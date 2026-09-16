import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma, Prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { notify, notifyRole } from "./notifications";
import { getSetting } from "./settings";
import { storeGeneratedFile } from "./media";
import { evaluateAndCompleteIfReady } from "./completion";
import { changeStage } from "./crm";
import { enabledPaymentProviders, paymentDriver, type ProviderKey, type WebhookResult } from "@/server/providers/payments";
import { absoluteUrl, formatMoney, toNumber } from "@/lib/utils";
import { enqueue } from "@/server/jobs";
import type { InvoiceStatus, PaymentProvider } from "@prisma/client";

const D = (v: number | string | Prisma.Decimal) => new Prisma.Decimal(v);

async function nextNumber(tx: Prisma.TransactionClient, kind: "INV" | "RCP"): Promise<string> {
  const prefix = `${kind}-${new Date().getFullYear()}-`;
  // Compare numerically: numbers of different widths (seeded 00022 vs 000023) don't sort as strings.
  const rows = kind === "INV" ? await tx.invoice.findMany({ where: { number: { startsWith: prefix } }, select: { number: true } }) : await tx.receipt.findMany({ where: { number: { startsWith: prefix } }, select: { number: true } });
  const n = rows.reduce((max, r) => Math.max(max, Number(r.number.slice(prefix.length)) || 0), 0) + 1;
  return `${prefix}${String(n).padStart(6, "0")}`;
}

// ───────────── Fee plans ─────────────

export async function upsertFeePlan(input: { id?: string; courseId: string; name: string; totalAmount: number; currency: string; isDefault: boolean; installments: Array<{ label: string; amount: number; dueAfterDays: number }> }) {
  const sum = input.installments.reduce((s, i) => s + i.amount, 0);
  if (Math.abs(sum - input.totalAmount) > 0.01) throw AppError.validation(`Installments add up to ${sum}, but the plan total is ${input.totalAmount}.`);
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.feePlan.updateMany({ where: { courseId: input.courseId }, data: { isDefault: false } });
    const data = { courseId: input.courseId, name: input.name, totalAmount: input.totalAmount, currency: input.currency, isDefault: input.isDefault };
    const plan = input.id ? await tx.feePlan.update({ where: { id: input.id }, data }) : await tx.feePlan.create({ data });
    await tx.feeInstallment.deleteMany({ where: { feePlanId: plan.id } });
    await tx.feeInstallment.createMany({ data: input.installments.map((i, order) => ({ feePlanId: plan.id, label: i.label, amount: i.amount, dueAfterDays: i.dueAfterDays, order })) });
    return plan;
  });
}

// ───────────── Discounts & scholarships ─────────────

export async function validateDiscount(code: string, courseId: string | null, amount: number): Promise<{ discount: { id: string; code: string; type: "PERCENT" | "FIXED"; value: number }; discountAmount: number }> {
  const discount = await prisma.discount.findUnique({ where: { code: code.toUpperCase() } });
  const now = new Date();
  if (!discount || !discount.isActive) throw AppError.validation("That discount code isn't valid.");
  if (discount.validFrom && discount.validFrom > now) throw AppError.validation("That discount code isn't active yet.");
  if (discount.validTo && discount.validTo < now) throw AppError.validation("That discount code has expired.");
  if (discount.maxUses != null && discount.usedCount >= discount.maxUses) throw AppError.validation("That discount code has been fully redeemed.");
  if (discount.courseIds.length && (!courseId || !discount.courseIds.includes(courseId))) throw AppError.validation("That discount code doesn't apply to this course.");
  const value = toNumber(discount.value);
  const discountAmount = discount.type === "PERCENT" ? Math.round(amount * (value / 100) * 100) / 100 : Math.min(amount, value);
  return { discount: { id: discount.id, code: discount.code, type: discount.type, value }, discountAmount };
}

// ───────────── Invoices ─────────────

export interface CreateInvoiceInput {
  studentId: string;
  enrollmentId?: string | null;
  feePlanId?: string | null;
  discountCode?: string;
  scholarshipAwardId?: string | null;
  dueDate?: Date | null;
  notes?: string;
  issuedById: string;
  lines: Array<{ description: string; quantity: number; unitAmount: number; dueDate?: Date | null }>;
  isTestData?: boolean;
}

