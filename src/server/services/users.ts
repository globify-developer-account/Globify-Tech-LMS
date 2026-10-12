import "server-only";
import { prisma, type Prisma } from "@/server/db/prisma";
import { hashPassword } from "@/server/auth/password";
import { AppError } from "@/server/errors";
import type { RoleKey } from "@/lib/rbac";

type Tx = Prisma.TransactionClient;

export async function ensureRole(userId: string, roleKey: RoleKey, tx: Tx | typeof prisma = prisma, campusId?: string | null) {
  const role = await tx.role.findUnique({ where: { key: roleKey } });
  if (!role) throw new Error(`Role ${roleKey} is not seeded`);
  await tx.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id, campusId: campusId ?? null },
  });
}

export async function removeRole(userId: string, roleKey: RoleKey) {
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) return;
  await prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
}

/**
 * GT-YYYY-NNNNN, sequential per year. The maximum is taken numerically, not
 * by sorting strings: the roster import wrote 4-digit numbers (GT-2026-1024)
 * while this generator pads to 5 (GT-2026-01025), and a string "desc" sort
 * ranks "1024" above "01025", which re-issued 01025 and made every sign-up
 * fail with a unique-constraint conflict.
 */
export async function nextStudentNumber(tx: Tx | typeof prisma = prisma): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `GT-${year}-`;
  const rows = await tx.studentProfile.findMany({ where: { studentNumber: { startsWith: prefix } }, select: { studentNumber: true } });
  const max = rows.reduce((m, r) => Math.max(m, Number(r.studentNumber.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

export interface CreateStudentInput {
  name: string;
  email: string;
  password?: string;
  phone?: string | null;
  whatsapp?: string | null;
  city?: string | null;
  education?: string | null;
  campusId?: string | null;
  emailVerified?: boolean;
  isTestData?: boolean;
}

/** Creates a user + STUDENT role + student profile atomically. */
export async function createStudentAccount(input: CreateStudentInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw AppError.conflict("An account with this email already exists.");
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash,
        phone: input.phone || null,
        whatsapp: input.whatsapp || input.phone || null,
        emailVerifiedAt: input.emailVerified ? new Date() : null,
        status: "ACTIVE",
        isTestData: input.isTestData ?? false,
      },
    });
    await ensureRole(user.id, "STUDENT", tx, input.campusId);
    const profile = await tx.studentProfile.create({
      data: {
        userId: user.id,
        studentNumber: await nextStudentNumber(tx),
        city: input.city ?? null,
        education: input.education ?? null,
        campusId: input.campusId ?? null,
        isTestData: input.isTestData ?? false,
      },
    });
    await tx.streak.create({ data: { userId: user.id } });
    return { user, profile };
  });
}

/** Finds a student by user id or creates one for an existing user without a profile. */
export async function ensureStudentProfile(userId: string) {
  const existing = await prisma.studentProfile.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.$transaction(async (tx) => {
    await ensureRole(userId, "STUDENT", tx);
    return tx.studentProfile.create({ data: { userId, studentNumber: await nextStudentNumber(tx) } });
  });
}

export async function bumpSessionVersion(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}
