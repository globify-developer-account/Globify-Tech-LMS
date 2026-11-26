import "server-only";
import { prisma, type Prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import type { LeadInput, PublicLeadInput } from "@/lib/validation/crm";
import { notify, notifyRole } from "./notifications";
import { normalizePhone } from "@/server/providers/whatsapp";
import type { LeadStage, LeadActivityType } from "@prisma/client";

export const LEAD_STAGES: LeadStage[] = ["NEW", "CONTACTED", "COUNSELLING", "INTERESTED", "APPLICATION", "APPROVED", "FEE_PENDING", "ENROLLED", "LOST"];

/** Simple lead scoring: completeness + intent signals. */
export function scoreLead(lead: { email?: string | null; phone?: string | null; courseId?: string | null; source: string; message?: string | null; preferredMode?: string | null }): number {
  let score = 10;
  if (lead.phone) score += 15;
  if (lead.email) score += 10;
  if (lead.courseId) score += 25;
  if (lead.preferredMode) score += 10;
  if (lead.message && lead.message.length > 40) score += 10;
  if (["REFERRAL", "WALK_IN", "WHATSAPP"].includes(lead.source)) score += 15;
  if (["EVENT", "PHONE"].includes(lead.source)) score += 10;
  return Math.min(100, score);
}

/** Website / API lead capture. De-duplicates by phone within 30 days. */
export async function capturePublicLead(input: PublicLeadInput, meta?: { ip?: string | null }) {
  const phone = normalizePhone(input.phone);
  const recent = await prisma.lead.findFirst({ where: { phone, deletedAt: null, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } }, orderBy: { createdAt: "desc" } });
  let campaignId: string | null = null;
  if (input.utm?.campaign) {
    const campaign = await prisma.campaign.findFirst({ where: { utmCampaign: input.utm.campaign, isActive: true } });
    campaignId = campaign?.id ?? null;
  }
  if (recent) {
    await prisma.leadActivity.create({ data: { leadId: recent.id, type: "SYSTEM", summary: "Submitted another enquiry from the website", details: { message: input.message, courseId: input.courseId, ip: meta?.ip } as never } });
    if (input.courseId && !recent.courseId) await prisma.lead.update({ where: { id: recent.id }, data: { courseId: input.courseId } });
    return { lead: recent, duplicate: true };
  }
  const data = { name: input.name, phone, whatsapp: phone, email: input.email || null, city: input.city || null, courseId: input.courseId ?? null, interest: input.interest || null, message: input.message || null, preferredMode: input.preferredMode ?? null, source: input.source, campaignId, metadata: { utm: input.utm, ip: meta?.ip } as never };
  const lead = await prisma.lead.create({ data: { ...data, score: scoreLead(data), activities: { create: { type: "SYSTEM", summary: `Lead captured from ${input.source.toLowerCase()}` } } } });
  await autoAssign(lead.id);
  return { lead, duplicate: false };
}

/** Round-robin assignment to active counsellors. */
async function autoAssign(leadId: string) {
  const counsellors = await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: ["COUNSELLOR", "ADMISSIONS_MANAGER"] } } } } }, select: { id: true, _count: { select: { leadsAssigned: { where: { stage: { notIn: ["ENROLLED", "LOST"] }, deletedAt: null } } } } }, orderBy: { createdAt: "asc" } });
  if (!counsellors.length) return;
  const target = counsellors.sort((a, b) => a._count.leadsAssigned - b._count.leadsAssigned)[0]!;
  await assignLead(leadId, target.id, null);
}

export async function assignLead(leadId: string, counsellorId: string | null, actorId: string | null) {
  const lead = await prisma.lead.update({ where: { id: leadId }, data: { counsellorId } });
  const counsellor = counsellorId ? await prisma.user.findUnique({ where: { id: counsellorId }, select: { name: true } }) : null;
  await prisma.leadActivity.create({ data: { leadId, actorId, type: "SYSTEM", summary: counsellor ? `Assigned to ${counsellor.name}` : "Unassigned" } });
  if (counsellorId) await notify({ userId: counsellorId, event: "LEAD_ASSIGNED", data: { name: lead.name }, href: `/admin/leads/${leadId}`, fallback: { title: `New lead: ${lead.name}`, body: lead.courseId ? "Interested in a course. Follow up today." : "Follow up today." }, channels: ["IN_APP"] });
  return lead;
}