export async function createInvoice(input: CreateInvoiceInput) {
  const enrollment = input.enrollmentId ? await prisma.enrollment.findUnique({ where: { id: input.enrollmentId }, select: { courseId: true } }) : null;
  const subtotal = input.lines.reduce((s, l) => s + l.quantity * l.unitAmount, 0);
  let discountTotal = 0;
  let discountId: string | null = null;
  if (input.discountCode) {
    const v = await validateDiscount(input.discountCode, enrollment?.courseId ?? null, subtotal);
    discountTotal += v.discountAmount;
    discountId = v.discount.id;
  }
  if (input.scholarshipAwardId) {
    const award = await prisma.scholarshipAward.findUnique({ where: { id: input.scholarshipAwardId }, include: { scholarship: true } });
    if (!award || award.studentId !== input.studentId) throw AppError.validation("That scholarship isn't awarded to this student.");
    const value = toNumber(award.scholarship.value);
    discountTotal += award.scholarship.type === "PERCENT" ? Math.round(subtotal * (value / 100) * 100) / 100 : Math.min(subtotal, value);
  }
  discountTotal = Math.min(subtotal, discountTotal);
  const total = Math.round((subtotal - discountTotal) * 100) / 100;
  const dueDays = await getSetting("finance.invoiceDueDays");

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        number: await nextNumber(tx, "INV"),
        studentId: input.studentId,
        enrollmentId: input.enrollmentId ?? null,
        feePlanId: input.feePlanId ?? null,
        status: total === 0 ? "PAID" : "ISSUED",
        subtotal,
        discountTotal,
        total,
        amountPaid: total === 0 ? 0 : 0,
        discountId,
        scholarshipAwardId: input.scholarshipAwardId ?? null,
        issuedAt: new Date(),
        paidAt: total === 0 ? new Date() : null,
        dueDate: input.dueDate ?? new Date(Date.now() + dueDays * 86400000),
        notes: input.notes || null,
        issuedById: input.issuedById,
        isTestData: input.isTestData ?? false,
        lines: { create: input.lines.map((l, order) => ({ description: l.description, quantity: l.quantity, unitAmount: l.unitAmount, amount: l.quantity * l.unitAmount, dueDate: l.dueDate ?? null, order })) },
      },
    });
    if (discountId) await tx.discount.update({ where: { id: discountId }, data: { usedCount: { increment: 1 } } });
    return inv;
  });

  const student = await prisma.studentProfile.findUnique({ where: { id: input.studentId }, select: { userId: true } });
  if (student && total > 0) {
    await notify({ userId: student.userId, event: "PAYMENT_DUE", data: { number: invoice.number, amount: formatMoney(total), due: invoice.dueDate?.toDateString() ?? "" }, href: `/student/payments/${invoice.id}`, fallback: { title: `Invoice ${invoice.number} issued`, body: `${formatMoney(total)} is due by ${invoice.dueDate?.toLocaleDateString("en-GB")}. Pay online or by bank transfer.` } });
  }
  await enqueue("invoice.render", { invoiceId: invoice.id });
  return invoice;
}

export async function createInvoiceFromFeePlan(params: { studentId: string; enrollmentId: string; feePlanId: string; issuedById: string; discountCode?: string; scholarshipAwardId?: string | null }) {
  const plan = await prisma.feePlan.findUnique({ where: { id: params.feePlanId }, include: { installments: { orderBy: { order: "asc" } }, course: { select: { title: true } } } });
  if (!plan) throw AppError.notFound("Fee plan");
  const lines = plan.installments.length
    ? plan.installments.map((i) => ({ description: `${plan.course.title} — ${i.label}`, quantity: 1, unitAmount: toNumber(i.amount), dueDate: new Date(Date.now() + i.dueAfterDays * 86400000) }))
    : [{ description: `${plan.course.title} — ${plan.name}`, quantity: 1, unitAmount: toNumber(plan.totalAmount), dueDate: null as Date | null }];
  return createInvoice({ studentId: params.studentId, enrollmentId: params.enrollmentId, feePlanId: plan.id, issuedById: params.issuedById, discountCode: params.discountCode, scholarshipAwardId: params.scholarshipAwardId, lines, dueDate: lines[0]?.dueDate ?? null });
}

