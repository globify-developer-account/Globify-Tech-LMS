"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, AppError, type ActionResult } from "@/server/errors";
import { requirePermission, requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { fieldErrors, uuid, nonEmpty } from "@/lib/validation/common";
import { leadSchema, leadStageChangeSchema, leadActivitySchema, leadTaskSchema, leadNoteSchema, campaignSchema, applicationDecisionSchema } from "@/lib/validation/crm";
import { feePlanSchema, createInvoiceSchema, recordPaymentSchema, refundSchema, discountSchema, scholarshipSchema, scholarshipAwardSchema } from "@/lib/validation/finance";
import { batchSchema, batchStudentsSchema, enrollmentSchema, campusSchema, classroomSchema } from "@/lib/validation/delivery";
import { categorySchema, programSchema, learningPathSchema } from "@/lib/validation/course";
import { employerSchema, jobSchema, internshipSchema, jobApplicationStatusSchema } from "@/lib/validation/career";
import { pageSchema, pageSectionSchema, publishSchema, navigationItemSchema, blogPostSchema, eventSchema, testimonialSchema, faqSchema, successStorySchema } from "@/lib/validation/cms";
import * as crm from "@/server/services/crm";
import * as apps from "@/server/services/applications";
import * as finance from "@/server/services/finance";
import * as batches from "@/server/services/batches";
import * as enrollments from "@/server/services/enrollments";
import * as certs from "@/server/services/certificates";
import * as career from "@/server/services/career";
import * as cms from "@/server/services/cms";
import * as media from "@/server/services/media";
import * as instructors from "@/server/services/instructors";
import * as students from "@/server/services/students";
import { setSetting } from "@/server/services/settings";
import { acknowledgeRisk, computeAllRisk } from "@/server/services/risk";
import { bumpSessionVersion, ensureRole, removeRole } from "@/server/services/users";
import { revalidateCourse } from "@/server/services/courses";
import { audit } from "@/server/audit";
import { slugify } from "@/lib/utils";
import { enqueue } from "@/server/jobs";
import { ROLE_KEYS, type RoleKey } from "@/lib/rbac";

type R<T = void> = Promise<ActionResult<T>>;
const v = <S extends z.ZodTypeAny>(schema: S, input: unknown) => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw AppError.validation(undefined, fieldErrors(parsed.error));
  return parsed.data as z.infer<S>;
};
const wrap = async <T>(fn: () => Promise<T>): R<T> => {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error);
  }
};

// ───────────── CRM ─────────────

export const createLeadAction = async (input: z.infer<typeof leadSchema>): R<{ id: string }> =>
  wrap(async () => {
    const user = await requirePermission("crm.leads.create");
    const lead = await crm.createLead(v(leadSchema, input), user.id);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "lead.create", entityType: "Lead", entityId: lead.id });
    revalidatePath("/admin/leads");
    return { id: lead.id };
  });

export const updateLeadAction = async (id: string, input: z.infer<typeof leadSchema>): R =>
  wrap(async () => {
    const user = await requirePermission("crm.leads.update");
    await crm.updateLead(id, v(leadSchema, input), user.id);
    revalidatePath(`/admin/leads/${id}`);
    revalidatePath("/admin/leads");
  });

