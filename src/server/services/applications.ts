import "server-only";
import { prisma, type Prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import type { ApplicationInput } from "@/lib/validation/crm";
import { createStudentAccount, ensureStudentProfile } from "./users";
import { enrollStudent } from "./enrollments";
import { createInvoiceFromFeePlan } from "./finance";
import { notify } from "./notifications";
import { changeStage } from "./crm";
import { normalizePhone } from "@/server/providers/whatsapp";
import type { ApplicationStatus } from "@prisma/client";

async function nextApplicationNumber(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = `APP-${new Date().getFullYear()}-`;
  const last = await tx.application.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(5, "0")}`;
}

/** Submit (or save as draft) an application. Works for signed-in users and guests. */
export async function submitApplication(input: ApplicationInput, params: { userId?: string | null; submit: boolean; leadId?: string | null }) {
  const course = await prisma.course.findFirst({ where: { id: input.courseId, status: "PUBLISHED", deletedAt: null }, select: { id: true, title: true } });
  if (!course) throw AppError.notFound("Course");
  if (input.preferredBatchId) {
    const batch = await prisma.batch.findFirst({ where: { id: input.preferredBatchId, courseId: course.id, deletedAt: null } });
    if (!batch) throw AppError.validation("Choose a batch that belongs to this course.");
  }
  const personal = { ...input.personal, phone: normalizePhone(input.personal.phone), whatsapp: input.personal.whatsapp ? normalizePhone(input.personal.whatsapp) : null };

  const application = await prisma.$transaction(async (tx) => {
    const existingDraft = params.userId ? await tx.application.findFirst({ where: { applicantUserId: params.userId, courseId: course.id, status: "DRAFT" } }) : null;
    const data = { courseId: course.id, preferredMode: input.preferredMode, preferredBatchId: input.preferredBatchId ?? null, personal: personal as never, education: input.education as never, experience: input.experience as never, goals: input.goals, status: params.submit ? ("SUBMITTED" as const) : ("DRAFT" as const), submittedAt: params.submit ? new Date() : null, applicantUserId: params.userId ?? null };
    const app = existingDraft ? await tx.application.update({ where: { id: existingDraft.id }, data }) : await tx.application.create({ data: { ...data, number: await nextApplicationNumber(tx) } });
    await tx.applicationDocument.deleteMany({ where: { applicationId: app.id } });
    if (input.documents.length) await tx.applicationDocument.createMany({ data: input.documents.map((d) => ({ applicationId: app.id, kind: d.kind, mediaId: d.mediaId })) });
    return app;
  });

  if (params.submit) {
    // Link or create a CRM lead so admissions sees the pipeline move.
    const lead =
      (params.leadId ? await prisma.lead.findUnique({ where: { id: params.leadId } }) : null) ??
      (await prisma.lead.findFirst({ where: { deletedAt: null, OR: [{ phone: personal.phone }, ...(personal.email ? [{ email: personal.email }] : [])], stage: { notIn: ["ENROLLED", "LOST"] } }, orderBy: { createdAt: "desc" } }));
    if (lead) {
      await prisma.lead.update({ where: { id: lead.id }, data: { applicationId: application.id, courseId: course.id } });
      await changeStage({ leadId: lead.id, stage: "APPLICATION", actorId: params.userId ?? lead.counsellorId ?? "", note: `Application ${application.number} submitted` }).catch(() => undefined);
    } else {
      await prisma.lead.create({ data: { name: `${personal.firstName} ${personal.lastName}`, phone: personal.phone, whatsapp: personal.whatsapp ?? personal.phone, email: personal.email, city: personal.city, courseId: course.id, source: "WEBSITE", stage: "APPLICATION", applicationId: application.id, score: 70, activities: { create: { type: "SYSTEM", summary: `Applied online (${application.number})` } } } });
    }
    if (params.userId) {
      await notify({ userId: params.userId, event: "APPLICATION_STATUS", data: { number: application.number, course: course.title, status: "submitted" }, href: `/apply/${application.id}`, fallback: { title: `Application ${application.number} received`, body: `We're reviewing your application for ${course.title}. Admissions will be in touch within two working days.` } });
    }
  }
  return application;
}

export interface ApplicationFilters {
  q?: string;
  status?: ApplicationStatus;
  courseId?: string;
  page?: number;
  pageSize?: number;
}