export async function createLead(input: LeadInput, actorId: string) {
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const data = { name: input.name, phone, whatsapp: input.whatsapp ? normalizePhone(input.whatsapp) : phone, email: input.email || null, city: input.city || null, education: input.education || null, courseId: input.courseId ?? null, interest: input.interest || null, source: input.source, campaignId: input.campaignId ?? null, counsellorId: input.counsellorId ?? null, preferredMode: input.preferredMode ?? null, message: input.message || null, nextFollowUpAt: input.nextFollowUpAt ?? null };
  return prisma.lead.create({ data: { ...data, score: scoreLead(data), activities: { create: { actorId, type: "SYSTEM", summary: "Lead created" } } } });
}

export async function updateLead(leadId: string, input: LeadInput, actorId: string) {
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const data = { name: input.name, phone, whatsapp: input.whatsapp ? normalizePhone(input.whatsapp) : phone, email: input.email || null, city: input.city || null, education: input.education || null, courseId: input.courseId ?? null, interest: input.interest || null, source: input.source, campaignId: input.campaignId ?? null, counsellorId: input.counsellorId ?? null, preferredMode: input.preferredMode ?? null, message: input.message || null, nextFollowUpAt: input.nextFollowUpAt ?? null };
  const before = await prisma.lead.findUnique({ where: { id: leadId }, select: { counsellorId: true } });
  const lead = await prisma.lead.update({ where: { id: leadId }, data: { ...data, score: scoreLead(data) } });
  if (before && before.counsellorId !== lead.counsellorId) await assignLead(leadId, lead.counsellorId, actorId);
  return lead;
}

export async function changeStage(params: { leadId: string; stage: LeadStage; actorId: string; lostReason?: string; note?: string }) {
  const lead = await prisma.lead.findUnique({ where: { id: params.leadId } });
  if (!lead) throw AppError.notFound("Lead");
  if (lead.stage === params.stage) return lead;
  if (params.stage === "LOST" && !params.lostReason) throw AppError.validation("Add a reason when marking a lead as lost.");
  const updated = await prisma.lead.update({ where: { id: params.leadId }, data: { stage: params.stage, lostReason: params.stage === "LOST" ? params.lostReason : null, lastContactedAt: new Date() } });
  await prisma.leadActivity.create({ data: { leadId: params.leadId, actorId: params.actorId, type: "STAGE_CHANGE", summary: `Moved from ${lead.stage} to ${params.stage}`, details: { from: lead.stage, to: params.stage, note: params.note, lostReason: params.lostReason } as never } });
  return updated;
}

export async function logActivity(params: { leadId: string; actorId: string; type: LeadActivityType; summary: string; details?: string; nextFollowUpAt?: Date | null }) {
  const activity = await prisma.leadActivity.create({ data: { leadId: params.leadId, actorId: params.actorId, type: params.type, summary: params.summary, details: params.details ? { text: params.details } : undefined } });
  await prisma.lead.update({ where: { id: params.leadId }, data: { lastContactedAt: ["CALL", "WHATSAPP", "EMAIL", "MEETING"].includes(params.type) ? new Date() : undefined, nextFollowUpAt: params.nextFollowUpAt === undefined ? undefined : params.nextFollowUpAt, stage: undefined } });
  // Auto-advance NEW → CONTACTED on first outreach
  const lead = await prisma.lead.findUnique({ where: { id: params.leadId }, select: { stage: true } });
  if (lead?.stage === "NEW" && ["CALL", "WHATSAPP", "EMAIL", "MEETING"].includes(params.type)) await changeStage({ leadId: params.leadId, stage: "CONTACTED", actorId: params.actorId });
  return activity;
}

export async function addTask(params: { leadId: string; actorId: string; title: string; dueAt?: Date | null; assigneeId?: string | null }) {
  const lead = await prisma.lead.findUnique({ where: { id: params.leadId }, select: { counsellorId: true } });
  const task = await prisma.leadTask.create({ data: { leadId: params.leadId, title: params.title, dueAt: params.dueAt ?? null, assigneeId: params.assigneeId ?? lead?.counsellorId ?? params.actorId } });
  await prisma.leadActivity.create({ data: { leadId: params.leadId, actorId: params.actorId, type: "TASK", summary: `Task added: ${params.title}` } });
  return task;
}

export async function completeTask(taskId: string, actorId: string) {
  const task = await prisma.leadTask.update({ where: { id: taskId }, data: { status: "DONE", completedAt: new Date() } });
  await prisma.leadActivity.create({ data: { leadId: task.leadId, actorId, type: "TASK", summary: `Task completed: ${task.title}` } });
  return task;
}

export async function addNote(params: { leadId: string; authorId: string; body: string }) {
  const note = await prisma.leadNote.create({ data: params });
  await prisma.leadActivity.create({ data: { leadId: params.leadId, actorId: params.authorId, type: "NOTE", summary: params.body.slice(0, 120) } });
  return note;
}

