/**
 * Removes the demo students that `pnpm db:seed` creates, so a freshly seeded
 * database can go live with real students only.
 *
 * A demo student is a user flagged `isTestData` that has a student profile.
 * Their certificates, invoices, payments, receipts, enrollments, progress and
 * attendance go with them. Demo staff and admin logins, instructors, courses,
 * batches and site content are kept. Real students (imported with
 * import-students.ts, never flagged isTestData) are not touched.
 *
 * Afterwards each course's student and rating counters are recomputed, the
 * same way the seed computes them.
 *
 * Usage:
 *   pnpm tsx scripts/remove-demo-students.ts          # shows what would be removed
 *   pnpm tsx scripts/remove-demo-students.ts --yes    # removes it
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRMED = process.argv.includes("--yes");

async function main() {
  const demo = await prisma.studentProfile.findMany({
    where: { user: { isTestData: true } },
    select: { id: true, userId: true, studentNumber: true, user: { select: { email: true } } },
    orderBy: { studentNumber: "asc" },
  });
  const studentIds = demo.map((d) => d.id);
  const userIds = demo.map((d) => d.userId);
  const ofDemoInvoice = { invoice: { studentId: { in: studentIds } } };

  const [certificates, invoices, payments, refunds, enrollments, realStudents] = await Promise.all([
    prisma.certificate.count({ where: { studentId: { in: studentIds } } }),
    prisma.invoice.count({ where: { studentId: { in: studentIds } } }),
    prisma.payment.count({ where: ofDemoInvoice }),
    prisma.refund.count({ where: ofDemoInvoice }),
    prisma.enrollment.count({ where: { studentId: { in: studentIds } } }),
    prisma.studentProfile.count({ where: { user: { isTestData: false } } }),
  ]);

  console.log(`Demo students: ${demo.length}${demo.length ? ` (${demo[0]!.studentNumber} … ${demo.at(-1)!.studentNumber}, e.g. ${demo[0]!.user.email})` : ""}`);
  console.log(`  with ${enrollments} enrollments, ${invoices} invoices, ${payments} payments, ${refunds} refunds, ${certificates} certificates`);
  console.log(`Real students kept: ${realStudents}`);
  if (!demo.length) return;
  if (!CONFIRMED) {
    console.log("\nNothing was removed. Run again with --yes to remove them.");
    return;
  }

  // Certificates and invoices block deleting a student, and payments and
  // refunds block deleting an invoice, so those go first. Deleting the user
  // then takes the profile, enrollments, progress and attendance with it.
  await prisma.$transaction(
    async (tx) => {
      await tx.certificate.deleteMany({ where: { studentId: { in: studentIds } } });
      await tx.refund.deleteMany({ where: ofDemoInvoice });
      await tx.payment.deleteMany({ where: ofDemoInvoice }); // receipts go with their payment
      await tx.invoice.deleteMany({ where: { studentId: { in: studentIds } } }); // lines go with their invoice
      await tx.user.deleteMany({ where: { id: { in: userIds } } });

      // Recompute denormalised course stats, as the seed does.
      const courses = await tx.course.findMany({ select: { id: true } });
      for (const { id: courseId } of courses) {
        const students = await tx.enrollment.count({ where: { courseId, status: { in: ["ACTIVE", "COMPLETED"] } } });
        const ratings = await tx.review.aggregate({ where: { courseId, isApproved: true }, _avg: { rating: true }, _count: { _all: true } });
        await tx.course.update({ where: { id: courseId }, data: { studentCount: students, ratingAvg: ratings._avg.rating ?? 0, ratingCount: ratings._count._all } });
      }
    },
    { timeout: 300_000, maxWait: 60_000 },
  );

  const left = await prisma.studentProfile.count({ where: { user: { isTestData: true } } });
  console.log(`\nRemoved ${demo.length - left} demo students. Students now in the database: ${await prisma.studentProfile.count()}.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
