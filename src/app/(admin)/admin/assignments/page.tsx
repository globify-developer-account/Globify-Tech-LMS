import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/admin/filter-bar";
import { AssessmentOverview } from "@/components/admin/assessment-overview";
import { toNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Assignments" };
export const dynamic = "force-dynamic";

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<{ q?: string; course?: string }> }) {
  const [sp] = await Promise.all([searchParams, requirePermission("assessments.manage")]);
  const [assignments, courses] = await Promise.all([
    prisma.assignment.findMany({
      where: { ...(sp.course ? { courseId: sp.course } : {}), ...(sp.q ? { title: { contains: sp.q } } : {}), course: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      include: { course: { select: { id: true, title: true } }, submissions: { select: { status: true, score: true } } },
    }),
    prisma.course.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Assignments" description={`${assignments.length} assignments. Grading happens in the Instructor Studio.`} />
      <FilterBar searchPlaceholder="Assignment title" filters={[{ key: "course", label: "courses", options: courses.map((c) => ({ value: c.id, label: c.title })) }]} />
      <AssessmentOverview
        kind="assignment"
        emptyIcon={<ClipboardList />}
        rows={assignments.map((a) => {
          const submitted = a.submissions.filter((s) => s.status !== "DRAFT");
          const graded = submitted.filter((s) => s.score !== null);
          const approved = submitted.filter((s) => s.status === "APPROVED").length;
          const max = toNumber(a.maxPoints) || 100;
          return {
            id: a.id,
            title: a.title,
            courseId: a.course.id,
            courseTitle: a.course.title,
            published: a.isPublished,
            meta: `${max} points${a.allowLate ? ` · late allowed (−${a.latePenaltyPercent}%)` : ""}`,
            when: a.dueAt,
            attempts: submitted.length,
            average: graded.length ? Math.round((graded.reduce((s, x) => s + toNumber(x.score ?? 0), 0) / graded.length / max) * 100) : null,
            passRate: submitted.length ? Math.round((approved / submitted.length) * 100) : null,
            pending: submitted.filter((s) => s.status === "SUBMITTED" || s.status === "UNDER_REVIEW").length,
          };
        })}
      />
    </div>
  );
}
