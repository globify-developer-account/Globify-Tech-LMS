import "server-only";
import { streamText, tool, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { can, type Permission } from "@/lib/rbac";
import type { SessionUser } from "@/server/auth/session";
import { getModel, BRAND_VOICE } from "./provider";
import { enforceRateLimit } from "@/server/rate-limit";
import { toNumber } from "@/lib/utils";
import { adminOverview } from "@/server/services/analytics";
import { latestRiskScores } from "@/server/services/risk";

/**
 * Permission-aware tool set. Each tool is only registered when the asking
 * user holds the permission, so the model cannot even attempt to read data
 * the user couldn't open in the UI. Every tool is read-only.
 */
function buildTools(user: SessionUser) {
  const tools: ToolSet = {};
  const has = (p: Permission) => can(user, p);
  const since = (days: number) => new Date(Date.now() - days * 86400000);

  if (has("analytics.read")) {
    tools.overview = tool({ description: "Key institute metrics: students, enrollments, revenue this month, leads, at-risk count, pending applications, outstanding fees.", inputSchema: z.object({}), execute: async () => (await adminOverview()).kpis });
    tools.enrollmentsInPeriod = tool({ description: "Count enrollments created in the last N days, optionally by course.", inputSchema: z.object({ days: z.number().int().min(1).max(365).default(30), courseTitle: z.string().optional() }), execute: async ({ days, courseTitle }) => {
      const rows = await prisma.enrollment.groupBy({ by: ["courseId"], where: { createdAt: { gte: since(days) }, ...(courseTitle ? { course: { title: { contains: courseTitle } } } : {}) }, _count: { _all: true } });
      const courses = await prisma.course.findMany({ where: { id: { in: rows.map((r) => r.courseId) } }, select: { id: true, title: true } });
      return rows.map((r) => ({ course: courses.find((c) => c.id === r.courseId)?.title, enrollments: r._count._all })).sort((a, b) => b.enrollments - a.enrollments);
    } });
    tools.bestPerformingCourses = tool({ description: "Courses ranked by enrollments, completion rate and rating.", inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(5) }), execute: async ({ limit }) => {
      const courses = await prisma.course.findMany({ where: { status: "PUBLISHED", deletedAt: null }, select: { title: true, studentCount: true, ratingAvg: true, enrollments: { select: { status: true } } }, orderBy: { studentCount: "desc" }, take: limit });
      return courses.map((c) => ({ title: c.title, students: c.studentCount, rating: toNumber(c.ratingAvg), completionRate: c.enrollments.length ? Math.round((c.enrollments.filter((e) => e.status === "COMPLETED").length / c.enrollments.length) * 100) : 0 }));
    } });
    tools.atRiskStudents = tool({ description: "Students flagged HIGH or MEDIUM risk by the success engine, with reasons.", inputSchema: z.object({ level: z.enum(["HIGH", "MEDIUM"]).default("HIGH"), limit: z.number().int().min(1).max(30).default(10) }), execute: async ({ level, limit }) => (await latestRiskScores({ level, pageSize: limit })).items.map((r) => ({ student: r.student.user.name, course: r.enrollment?.course.title, score: r.score, reasons: r.reasons, recommendation: r.recommendation })) });
  }
  if (has("payments.read")) {
    tools.unpaidFees = tool({ description: "Students with unpaid or overdue invoices and their balances.", inputSchema: z.object({ overdueOnly: z.boolean().default(false), limit: z.number().int().min(1).max(50).default(20) }), execute: async ({ overdueOnly, limit }) => {
      const invoices = await prisma.invoice.findMany({ where: { deletedAt: null, status: overdueOnly ? "OVERDUE" : { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } }, take: limit, orderBy: { dueDate: "asc" }, include: { student: { select: { user: { select: { name: true, phone: true } } } } } });
      return invoices.map((i) => ({ invoice: i.number, student: i.student.user.name, phone: i.student.user.phone, balance: toNumber(i.total) - toNumber(i.amountPaid), dueDate: i.dueDate?.toISOString().slice(0, 10), status: i.status }));
    } });
    tools.revenue = tool({ description: "Revenue collected in the last N days, grouped by payment provider.", inputSchema: z.object({ days: z.number().int().min(1).max(365).default(30) }), execute: async ({ days }) => {
      const rows = await prisma.payment.groupBy({ by: ["provider"], where: { status: "SUCCEEDED", paidAt: { gte: since(days) } }, _sum: { amount: true }, _count: { _all: true } });
      return { days, total: rows.reduce((s, r) => s + toNumber(r._sum.amount ?? 0), 0), byProvider: rows.map((r) => ({ provider: r.provider, amount: toNumber(r._sum.amount ?? 0), payments: r._count._all })) };
    } });
  }
  if (has("crm.leads.read")) {
    tools.uncontactedLeads = tool({ description: "Leads still in NEW stage (never contacted), oldest first.", inputSchema: z.object({ olderThanHours: z.number().int().min(0).max(720).default(24), limit: z.number().int().min(1).max(50).default(20) }), execute: async ({ olderThanHours, limit }) => {
      const leads = await prisma.lead.findMany({ where: { deletedAt: null, stage: "NEW", createdAt: { lt: new Date(Date.now() - olderThanHours * 3600000) } }, orderBy: { createdAt: "asc" }, take: limit, include: { course: { select: { title: true } }, counsellor: { select: { name: true } } } });
      return leads.map((l) => ({ name: l.name, phone: l.phone, course: l.course?.title, source: l.source, counsellor: l.counsellor?.name, ageHours: Math.round((Date.now() - l.createdAt.getTime()) / 3600000) }));
    } });
    tools.leadPipeline = tool({ description: "Lead counts per pipeline stage for the last N days, plus conversion rate.", inputSchema: z.object({ days: z.number().int().min(1).max(365).default(30) }), execute: async ({ days }) => {
      const rows = await prisma.lead.groupBy({ by: ["stage"], where: { deletedAt: null, createdAt: { gte: since(days) } }, _count: { _all: true } });
      const total = rows.reduce((s, r) => s + r._count._all, 0);
      const enrolled = rows.find((r) => r.stage === "ENROLLED")?._count._all ?? 0;
      return { total, conversionPercent: total ? Math.round((enrolled / total) * 100) : 0, stages: rows.map((r) => ({ stage: r.stage, count: r._count._all })) };
    } });
  }
  if (has("applications.read")) {
    tools.pendingApplications = tool({ description: "Applications awaiting review.", inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }), execute: async ({ limit }) => (await prisma.application.findMany({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } }, orderBy: { submittedAt: "asc" }, take: limit, include: { course: { select: { title: true } } } })).map((a) => ({ number: a.number, applicant: (a.personal as { firstName: string; lastName: string }).firstName + " " + (a.personal as { lastName: string }).lastName, course: a.course.title, submitted: a.submittedAt?.toISOString().slice(0, 10), status: a.status })) });
  }
  if (has("attendance.read")) {
    tools.attendanceByBatch = tool({ description: "Attendance rate per running batch.", inputSchema: z.object({}), execute: async () => {
      const batches = await prisma.batch.findMany({ where: { status: "RUNNING", deletedAt: null }, select: { code: true, name: true, attendance: { select: { status: true } } } });
      return batches.map((b) => ({ batch: b.code, name: b.name, sessions: b.attendance.length, rate: b.attendance.length ? Math.round((b.attendance.filter((a) => a.status !== "ABSENT").length / b.attendance.length) * 100) : null }));
    } });
  }
  return tools;
}