export async function voidInvoice(invoiceId: string) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { amountPaid: true } });
  if (!inv) throw AppError.notFound("Invoice");
  if (toNumber(inv.amountPaid) > 0) throw AppError.conflict("Refund payments before voiding this invoice.");
  return prisma.invoice.update({ where: { id: invoiceId }, data: { status: "VOID" } });
}

function statusAfterPayment(total: number, paid: number, dueDate: Date | null): InvoiceStatus {
  if (paid >= total - 0.005) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";
  if (dueDate && dueDate < new Date()) return "OVERDUE";
  return "ISSUED";
}

// ───────────── Payments ─────────────

export async function recordPayment(input: { invoiceId: string; amount: number; provider: PaymentProvider; method?: string; providerRef?: string; paidAt?: Date; recordedById?: string | null; note?: string; isTestData?: boolean }) {
  const invoice = await prisma.invoice.findUnique({ where: { id: input.invoiceId }, include: { student: { select: { userId: true } }, enrollment: { select: { id: true, courseId: true } } } });
  if (!invoice) throw AppError.notFound("Invoice");
  if (invoice.status === "VOID") throw AppError.conflict("This invoice is void.");
  const remaining = toNumber(invoice.total) - toNumber(invoice.amountPaid);
  if (input.amount > remaining + 0.005) throw AppError.validation(`Only ${formatMoney(remaining, invoice.currency)} remains on this invoice.`);

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({ data: { invoiceId: invoice.id, provider: input.provider, providerRef: input.providerRef || null, method: input.method || null, amount: input.amount, currency: invoice.currency, status: "SUCCEEDED", paidAt: input.paidAt ?? new Date(), recordedById: input.recordedById ?? null, metadata: input.note ? { note: input.note } : undefined, isTestData: input.isTestData ?? false } });
    const receipt = await tx.receipt.create({ data: { number: await nextNumber(tx, "RCP"), paymentId: payment.id } });
    const paid = toNumber(invoice.amountPaid) + input.amount;
    const status = statusAfterPayment(toNumber(invoice.total), paid, invoice.dueDate);
    await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid: D(paid), status, paidAt: status === "PAID" ? new Date() : null } });
    return { payment, receipt, status };
  });

  await notify({ userId: invoice.student.userId, event: "PAYMENT_RECEIVED", data: { amount: formatMoney(input.amount, invoice.currency), number: invoice.number, receipt: result.receipt.number }, href: `/student/payments/${invoice.id}`, fallback: { title: `Payment received — ${formatMoney(input.amount, invoice.currency)}`, body: `Receipt ${result.receipt.number} for invoice ${invoice.number}. ${result.status === "PAID" ? "Your invoice is fully paid." : "Thank you — a balance remains."}` } });
  if (result.status === "PAID" && invoice.enrollment) {
    await evaluateAndCompleteIfReady(invoice.enrollment.id);
    const lead = await prisma.lead.findFirst({ where: { convertedUserId: invoice.student.userId, stage: "FEE_PENDING" } });
    if (lead) await changeStage({ leadId: lead.id, stage: "ENROLLED", actorId: input.recordedById ?? "", note: `Invoice ${invoice.number} paid` });
  }
  await enqueue("invoice.render", { invoiceId: invoice.id });
  return result;
}

export async function refundPayment(input: { invoiceId: string; paymentId?: string | null; amount: number; reason: string; processedById: string }) {
  const invoice = await prisma.invoice.findUnique({ where: { id: input.invoiceId }, include: { student: { select: { userId: true } } } });
  if (!invoice) throw AppError.notFound("Invoice");
  if (input.amount > toNumber(invoice.amountPaid) + 0.005) throw AppError.validation("Refund exceeds the amount paid.");
  const refund = await prisma.$transaction(async (tx) => {
    const r = await tx.refund.create({ data: { invoiceId: invoice.id, paymentId: input.paymentId ?? null, amount: input.amount, reason: input.reason, status: "SUCCEEDED", processedById: input.processedById, processedAt: new Date() } });
    const paid = toNumber(invoice.amountPaid) - input.amount;
    await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid: D(paid), status: statusAfterPayment(toNumber(invoice.total), paid, invoice.dueDate), paidAt: null } });
    if (input.paymentId) {
      const p = await tx.payment.findUnique({ where: { id: input.paymentId } });
      if (p) await tx.payment.update({ where: { id: input.paymentId }, data: { status: input.amount >= toNumber(p.amount) - 0.005 ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    }
    return r;
  });
  await notify({ userId: invoice.student.userId, event: "PAYMENT_RECEIVED", data: { amount: formatMoney(input.amount, invoice.currency), number: invoice.number }, href: `/student/payments/${invoice.id}`, fallback: { title: `Refund of ${formatMoney(input.amount, invoice.currency)} processed`, body: `Invoice ${invoice.number}. ${input.reason}` } });
  return refund;
}

