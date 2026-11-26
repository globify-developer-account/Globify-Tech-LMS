import "server-only";
import { unstable_cache, revalidateTag, revalidatePath } from "next/cache";
import { prisma, type Prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { sanitizeRichText } from "@/lib/sanitize";
import { slugify } from "@/lib/utils";
import type { CourseInput, LessonInput } from "@/lib/validation/course";
import type { ListQuery } from "@/lib/validation/common";
import type { CourseLevel, LearningMode, ContentStatus } from "@prisma/client";

export const COURSE_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  shortDescription: true,
  level: true,
  mode: true,
  durationWeeks: true,
  hoursPerWeek: true,
  price: true,
  discountPrice: true,
  currency: true,
  ratingAvg: true,
  ratingCount: true,
  studentCount: true,
  featured: true,
  status: true,
  publishedAt: true,
  artwork: { select: { url: true, alt: true } },
  category: { select: { id: true, slug: true, name: true, artworkKey: true } },
  instructors: { select: { isLead: true, instructor: { select: { id: true, slug: true, title: true, user: { select: { name: true, avatar: { select: { url: true } } } } } } } },
  skills: { select: { skill: { select: { id: true, slug: true, name: true } } } },
} satisfies Prisma.CourseSelect;

export type CourseCardData = Prisma.CourseGetPayload<{ select: typeof COURSE_CARD_SELECT }>;

export interface CatalogFilters {
  q?: string;
  category?: string;
  skill?: string;
  level?: CourseLevel;
  mode?: LearningMode;
  duration?: "short" | "medium" | "long";
  instructor?: string;
  page?: number;
  pageSize?: number;
  sort?: "popular" | "newest" | "rating" | "price-asc" | "price-desc";
}

/** Public catalogue: published, not deleted. */
export async function listPublishedCourses(filters: CatalogFilters = {}) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 12;
  const where: Prisma.CourseWhereInput = {
    status: "PUBLISHED",
    deletedAt: null,
    ...(filters.q ? { OR: [{ title: { contains: filters.q } }, { subtitle: { contains: filters.q } }, { shortDescription: { contains: filters.q } }, { skills: { some: { skill: { name: { contains: filters.q } } } } }] } : {}),
    ...(filters.category ? { category: { slug: filters.category } } : {}),
    ...(filters.skill ? { skills: { some: { skill: { slug: filters.skill } } } } : {}),
    ...(filters.level ? { level: filters.level } : {}),
    ...(filters.mode ? { mode: filters.mode } : {}),
    ...(filters.instructor ? { instructors: { some: { instructor: { slug: filters.instructor } } } } : {}),
    ...(filters.duration === "short" ? { durationWeeks: { lte: 4 } } : filters.duration === "medium" ? { durationWeeks: { gt: 4, lte: 12 } } : filters.duration === "long" ? { durationWeeks: { gt: 12 } } : {}),
  };
  const orderBy: Prisma.CourseOrderByWithRelationInput[] =
    filters.sort === "newest" ? [{ publishedAt: "desc" }]
    : filters.sort === "rating" ? [{ ratingAvg: "desc" }, { ratingCount: "desc" }]
    : filters.sort === "price-asc" ? [{ price: "asc" }]
    : filters.sort === "price-desc" ? [{ price: "desc" }]
    : [{ featured: "desc" }, { studentCount: "desc" }, { publishedAt: "desc" }];
  const [items, total] = await Promise.all([
    prisma.course.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: COURSE_CARD_SELECT }),
    prisma.course.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export const getFeaturedCourses = unstable_cache(
  async (limit = 6) => prisma.course.findMany({ where: { status: "PUBLISHED", deletedAt: null, featured: true }, orderBy: [{ studentCount: "desc" }], take: limit, select: COURSE_CARD_SELECT }),
  ["featured-courses"],
  { tags: ["courses"], revalidate: 300 },
);

export const getCatalogFacets = unstable_cache(
  async () => {
    const [categories, skills, instructors] = await Promise.all([
      prisma.category.findMany({ where: { isActive: true, courses: { some: { status: "PUBLISHED", deletedAt: null } } }, orderBy: { order: "asc" }, select: { id: true, slug: true, name: true, artworkKey: true } }),
      prisma.skill.findMany({ where: { courses: { some: { course: { status: "PUBLISHED", deletedAt: null } } } }, orderBy: { name: "asc" }, select: { id: true, slug: true, name: true }, take: 60 }),
      prisma.instructorProfile.findMany({ where: { isPublic: true, courses: { some: { course: { status: "PUBLISHED" } } } }, select: { id: true, slug: true, user: { select: { name: true } } }, take: 30 }),
    ]);
    return { categories, skills, instructors };
  },
  ["catalog-facets"],
  { tags: ["courses"], revalidate: 600 },
);