export async function adminAssistantStream(params: { user: SessionUser; conversationId?: string | null; message: string }) {
  if (!can(params.user, "ai.admin_assistant")) throw new Error("FORBIDDEN");
  await enforceRateLimit(`ai:admin:${params.user.id}`, 60, 3600);
  const model = await getModel();
  const tools = buildTools(params.user);

  let conversation = params.conversationId ? await prisma.aIConversation.findFirst({ where: { id: params.conversationId, userId: params.user.id } }) : null;
  if (!conversation) conversation = await prisma.aIConversation.create({ data: { userId: params.user.id, contextType: "ADMIN_ASSISTANT", title: params.message.slice(0, 80) } });
  const history = await prisma.aIMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" }, take: 20 });
  await prisma.aIMessage.create({ data: { conversationId: conversation.id, role: "USER", content: params.message } });

  const messages: ModelMessage[] = [
    ...history.filter((m) => m.role === "USER" || m.role === "ASSISTANT").map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content })),
    { role: "user", content: params.message },
  ];
  const available = Object.keys(tools);
  const result = streamText({
    model,
    system: `${BRAND_VOICE}\nYou are the operations assistant for institute staff. Answer with numbers from the tools; never guess figures. If a question needs data you have no tool for, say so and name who can help (finance, admissions, academics). Tools available to this user: ${available.join(", ") || "none"}. When asked for a report, produce a concise structured summary with headings and the most important numbers first. Today is ${new Date().toDateString()}.`,
    messages,
    tools,
    stopWhen: stepCountIs(4),
    maxOutputTokens: 1200,
    temperature: 0.2,
    onFinish: async ({ text, usage, steps }) => {
      const toolCalls = steps.flatMap((s) => s.toolCalls.map((c) => ({ name: c.toolName, input: c.input })));
      await prisma.aIMessage.create({ data: { conversationId: conversation!.id, role: "ASSISTANT", content: text, tokens: usage.totalTokens ?? null, toolCalls: toolCalls.length ? (toolCalls as never) : undefined } });
      await prisma.aIConversation.update({ where: { id: conversation!.id }, data: { tokensUsed: { increment: usage.totalTokens ?? 0 } } });
    },
  });
  return { result, conversationId: conversation.id, availableTools: available };
}
