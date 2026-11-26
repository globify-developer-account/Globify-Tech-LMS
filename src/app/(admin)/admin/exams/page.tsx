import type { Metadata } from "next";
import { FileCheck } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/admin/filter-bar";
import { AssessmentOverview } from "@/components/admin/assessment-overview";
import { enumLabel, toNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Exams" };
export const dynamic = "force-dynamic";

export default async function ExamsPage({ searchParams }: { searchParams: Promise<{ q?: string; course?: string }> }) {
  const [sp] = await Promise.all([searchParams, requirePermission("assessments.manage")]);
  const [exams, courses] = await Promise.all([
    prisma.exam.findMany({
      where: { ...(sp.course ? { courseId: sp.course } : {}), ...(sp.q ? { title: { contains: sp.q } } : {}), course: { deletedAt: null } },
      orderBy: { scheduledAt: "desc" },
      include: { course: { select: { id: true, title: true } }, batch: { select: { code: true } }, _count: { select: { questions: true } }, attempts: { where: { status: "GRADED" }, select: { percent: true, passed: true } } },
    }),
    prisma.course.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Exams" description={`${exams.length} exams, including midterms and finals.`} />
      <FilterBar searchPlaceholder="Exam title" filters={[{ key: "course", label: "courses", options: courses.map((c) => ({ value: c.id, label: c.title })) }]} />
      <AssessmentOverview
        kind="exam"
        emptyIcon={<FileCheck />}
        rows={exams.map((e) => ({
          id: e.id,
          title: e.title,
          courseId: e.course.id,
          courseTitle: e.course.title,
          published: e.isPublished,
          meta: `${enumLabel(e.kind)} · ${e._count.questions} questions · ${e.durationMinutes} min${e.batch ? ` · ${e.batch.code}` : ""}`,
          when: e.scheduledAt,
          attempts: e.attempts.length,
          average: e.attempts.length ? Math.round(e.attempts.reduce((s, a) => s + toNumber(a.percent), 0) / e.attempts.length) : null,
          passRate: e.attempts.length ? Math.round((e.attempts.filter((a) => a.passed).length / e.attempts.length) * 100) : null,
        }))}
      />
    </div>
  );
}