// ───────────── Online checkout ─────────────

export async function startCheckout(params: { invoiceId: string; studentId: string; provider: ProviderKey }) {
  const invoice = await prisma.invoice.findUnique({ where: { id: params.invoiceId }, include: { student: { include: { user: { select: { name: true, email: true, phone: true } } } } } });
  if (!invoice || invoice.studentId !== params.studentId) throw AppError.forbidden();
  if (["PAID", "VOID"].includes(invoice.status)) throw AppError.conflict("This invoice doesn't need a payment.");
  if (!enabledPaymentProviders().some((p) => p.key === params.provider)) throw AppError.unavailable("That payment method isn't available right now.");
  const remaining = toNumber(invoice.total) - toNumber(invoice.amountPaid);
  const session = await paymentDriver(params.provider).createCheckout({
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    amount: remaining,
    currency: invoice.currency,
    description: `Globify Tech — ${invoice.number}`,
    customer: { name: invoice.student.user.name, email: invoice.student.user.email, phone: invoice.student.user.phone },
    successUrl: absoluteUrl(`/student/payments/${invoice.id}?status=success`),
    cancelUrl: absoluteUrl(`/student/payments/${invoice.id}?status=cancelled`),
  });
  if (params.provider !== "BANK_TRANSFER") {
    await prisma.payment.upsert({
      where: { provider_providerRef: { provider: params.provider, providerRef: session.providerRef } },
      update: {},
      create: { invoiceId: invoice.id, provider: params.provider, providerRef: session.providerRef, amount: remaining, currency: invoice.currency, status: "PENDING" },
    });
  }
  return session;
}

/** Idempotent webhook handling for every provider. */
export async function handlePaymentWebhook(provider: ProviderKey, result: WebhookResult) {
  if (result.type === "ignored" || !result.providerEventId) return { handled: false };
  const existing = await prisma.webhookEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: result.providerEventId } } });
  if (existing?.processedAt) return { handled: true, duplicate: true };
  const event = existing ?? (await prisma.webhookEvent.create({ data: { provider, providerEventId: result.providerEventId, type: result.type, payload: result.raw as never } }));
  try {
    const pending = result.providerRef ? await prisma.payment.findUnique({ where: { provider_providerRef: { provider, providerRef: result.providerRef } } }) : null;
    if (result.type === "payment.succeeded" && pending && pending.status === "PENDING") {
      await prisma.payment.delete({ where: { id: pending.id } });
      await recordPayment({ invoiceId: pending.invoiceId, amount: result.amount ?? toNumber(pending.amount), provider, providerRef: result.providerRef ?? undefined, method: "online" });
    } else if (result.type === "payment.failed" && pending) {
      await prisma.payment.update({ where: { id: pending.id }, data: { status: "FAILED", failureReason: "Provider reported failure" } });
    }
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
    return { handled: true };
  } catch (error) {
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { error: (error as Error).message.slice(0, 500) } });
    throw error;
  }
}

// ───────────── Queries ─────────────

export async function listInvoices(filters: { q?: string; status?: InvoiceStatus; studentId?: string; page?: number; pageSize?: number }) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const where: Prisma.InvoiceWhereInput = { deletedAt: null, ...(filters.status ? { status: filters.status } : {}), ...(filters.studentId ? { studentId: filters.studentId } : {}), ...(filters.q ? { OR: [{ number: { contains: filters.q, mode: "insensitive" } }, { student: { user: { name: { contains: filters.q, mode: "insensitive" } } } }] } : {}) };
  const [items, total, sums] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { student: { select: { id: true, studentNumber: true, user: { select: { name: true, email: true } } } }, enrollment: { select: { course: { select: { title: true } } } } } }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where, _sum: { total: true, amountPaid: true } }),
  ]);
  return { items, total, page, pageSize, totals: { invoiced: toNumber(sums._sum.total ?? 0), collected: toNumber(sums._sum.amountPaid ?? 0) } };
}

