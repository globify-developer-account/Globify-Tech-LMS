import "server-only";
import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { prisma, type Prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { notify } from "./notifications";
import { storeGeneratedFile } from "./media";
import { getSetting } from "./settings";
import { absoluteUrl } from "@/lib/utils";
import { enqueue } from "@/server/jobs";
import { log } from "@/server/log";

async function nextCertificateNumber(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = `${await getSetting("certificates.prefix")}-${new Date().getFullYear()}-`;
  const last = await tx.certificate.findFirst({ where: { certificateNumber: { startsWith: prefix } }, orderBy: { certificateNumber: "desc" }, select: { certificateNumber: true } });
  const n = last ? Number(last.certificateNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(6, "0")}`;
}

function verificationCode(): string {
  return randomBytes(9).toString("base64url").replace(/[-_]/g, "x").toUpperCase().slice(0, 12);
}

export async function issueCertificate(params: { enrollmentId: string; signedById?: string | null; validityMonths?: number | null; isTestData?: boolean }) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: params.enrollmentId },
    include: { course: { select: { id: true, title: true } }, student: { select: { id: true, userId: true, user: { select: { name: true } } } }, certificate: true },
  });
  if (!enrollment) throw AppError.notFound("Enrollment");
  if (enrollment.certificate) return enrollment.certificate;

  const certificate = await prisma.$transaction(async (tx) => {
    return tx.certificate.create({
      data: {
        certificateNumber: await nextCertificateNumber(tx),
        verificationCode: verificationCode(),
        studentId: enrollment.student.id,
        courseId: enrollment.course.id,
        enrollmentId: enrollment.id,
        title: enrollment.course.title,
        signedById: params.signedById ?? null,
        expiresAt: params.validityMonths ? new Date(new Date().setMonth(new Date().getMonth() + params.validityMonths)) : null,
        isTestData: params.isTestData ?? false,
        metadata: { studentName: enrollment.student.user.name },
      },
    });
  });

  await enqueue("certificate.render", { certificateId: certificate.id });
  await notify({
    userId: enrollment.student.userId,
    event: "CERTIFICATE_ISSUED",
    data: { course: enrollment.course.title, number: certificate.certificateNumber },
    href: `/student/certificates`,
    fallback: { title: `Your certificate for ${enrollment.course.title} is ready`, body: `Certificate ${certificate.certificateNumber} has been issued. Share it or verify it any time.` },
  });
  return certificate;
}

export async function revokeCertificate(certificateId: string, reason: string) {
  const cert = await prisma.certificate.findUnique({ where: { id: certificateId } });
  if (!cert) throw AppError.notFound("Certificate");
  if (cert.status === "REVOKED") return cert;
  return prisma.certificate.update({ where: { id: certificateId }, data: { status: "REVOKED", revokedAt: new Date(), revokedReason: reason } });
}

export async function reinstateCertificate(certificateId: string) {
  return prisma.certificate.update({ where: { id: certificateId }, data: { status: "VALID", revokedAt: null, revokedReason: null } });
}

/** Public verification by certificate number or verification code. Logs the lookup. */
export async function verifyCertificate(idOrCode: string, meta?: { ip?: string | null; userAgent?: string | null }) {
  const key = idOrCode.trim().toUpperCase();
  const cert = await prisma.certificate.findFirst({
    where: { OR: [{ certificateNumber: key }, { verificationCode: key }] },
    include: {
      student: { select: { user: { select: { name: true } } } },
      course: { select: { title: true, slug: true, durationWeeks: true, level: true } },
      signedBy: { select: { name: true } },
      pdf: { select: { url: true } },
    },
  });
  if (!cert) return null;
  const effectiveStatus = cert.status === "VALID" && cert.expiresAt && cert.expiresAt < new Date() ? "EXPIRED" : cert.status;
  await prisma.certificateVerification.create({ data: { certificateId: cert.id, ip: meta?.ip ?? null, userAgent: meta?.userAgent ?? null } }).catch(() => undefined);
  return { ...cert, effectiveStatus };
}

/** Renders the certificate PDF with a QR code pointing at the verification page. */
export async function renderCertificatePdf(certificateId: string): Promise<Buffer> {
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: { student: { select: { user: { select: { name: true } } } }, course: { select: { title: true, durationWeeks: true } }, signedBy: { select: { name: true } } },
  });
  if (!cert) throw AppError.notFound("Certificate");
  const signatory = cert.signedBy?.name ?? (await getSetting("certificates.signatoryName"));
  const verifyUrl = absoluteUrl(`/verify/${cert.certificateNumber}`);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${cert.certificateNumber} — ${cert.student.user.name}`);
  pdf.setAuthor("Globify Tech");
  const page = pdf.addPage([842, 595]); // A4 landscape
  const [bold, regular] = await Promise.all([pdf.embedFont(StandardFonts.HelveticaBold), pdf.embedFont(StandardFonts.Helvetica)]);
  const ink = rgb(0.043, 0.051, 0.07);
  const muted = rgb(0.357, 0.392, 0.447);
  const accent = rgb(0.145, 0.388, 1);

  page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 0, y: 0, width: 14, height: 595, color: accent });
  page.drawRectangle({ x: 14, y: 0, width: 6, height: 595, color: rgb(0.024, 0.714, 0.831) });
  page.drawRectangle({ x: 20, y: 0, width: 4, height: 595, color: rgb(0.486, 0.227, 0.929) });

  page.drawText("GLOBIFY TECH", { x: 72, y: 520, size: 12, font: bold, color: accent, characterSpacing: 2 } as never);
  page.drawText("Certificate of Completion", { x: 72, y: 470, size: 32, font: bold, color: ink });
  page.drawText("This certifies that", { x: 72, y: 420, size: 13, font: regular, color: muted });
  page.drawText(cert.student.user.name, { x: 72, y: 380, size: 30, font: bold, color: ink });
  page.drawText("has successfully completed", { x: 72, y: 340, size: 13, font: regular, color: muted });
  const title = cert.course.title.length > 48 ? `${cert.course.title.slice(0, 47)}…` : cert.course.title;
  page.drawText(title, { x: 72, y: 305, size: 22, font: bold, color: ink });
  const weeks = cert.course.durationWeeks ? ` · ${cert.course.durationWeeks}-week program` : "";
  page.drawText(`Issued ${cert.issuedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}${weeks}`, { x: 72, y: 275, size: 12, font: regular, color: muted });

  page.drawLine({ start: { x: 72, y: 150 }, end: { x: 300, y: 150 }, thickness: 1, color: rgb(0.83, 0.85, 0.88) });
  page.drawText(signatory, { x: 72, y: 132, size: 12, font: bold, color: ink });
  page.drawText("Authorised signature", { x: 72, y: 116, size: 10, font: regular, color: muted });

  page.drawText(`Certificate ID  ${cert.certificateNumber}`, { x: 72, y: 78, size: 10, font: regular, color: muted });
  page.drawText(`Verify at  ${verifyUrl}`, { x: 72, y: 62, size: 10, font: regular, color: muted });

  const qrPng = await QRCode.toBuffer(verifyUrl, { type: "png", width: 260, margin: 1, color: { dark: "#0b0d12", light: "#ffffff" } });
  const qr = await pdf.embedPng(qrPng);
  page.drawImage(qr, { x: 842 - 72 - 130, y: 62, width: 130, height: 130 });
  page.drawText("Scan to verify", { x: 842 - 72 - 130 + 26, y: 48, size: 9, font: regular, color: muted });

  return Buffer.from(await pdf.save());
}

