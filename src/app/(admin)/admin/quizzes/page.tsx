import type { Metadata } from "next";
import { HelpCircle } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/admin/filter-bar";
import { AssessmentOverview } from "@/components/admin/assessment-overview";
import { toNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Quizzes" };
export const dynamic = "force-dynamic";

export default async function QuizzesPage({ searchParams }: { searchParams: Promise<{ q?: string; course?: string }> }) {
  const [sp] = await Promise.all([searchParams, requirePermission("assessments.manage")]);
  const [quizzes, courses] = await Promise.all([
    prisma.quiz.findMany({
      where: { ...(sp.course ? { courseId: sp.course } : {}), ...(sp.q ? { title: { contains: sp.q } } : {}), course: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      include: { course: { select: { id: true, title: true } }, _count: { select: { questions: true } }, attempts: { where: { status: "GRADED" }, select: { percent: true, passed: true } } },
    }),
    prisma.course.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Quizzes" description={`${quizzes.length} quizzes across the catalogue, with live performance.`} />
      <FilterBar searchPlaceholder="Quiz title" filters={[{ key: "course", label: "courses", options: courses.map((c) => ({ value: c.id, label: c.title })) }]} />
      <AssessmentOverview
        kind="quiz"
        emptyIcon={<HelpCircle />}
        rows={quizzes.map((q) => ({
          id: q.id,
          title: q.title,
          courseId: q.course.id,
          courseTitle: q.course.title,
          published: q.isPublished,
          meta: `${q._count.questions} questions · pass ${q.passingScore}%${q.timeLimitMinutes ? ` · ${q.timeLimitMinutes} min` : ""}`,
          when: q.availableFrom,
          attempts: q.attempts.length,
          average: q.attempts.length ? Math.round(q.attempts.reduce((s, a) => s + toNumber(a.percent), 0) / q.attempts.length) : null,
          passRate: q.attempts.length ? Math.round((q.attempts.filter((a) => a.passed).length / q.attempts.length) * 100) : null,
        }))}
      />
    </div>
  );
}