export async function listApplications(filters: ApplicationFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const where: Prisma.ApplicationWhereInput = {
    NOT: { status: "DRAFT" },
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.q ? { OR: [{ number: { contains: filters.q } }, { personal: { path: "$.firstName", string_contains: filters.q } }, { personal: { path: "$.lastName", string_contains: filters.q } }, { personal: { path: "$.email", string_contains: filters.q } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.application.findMany({ where, orderBy: [{ submittedAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { course: { select: { id: true, title: true } }, preferredBatch: { select: { code: true } }, reviewedBy: { select: { name: true } }, applicant: { select: { id: true, name: true, email: true } } } }),
    prisma.application.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getApplication(id: string) {
  const app = await prisma.application.findUnique({ where: { id }, include: { course: { include: { feePlans: { where: { isActive: true }, include: { installments: true } }, batches: { where: { status: { in: ["PLANNED", "OPEN"] }, deletedAt: null }, orderBy: { startDate: "asc" }, include: { _count: { select: { students: { where: { leftAt: null } } } } } } } }, preferredBatch: { select: { id: true, code: true, name: true } }, documents: { include: { media: true } }, reviewedBy: { select: { name: true } }, applicant: { select: { id: true, name: true, email: true } }, lead: { select: { id: true, stage: true, counsellor: { select: { name: true } } } } } });
  if (!app) throw AppError.notFound("Application");
  return app;
}

export async function applicationsForUser(userId: string) {
  return prisma.application.findMany({ where: { applicantUserId: userId }, orderBy: { createdAt: "desc" }, include: { course: { select: { id: true, slug: true, title: true } }, preferredBatch: { select: { code: true, name: true, startDate: true } } } });
}

/**
 * Admissions decision. APPROVED creates/links the student account, enrolls them
 * (into the chosen batch), issues the fee invoice when a plan is selected and
 * moves the CRM lead to FEE_PENDING or ENROLLED.
 */
export async function decideApplication(params: { applicationId: string; decision: "APPROVED" | "REJECTED" | "WAITLISTED" | "UNDER_REVIEW"; note?: string; batchId?: string | null; feePlanId?: string | null; reviewerId: string }) {
  const app = await getApplication(params.applicationId);
  if (["ENROLLED"].includes(app.status)) throw AppError.conflict("This application is already enrolled.");
  const personal = app.personal as { firstName: string; lastName: string; email: string; phone: string; whatsapp?: string | null; city?: string };

  if (params.decision !== "APPROVED") {
    const updated = await prisma.application.update({ where: { id: app.id }, data: { status: params.decision, reviewedById: params.reviewerId, reviewedAt: new Date(), decisionNote: params.note ?? null } });
    if (app.applicantUserId) {
      await notify({ userId: app.applicantUserId, event: "APPLICATION_STATUS", data: { number: app.number, course: app.course.title, status: params.decision.toLowerCase() }, href: `/apply/${app.id}`, fallback: { title: params.decision === "REJECTED" ? `Update on application ${app.number}` : params.decision === "WAITLISTED" ? `You're on the waitlist for ${app.course.title}` : `Application ${app.number} is under review`, body: params.note ?? "Admissions will contact you with next steps." } });
    }
    if (app.lead && params.decision === "REJECTED") await changeStage({ leadId: app.lead.id, stage: "LOST", actorId: params.reviewerId, lostReason: params.note ?? "Application rejected" });
    return updated;
  }

  // APPROVED
  let userId = app.applicantUserId;
  if (!userId) {
    const existing = await prisma.user.findUnique({ where: { email: personal.email.toLowerCase() }, select: { id: true } });
    if (existing) userId = existing.id;
    else {
      const { user } = await createStudentAccount({ name: `${personal.firstName} ${personal.lastName}`, email: personal.email, phone: personal.phone, whatsapp: personal.whatsapp ?? personal.phone, city: personal.city, emailVerified: false });
      userId = user.id;
      const { generateToken } = await import("@/server/auth/password");
      const { token, tokenHash } = generateToken();
      await prisma.verificationToken.create({ data: { identifier: user.email, tokenHash, purpose: "PASSWORD_RESET", userId: user.id, expires: new Date(Date.now() + 7 * 86400000) } });
      const { emailProvider, emailLayout } = await import("@/server/providers/email");
      const { absoluteUrl } = await import("@/lib/utils");
      await emailProvider().send({ to: user.email, subject: `Welcome to Globify Tech — set your password`, html: emailLayout({ title: `Welcome, ${personal.firstName}.`, body: `Your application for <strong>${app.course.title}</strong> has been approved. Set a password to open your learning space.`, cta: { label: "Set my password", href: absoluteUrl(`/reset-password?token=${token}`) } }), text: `Set your password: ${absoluteUrl(`/reset-password?token=${token}`)}` });
    }
  }
  const student = await ensureStudentProfile(userId);
  const enrollment = await enrollStudent({ studentId: student.id, courseId: app.courseId, batchId: params.batchId ?? app.preferredBatchId ?? null, source: "ADMISSION" });

  let invoiceId: string | null = null;
  const feePlanId = params.feePlanId ?? app.course.feePlans.find((p) => p.isDefault)?.id ?? app.course.feePlans[0]?.id ?? null;
  if (feePlanId) {
    const invoice = await createInvoiceFromFeePlan({ studentId: student.id, enrollmentId: enrollment.id, feePlanId, issuedById: params.reviewerId });
    invoiceId = invoice.id;
  }

  const updated = await prisma.application.update({ where: { id: app.id }, data: { status: "ENROLLED", applicantUserId: userId, reviewedById: params.reviewerId, reviewedAt: new Date(), decisionNote: params.note ?? null, enrollmentId: enrollment.id } });
  if (app.lead) {
    await prisma.lead.update({ where: { id: app.lead.id }, data: { convertedUserId: userId } });
    await changeStage({ leadId: app.lead.id, stage: invoiceId ? "FEE_PENDING" : "ENROLLED", actorId: params.reviewerId, note: `Application ${app.number} approved` });
  }
  await notify({ userId, event: "APPLICATION_STATUS", data: { number: app.number, course: app.course.title, status: "approved" }, href: "/student/dashboard", fallback: { title: `You're in! ${app.course.title}`, body: invoiceId ? "Your admission is approved. Complete your fee payment to unlock every lesson." : "Your admission is approved. Your learning space is ready." } });
  return updated;
}
