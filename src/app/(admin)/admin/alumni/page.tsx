import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Briefcase, Award, Percent } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/lms/dashboard-widgets";
import { FilterBar } from "@/components/admin/filter-bar";
import { AdminTable, Row, Cell } from "@/components/admin/table";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Alumni" };
export const dynamic = "force-dynamic";

export default async function AlumniPage({ searchParams }: { searchParams: Promise<{ q?: string; course?: string; page?: string }> }) {
  const [sp] = await Promise.all([searchParams, requirePermission("students.read")]);
  const page = Number(sp.page ?? 1) || 1;
  const pageSize = 25;
  const where = {
    enrollments: { some: { status: "COMPLETED" as const, ...(sp.course ? { courseId: sp.course } : {}) } },
    ...(sp.q ? { user: { OR: [{ name: { contains: sp.q } }, { email: { contains: sp.q } }] } } : {}),
  };
  const [items, total, courses, hired, certificates] = await Promise.all([
    prisma.studentProfile.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { name: true, email: true, phone: true, avatar: { select: { url: true } } } },
        enrollments: { where: { status: "COMPLETED" }, select: { course: { select: { title: true } }, completion: { select: { completedAt: true } } } },
        certificates: { where: { status: "VALID" }, select: { id: true } },
        jobApplications: { where: { status: "HIRED" }, select: { job: { select: { title: true, employer: { select: { name: true } } } }, internship: { select: { title: true, employer: { select: { name: true } } } } } },
        portfolio: { select: { username: true, isPublic: true } },
      },
    }),
    prisma.studentProfile.count({ where }),
    prisma.course.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.jobApplication.count({ where: { status: "HIRED" } }),
    prisma.certificate.count({ where: { status: "VALID" } }),
  ]);
  const placementRate = total ? Math.round((hired / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Alumni" description="Students who have completed at least one course." />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={GraduationCap} label="Alumni" value={total.toLocaleString()} tone="accent" />
        <StatTile icon={Award} label="Valid certificates" value={certificates.toLocaleString()} />
        <StatTile icon={Briefcase} label="Hired through Globify" value={hired.toLocaleString()} tone="success" />
        <StatTile icon={Percent} label="Placement rate" value={`${placementRate}%`} hint="hires ÷ alumni" tone={placementRate >= 50 ? "success" : "warning"} />
      </section>
      <FilterBar searchPlaceholder="Alumni name or email" filters={[{ key: "course", label: "courses", options: courses.map((c) => ({ value: c.id, label: c.title })) }]} />
      {items.length ? (
        <AdminTable headers={["Alumnus", "Completed", "Graduated", { label: "Certificates", align: "end" }, "Outcome"]}>
          {items.map((s) => {
            const latest = s.enrollments.map((e) => e.completion?.completedAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
            const hire = s.jobApplications[0];
            const role = hire?.job ?? hire?.internship;
            return (
              <Row key={s.id}>
                <Cell><Link href={`/admin/students/${s.id}`} className="flex items-center gap-2 hover:text-accent"><Avatar name={s.user.name} src={s.user.avatar?.url} size="xs" /><span><span className="block font-medium">{s.user.name}</span><span className="block text-caption text-fg-subtle">{s.studentNumber}</span></span></Link></Cell>
                <Cell className="text-caption text-fg-muted">{s.enrollments.map((e) => e.course.title).join(", ")}</Cell>
                <Cell className="text-caption text-fg-muted">{latest ? formatDate(latest) : "—"}</Cell>
                <Cell align="end">{s.certificates.length}</Cell>
                <Cell>{role ? <Badge variant="success">{role.title} · {role.employer.name}</Badge> : s.portfolio?.isPublic ? <Link href={`/portfolio/${s.portfolio.username}`} target="_blank" className="text-caption text-accent hover:underline">Portfolio</Link> : <span className="text-caption text-fg-subtle">—</span>}</Cell>
              </Row>
            );
          })}
        </AdminTable>
      ) : (
        <EmptyState icon={<GraduationCap />} title="No alumni yet." description="Students appear here once they complete a course." />
      )}
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(sp)) if (v && k !== "page") q.set(k, v); q.set("page", String(p)); return `/admin/alumni?${q}`; }} />
    </div>
  );
}
