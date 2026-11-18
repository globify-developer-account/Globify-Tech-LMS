import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download, CheckCircle2, XCircle } from "lucide-react";
import { requireStudentProfile } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { enabledPaymentProviders } from "@/server/providers/payments";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkout } from "@/components/lms/checkout";
import { DiscountCodeForm } from "@/components/lms/discount-code-form";
import { enumLabel, formatDate, formatDateTime, formatMoney, toNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  const [{ id }, { status }, { studentId }] = await Promise.all([params, searchParams, requireStudentProfile()]);
  const inv = await prisma.invoice.findFirst({ where: { id, studentId, deletedAt: null }, include: { lines: { orderBy: { order: "asc" } }, payments: { orderBy: { createdAt: "desc" }, include: { receipt: true } }, refunds: true, enrollment: { select: { course: { select: { title: true } } } }, pdf: { select: { url: true } } } });
  if (!inv) notFound();
  const balance = toNumber(inv.total) - toNumber(inv.amountPaid);
  const providers = enabledPaymentProviders().map((p) => p.key);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader breadcrumbs={[{ label: "Payments", href: "/student/payments" }, { label: inv.number }]} title={`Invoice ${inv.number}`} description={inv.enrollment?.course.title ?? undefined} actions={<><Badge variant={statusVariant(inv.status)} className="px-3 py-1">{enumLabel(inv.status)}</Badge>{inv.pdf ? <Button asChild variant="secondary" size="sm"><a href={inv.pdf.url} target="_blank" rel="noreferrer"><Download /> PDF</a></Button> : null}</>} />
      {status === "success" ? <Alert variant="success" icon={<CheckCircle2 />} title="Payment received">Thank you. Your receipt is below and a copy is in your email.</Alert> : null}
      {status === "cancelled" ? <Alert variant="warning" icon={<XCircle />} title="Payment cancelled">No money was taken. You can try again or choose another method.</Alert> : null}
      {status === "failed" ? <Alert variant="danger" icon={<XCircle />} title="We couldn't process your payment">No money was taken. Please try another method or contact finance.</Alert> : null}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <section className="surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-subtle text-label text-fg-subtle">
                <tr><th className="p-3 text-start">Description</th><th className="p-3 text-end">Due</th><th className="p-3 text-end">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inv.lines.map((l) => (
                  <tr key={l.id}><td className="p-3">{l.description}</td><td className="p-3 text-end text-fg-muted">{l.dueDate ? formatDate(l.dueDate) : "—"}</td><td className="p-3 text-end tabular-nums">{formatMoney(toNumber(l.amount), inv.currency)}</td></tr>
                ))}
              </tbody>
              <tfoot className="text-sm">
                <tr><td className="p-3 text-fg-muted" colSpan={2}>Subtotal</td><td className="p-3 text-end tabular-nums">{formatMoney(toNumber(inv.subtotal), inv.currency)}</td></tr>
                {toNumber(inv.discountTotal) > 0 ? <tr><td className="p-3 text-fg-muted" colSpan={2}>Discount</td><td className="p-3 text-end tabular-nums text-success">−{formatMoney(toNumber(inv.discountTotal), inv.currency)}</td></tr> : null}
                <tr className="font-semibold"><td className="p-3" colSpan={2}>Total</td><td className="p-3 text-end tabular-nums">{formatMoney(toNumber(inv.total), inv.currency)}</td></tr>
                <tr><td className="p-3 text-fg-muted" colSpan={2}>Paid</td><td className="p-3 text-end tabular-nums">{formatMoney(toNumber(inv.amountPaid), inv.currency)}</td></tr>
                <tr className="font-semibold"><td className="p-3" colSpan={2}>Balance due</td><td className="p-3 text-end tabular-nums">{formatMoney(balance, inv.currency)}</td></tr>
              </tfoot>
            </table>
          </section>
          {inv.payments.length ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-label text-fg-subtle">Payments</h2>
              <ul className="surface divide-y divide-border">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 p-4 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{formatMoney(toNumber(p.amount), p.currency)} · {enumLabel(p.provider)}</p>
                      <p className="text-caption text-fg-muted">{p.paidAt ? formatDateTime(p.paidAt) : formatDateTime(p.createdAt)}{p.receipt ? ` · receipt ${p.receipt.number}` : ""}</p>
                    </div>
                    <Badge variant={statusVariant(p.status)}>{enumLabel(p.status)}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <aside className="lg:col-span-5">
          <div className="surface sticky top-20 p-6">
            {balance > 0 && inv.status !== "VOID" ? (
              <div className="flex flex-col gap-5">
                {!inv.discountId && toNumber(inv.amountPaid) === 0 && (inv.status === "ISSUED" || inv.status === "OVERDUE") ? <DiscountCodeForm invoiceId={inv.id} currency={inv.currency} /> : null}
                <Checkout invoiceId={inv.id} amount={balance} currency={inv.currency} providers={providers} />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CheckCircle2 className="size-8 text-success" />
                <p className="font-medium">{inv.status === "VOID" ? "This invoice was voided." : "Paid in full. Thank you."}</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
