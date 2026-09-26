import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ListTodo } from "lucide-react";
import { requireStudentProfile } from "@/server/auth/session";
import { hermesPortal, portalConfigured, type HermesTaskSummary } from "@/server/hermes/portal";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, statusVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

// The LMS's badge colours: to do is pending, accepted is approved, changes requested is a revision.
const BADGE: Record<string, string> = { ASSIGNED: "PENDING", OPENED: "PENDING", ACCEPTED: "APPROVED", CHANGES_REQUESTED: "REVISION_REQUESTED" };
const LABEL: Record<string, string> = { ASSIGNED: "To do", OPENED: "To do", OVERDUE: "Overdue", CHANGES_REQUESTED: "Changes requested", SUBMITTED: "Handed in", ACCEPTED: "Accepted" };

/** Brief §53 "My Tasks": tasks from Globify staff (sent through Hermes), answered here. */
export default async function TasksPage() {
  const { studentId } = await requireStudentProfile();
  let items: HermesTaskSummary[] = [];
  let unavailable = !portalConfigured();
  if (!unavailable) {
    try {
      items = await hermesPortal.tasks(studentId);
    } catch {
      unavailable = true;
    }
  }
  const todo = items.filter((t) => ["ASSIGNED", "OPENED", "OVERDUE", "CHANGES_REQUESTED"].includes(t.status));
  const done = items.filter((t) => ["SUBMITTED", "ACCEPTED"].includes(t.status));

  const row = (t: HermesTaskSummary) => (
    <li key={t.assignmentId}>
      <Link href={`/student/tasks/${t.assignmentId}`} className="flex items-center gap-4 p-4 transition-colors hover:bg-bg-subtle">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><ListTodo className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{t.title}</p>
          <p className="text-caption text-fg-muted">
            {t.typeLabel} · due {relativeTime(new Date(t.dueAt))} ({formatDateTime(new Date(t.dueAt))}){t.late ? " · handed in late" : ""}
          </p>
        </div>
        <Badge variant={statusVariant(BADGE[t.status] ?? t.status)}>{LABEL[t.status] ?? t.status}</Badge>
        <ArrowRight className="size-4 text-fg-subtle rtl:rotate-180" />
      </Link>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tasks" description={unavailable ? "Tasks from Globify staff." : `${todo.length} to do · ${done.length} handed in`} />
      {unavailable ? (
        <EmptyState icon={<ListTodo />} title="Tasks are not available right now." description="Please check again later." />
      ) : items.length ? (
        [["To do", todo], ["Handed in", done]].map(([label, list]) =>
          (list as HermesTaskSummary[]).length ? (
            <section key={label as string} className="flex flex-col gap-2">
              <h2 className="text-label text-fg-subtle">{label as string}</h2>
              <ul className="surface divide-y divide-border">{(list as HermesTaskSummary[]).map(row)}</ul>
            </section>
          ) : null,
        )
      ) : (
        <EmptyState icon={<ListTodo />} title="No tasks right now." description="Photo requests, surveys and other tasks from Globify staff appear here." />
      )}
    </div>
  );
}
