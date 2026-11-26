import type { Metadata } from "next";
import Link from "next/link";
import { PlaySquare } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { instructorScope } from "@/server/services/instructor-scope";
import { prisma } from "@/server/db/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { enumLabel, formatDuration } from "@/lib/utils";

export const metadata: Metadata = { title: "Lessons" };
export const dynamic = "force-dynamic";

export default async function LessonsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const [sp, user] = await Promise.all([searchParams, requireUser()]);
  const scope = await instructorScope(user);
  const page = Number(sp.page ?? 1) || 1;
  const pageSize = 30;
  const where = { unit: { module: { course: { deletedAt: null, ...scope.courseWhere } } }, ...(sp.q ? { title: { contains: sp.q } } : {}) };
  const [lessons, total] = await Promise.all([
    prisma.lesson.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, title: true, type: true, durationSeconds: true, isPublished: true, isPreview: true, unit: { select: { title: true, module: { select: { title: true, course: { select: { id: true, title: true } } } } } }, _count: { select: { progress: { where: { status: "COMPLETED" } } } } } }),
    prisma.lesson.count({ where }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Lessons" description={`${total} lessons across your courses.`} />
      {lessons.length ? (
        <div className="surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-subtle text-label text-fg-subtle"><tr><th className="p-3 text-start">Lesson</th><th className="p-3 text-start">Course · Module</th><th className="p-3 text-start">Type</th><th className="p-3 text-end">Length</th><th className="p-3 text-end">Completions</th><th className="p-3 text-end">Status</th></tr></thead>
            <tbody className="divide-y divide-border">
              {lessons.map((l) => (
                <tr key={l.id} className="hover:bg-bg-subtle/60">
                  <td className="p-3"><Link href={`/instructor/course/${l.unit.module.course.id}?tab=curriculum`} className="font-medium hover:text-accent">{l.title}</Link>{l.isPreview ? <Badge variant="accent" className="ms-2">Preview</Badge> : null}</td>
                  <td className="p-3 text-fg-muted">{l.unit.module.course.title} · {l.unit.module.title}</td>
                  <td className="p-3">{enumLabel(l.type)}</td>
                  <td className="p-3 text-end tabular-nums">{l.durationSeconds ? formatDuration(l.durationSeconds) : "—"}</td>
                  <td className="p-3 text-end tabular-nums">{l._count.progress}</td>
                  <td className="p-3 text-end">{l.isPublished ? <Badge variant="success">Published</Badge> : <Badge>Hidden</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<PlaySquare />} title="No lessons yet." description="Add lessons from a course's curriculum tab." />
      )}
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => `/instructor/lessons?page=${p}`} />
    </div>
  );
}