export interface LeadFilters {
  q?: string;
  stage?: LeadStage;
  source?: string;
  counsellorId?: string;
  courseId?: string;
  campaignId?: string;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listLeads(filters: LeadFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const where: Prisma.LeadWhereInput = {
    deletedAt: null,
    ...(filters.q ? { OR: [{ name: { contains: filters.q } }, { phone: { contains: filters.q } }, { email: { contains: filters.q } }, { city: { contains: filters.q } }] } : {}),
    ...(filters.stage ? { stage: filters.stage } : {}),
    ...(filters.source ? { source: filters.source as never } : {}),
    ...(filters.counsellorId ? { counsellorId: filters.counsellorId } : {}),
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
    ...(filters.overdueOnly ? { nextFollowUpAt: { lt: new Date() }, stage: { notIn: ["ENROLLED", "LOST"] } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.lead.findMany({ where, orderBy: [{ updatedAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { course: { select: { id: true, title: true } }, counsellor: { select: { id: true, name: true, avatar: { select: { url: true } } } }, campaign: { select: { name: true } }, _count: { select: { tasks: { where: { status: "OPEN" } } } } } }),
    prisma.lead.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

/** Kanban payload: every non-terminal lead grouped by stage (capped per column). */
export async function pipeline(filters: { counsellorId?: string; courseId?: string; perStage?: number }) {
  const perStage = filters.perStage ?? 50;
  const base: Prisma.LeadWhereInput = { deletedAt: null, ...(filters.counsellorId ? { counsellorId: filters.counsellorId } : {}), ...(filters.courseId ? { courseId: filters.courseId } : {}) };
  const [counts, ...columns] = await Promise.all([
    prisma.lead.groupBy({ by: ["stage"], where: base, _count: { _all: true } }),
    ...LEAD_STAGES.map((stage) => prisma.lead.findMany({ where: { ...base, stage }, orderBy: { updatedAt: "desc" }, take: perStage, include: { course: { select: { title: true } }, counsellor: { select: { name: true, avatar: { select: { url: true } } } } } })),
  ]);
  return LEAD_STAGES.map((stage, i) => ({ stage, total: counts.find((c) => c.stage === stage)?._count._all ?? 0, leads: columns[i]! }));
}

export async function getLead(leadId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, deletedAt: null }, include: { course: { select: { id: true, title: true, slug: true } }, counsellor: { select: { id: true, name: true, avatar: { select: { url: true } } } }, campaign: true, activities: { orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } }, tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }], include: { assignee: { select: { name: true } } } }, notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } }, application: { select: { id: true, number: true, status: true } }, convertedUser: { select: { id: true, name: true, email: true } } } });
  if (!lead) throw AppError.notFound("Lead");
  return lead;
}

export async function softDeleteLead(leadId: string) {
  return prisma.lead.update({ where: { id: leadId }, data: { deletedAt: new Date() } });
}

export async function crmStats(counsellorId?: string) {
  const base: Prisma.LeadWhereInput = { deletedAt: null, ...(counsellorId ? { counsellorId } : {}) };
  const since = new Date(Date.now() - 30 * 86400000);
  const [total, newThisMonth, enrolled, lost, overdue, bySource] = await Promise.all([
    prisma.lead.count({ where: base }),
    prisma.lead.count({ where: { ...base, createdAt: { gte: since } } }),
    prisma.lead.count({ where: { ...base, stage: "ENROLLED", updatedAt: { gte: since } } }),
    prisma.lead.count({ where: { ...base, stage: "LOST", updatedAt: { gte: since } } }),
    prisma.lead.count({ where: { ...base, nextFollowUpAt: { lt: new Date() }, stage: { notIn: ["ENROLLED", "LOST"] } } }),
    prisma.lead.groupBy({ by: ["source"], where: { ...base, createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  return { total, newThisMonth, enrolled, lost, overdue, conversion: newThisMonth ? Math.round((enrolled / newThisMonth) * 100) : 0, bySource: bySource.map((s) => ({ source: s.source, count: s._count._all })) };
}

export async function uncontactedLeadsDigest() {
  const stale = await prisma.lead.findMany({ where: { deletedAt: null, stage: "NEW", createdAt: { lt: new Date(Date.now() - 24 * 3600000) } }, select: { id: true, name: true } });
  if (stale.length) await notifyRole(["ADMISSIONS_MANAGER"], { event: "SYSTEM", data: { count: stale.length }, href: "/admin/leads?stage=NEW", fallback: { title: `${stale.length} leads haven't been contacted`, body: "These leads have waited more than 24 hours." }, channels: ["IN_APP"] });
  return stale.length;
}