export async function getInvoice(invoiceId: string) {
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, deletedAt: null }, include: { lines: { orderBy: { order: "asc" } }, payments: { orderBy: { createdAt: "desc" }, include: { receipt: true, recordedBy: { select: { name: true } } } }, refunds: { orderBy: { createdAt: "desc" } }, student: { include: { user: { select: { name: true, email: true, phone: true } } } }, enrollment: { include: { course: { select: { id: true, title: true } }, batch: { select: { code: true } } } }, discount: true, feePlan: true, issuedBy: { select: { name: true } }, pdf: { select: { url: true } } } });
  if (!inv) throw AppError.notFound("Invoice");
  return inv;
}

export async function financeOverview() {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [collectedMonth, outstanding, overdue, recent] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "SUCCEEDED", paidAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.invoice.aggregate({ where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } }, _sum: { total: true, amountPaid: true } }),
    prisma.invoice.count({ where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: new Date() } } }),
    prisma.payment.findMany({ where: { status: "SUCCEEDED" }, orderBy: { paidAt: "desc" }, take: 8, include: { invoice: { select: { number: true, student: { select: { user: { select: { name: true } } } } } } } }),
  ]);
  return { collectedMonth: toNumber(collectedMonth._sum.amount ?? 0), outstanding: toNumber(outstanding._sum.total ?? 0) - toNumber(outstanding._sum.amountPaid ?? 0), overdue, recent };
}

/** Job: flag overdue invoices and send reminders N days before due. */
export async function runPaymentReminders() {
  const remindDays = await getSetting("finance.reminderDaysBefore");
  await prisma.invoice.updateMany({ where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: new Date() } }, data: { status: "OVERDUE" } });
  const soon = await prisma.invoice.findMany({ where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] }, dueDate: { lte: new Date(Date.now() + remindDays * 86400000) } }, include: { student: { select: { userId: true } } } });
  for (const inv of soon) {
    const recent = await prisma.notification.findFirst({ where: { userId: inv.student.userId, event: "PAYMENT_DUE", createdAt: { gte: new Date(Date.now() - 3 * 86400000) }, data: { path: ["number"], equals: inv.number } } });
    if (recent) continue;
    const remaining = toNumber(inv.total) - toNumber(inv.amountPaid);
    await notify({ userId: inv.student.userId, event: "PAYMENT_DUE", data: { number: inv.number, amount: formatMoney(remaining, inv.currency), due: inv.dueDate?.toLocaleDateString("en-GB") ?? "" }, href: `/student/payments/${inv.id}`, fallback: { title: inv.status === "OVERDUE" ? `Invoice ${inv.number} is overdue` : `Reminder: ${formatMoney(remaining, inv.currency)} due soon`, body: `Invoice ${inv.number} is due ${inv.dueDate?.toLocaleDateString("en-GB")}.` } });
  }
  const overdueCount = await prisma.invoice.count({ where: { status: "OVERDUE", deletedAt: null } });
  if (overdueCount) await notifyRole(["FINANCE_MANAGER"], { event: "SYSTEM", data: { count: overdueCount }, href: "/admin/invoices?status=OVERDUE", fallback: { title: `${overdueCount} overdue invoices`, body: "Review outstanding balances." }, channels: ["IN_APP"] });
}

// ───────────── PDF ─────────────