/** Public course page payload. */
export async function getPublicCourseBySlug(slug: string) {
  return prisma.course.findFirst({
    where: { slug, status: "PUBLISHED", deletedAt: null },
    include: {
      artwork: true,
      promoVideo: true,
      ogImage: true,
      category: true,
      skills: { include: { skill: true } },
      instructors: { include: { instructor: { include: { user: { select: { name: true, avatar: { select: { url: true } } } } } } } },
      modules: { where: { isPublished: true }, orderBy: { order: "asc" }, include: { units: { orderBy: { order: "asc" }, include: { lessons: { where: { isPublished: true }, orderBy: { order: "asc" }, select: { id: true, title: true, type: true, durationSeconds: true, isPreview: true } } } } } },
      projects: { where: { isPublished: true }, orderBy: { order: "asc" }, select: { id: true, title: true, overview: true, skills: true } },
      reviews: { where: { isApproved: true }, orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }], take: 8, include: { student: { select: { user: { select: { name: true, avatar: { select: { url: true } } } } } } } },
      feePlans: { where: { isActive: true }, include: { installments: { orderBy: { order: "asc" } } }, orderBy: { isDefault: "desc" } },
      batches: { where: { status: { in: ["OPEN", "PLANNED"] }, deletedAt: null, startDate: { gte: new Date(Date.now() - 7 * 86400000) } }, orderBy: { startDate: "asc" }, take: 4, include: { schedule: true, campus: { select: { name: true, city: true } }, _count: { select: { students: true } } } },
      completionRules: true,
    },
  });
}

export async function listPublicCourseSlugs() {
  return prisma.course.findMany({ where: { status: "PUBLISHED", deletedAt: null }, select: { slug: true, updatedAt: true } });
}

// ───────────────────────── Admin / instructor ─────────────────────────

export interface AdminCourseFilters extends ListQuery {
  status?: ContentStatus;
  categoryId?: string;
  instructorId?: string;
}

export async function listCoursesForStaff(filters: AdminCourseFilters) {
  const where: Prisma.CourseWhereInput = {
    deletedAt: null,
    ...(filters.q ? { OR: [{ title: { contains: filters.q } }, { slug: { contains: filters.q } }] } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.instructorId ? { instructors: { some: { instructorId: filters.instructorId } } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.course.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: { ...COURSE_CARD_SELECT, updatedAt: true, _count: { select: { enrollments: true, modules: true, batches: true } } },
    }),
    prisma.course.count({ where }),
  ]);
  return { items, total, page: filters.page, pageSize: filters.pageSize };
}

export async function getCourseForEditing(courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, deletedAt: null },
    include: {
      artwork: true,
      promoVideo: true,
      category: true,
      skills: { include: { skill: true } },
      instructors: { include: { instructor: { include: { user: { select: { name: true } } } } } },
      modules: { orderBy: { order: "asc" }, include: { units: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" }, include: { resources: true, video: true, quiz: { select: { id: true, title: true } }, assignment: { select: { id: true, title: true } }, project: { select: { id: true, title: true } } } } } } } },
      quizzes: { select: { id: true, title: true, isPublished: true, _count: { select: { questions: true } } } },
      assignments: { select: { id: true, title: true, isPublished: true, dueAt: true } },
      projects: { select: { id: true, title: true, isPublished: true, deadline: true } },
      exams: { select: { id: true, title: true, isPublished: true, scheduledAt: true } },
      completionRules: true,
      feePlans: { include: { installments: { orderBy: { order: "asc" } } } },
      _count: { select: { enrollments: true, batches: true } },
    },
  });
  if (!course) throw AppError.notFound("Course");
  return course;
}

export type CourseForEditing = Awaited<ReturnType<typeof getCourseForEditing>>;

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "course";
  let candidate = root;
  let i = 2;
  while (await prisma.course.findFirst({ where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true } })) {
    candidate = `${root}-${i++}`;
  }
  return candidate;
}

