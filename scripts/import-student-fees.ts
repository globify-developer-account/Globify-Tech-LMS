/**
 * Loads fee records for students created by import-students.ts: one invoice per
 * student with the agreed course fee, a payment + receipt for every amount
 * received, and the sheet's other columns (joining date, class time, R/O, ...)
 * in the invoice notes.
 *
 * Usage: pnpm tsx scripts/import-student-fees.ts private/<sheet>.csv private/student-fees.json
 *
 * Writes through Prisma directly rather than services/finance.ts so imported
 * history doesn't send "payment due" / "payment received" notifications.
 * Students who already have an imported invoice are skipped, so it's safe to re-run.
 * Withdrawn students get an invoice closed at the amount they paid (nothing owed).
 */
import { readFileSync } from "node:fs";
import { Prisma, PrismaClient, type PaymentProvider } from "@prisma/client";
import { parseDate, readTable } from "./sheet-csv";

const prisma = new PrismaClient();
const IMPORT_MARKER = "Imported from admissions sheet";

type Ledger = { students: Record<string, { fee: number; withdrawn?: boolean; payments: Array<[string | null, number, string]>; note?: string }> };

async function nextNumber(tx: Prisma.TransactionClient, kind: "INV" | "RCP"): Promise<string> {
  const prefix = `${kind}-${new Date().getFullYear()}-`;
  // Compare numerically: numbers of different widths (seeded 00022 vs 000023) don't sort as strings.
  const rows = kind === "INV" ? await tx.invoice.findMany({ where: { number: { startsWith: prefix } }, select: { number: true } }) : await tx.receipt.findMany({ where: { number: { startsWith: prefix } }, select: { number: true } });
  const n = rows.reduce((max, r) => Math.max(max, Number(r.number.slice(prefix.length)) || 0), 0) + 1;
  return `${prefix}${String(n).padStart(6, "0")}`;
}

const titleCase = (v: string) => v.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bAi\b/g, "AI").replace(/\bWith\b/g, "with").replace(/\bAnd\b/g, "and");
const money = (n: number) => n.toLocaleString("en-PK");

async function main() {
  const [sheetPath, ledgerPath] = process.argv.slice(2);
  if (!sheetPath || !ledgerPath) throw new Error("Pass the sheet CSV and fee ledger JSON paths");
  const sheet = readTable(readFileSync(sheetPath, "utf8")).filter((r) => r.NAME && r["CURRENT STATUS"]);
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) as Ledger;

  let invoices = 0, payments = 0, skipped = 0;
  for (const [email, entry] of Object.entries(ledger.students)) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { name: true, phone: true, studentProfile: { select: { id: true, invoices: { where: { notes: { startsWith: IMPORT_MARKER } }, select: { id: true } }, enrollments: { select: { id: true, course: { select: { title: true } } } } } } },
    });
    const student = user?.studentProfile;
    if (!student) throw new Error(`${email} has no student profile - run import-students.ts first`);
    if (student.invoices.length) { skipped++; continue; }

    const digits = user.phone?.replace(/\D/g, "");
    const row = sheet.find((r) => (digits ? r.CONTACT.replace(/\D/g, "") === digits : r.NAME.toLowerCase() === user.name.toLowerCase()));
    if (!row) throw new Error(`No sheet row for ${email}`);

    const enrollment = student.enrollments[0];
    const courseTitle = enrollment?.course.title ?? titleCase(row.COURSE);
    const paid = entry.payments.reduce((sum, [, amount]) => sum + amount, 0);
    const total = entry.withdrawn ? paid : entry.fee;
    if (paid > total) throw new Error(`${email}: payments ${paid} exceed fee ${total}`);
    const dated = entry.payments.map(([d]) => parseDate(d)).filter((d): d is Date => !!d);
    const status = paid >= total ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "ISSUED";

    const notes = [
      `${IMPORT_MARKER} on ${new Date().toISOString().slice(0, 10)}.`,
      entry.withdrawn ? `Withdrawn. Agreed fee ${money(entry.fee)}; invoice closed at the ${money(paid)} paid.` : null,
      `Status: ${row["CURRENT STATUS"]}`,
      `Joining: ${row["JOINING DATE"] || "—"} · Registration: ${row["REGISTRATION DATE"] || "—"}`,
      `Class time: ${row.TIME || "—"} · R/O: ${row["R/O"] || "—"} · Payment method: ${row["PAYMENT METHOD"] || "—"}`,
      `Sheet fee columns — Payables: ${row.PAYABLES || "—"}, Initial: ${row["INITIAL AMOUNT"] || "—"}, Remaining: ${row["REMAINING PAYMENT"] || "—"}, Total: ${row["TOTAL PAYMENT"] || "—"}`,
      `Installments — 1st: ${row["1ST INSTALLMENTS"] || "—"}; received: ${row["RECEIVING DATE"] || "—"}; 2nd: ${row["2ND INSTALLMENTS"] || "—"}; 3rd: ${row["3RD INSTALLMENTS"] || "—"}`,
      entry.note ? `Note: ${entry.note}` : null,
    ].filter(Boolean).join("\n");

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          number: await nextNumber(tx, "INV"),
          studentId: student.id,
          enrollmentId: enrollment?.id ?? null,
          status,
          subtotal: total,
          total,
          amountPaid: paid,
          issuedAt: parseDate(row["REGISTRATION DATE"]) ?? dated[0] ?? new Date(),
          paidAt: status === "PAID" ? (dated.at(-1) ?? null) : null,
          notes,
          lines: { create: [{ description: entry.withdrawn ? `${courseTitle} — fee paid before withdrawal` : `${courseTitle} — course fee`, quantity: 1, unitAmount: total, amount: total, order: 0 }] },
        },
      });
      for (const [date, amount, method] of entry.payments) {
        const provider: PaymentProvider = method.toLowerCase() === "cash" ? "CASH" : "BANK_TRANSFER";
        const payment = await tx.payment.create({
          data: { invoiceId: invoice.id, provider, method, amount, status: "SUCCEEDED", paidAt: parseDate(date), metadata: { note: date ? IMPORT_MARKER : `${IMPORT_MARKER}; payment date not recorded` } },
        });
        await tx.receipt.create({ data: { number: await nextNumber(tx, "RCP"), paymentId: payment.id, issuedAt: parseDate(date) ?? new Date() } });
        payments++;
      }
    }, { timeout: 30_000 });
    invoices++;
  }
  console.log(`Created ${invoices} invoices and ${payments} payments; skipped ${skipped} already imported.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
