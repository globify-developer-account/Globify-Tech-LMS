import "server-only";
import { prisma, type Prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { slugify } from "@/lib/utils";
import { createStudentAccount, ensureRole, removeRole } from "./users";
import { hashPassword } from "@/server/auth/password";
import { revalidateContent } from "./cms";

export interface InstructorInput {
  userId?: string;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  title?: string;
  bio?: string;
  expertise: string[];
  yearsExperience?: number | null;
  linkedinUrl?: string;
  websiteUrl?: string;
  isFeatured: boolean;
  isPublic: boolean;
  campusId?: string | null;
  avatarMediaId?: string | null;
}

async function uniqueSlug(name: string, excludeId?: string) {
  const root = slugify(name) || "instructor";
  let candidate = root;
  let i = 2;
  while (await prisma.instructorProfile.findFirst({ where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) } })) candidate = `${root}-${i++}`;
  return candidate;
}

export async function createInstructor(input: InstructorInput) {
  const email = input.email.toLowerCase();
  let userId = input.userId;
  if (!userId) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) userId = existing.id;
    else {
      const user = await prisma.user.create({ data: { email, name: input.name, phone: input.phone || null, passwordHash: input.password ? await hashPassword(input.password) : null, status: input.password ? "ACTIVE" : "INVITED", avatarMediaId: input.avatarMediaId ?? null } });
      userId = user.id;
    }
  }
  await ensureRole(userId, "INSTRUCTOR", prisma, input.campusId);
  const existingProfile = await prisma.instructorProfile.findUnique({ where: { userId } });
  if (existingProfile) throw AppError.conflict("This user already has an instructor profile.");
  const profile = await prisma.instructorProfile.create({ data: { userId, slug: await uniqueSlug(input.name), title: input.title || null, bio: input.bio || null, expertise: input.expertise, yearsExperience: input.yearsExperience ?? null, linkedinUrl: input.linkedinUrl || null, websiteUrl: input.websiteUrl || null, isFeatured: input.isFeatured, isPublic: input.isPublic, campusId: input.campusId ?? null } });
  revalidateContent();
  return profile;
}

export async function updateInstructor(id: string, input: InstructorInput) {
  const profile = await prisma.instructorProfile.findUnique({ where: { id }, include: { user: true } });
  if (!profile) throw AppError.notFound("Instructor");
  await prisma.user.update({ where: { id: profile.userId }, data: { name: input.name, phone: input.phone || null, avatarMediaId: input.avatarMediaId ?? undefined, ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}) } });
  const updated = await prisma.instructorProfile.update({ where: { id }, data: { slug: profile.user.name !== input.name ? await uniqueSlug(input.name, id) : profile.slug, title: input.title || null, bio: input.bio || null, expertise: input.expertise, yearsExperience: input.yearsExperience ?? null, linkedinUrl: input.linkedinUrl || null, websiteUrl: input.websiteUrl || null, isFeatured: input.isFeatured, isPublic: input.isPublic, campusId: input.campusId ?? null } });
  revalidateContent();
  return updated;
}

export async function deactivateInstructor(id: string) {
  const profile = await prisma.instructorProfile.findUnique({ where: { id } });
  if (!profile) throw AppError.notFound("Instructor");
  await prisma.instructorProfile.update({ where: { id }, data: { isPublic: false, isFeatured: false } });
  await removeRole(profile.userId, "INSTRUCTOR");
  revalidateContent();
}

export async function listInstructors(filters: { q?: string; campusId?: string; page?: number; pageSize?: number }) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const where: Prisma.InstructorProfileWhereInput = { ...(filters.campusId ? { campusId: filters.campusId } : {}), ...(filters.q ? { OR: [{ user: { name: { contains: filters.q } } }, { user: { email: { contains: filters.q } } }, { expertise: { array_contains: filters.q } }] } : {}) };
  const [items, total] = await Promise.all([
    prisma.instructorProfile.findMany({ where, orderBy: [{ isFeatured: "desc" }, { createdAt: "asc" }], skip: (page - 1) * pageSize, take: pageSize, include: { user: { select: { name: true, email: true, status: true, avatar: { select: { url: true } } } }, campus: { select: { name: true } }, _count: { select: { courses: true, batches: true } } } }),
    prisma.instructorProfile.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getInstructor(id: string) {
  const i = await prisma.instructorProfile.findUnique({ where: { id }, include: { user: { select: { id: true, name: true, email: true, phone: true, status: true, avatar: true } }, campus: true, courses: { include: { course: { select: { id: true, title: true, slug: true, status: true, studentCount: true } } } }, batches: { where: { deletedAt: null }, orderBy: { startDate: "desc" }, take: 10, include: { course: { select: { title: true } }, _count: { select: { students: { where: { leftAt: null } } } } } } } });
  if (!i) throw AppError.notFound("Instructor");
  return i;
}

export async function getPublicInstructorBySlug(slug: string) {
  return prisma.instructorProfile.findFirst({ where: { slug, isPublic: true }, include: { user: { select: { name: true, avatar: { select: { url: true } } } }, courses: { include: { course: { select: { id: true, slug: true, title: true, subtitle: true, status: true, level: true, durationWeeks: true, ratingAvg: true, studentCount: true, artwork: { select: { url: true } }, category: { select: { name: true, artworkKey: true } } } } } } } });
}

/** Admin: quick student creation without an application. */
export async function adminCreateStudent(input: { name: string; email: string; password?: string; phone?: string; city?: string; campusId?: string | null }) {
  return createStudentAccount({ ...input, emailVerified: true });
}