function courseData(input: CourseInput): Omit<Prisma.CourseUncheckedCreateInput, "slug" | "createdById"> {
  return {
    title: input.title,
    subtitle: input.subtitle || null,
    shortDescription: input.shortDescription || null,
    description: input.description ? sanitizeRichText(input.description) : null,
    categoryId: input.categoryId ?? null,
    level: input.level,
    mode: input.mode,
    durationWeeks: input.durationWeeks ?? null,
    hoursPerWeek: input.hoursPerWeek ?? null,
    language: input.language,
    price: input.price,
    discountPrice: input.discountPrice ?? null,
    currency: input.currency,
    artworkMediaId: input.artworkMediaId ?? null,
    promoVideoMediaId: input.promoVideoMediaId ?? null,
    featured: input.featured,
    outcomes: input.outcomes,
    prerequisites: input.prerequisites,
    careerOutcomes: input.careerOutcomes,
    faqs: input.faqs,
    seoTitle: input.seoTitle || null,
    seoDescription: input.seoDescription || null,
    noindex: input.noindex,
    leaderboardEnabled: input.leaderboardEnabled,
    campusId: input.campusId ?? null,
  };
}

export async function createCourse(input: CourseInput, createdById: string) {
  const slug = await uniqueSlug(input.slug ?? input.title);
  const course = await prisma.course.create({
    data: {
      ...courseData(input),
      slug,
      createdById,
      skills: { create: input.skillIds.map((skillId) => ({ skillId })) },
      instructors: { create: input.instructorIds.map((instructorId, i) => ({ instructorId, isLead: i === 0 })) },
      completionRules: { create: {} },
    },
  });
  return course;
}

export async function updateCourse(courseId: string, input: CourseInput) {
  const existing = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null }, select: { id: true, slug: true } });
  if (!existing) throw AppError.notFound("Course");
  const slug = input.slug && input.slug !== existing.slug ? await uniqueSlug(input.slug, courseId) : existing.slug;
  const course = await prisma.$transaction(async (tx) => {
    await tx.courseSkill.deleteMany({ where: { courseId } });
    await tx.instructorCourse.deleteMany({ where: { courseId } });
    return tx.course.update({
      where: { id: courseId },
      data: {
        ...courseData(input),
        slug,
        skills: { create: input.skillIds.map((skillId) => ({ skillId })) },
        instructors: { create: input.instructorIds.map((instructorId, i) => ({ instructorId, isLead: i === 0 })) },
      },
    });
  });
  revalidateCourse(course.slug);
  return course;
}

export async function setCourseStatus(courseId: string, status: ContentStatus) {
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null }, include: { _count: { select: { modules: true } } } });
  if (!course) throw AppError.notFound("Course");
  if (status === "PUBLISHED" && course._count.modules === 0) throw AppError.validation("Add at least one module before publishing.");
  const updated = await prisma.course.update({
    where: { id: courseId },
    data: { status, publishedAt: status === "PUBLISHED" ? (course.publishedAt ?? new Date()) : course.publishedAt },
  });
  revalidateCourse(updated.slug);
  return updated;
}

