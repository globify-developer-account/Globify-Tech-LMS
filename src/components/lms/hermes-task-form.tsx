"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { openHermesTaskAction, submitHermesTaskAction, withdrawHermesConsentAction } from "@/server/actions/hermes-tasks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { FileUploader, type UploadedFile } from "@/components/ui/file-uploader";
import { toast } from "@/components/ui/toaster";

type Kind = "image" | "video" | "document";

const ACCEPT: Record<Kind, string> = { image: "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp", video: "video/mp4,.mp4", document: ".pdf,.doc,.docx" };
const HINT: Record<Kind, string> = { image: "JPG, PNG or WEBP", video: "MP4", document: "PDF or Word" };

/** Tells Hermes the student opened the task (so no "you have not opened it" reminder follows). */
export function MarkTaskOpened({ assignmentId }: { assignmentId: string }) {
  React.useEffect(() => {
    void openHermesTaskAction(assignmentId);
  }, [assignmentId]);
  return null;
}

/**
 * Brief §17: upload, optional caption, the two consent statements, Submit,
 * then "Your submission has been received and is awaiting review."
 * Files go to the private student-content/ area and are never public.
 */
export function HermesTaskForm({
  assignmentId,
  files,
  responsePrompt,
  consent,
}: {
  assignmentId: string;
  files: { kinds: Kind[]; maxFiles: number; maxSizeMb: Record<string, number> } | null;
  responsePrompt: string | null;
  consent: { version: string; statements: string[] } | null;
}) {
  const router = useRouter();
  const [submitKey] = React.useState(() => `lms-${crypto.randomUUID()}`);
  const [uploads, setUploads] = React.useState<UploadedFile[]>([]);
  const [response, setResponse] = React.useState("");
  const [ticked, setTicked] = React.useState<string[]>([]);
  const [done, setDone] = React.useState(false);
  const [pending, start] = React.useTransition();

  const kinds = files?.kinds ?? [];
  const single = kinds.length === 1 ? kinds[0]! : null;
  const maxMb = kinds.length ? Math.max(...kinds.map((k) => files!.maxSizeMb[k] ?? 10)) : 0;
  const allTicked = !consent || consent.statements.every((s) => ticked.includes(s));

  const submit = () =>
    start(async () => {
      const res = await submitHermesTaskAction({
        assignmentId,
        submitKey,
        response: response || undefined,
        consentAccepted: ticked,
        consentVersion: consent?.version ?? null,
        mediaIds: uploads.map((u) => u.mediaId),
      });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setDone(true);
      router.refresh();
    });

  if (done) return <p className="rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm">Your submission has been received and is awaiting review.</p>;

  return (
    <div className="flex flex-col gap-4">
      {files ? (
        <FileUploader
          multiple={files.maxFiles > 1}
          kind={single ?? "any"}
          maxSizeMb={maxMb}
          accept={kinds.map((k) => ACCEPT[k]).join(",")}
          folder="student-content"
          value={uploads}
          onChange={(v) => setUploads(v.slice(0, files.maxFiles))}
          hint={`${kinds.map((k) => HINT[k]).join(", ")} · up to ${files.maxFiles} file${files.maxFiles === 1 ? "" : "s"} · private until the institute approves it`}
        />
      ) : null}
      {responsePrompt ? (
        <Field label={responsePrompt} htmlFor="task-response">
          <Textarea id="task-response" rows={4} maxLength={2000} value={response} onChange={(e) => setResponse(e.target.value)} />
        </Field>
      ) : null}
      {consent ? (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-medium">Consent</legend>
          {consent.statements.map((s, i) => (
            <label key={s} className="flex items-start gap-2.5 text-sm" htmlFor={`consent-${i}`}>
              <Checkbox id={`consent-${i}`} checked={ticked.includes(s)} onCheckedChange={(c) => setTicked((t) => (c ? [...t, s] : t.filter((x) => x !== s)))} />
              <span>{s}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <Button onClick={submit} loading={pending} disabled={!allTicked || (kinds.length > 0 && uploads.length === 0 && !responsePrompt)}>
        Submit
      </Button>
    </div>
  );
}

/**
 * Brief §20: the student can withdraw permission at any time. Two steps, so
 * a stray tap does not withdraw it; the reason is optional.
 */
export function WithdrawPermission({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [asking, setAsking] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, start] = React.useTransition();

  const withdraw = () =>
    start(async () => {
      const res = await withdrawHermesConsentAction(assignmentId, reason || undefined);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success("Your permission has been withdrawn. Globify will not use this work.");
      setAsking(false);
      router.refresh();
    });

  if (!asking) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAsking(true)}>
        Withdraw my permission
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-danger/30 p-4">
      <p className="text-sm">Globify will stop using what you handed in for this task, and staff will be told. This cannot be undone here.</p>
      <Field label="Reason (optional)" htmlFor="withdraw-reason">
        <Textarea id="withdraw-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button variant="danger" size="sm" onClick={withdraw} loading={pending}>
          Withdraw permission
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setAsking(false)} disabled={pending}>
          Keep it
        </Button>
      </div>
    </div>
  );
}
