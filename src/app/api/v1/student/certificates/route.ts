import { handle, jsonOk } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** GET /api/v1/student/certificates — this student's certificates with PDF and share links. */
export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) throw AppError.forbidden("Only students can use this endpoint.");
  const certificates = await prisma.certificate.findMany({
    where: { studentId: student.id },
    orderBy: { issuedAt: "desc" },
    include: { course: { select: { slug: true, title: true, category: { select: { artworkKey: true } } } }, pdf: { select: { url: true } } },
  });
  return jsonOk(
    certificates.map((c) => ({
      id: c.id,
      certificateNumber: c.certificateNumber,
      verificationCode: c.verificationCode,
      title: c.title,
      course: { slug: c.course.slug, title: c.course.title, artworkKey: c.course.category?.artworkKey ?? null },
      issuedAt: c.issuedAt,
      expiresAt: c.expiresAt,
      status: c.status,
      pdfUrl: c.pdf?.url ?? null,
      verifyPath: `/verify/${c.verificationCode}`,
    })),
  );
});