export async function renderInvoicePdf(invoiceId: string): Promise<Buffer> {
  const inv = await getInvoice(invoiceId);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const [bold, regular] = await Promise.all([pdf.embedFont(StandardFonts.HelveticaBold), pdf.embedFont(StandardFonts.Helvetica)]);
  const ink = rgb(0.043, 0.051, 0.07);
  const muted = rgb(0.357, 0.392, 0.447);
  const accent = rgb(0.145, 0.388, 1);
  let y = 780;
  page.drawText("GLOBIFY TECH", { x: 48, y, size: 11, font: bold, color: accent });
  page.drawText(inv.status === "PAID" ? "RECEIPT" : "INVOICE", { x: 420, y, size: 20, font: bold, color: ink });
  y -= 22;
  page.drawText("2nd Floor, Kohinoor Plaza, Jaranwala Road, Faisalabad", { x: 48, y, size: 9, font: regular, color: muted });
  page.drawText(inv.number, { x: 420, y, size: 10, font: regular, color: muted });
  y -= 40;
  page.drawText("Billed to", { x: 48, y, size: 9, font: bold, color: muted });
  page.drawText("Issued", { x: 340, y, size: 9, font: bold, color: muted });
  page.drawText("Due", { x: 460, y, size: 9, font: bold, color: muted });
  y -= 16;
  page.drawText(inv.student.user.name, { x: 48, y, size: 12, font: bold, color: ink });
  page.drawText(inv.issuedAt?.toLocaleDateString("en-GB") ?? "", { x: 340, y, size: 11, font: regular, color: ink });
  page.drawText(inv.dueDate?.toLocaleDateString("en-GB") ?? "—", { x: 460, y, size: 11, font: regular, color: ink });
  y -= 14;
  page.drawText(inv.student.user.email, { x: 48, y, size: 10, font: regular, color: muted });
  y -= 40;
  page.drawRectangle({ x: 48, y: y - 6, width: 499, height: 22, color: rgb(0.968, 0.972, 0.98) });
  page.drawText("Description", { x: 56, y, size: 9, font: bold, color: muted });
  page.drawText("Qty", { x: 380, y, size: 9, font: bold, color: muted });
  page.drawText("Amount", { x: 470, y, size: 9, font: bold, color: muted });
  y -= 26;
  for (const line of inv.lines) {
    page.drawText(line.description.slice(0, 60), { x: 56, y, size: 10, font: regular, color: ink });
    page.drawText(String(line.quantity), { x: 380, y, size: 10, font: regular, color: ink });
    page.drawText(formatMoney(toNumber(line.amount), inv.currency), { x: 470, y, size: 10, font: regular, color: ink });
    y -= 18;
  }
  y -= 10;
  page.drawLine({ start: { x: 340, y }, end: { x: 547, y }, thickness: 0.5, color: rgb(0.83, 0.85, 0.88) });
  y -= 18;
  const rows: Array<[string, string, boolean]> = [["Subtotal", formatMoney(toNumber(inv.subtotal), inv.currency), false]];
  if (toNumber(inv.discountTotal) > 0) rows.push(["Discount", `-${formatMoney(toNumber(inv.discountTotal), inv.currency)}`, false]);
  rows.push(["Total", formatMoney(toNumber(inv.total), inv.currency), true], ["Paid", formatMoney(toNumber(inv.amountPaid), inv.currency), false], ["Balance due", formatMoney(toNumber(inv.total) - toNumber(inv.amountPaid), inv.currency), true]);
  for (const [label, value, strong] of rows) {
    page.drawText(label, { x: 340, y, size: 10, font: strong ? bold : regular, color: strong ? ink : muted });
    page.drawText(value, { x: 470, y, size: 10, font: strong ? bold : regular, color: ink });
    y -= 16;
  }
  if (inv.payments.length) {
    y -= 20;
    page.drawText("Payments", { x: 48, y, size: 9, font: bold, color: muted });
    y -= 16;
    for (const p of inv.payments.filter((p) => p.status === "SUCCEEDED")) {
      page.drawText(`${p.paidAt?.toLocaleDateString("en-GB")} · ${p.provider.replace("_", " ")} · ${p.receipt?.number ?? ""}`, { x: 48, y, size: 9, font: regular, color: muted });
      page.drawText(formatMoney(toNumber(p.amount), inv.currency), { x: 470, y, size: 9, font: regular, color: ink });
      y -= 14;
    }
  }
  page.drawText("Thank you for learning with Globify Tech. Learn Today. Lead Tomorrow.", { x: 48, y: 48, size: 9, font: regular, color: muted });
  return Buffer.from(await pdf.save());
}

export async function renderAndStoreInvoice(invoiceId: string) {
  const pdf = await renderInvoicePdf(invoiceId);
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { number: true } });
  const media = await storeGeneratedFile({ key: `invoices/${inv.number}.pdf`, body: pdf, mime: "application/pdf", fileName: `${inv.number}.pdf`, isPublic: false });
  await prisma.invoice.update({ where: { id: invoiceId }, data: { pdfMediaId: media.id } });
}