/** Job: render + store PDF, attach to certificate. */
export async function renderAndStoreCertificate(certificateId: string) {
  try {
    const pdf = await renderCertificatePdf(certificateId);
    const cert = await prisma.certificate.findUniqueOrThrow({ where: { id: certificateId }, select: { certificateNumber: true, studentId: true } });
    const media = await storeGeneratedFile({ key: `certificates/${cert.certificateNumber}.pdf`, body: pdf, mime: "application/pdf", fileName: `${cert.certificateNumber}.pdf` });
    await prisma.certificate.update({ where: { id: certificateId }, data: { pdfMediaId: media.id } });
  } catch (error) {
    log.error("certificate render failed", { certificateId, error: (error as Error).message });
    throw error;
  }
}

export async function listCertificates(filters: { q?: string; status?: "VALID" | "REVOKED" | "EXPIRED"; courseId?: string; page?: number; pageSize?: number }) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const where: Prisma.CertificateWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.q ? { OR: [{ certificateNumber: { contains: filters.q } }, { student: { user: { name: { contains: filters.q } } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.certificate.findMany({ where, orderBy: { issuedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { student: { select: { id: true, studentNumber: true, user: { select: { name: true, email: true } } } }, course: { select: { title: true } }, pdf: { select: { url: true } }, _count: { select: { verifications: true } } } }),
    prisma.certificate.count({ where }),
  ]);
  return { items, total, page, pageSize };
}
