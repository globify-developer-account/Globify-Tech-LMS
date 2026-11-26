import "server-only";
import { prisma, Prisma } from "@/server/db/prisma";
import { can, type Permission } from "@/lib/rbac";
import { booleanFulltextQuery } from "@/lib/fulltext";
import type { SessionUser } from "@/server/auth/session";

export interface SearchHit {
  id: string;
  type: "student" | "course" | "lesson" | "application" | "lead" | "invoice" | "certificate" | "blog" | "page" | "instructor" | "batch";
  title: string;
  subtitle?: string;
  href: string;
}

export interface SearchProvider {
  search(query: string, user: SessionUser, limit?: number): Promise<SearchHit[]>;
}

/**
 * Tables with a FULLTEXT index, and its exact column list. MATCH() must name
 * the same columns as the index, so keep this in step with the `@@fulltext`
 * attributes in prisma/schema.prisma.
 */
const FTS_COLUMNS = {
  courses: ["title", "subtitle", "shortDescription", "description"],
  lessons: ["title", "content"],
  blog_posts: ["title", "excerpt", "content"],
  pages: ["title", "seoDescription"],
  discussions: ["title", "body"],
} as const;
type FtsTable = keyof typeof FTS_COLUMNS;

/**
 * Ranked full-text matches for one table, best first.
 *
 * Uses the FULLTEXT indexes so multi-word queries match titles and body text,
 * not just one column. Returns an empty list when the query has no usable
 * words or the index is missing, and the caller falls back to `contains`.
 */
