import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStudentProfile } from "@/server/auth/session";
import { hermesPortal, type HermesTask } from "@/server/hermes/portal";
import { AppError } from "@/server/errors";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, statusVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { HermesTaskForm, MarkTaskOpened, WithdrawPermission } from "@/components/lms/hermes-task-form";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Task" };
export const dynamic = "force-dynamic";

// The LMS's badge colours: to do is pending, accepted is approved, changes requested is a revision.
const BADGE: Record<string, string> = { ASSIGNED: "PENDING", OPENED: "PENDING", ACCEPTED: "APPROVED", CHANGES_REQUESTED: "REVISION_REQUESTED" };
const LABEL: Record<string, string> = { ASSIGNED: "To do", OPENED: "To do", OVERDUE: "Overdue", CHANGES_REQUESTED: "Changes requested", SUBMITTED: "Handed in", ACCEPTED: "Accepted" };

/** What the student reads about their latest hand-in, by its review status. */
function outcome(status: string): { tone: "success" | "warning" | "danger"; text: string } {
  if (status === "ACCEPTED") return { tone: "success", text: "Your submission was accepted." };
  if (status === "CHANGES_REQUESTED") return { tone: "warning", text: "The reviewer asked for changes. Please update your work and hand it in again below." };
  if (status === "REJECTED") return { tone: "danger", text: "Your submission was not accepted." };
  return { tone: "success", text: "Your submission has been received and is awaiting review." };
}

const TONE = { success: "border-success/30 bg-success-soft", warning: "border-warning/30 bg-warning-soft", danger: "border-danger/30 bg-danger-soft" } as const;

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
        actions={<Badge variant={statusVariant(BADGE[task.status] ?? task.status)} className="px-3 py-1">{LABEL[task.status] ?? task.status}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="surface p-6 lg:col-span-7">
          <h2 className="text-h4 mb-3">What to do</h2>
          <p className="whitespace-pre-wrap text-body-sm text-fg">{task.instructions}</p>
        </section>
        <section className="surface flex flex-col gap-4 p-6 lg:col-span-5">
          {task.submission ? (
            <div className="flex flex-col gap-2">
              <div className={`rounded-lg border px-4 py-3 text-sm ${TONE[outcome(task.submission.status).tone]}`}>
                <p>
                  {outcome(task.submission.status).text} <span className="text-fg-muted">(handed in {formatDateTime(new Date(task.submission.submittedAt))}{task.late ? ", after the deadline" : ""})</span>
                </p>
                {task.submission.review?.feedback ? <p className="mt-2 whitespace-pre-wrap">From the reviewer: {task.submission.review.feedback}</p> : null}
              </div>
              {task.submission.files.length ? (
                <p className="text-caption text-fg-muted">
                  {task.submission.files.map((f) => f.fileName + (task.submission!.status === "ACCEPTED" && f.approved ? " (chosen)" : "")).join(", ")}
                </p>
              ) : null}
              {task.submission.response ? <p className="whitespace-pre-wrap text-caption text-fg-muted">{task.submission.response}</p> : null}
            </div>
          ) : null}
          {task.permission && task.permission.state !== "NONE" ? (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <h3 className="text-sm font-medium">Your permission</h3>
              {task.permission.state === "GIVEN" ? (
                <>
                  <p className="text-caption text-fg-muted">
                    You allowed Globify Tech Institute to use this work on its official social media{task.permission.since ? ` (${formatDateTime(new Date(task.permission.since))})` : ""}. You can withdraw that at any time.
                  </p>
                  {task.permission.canWithdraw ? <WithdrawPermission assignmentId={task.assignmentId} /> : null}
                </>
              ) : (
                <p className="text-caption text-fg-muted">You withdrew your permission{task.permission.since ? ` on ${formatDateTime(new Date(task.permission.since))}` : ""}. Globify will not use this work.</p>
              )}
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