export const changeLeadStageAction = async (input: z.infer<typeof leadStageChangeSchema>): R =>
  wrap(async () => {
    const user = await requirePermission("crm.leads.update");
    const d = v(leadStageChangeSchema, input);
    await crm.changeStage({ leadId: d.leadId, stage: d.stage, actorId: user.id, lostReason: d.lostReason, note: d.note });
    await audit({ actorId: user.id, actorRoles: user.roles, action: "lead.stage", entityType: "Lead", entityId: d.leadId, after: { stage: d.stage } });
    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${d.leadId}`);
  });

export const assignLeadAction = async (leadId: string, counsellorId: string | null): R =>
  wrap(async () => {
    const user = await requirePermission("crm.leads.assign");
    await crm.assignLead(leadId, counsellorId, user.id);
    revalidatePath(`/admin/leads/${leadId}`);
    revalidatePath("/admin/leads");
  });

export const logLeadActivityAction = async (input: z.infer<typeof leadActivitySchema>): R =>
  wrap(async () => {
    const user = await requirePermission("crm.leads.update");
    const d = v(leadActivitySchema, input);
    await crm.logActivity({ leadId: d.leadId, actorId: user.id, type: d.type, summary: d.summary, details: d.details, nextFollowUpAt: d.nextFollowUpAt });
    revalidatePath(`/admin/leads/${d.leadId}`);
  });

export const addLeadTaskAction = async (input: z.infer<typeof leadTaskSchema>): R =>
  wrap(async () => {
    const user = await requirePermission("crm.leads.update");
    const d = v(leadTaskSchema, input);
    await crm.addTask({ leadId: d.leadId, actorId: user.id, title: d.title, dueAt: d.dueAt, assigneeId: d.assigneeId });
    revalidatePath(`/admin/leads/${d.leadId}`);
  });

export const completeLeadTaskAction = async (taskId: string, leadId: string): R =>
  wrap(async () => {
    const user = await requirePermission("crm.leads.update");
    await crm.completeTask(taskId, user.id);
    revalidatePath(`/admin/leads/${leadId}`);
  });

export const addLeadNoteAction = async (input: z.infer<typeof leadNoteSchema>): R =>
  wrap(async () => {
    const user = await requirePermission("crm.leads.update");
    const d = v(leadNoteSchema, input);
    await crm.addNote({ leadId: d.leadId, authorId: user.id, body: d.body });
    revalidatePath(`/admin/leads/${d.leadId}`);
  });

export const deleteLeadAction = async (leadId: string): R =>
  wrap(async () => {
    const user = await requirePermission("crm.leads.delete");
    await crm.softDeleteLead(leadId);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "lead.delete", entityType: "Lead", entityId: leadId });
    revalidatePath("/admin/leads");
  });

export const upsertCampaignAction = async (input: z.infer<typeof campaignSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("crm.campaigns.manage");
    const d = v(campaignSchema, input);
    const data = { ...d, utmSource: d.utmSource || null, utmMedium: d.utmMedium || null, utmCampaign: d.utmCampaign || null, budget: d.budget ?? null, startDate: d.startDate ?? null, endDate: d.endDate ?? null };
    const c = id ? await prisma.campaign.update({ where: { id }, data }) : await prisma.campaign.create({ data });
    revalidatePath("/admin/leads");
    return { id: c.id };
  });

// ───────────── Admissions ─────────────

export const decideApplicationAction = async (input: z.infer<typeof applicationDecisionSchema>): R =>
  wrap(async () => {
    const user = await requirePermission("applications.review");
    const d = v(applicationDecisionSchema, input);
    await apps.decideApplication({ applicationId: d.applicationId, decision: d.decision, note: d.note, batchId: d.batchId, feePlanId: d.feePlanId, reviewerId: user.id });
    await audit({ actorId: user.id, actorRoles: user.roles, action: `application.${d.decision.toLowerCase()}`, entityType: "Application", entityId: d.applicationId, after: { batchId: d.batchId, feePlanId: d.feePlanId } });
    revalidatePath("/admin/applications");
    revalidatePath(`/admin/applications/${d.applicationId}`);
    revalidatePath("/admin/admissions");
  });

// ───────────── Students & instructors ─────────────

export const adminCreateStudentAction = async (input: { name: string; email: string; password?: string; phone?: string; city?: string; campusId?: string | null }): R<{ id: string }> =>
  wrap(async () => {
    const user = await requirePermission("students.create");
    const d = v(z.object({ name: nonEmpty.max(80), email: z.string().email(), password: z.string().min(10).optional().or(z.literal("")), phone: z.string().max(20).optional().or(z.literal("")), city: z.string().max(80).optional().or(z.literal("")), campusId: uuid.nullable().optional() }), input);
    const { profile } = await instructors.adminCreateStudent({ name: d.name, email: d.email, password: d.password || undefined, phone: d.phone || undefined, city: d.city || undefined, campusId: d.campusId ?? null });
    await audit({ actorId: user.id, actorRoles: user.roles, action: "student.create", entityType: "StudentProfile", entityId: profile.id, after: { email: d.email } });
    revalidatePath("/admin/students");
    return { id: profile.id };
  });

export const setUserStatusAction = async (userId: string, status: "ACTIVE" | "SUSPENDED"): R =>
  wrap(async () => {
    const user = await requirePermission("students.update");
    if (userId === user.id) throw AppError.validation("You can't suspend yourself.");
    const before = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    await students.setUserStatus(userId, status);
    await audit({ actorId: user.id, actorRoles: user.roles, action: `user.${status.toLowerCase()}`, entityType: "User", entityId: userId, before, after: { status } });
    revalidatePath("/admin/students");
  });

export const setUserRolesAction = async (userId: string, roles: RoleKey[]): R =>
  wrap(async () => {
    const user = await requirePermission("staff.manage");
    const valid = roles.filter((r) => (ROLE_KEYS as readonly string[]).includes(r));
    if (userId === user.id && !valid.includes("SUPER_ADMIN") && user.roles.includes("SUPER_ADMIN")) throw AppError.validation("You can't remove your own super admin role.");
    const current = await prisma.userRole.findMany({ where: { userId }, include: { role: true } });
    for (const c of current) if (!valid.includes(c.role.key as RoleKey)) await removeRole(userId, c.role.key as RoleKey);
    for (const r of valid) await ensureRole(userId, r);
    await bumpSessionVersion(userId);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "user.roles", entityType: "User", entityId: userId, before: { roles: current.map((c) => c.role.key) }, after: { roles: valid } });
    revalidatePath("/admin/students");
    revalidatePath("/admin/instructors");
  });

export const createInstructorAction = async (input: instructors.InstructorInput): R<{ id: string }> =>
  wrap(async () => {
    const user = await requirePermission("instructors.manage");
    const d = v(z.object({ name: nonEmpty.max(80), email: z.string().email(), password: z.string().min(10).optional().or(z.literal("")), phone: z.string().max(20).optional().or(z.literal("")), title: z.string().max(120).optional().or(z.literal("")), bio: z.string().max(3000).optional().or(z.literal("")), expertise: z.array(z.string().max(60)).max(20).default([]), yearsExperience: z.number().int().min(0).max(60).nullable().optional(), linkedinUrl: z.string().url().optional().or(z.literal("")), websiteUrl: z.string().url().optional().or(z.literal("")), isFeatured: z.boolean().default(false), isPublic: z.boolean().default(true), campusId: uuid.nullable().optional(), avatarMediaId: uuid.nullable().optional() }), input);
    const p = await instructors.createInstructor({ ...d, password: d.password || undefined });
    await audit({ actorId: user.id, actorRoles: user.roles, action: "instructor.create", entityType: "InstructorProfile", entityId: p.id, after: { email: d.email } });
    revalidatePath("/admin/instructors");
    return { id: p.id };
  });

export const updateInstructorAction = async (id: string, input: instructors.InstructorInput): R =>
  wrap(async () => {
    const user = await requirePermission("instructors.manage");
    await instructors.updateInstructor(id, { ...input, password: input.password || undefined });
    await audit({ actorId: user.id, actorRoles: user.roles, action: "instructor.update", entityType: "InstructorProfile", entityId: id });
    revalidatePath(`/admin/instructors/${id}`);
    revalidatePath("/admin/instructors");
  });

export const deactivateInstructorAction = async (id: string): R =>
  wrap(async () => {
    const user = await requirePermission("instructors.manage");
    await instructors.deactivateInstructor(id);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "instructor.deactivate", entityType: "InstructorProfile", entityId: id });
    revalidatePath("/admin/instructors");
  });

// ───────────── Batches, enrollments, campuses ─────────────

export const saveBatchAction = async (input: z.infer<typeof batchSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    const user = await requirePermission("batches.manage");
    const d = v(batchSchema, input);
    const b = id ? await batches.updateBatch(id, d) : await batches.createBatch(d);
    await audit({ actorId: user.id, actorRoles: user.roles, action: id ? "batch.update" : "batch.create", entityType: "Batch", entityId: b.id, after: { code: d.code, status: d.status } });
    revalidatePath("/admin/batches");
    revalidatePath(`/admin/batches/${b.id}`);
    return { id: b.id };
  });

export const addStudentsToBatchAction = async (input: z.infer<typeof batchStudentsSchema>): R =>
  wrap(async () => {
    const user = await requirePermission("enrollments.manage");
    const d = v(batchStudentsSchema, input);
    await batches.addStudentsToBatch(d.batchId, d.studentIds);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "batch.add_students", entityType: "Batch", entityId: d.batchId, after: { count: d.studentIds.length } });
    revalidatePath(`/admin/batches/${d.batchId}`);
  });

export const removeStudentFromBatchAction = async (batchId: string, studentId: string): R =>
  wrap(async () => {
    const user = await requirePermission("enrollments.manage");
    await batches.removeStudentFromBatch(batchId, studentId);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "batch.remove_student", entityType: "Batch", entityId: batchId, after: { studentId } });
    revalidatePath(`/admin/batches/${batchId}`);
  });

export const createEnrollmentAction = async (input: z.infer<typeof enrollmentSchema>): R<{ id: string }> =>
  wrap(async () => {
    const user = await requirePermission("enrollments.manage");
    const d = v(enrollmentSchema, input);
    const e = await enrollments.enrollStudent({ studentId: d.studentId, courseId: d.courseId, batchId: d.batchId, source: d.source });
    if (d.createInvoice && d.feePlanId) await finance.createInvoiceFromFeePlan({ studentId: d.studentId, enrollmentId: e.id, feePlanId: d.feePlanId, issuedById: user.id });
    await audit({ actorId: user.id, actorRoles: user.roles, action: "enrollment.create", entityType: "Enrollment", entityId: e.id, after: d });
    revalidatePath("/admin/enrollments");
    return { id: e.id };
  });

export const setEnrollmentStatusAction = async (id: string, status: "ACTIVE" | "PAUSED" | "DROPPED" | "EXPIRED"): R =>
  wrap(async () => {
    const user = await requirePermission("enrollments.manage");
    await enrollments.setEnrollmentStatus(id, status);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "enrollment.status", entityType: "Enrollment", entityId: id, after: { status } });
    revalidatePath("/admin/enrollments");
  });

export const saveCampusAction = async (input: z.infer<typeof campusSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("settings.manage");
    const d = v(campusSchema, input);
    const data = { ...d, address: d.address || null, phone: d.phone || null, email: d.email || null };
    const c = id ? await prisma.campus.update({ where: { id }, data }) : await prisma.campus.create({ data });
    revalidatePath("/admin/settings");
    return { id: c.id };
  });

export const saveClassroomAction = async (input: z.infer<typeof classroomSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("settings.manage");
    const d = v(classroomSchema, input);
    const data = { ...d, floor: d.floor || null };
    const c = id ? await prisma.classroom.update({ where: { id }, data }) : await prisma.classroom.create({ data });
    revalidatePath("/admin/settings");
    return { id: c.id };
  });

// ───────────── Catalogue structure ─────────────

export const saveCategoryAction = async (input: z.infer<typeof categorySchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("categories.manage");
    const d = v(categorySchema, input);
    const data = { name: d.name, description: d.description || null, artworkKey: d.artworkKey, order: d.order, parentId: d.parentId ?? null };
    const c = id ? await prisma.category.update({ where: { id }, data }) : await prisma.category.create({ data: { ...data, slug: d.slug ?? slugify(d.name) } });
    revalidateCourse();
    revalidatePath("/admin/categories");
    return { id: c.id };
  });

export const deleteCategoryAction = async (id: string): R =>
  wrap(async () => {
    await requirePermission("categories.manage");
    await prisma.category.update({ where: { id }, data: { isActive: false } });
    revalidatePath("/admin/categories");
  });

export const saveProgramAction = async (input: z.infer<typeof programSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("programs.manage");
    const d = v(programSchema, input);
    const { courseIds, ...rest } = d;
    const data = { title: rest.title, subtitle: rest.subtitle || null, description: rest.description ? (await import("@/lib/sanitize")).sanitizeRichText(rest.description) : null, durationWeeks: rest.durationWeeks ?? null, price: rest.price ?? null, featured: rest.featured, outcomes: rest.outcomes, artworkMediaId: rest.artworkMediaId ?? null };
    const p = await prisma.$transaction(async (tx) => {
      const row = id ? await tx.program.update({ where: { id }, data }) : await tx.program.create({ data: { ...data, slug: rest.slug ?? slugify(rest.title) } });
      await tx.programCourse.deleteMany({ where: { programId: row.id } });
      if (courseIds.length) await tx.programCourse.createMany({ data: courseIds.map((courseId, order) => ({ programId: row.id, courseId, order })) });
      return row;
    });
    revalidateCourse();
    revalidatePath("/admin/programs");
    return { id: p.id };
  });

export const setProgramStatusAction = async (id: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED"): R =>
  wrap(async () => {
    await requirePermission("programs.manage");
    await prisma.program.update({ where: { id }, data: { status, publishedAt: status === "PUBLISHED" ? new Date() : undefined } });
    revalidateCourse();
    revalidatePath("/admin/programs");
  });

export const saveLearningPathAction = async (input: z.infer<typeof learningPathSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("programs.manage");
    const d = v(learningPathSchema, input);
    const data = { title: d.title, description: d.description || null, careerGoal: d.careerGoal || null, artworkKey: d.artworkKey, featured: d.featured };
    const p = await prisma.$transaction(async (tx) => {
      const row = id ? await tx.learningPath.update({ where: { id }, data }) : await tx.learningPath.create({ data: { ...data, slug: d.slug ?? slugify(d.title) } });
      await tx.learningPathStep.deleteMany({ where: { pathId: row.id } });
      if (d.steps.length) await tx.learningPathStep.createMany({ data: d.steps.map((s, order) => ({ pathId: row.id, title: s.title, description: s.description || null, courseId: s.courseId ?? null, isOptional: s.isOptional, order })) });
      return row;
    });
    revalidateCourse();
    revalidatePath("/admin/programs");
    return { id: p.id };
  });

export const setLearningPathStatusAction = async (id: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED"): R =>
  wrap(async () => {
    await requirePermission("programs.manage");
    await prisma.learningPath.update({ where: { id }, data: { status, publishedAt: status === "PUBLISHED" ? new Date() : undefined } });
    revalidateCourse();
    revalidatePath("/admin/programs");
  });

// ───────────── Finance ─────────────

export const saveFeePlanAction = async (input: z.infer<typeof feePlanSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    const user = await requirePermission("payments.create");
    const d = v(feePlanSchema, input);
    const p = await finance.upsertFeePlan({ id, ...d });
    await audit({ actorId: user.id, actorRoles: user.roles, action: "feeplan.save", entityType: "FeePlan", entityId: p.id, after: d });
    revalidatePath(`/admin/courses/${d.courseId}`);
    revalidatePath("/admin/payments");
    return { id: p.id };
  });

export const createInvoiceAction = async (input: z.infer<typeof createInvoiceSchema>): R<{ id: string }> =>
  wrap(async () => {
    const user = await requirePermission("payments.create");
    const d = v(createInvoiceSchema, input);
    const inv = await finance.createInvoice({ ...d, discountCode: d.discountCode || undefined, notes: d.notes || undefined, issuedById: user.id });
    await audit({ actorId: user.id, actorRoles: user.roles, action: "invoice.create", entityType: "Invoice", entityId: inv.id, after: { number: inv.number, total: inv.total } });
    revalidatePath("/admin/invoices");
    return { id: inv.id };
  });

export const voidInvoiceAction = async (id: string): R =>
  wrap(async () => {
    const user = await requirePermission("payments.create");
    await finance.voidInvoice(id);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "invoice.void", entityType: "Invoice", entityId: id });
    revalidatePath(`/admin/invoices/${id}`);
    revalidatePath("/admin/invoices");
  });

export const recordPaymentAction = async (input: z.infer<typeof recordPaymentSchema>): R<{ receipt: string }> =>
  wrap(async () => {
    const user = await requirePermission("payments.create");
    const d = v(recordPaymentSchema, input);
    const r = await finance.recordPayment({ invoiceId: d.invoiceId, amount: d.amount, provider: d.provider, method: d.method || undefined, providerRef: d.providerRef || undefined, paidAt: d.paidAt, recordedById: user.id, note: d.note || undefined });
    await audit({ actorId: user.id, actorRoles: user.roles, action: "payment.record", entityType: "Payment", entityId: r.payment.id, after: { invoiceId: d.invoiceId, amount: d.amount, provider: d.provider } });
    revalidatePath(`/admin/invoices/${d.invoiceId}`);
    revalidatePath("/admin/payments");
    return { receipt: r.receipt.number };
  });

export const refundAction = async (input: z.infer<typeof refundSchema>): R =>
  wrap(async () => {
    const user = await requirePermission("payments.refund");
    const d = v(refundSchema, input);
    const r = await finance.refundPayment({ ...d, processedById: user.id });
    await audit({ actorId: user.id, actorRoles: user.roles, action: "payment.refund", entityType: "Refund", entityId: r.id, after: { invoiceId: d.invoiceId, amount: d.amount, reason: d.reason } });
    revalidatePath(`/admin/invoices/${d.invoiceId}`);
    revalidatePath("/admin/payments");
  });

export const saveDiscountAction = async (input: z.infer<typeof discountSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    const user = await requirePermission("discounts.manage");
    const d = v(discountSchema, input);
    const data = { ...d, maxUses: d.maxUses ?? null, validFrom: d.validFrom ?? null, validTo: d.validTo ?? null };
    const row = id ? await prisma.discount.update({ where: { id }, data }) : await prisma.discount.create({ data });
    await audit({ actorId: user.id, actorRoles: user.roles, action: "discount.save", entityType: "Discount", entityId: row.id, after: { code: d.code, value: d.value } });
    revalidatePath("/admin/discounts");
    return { id: row.id };
  });

export const saveScholarshipAction = async (input: z.infer<typeof scholarshipSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("discounts.manage");
    const d = v(scholarshipSchema, input);
    const data = { ...d, description: d.description || null, criteria: d.criteria || null, seats: d.seats ?? null };
    const row = id ? await prisma.scholarship.update({ where: { id }, data }) : await prisma.scholarship.create({ data });
    revalidatePath("/admin/scholarships");
    return { id: row.id };
  });

export const awardScholarshipAction = async (input: z.infer<typeof scholarshipAwardSchema>): R =>
  wrap(async () => {
    const user = await requirePermission("discounts.manage");
    const d = v(scholarshipAwardSchema, input);
    await prisma.scholarshipAward.create({ data: { scholarshipId: d.scholarshipId, studentId: d.studentId, note: d.note || null } });
    await audit({ actorId: user.id, actorRoles: user.roles, action: "scholarship.award", entityType: "ScholarshipAward", entityId: d.studentId, after: d });
    revalidatePath("/admin/scholarships");
  });

// ───────────── Certificates ─────────────

export const issueCertificateAction = async (enrollmentId: string): R<{ number: string }> =>
  wrap(async () => {
    const user = await requirePermission("certificates.issue");
    const c = await certs.issueCertificate({ enrollmentId, signedById: user.id });
    await audit({ actorId: user.id, actorRoles: user.roles, action: "certificate.issue", entityType: "Certificate", entityId: c.id, after: { number: c.certificateNumber } });
    revalidatePath("/admin/certificates");
    return { number: c.certificateNumber };
  });

export const revokeCertificateAction = async (id: string, reason: string): R =>
  wrap(async () => {
    const user = await requirePermission("certificates.revoke");
    if (!reason.trim()) throw AppError.validation("Give a reason for revoking.");
    await certs.revokeCertificate(id, reason.trim());
    await audit({ actorId: user.id, actorRoles: user.roles, action: "certificate.revoke", entityType: "Certificate", entityId: id, after: { reason } });
    revalidatePath("/admin/certificates");
    revalidatePath(`/admin/certificates/${id}`);
  });

export const reinstateCertificateAction = async (id: string): R =>
  wrap(async () => {
    const user = await requirePermission("certificates.revoke");
    await certs.reinstateCertificate(id);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "certificate.reinstate", entityType: "Certificate", entityId: id });
    revalidatePath("/admin/certificates");
  });

export const regenerateCertificatePdfAction = async (id: string): R =>
  wrap(async () => {
    await requirePermission("certificates.issue");
    await enqueue("certificate.render", { certificateId: id });
  });

// ───────────── Career ─────────────

export const saveEmployerAction = async (input: z.infer<typeof employerSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("career.jobs.manage");
    const d = v(employerSchema, input);
    const e = await career.upsertEmployer({ id, ...d });
    revalidatePath("/admin/employers");
    return { id: e.id };
  });

export const saveJobAction = async (input: z.infer<typeof jobSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("career.jobs.manage");
    const d = v(jobSchema, input);
    const j = await career.upsertJob({ id, ...d });
    revalidatePath("/admin/jobs");
    revalidatePath("/careers");
    return { id: j.id };
  });

export const saveInternshipAction = async (input: z.infer<typeof internshipSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("career.jobs.manage");
    const d = v(internshipSchema, input);
    const j = await career.upsertInternship({ id, ...d });
    revalidatePath("/admin/internships");
    revalidatePath("/careers");
    return { id: j.id };
  });

export const setJobApplicationStatusAction = async (input: z.infer<typeof jobApplicationStatusSchema>): R =>
  wrap(async () => {
    await requirePermission("career.jobs.manage");
    const d = v(jobApplicationStatusSchema, input);
    await prisma.jobApplication.update({ where: { id: d.applicationId }, data: { status: d.status } });
    revalidatePath("/admin/jobs");
    revalidatePath("/admin/internships");
  });

// ───────────── CMS ─────────────

export const savePageAction = async (input: z.infer<typeof pageSchema> & { id?: string }): R<{ id: string }> =>
  wrap(async () => {
    const user = await requirePermission("cms.pages.manage");
    const d = v(pageSchema, input);
    const p = await cms.upsertPage({ ...d, id: input.id }, user.id);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "page.save", entityType: "Page", entityId: p.id, after: { slug: p.slug } });
    revalidatePath("/admin/pages");
    return { id: p.id };
  });

export const saveSectionAction = async (input: z.infer<typeof pageSectionSchema> & { id?: string }): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("cms.pages.manage");
    const d = v(pageSectionSchema, input);
    const s = await cms.upsertSection({ ...d, id: input.id, name: d.name || undefined });
    revalidatePath(`/admin/pages/${d.pageId}`);
    return { id: s.id };
  });

export const duplicateSectionAction = async (id: string, pageId: string): R =>
  wrap(async () => {
    await requirePermission("cms.pages.manage");
    await cms.duplicateSection(id);
    revalidatePath(`/admin/pages/${pageId}`);
  });

export const deleteSectionAction = async (id: string, pageId: string): R =>
  wrap(async () => {
    await requirePermission("cms.pages.manage");
    await cms.deleteSection(id);
    revalidatePath(`/admin/pages/${pageId}`);
  });

export const reorderSectionsAction = async (pageId: string, ids: string[]): R =>
  wrap(async () => {
    await requirePermission("cms.pages.manage");
    await cms.reorderSections(pageId, ids);
    revalidatePath(`/admin/pages/${pageId}`);
  });

export const setPageStatusAction = async (input: z.infer<typeof publishSchema>): R =>
  wrap(async () => {
    const user = await requirePermission("cms.publish");
    const d = v(publishSchema, input);
    await cms.setPageStatus(d.id, d.action, d.scheduledAt);
    await audit({ actorId: user.id, actorRoles: user.roles, action: `page.${d.action}`, entityType: "Page", entityId: d.id });
    revalidatePath("/admin/pages");
    revalidatePath(`/admin/pages/${d.id}`);
  });

export const saveNavigationItemAction = async (input: z.infer<typeof navigationItemSchema> & { id?: string }): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("cms.navigation.manage");
    const d = v(navigationItemSchema, input);
    const i = await cms.upsertNavigationItem({ ...d, id: input.id, description: d.description || undefined });
    revalidatePath("/admin/cms");
    return { id: i.id };
  });

export const deleteNavigationItemAction = async (id: string): R =>
  wrap(async () => {
    await requirePermission("cms.navigation.manage");
    await cms.deleteNavigationItem(id);
    revalidatePath("/admin/cms");
  });

export const reorderNavigationAction = async (ids: string[]): R =>
  wrap(async () => {
    await requirePermission("cms.navigation.manage");
    await cms.reorderNavigation(ids);
    revalidatePath("/admin/cms");
  });

export const savePostAction = async (input: z.infer<typeof blogPostSchema> & { id?: string }): R<{ id: string }> =>
  wrap(async () => {
    const user = await requirePermission("cms.blog.manage");
    const d = v(blogPostSchema, input);
    if ((d.status === "PUBLISHED" || d.status === "SCHEDULED") && !(await import("@/lib/rbac")).can(user, "cms.publish")) throw AppError.forbidden("You can save drafts; publishing needs the publish permission.");
    const p = await cms.upsertPost({ ...d, id: input.id }, user.id);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "post.save", entityType: "BlogPost", entityId: p.id, after: { slug: p.slug, status: p.status } });
    revalidatePath("/admin/blog");
    return { id: p.id };
  });

export const deletePostAction = async (id: string): R =>
  wrap(async () => {
    const user = await requirePermission("cms.blog.manage");
    await cms.softDeletePost(id);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "post.delete", entityType: "BlogPost", entityId: id });
    revalidatePath("/admin/blog");
  });

export const saveEventAction = async (input: z.infer<typeof eventSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("cms.content.manage");
    const d = v(eventSchema, input);
    const { sanitizeRichText } = await import("@/lib/sanitize");
    const data = { title: d.title, description: d.description ? sanitizeRichText(d.description) : null, startsAt: d.startsAt, endsAt: d.endsAt ?? null, location: d.location || null, isOnline: d.isOnline, meetingUrl: d.meetingUrl || null, capacity: d.capacity ?? null, coverMediaId: d.coverMediaId ?? null, campusId: d.campusId ?? null, status: d.status };
    const e = id ? await prisma.event.update({ where: { id }, data }) : await prisma.event.create({ data: { ...data, slug: d.slug ?? `${slugify(d.title)}-${Date.now().toString(36)}` } });
    cms.revalidateContent();
    revalidatePath("/admin/events");
    revalidatePath("/events");
    return { id: e.id };
  });

export const saveTestimonialAction = async (input: z.infer<typeof testimonialSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("cms.content.manage");
    const d = v(testimonialSchema, input);
    const data = { ...d, role: d.role || null, company: d.company || null, courseTitle: d.courseTitle || null, outcome: d.outcome || null, avatarMediaId: d.avatarMediaId ?? null };
    const t = id ? await prisma.testimonial.update({ where: { id }, data }) : await prisma.testimonial.create({ data });
    cms.revalidateContent();
    revalidatePath("/admin/testimonials");
    return { id: t.id };
  });

export const deleteTestimonialAction = async (id: string): R =>
  wrap(async () => {
    await requirePermission("cms.content.manage");
    await prisma.testimonial.delete({ where: { id } });
    cms.revalidateContent();
    revalidatePath("/admin/testimonials");
  });

export const saveFaqAction = async (input: z.infer<typeof faqSchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("cms.content.manage");
    const d = v(faqSchema, input);
    const f = id ? await prisma.faq.update({ where: { id }, data: d }) : await prisma.faq.create({ data: d });
    cms.revalidateContent();
    revalidatePath("/admin/cms");
    return { id: f.id };
  });

export const deleteFaqAction = async (id: string): R =>
  wrap(async () => {
    await requirePermission("cms.content.manage");
    await prisma.faq.delete({ where: { id } });
    cms.revalidateContent();
    revalidatePath("/admin/cms");
  });

export const saveSuccessStoryAction = async (input: z.infer<typeof successStorySchema>, id?: string): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("cms.content.manage");
    const d = v(successStorySchema, input);
    const { sanitizeRichText } = await import("@/lib/sanitize");
    const data = { name: d.name, headline: d.headline, story: sanitizeRichText(d.story), outcome: d.outcome || null, courseTitle: d.courseTitle || null, coverMediaId: d.coverMediaId ?? null, status: d.status, isFeatured: d.isFeatured, publishedAt: d.status === "PUBLISHED" ? new Date() : undefined };
    const s = id ? await prisma.successStory.update({ where: { id }, data }) : await prisma.successStory.create({ data: { ...data, slug: d.slug ?? slugify(`${d.name}-${d.headline}`).slice(0, 80) } });
    cms.revalidateContent();
    revalidatePath("/admin/testimonials");
    revalidatePath("/success-stories");
    return { id: s.id };
  });

export const deleteMediaAction = async (id: string): R =>
  wrap(async () => {
    const user = await requirePermission("cms.media.manage");
    await media.deleteMedia(id);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "media.delete", entityType: "Media", entityId: id });
    revalidatePath("/admin/media");
  });

export const updateMediaAction = async (id: string, input: { alt?: string; caption?: string; tags?: string[]; folderId?: string | null }): R =>
  wrap(async () => {
    await requirePermission("cms.media.manage");
    await prisma.media.update({ where: { id }, data: { alt: input.alt ?? undefined, caption: input.caption ?? undefined, tags: input.tags ?? undefined, folderId: input.folderId === undefined ? undefined : input.folderId } });
    revalidatePath("/admin/media");
  });

export const createMediaFolderAction = async (name: string, parentId?: string | null): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("cms.media.manage");
    const f = await prisma.mediaFolder.create({ data: { name: name.trim().slice(0, 60), parentId: parentId ?? null } });
    revalidatePath("/admin/media");
    return { id: f.id };
  });

// ───────────── Notifications ─────────────

export const saveNotificationTemplateAction = async (input: { id?: string; event: string; channel: string; locale: string; subject?: string; body: string; isActive: boolean }): R<{ id: string }> =>
  wrap(async () => {
    await requirePermission("notifications.manage");
    const d = v(z.object({ id: uuid.optional(), event: z.string(), channel: z.string(), locale: z.string().max(5).default("en"), subject: z.string().max(200).optional().or(z.literal("")), body: nonEmpty.max(5000), isActive: z.boolean().default(true) }), input);
    const data = { event: d.event as never, channel: d.channel as never, locale: d.locale, subject: d.subject || null, body: d.body, isActive: d.isActive };
    const t = d.id ? await prisma.notificationTemplate.update({ where: { id: d.id }, data }) : await prisma.notificationTemplate.upsert({ where: { event_channel_locale: { event: data.event, channel: data.channel, locale: data.locale } }, update: data, create: data });
    revalidatePath("/admin/notifications");
    return { id: t.id };
  });

export const broadcastAnnouncementAction = async (input: { title: string; body: string; audience: "ALL_STUDENTS" | "ALL_INSTRUCTORS" | "COURSE"; courseId?: string | null; channels: string[] }): R<{ count: number }> =>
  wrap(async () => {
    const user = await requirePermission("notifications.manage");
    const d = v(z.object({ title: nonEmpty.max(200), body: nonEmpty.max(5000), audience: z.enum(["ALL_STUDENTS", "ALL_INSTRUCTORS", "COURSE"]), courseId: uuid.nullable().optional(), channels: z.array(z.enum(["IN_APP", "PUSH", "EMAIL", "WHATSAPP", "SMS"])).min(1) }), input);
    const users = d.audience === "COURSE" && d.courseId ? (await prisma.enrollment.findMany({ where: { courseId: d.courseId, status: "ACTIVE" }, select: { student: { select: { userId: true } } } })).map((e) => e.student.userId) : (await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: d.audience === "ALL_STUDENTS" ? "STUDENT" : "INSTRUCTOR" } } } }, select: { id: true } })).map((u) => u.id);
    const { notify } = await import("@/server/services/notifications");
    await Promise.all(users.map((userId) => notify({ userId, event: "ANNOUNCEMENT", data: { title: d.title }, channels: d.channels as never, fallback: { title: d.title, body: d.body } })));
    await audit({ actorId: user.id, actorRoles: user.roles, action: "notification.broadcast", entityType: "Notification", after: { audience: d.audience, count: users.length, channels: d.channels } });
    return { count: users.length };
  });

// ───────────── Settings, risk, automation ─────────────

export const saveSettingsAction = async (values: Record<string, unknown>): R =>
  wrap(async () => {
    const user = await requirePermission("settings.manage");
    for (const [key, value] of Object.entries(values)) {
      if (!/^[a-z]+\.[a-zA-Z]+$/.test(key)) continue;
      await setSetting(key, value, user.id);
    }
    await audit({ actorId: user.id, actorRoles: user.roles, action: "settings.update", entityType: "Setting", after: values });
    revalidatePath("/admin/settings");
  });

export const acknowledgeRiskAction = async (id: string): R =>
  wrap(async () => {
    const user = await requirePermission("analytics.read");
    await acknowledgeRisk(id, user.id);
    revalidatePath("/admin/analytics");
  });

export const recomputeRiskAction = async (): R<{ processed: number; high: number }> =>
  wrap(async () => {
    await requirePermission("analytics.read");
    return computeAllRisk();
  });

export const runDailyJobsAction = async (): R =>
  wrap(async () => {
    const user = await requirePermission("automation.manage");
    await enqueue("analytics.daily", {});
    await audit({ actorId: user.id, actorRoles: user.roles, action: "automation.run_daily", entityType: "Job" });
  });

export const impersonationCheckAction = async (): R<{ allowed: boolean }> =>
  wrap(async () => {
    const user = await requireUser();
    return { allowed: (await import("@/lib/rbac")).can(user, "users.impersonate") };
  });

// ───────────── Lookups used by admin forms ─────────────

export const searchStudentsAction = async (q: string): R<Array<{ id: string; label: string; email: string }>> =>
  wrap(async () => {
    await requirePermission("students.read");
    const term = q.trim();
    if (term.length < 2) return [];
    const rows = await prisma.studentProfile.findMany({ where: { user: { deletedAt: null, OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }, { phone: { contains: term } }] } }, take: 15, orderBy: { createdAt: "desc" }, select: { id: true, studentNumber: true, user: { select: { name: true, email: true } } } });
    const byNumber = await prisma.studentProfile.findMany({ where: { studentNumber: { contains: term, mode: "insensitive" } }, take: 5, select: { id: true, studentNumber: true, user: { select: { name: true, email: true } } } });
    const seen = new Set<string>();
    return [...rows, ...byNumber].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).map((r) => ({ id: r.id, label: `${r.user.name} · ${r.studentNumber}`, email: r.user.email }));
  });

export const runPaymentRemindersAction = async (): R =>
  wrap(async () => {
    const user = await requirePermission("payments.create");
    await finance.runPaymentReminders();
    await audit({ actorId: user.id, actorRoles: user.roles, action: "payment.reminders", entityType: "Invoice" });
    revalidatePath("/admin/payments");
    revalidatePath("/admin/invoices");
  });