async function ftsIds(table: FtsTable, query: string, limit: number): Promise<string[]> {
  const against = booleanFulltextQuery(query);
  if (!against) return [];
  const columns = Prisma.raw(FTS_COLUMNS[table].map((c) => `\`${c}\``).join(", "));
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM ${Prisma.raw(`\`${table}\``)}
      WHERE MATCH(${columns}) AGAINST (${against} IN BOOLEAN MODE)
      ORDER BY MATCH(${columns}) AGAINST (${against} IN BOOLEAN MODE) DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

/** Keeps full-text hits in rank order, then appends anything `contains` also found. */
function byRank<T extends { id: string }>(rows: T[], ranked: string[]): T[] {
  if (!ranked.length) return rows;
  const order = new Map(ranked.map((id, i) => [id, i]));
  return [...rows].sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

/**
 * Database search provider. Combines the FULLTEXT indexes with
 * `contains` matching for partial words, and applies the caller's permissions so
 * results never leak across roles.
 * Swap for an OpenSearch provider by implementing `SearchProvider`.
 */
class DatabaseSearchProvider implements SearchProvider {
  async search(query: string, user: SessionUser, limit = 8): Promise<SearchHit[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const like = { contains: q };
    const tasks: Array<Promise<SearchHit[]>> = [];
    const allowed = (p: Permission) => can(user, p);
    const isStudent = user.roles.includes("STUDENT") || user.roles.includes("ALUMNI");
    const isInstructor = user.roles.includes("INSTRUCTOR") || user.roles.includes("TEACHING_ASSISTANT");

    // Courses: everyone sees published; staff sees drafts too.
    const courseIds = await ftsIds("courses", q, limit);
    tasks.push(
      prisma.course
        .findMany({
          where: { deletedAt: null, ...(allowed("courses.read") ? {} : { status: "PUBLISHED" }), OR: [{ title: like }, { subtitle: like }, { slug: like }, ...(courseIds.length ? [{ id: { in: courseIds } }] : [])] },
          take: limit,
          select: { id: true, slug: true, title: true, subtitle: true, status: true },
        })
        .then((rows) => byRank(rows, courseIds))
        .then((rows) =>
          rows.map((c) => ({
            id: c.id,
            type: "course" as const,
            title: c.title,
            subtitle: c.subtitle ?? c.status,
            href: allowed("courses.read") ? `/admin/courses/${c.id}` : isInstructor ? `/instructor/course/${c.id}` : isStudent ? `/student/course/${c.id}` : `/courses/${c.slug}`,
          })),
        ),
    );

    if (allowed("students.read")) {
      tasks.push(
        prisma.studentProfile
          .findMany({
            where: { user: { OR: [{ name: like }, { email: like }, { phone: like }] } },
            take: limit,
            select: { id: true, studentNumber: true, user: { select: { name: true, email: true } } },
          })
          .then((rows) => rows.map((s) => ({ id: s.id, type: "student" as const, title: s.user.name, subtitle: `${s.studentNumber} · ${s.user.email}`, href: allowed("students.update") ? `/admin/students/${s.id}` : `/instructor/students/${s.id}` }))),
      );
    }
    if (allowed("crm.leads.read")) {
      tasks.push(
        prisma.lead
          .findMany({ where: { deletedAt: null, OR: [{ name: like }, { phone: like }, { email: like }, { city: like }] }, take: limit, select: { id: true, name: true, phone: true, stage: true } })
          .then((rows) => rows.map((l) => ({ id: l.id, type: "lead" as const, title: l.name, subtitle: `${l.stage} · ${l.phone ?? ""}`, href: `/admin/leads/${l.id}` }))),
      );
    }
    if (allowed("applications.read")) {
      tasks.push(
        prisma.application
          .findMany({ where: { OR: [{ number: like }, { applicant: { name: like } }, { applicant: { email: like } }] }, take: limit, select: { id: true, number: true, status: true, applicant: { select: { name: true } }, course: { select: { title: true } } } })
          .then((rows) => rows.map((a) => ({ id: a.id, type: "application" as const, title: a.applicant?.name ?? a.number, subtitle: `${a.number} · ${a.course.title} · ${a.status}`, href: `/admin/applications/${a.id}` }))),
      );
    }
    if (allowed("payments.read")) {
      tasks.push(
        prisma.invoice
          .findMany({ where: { deletedAt: null, OR: [{ number: like }, { student: { user: { name: like } } }] }, take: limit, select: { id: true, number: true, status: true, total: true, student: { select: { user: { select: { name: true } } } } } })
          .then((rows) => rows.map((i) => ({ id: i.id, type: "invoice" as const, title: i.number, subtitle: `${i.student.user.name} · ${i.status}`, href: `/admin/invoices/${i.id}` }))),
      );
    }
    if (allowed("certificates.read")) {
      tasks.push(
        prisma.certificate
          .findMany({ where: { OR: [{ certificateNumber: like }, { student: { user: { name: like } } }] }, take: limit, select: { id: true, certificateNumber: true, status: true, title: true } })
          .then((rows) => rows.map((c) => ({ id: c.id, type: "certificate" as const, title: c.certificateNumber, subtitle: `${c.title} · ${c.status}`, href: `/admin/certificates/${c.id}` }))),
      );
    }
    if (allowed("cms.blog.manage")) {
      const postIds = await ftsIds("blog_posts", q, limit);
      tasks.push(
        prisma.blogPost
          .findMany({ where: { deletedAt: null, OR: [{ title: like }, { slug: like }, ...(postIds.length ? [{ id: { in: postIds } }] : [])] }, take: limit, select: { id: true, title: true, status: true } })
          .then((rows) => byRank(rows, postIds))
          .then((rows) => rows.map((p) => ({ id: p.id, type: "blog" as const, title: p.title, subtitle: p.status, href: `/admin/blog/${p.id}` }))),
      );
    }
    if (allowed("cms.pages.manage")) {
      const pageIds = await ftsIds("pages", q, limit);
      tasks.push(
        prisma.page
          .findMany({ where: { deletedAt: null, OR: [{ title: like }, { slug: like }, ...(pageIds.length ? [{ id: { in: pageIds } }] : [])] }, take: limit, select: { id: true, title: true, slug: true } })
          .then((rows) => byRank(rows, pageIds))
          .then((rows) => rows.map((p) => ({ id: p.id, type: "page" as const, title: p.title, subtitle: `/${p.slug}`, href: `/admin/pages/${p.id}` }))),
      );
    }
    if (allowed("batches.read")) {
      tasks.push(
        prisma.batch
          .findMany({ where: { deletedAt: null, OR: [{ code: like }, { name: like }] }, take: limit, select: { id: true, code: true, name: true, status: true } })
          .then((rows) => rows.map((b) => ({ id: b.id, type: "batch" as const, title: b.name, subtitle: `${b.code} · ${b.status}`, href: allowed("batches.manage") ? `/admin/batches/${b.id}` : `/instructor/batches/${b.id}` }))),
      );
    }
    if (isStudent) {
      const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (student) {
        const lessonIds = await ftsIds("lessons", q, limit);
        tasks.push(
          prisma.lesson
            .findMany({
              where: { OR: [{ title: like }, ...(lessonIds.length ? [{ id: { in: lessonIds } }] : [])], unit: { module: { course: { enrollments: { some: { studentId: student.id } } } } } },
              take: limit,
              select: { id: true, title: true, unit: { select: { module: { select: { courseId: true, course: { select: { title: true } } } } } } },
            })
            .then((rows) => byRank(rows, lessonIds))
            .then((rows) => rows.map((l) => ({ id: l.id, type: "lesson" as const, title: l.title, subtitle: l.unit.module.course.title, href: `/student/course/${l.unit.module.courseId}?lesson=${l.id}` }))),
        );
      }
    }

    const results = (await Promise.all(tasks)).flat();
    return results.slice(0, limit * 3);
  }
}

let provider: SearchProvider | undefined;
export function searchProvider(): SearchProvider {
  provider ??= new DatabaseSearchProvider();
  return provider;
}