export async function softDeleteCourse(courseId: string) {
  const course = await prisma.course.update({ where: { id: courseId }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
  revalidateCourse(course.slug);
  return course;
}

export function revalidateCourse(slug?: string) {
  revalidateTag("courses", "max");
  revalidatePath("/courses");
  revalidatePath("/");
  if (slug) revalidatePath(`/courses/${slug}`);
}

// ───────────────────────── Curriculum ─────────────────────────

export async function createModule(input: { courseId: string; title: string; description?: string }) {
  const count = await prisma.courseModule.count({ where: { courseId: input.courseId } });
  return prisma.courseModule.create({ data: { courseId: input.courseId, title: input.title, description: input.description || null, order: count } });
}

export async function updateModule(id: string, input: { title: string; description?: string; isPublished?: boolean }) {
  return prisma.courseModule.update({ where: { id }, data: { title: input.title, description: input.description || null, isPublished: input.isPublished ?? undefined } });
}

export async function deleteModule(id: string) {
  return prisma.courseModule.delete({ where: { id } });
}

export async function createUnit(input: { moduleId: string; title: string }) {
  const count = await prisma.courseUnit.count({ where: { moduleId: input.moduleId } });
  return prisma.courseUnit.create({ data: { moduleId: input.moduleId, title: input.title, order: count } });
}

export async function updateUnit(id: string, title: string) {
  return prisma.courseUnit.update({ where: { id }, data: { title } });
}

export async function deleteUnit(id: string) {
  return prisma.courseUnit.delete({ where: { id } });
}

async function uniqueLessonSlug(unitId: string, title: string, excludeId?: string) {
  const root = slugify(title) || "lesson";
  let candidate = root;
  let i = 2;
  while (await prisma.lesson.findFirst({ where: { unitId, slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true } })) candidate = `${root}-${i++}`;
  return candidate;
}

export async function createLesson(input: LessonInput) {
  const count = await prisma.lesson.count({ where: { unitId: input.unitId } });
  return prisma.lesson.create({
    data: {
      unitId: input.unitId,
      title: input.title,
      slug: await uniqueLessonSlug(input.unitId, input.title),
      type: input.type,
      content: input.content ? sanitizeRichText(input.content) : null,
      videoMediaId: input.videoMediaId ?? null,
      videoUrl: input.videoUrl || null,
      durationSeconds: input.durationSeconds,
      isPreview: input.isPreview,
      isPublished: input.isPublished,
      objectives: input.objectives,
      quizId: input.quizId ?? null,
      assignmentId: input.assignmentId ?? null,
      projectId: input.projectId ?? null,
      order: count,
      resources: { create: input.resources.map((r, i) => ({ title: r.title, type: r.type, mediaId: r.mediaId ?? null, url: r.url || null, order: i })) },
    },
  });
}

export async function updateLesson(id: string, input: LessonInput) {
  const existing = await prisma.lesson.findUnique({ where: { id }, select: { unitId: true, title: true, slug: true } });
  if (!existing) throw AppError.notFound("Lesson");
  const slug = existing.title !== input.title ? await uniqueLessonSlug(input.unitId, input.title, id) : existing.slug;
  return prisma.$transaction(async (tx) => {
    await tx.lessonResource.deleteMany({ where: { lessonId: id } });
    return tx.lesson.update({
      where: { id },
      data: {
        unitId: input.unitId,
        title: input.title,
        slug,
        type: input.type,
        content: input.content ? sanitizeRichText(input.content) : null,
        videoMediaId: input.videoMediaId ?? null,
        videoUrl: input.videoUrl || null,
        durationSeconds: input.durationSeconds,
        isPreview: input.isPreview,
        isPublished: input.isPublished,
        objectives: input.objectives,
        quizId: input.quizId ?? null,
        assignmentId: input.assignmentId ?? null,
        projectId: input.projectId ?? null,
        resources: { create: input.resources.map((r, i) => ({ title: r.title, type: r.type, mediaId: r.mediaId ?? null, url: r.url || null, order: i })) },
      },
    });
  });
}

export async function deleteLesson(id: string) {
  return prisma.lesson.delete({ where: { id } });
}

export async function reorder(kind: "module" | "unit" | "lesson", ids: string[]) {
  const table = kind === "module" ? prisma.courseModule : kind === "unit" ? prisma.courseUnit : prisma.lesson;
  await prisma.$transaction(ids.map((id, order) => (table as typeof prisma.lesson).update({ where: { id }, data: { order } })));
}

/** Course id for a lesson (used by ownership guards). */
export async function courseIdForLesson(lessonId: string): Promise<string | null> {
  const l = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { unit: { select: { module: { select: { courseId: true } } } } } });
  return l?.unit.module.courseId ?? null;
}

/** Flat ordered list of published lessons in a course. */
export async function orderedLessons(courseId: string) {
  const modules = await prisma.courseModule.findMany({
    where: { courseId, isPublished: true },
    orderBy: { order: "asc" },
    select: { id: true, title: true, units: { orderBy: { order: "asc" }, select: { id: true, title: true, lessons: { where: { isPublished: true }, orderBy: { order: "asc" }, select: { id: true, title: true, type: true, durationSeconds: true, isPreview: true, quizId: true, assignmentId: true, projectId: true } } } } },
  });
  const flat = modules.flatMap((m) => m.units.flatMap((u) => u.lessons.map((l) => ({ ...l, moduleId: m.id, moduleTitle: m.title, unitId: u.id, unitTitle: u.title }))));
  return { modules, flat };
}

export async function recomputeCourseStats(courseId: string) {
  const [studentCount, rating] = await Promise.all([
    prisma.enrollment.count({ where: { courseId, status: { in: ["ACTIVE", "COMPLETED"] } } }),
    prisma.review.aggregate({ where: { courseId, isApproved: true }, _avg: { rating: true }, _count: { rating: true } }),
  ]);
  await prisma.course.update({ where: { id: courseId }, data: { studentCount, ratingAvg: rating._avg.rating ?? 0, ratingCount: rating._count.rating } });
}
