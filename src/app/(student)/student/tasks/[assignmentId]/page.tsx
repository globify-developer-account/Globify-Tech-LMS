import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStudentProfile } from "@/server/auth/session";
import { hermesPortal, type HermesTask } from "@/server/hermes/portal";
import { AppError } from "@/server/errors";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, statusVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { HermesTaskForm, MarkTaskOpened } from "@/components/lms/hermes-task-form";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Task" };
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { ASSIGNED: "To do", OPENED: "To do", OVERDUE: "Overdue", CHANGES_REQUESTED: "Changes requested", SUBMITTED: "Handed in", ACCEPTED: "Accepted" };

export default async function TaskPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const [{ assignmentId }, { studentId }] = await Promise.all([params, requireStudentProfile()]);
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) notFound();
  let task: HermesTask | null = null;
  try {
    task = await hermesPortal.task(studentId, assignmentId);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    return <EmptyState title="This task is not available right now." description="Please check again in a few minutes." />;
  }
  const due = new Date(task.dueAt);

  return (
    <div className="flex flex-col gap-6">
      <MarkTaskOpened assignmentId={task.assignmentId} />
      <PageHeader
        breadcrumbs={[{ label: "Tasks", href: "/student/tasks" }, { label: task.title }]}
        title={task.title}
        description={`${task.typeLabel} · due ${formatDateTime(due)}`}
        actions={<Badge variant={statusVariant(task.status === "ASSIGNED" || task.status === "OPENED" ? "PENDING" : task.status)} className="px-3 py-1">{LABEL[task.status] ?? task.status}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="surface p-6 lg:col-span-7">
          <h2 className="text-h4 mb-3">What to do</h2>
          <p className="whitespace-pre-wrap text-body-sm text-fg">{task.instructions}</p>
        </section>
        <section className="surface flex flex-col gap-4 p-6 lg:col-span-5">
          {task.submission ? (
            <div className="flex flex-col gap-2">
              <p className="rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm">
                Your submission has been received{task.submission.status === "RECEIVED" ? " and is awaiting review" : ""}. ({formatDateTime(new Date(task.submission.submittedAt))}{task.late ? ", after the deadline" : ""})
              </p>
              {task.submission.files.length ? <p className="text-caption text-fg-muted">{task.submission.files.map((f) => f.fileName).join(", ")}</p> : null}
              {task.submission.response ? <p className="whitespace-pre-wrap text-caption text-fg-muted">{task.submission.response}</p> : null}
            </div>
          ) : null}
          {task.open && (!task.submission || task.status === "CHANGES_REQUESTED") ? (
            <>
              {task.status === "OVERDUE" ? <p className="text-caption text-warning">The deadline has passed, but you can still hand this in.</p> : null}
              <HermesTaskForm assignmentId={task.assignmentId} files={task.files} responsePrompt={task.responsePrompt} consent={task.consent} />
            </>
          ) : !task.submission ? (
            <p className="text-sm text-fg-muted">This task is closed.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
