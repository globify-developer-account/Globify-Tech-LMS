"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Megaphone, Bell } from "lucide-react";
import { saveNotificationTemplateAction, broadcastAnnouncementAction } from "@/server/actions/admin";
import { AdminTable, Row, Cell } from "@/components/admin/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SimpleSelect } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { enumLabel, relativeTime } from "@/lib/utils";

interface Template { id: string; event: string; channel: string; locale: string; subject: string; body: string; isActive: boolean }
interface Recent { id: string; event: string; channel: string; title: string; status: string; user: string; createdAt: string; error: string | null }

// PUSH reaches the Android app; people without the app are skipped automatically.
const CHANNELS = ["IN_APP", "PUSH", "EMAIL", "WHATSAPP", "SMS"] as const;
const PLACEHOLDERS = "{{name}} {{firstName}} {{course}} {{number}} {{amount}} {{due}}";

export function NotificationCentre({ templates, recent, events, courses }: { templates: Template[]; recent: Recent[]; events: string[]; courses: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<Partial<Template> | null>(null);
  const [broadcast, setBroadcast] = React.useState(false);
  const [message, setMessage] = React.useState({ title: "", body: "", audience: "ALL_STUDENTS" as "ALL_STUDENTS" | "ALL_INSTRUCTORS" | "COURSE", courseId: "", channels: ["IN_APP", "PUSH"] as string[] });
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, start] = React.useTransition();
  return (
    <>
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-h4">Templates</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setBroadcast(true)}><Megaphone /> Broadcast</Button>
            <Button size="sm" onClick={() => setEditing({ event: events[0], channel: "EMAIL", locale: "en", subject: "", body: "", isActive: true })}><Plus /> New template</Button>
          </div>
        </div>
        {templates.length ? (
          <AdminTable headers={["Event", "Channel", "Locale", "Subject", "Status", { label: "", align: "end" }]}>
            {templates.map((t) => (
              <Row key={t.id}>
                <Cell className="font-medium">{enumLabel(t.event)}</Cell>
                <Cell><Badge>{enumLabel(t.channel)}</Badge></Cell>
                <Cell muted>{t.locale}</Cell>
                <Cell className="max-w-64 truncate text-caption text-fg-muted">{t.subject || t.body.slice(0, 60)}</Cell>
                <Cell>{t.isActive ? <Badge variant="success">Active</Badge> : <Badge>Off</Badge>}</Cell>
                <Cell align="end"><Button variant="ghost" size="sm" onClick={() => setEditing(t)}>Edit</Button></Cell>
              </Row>
            ))}
          </AdminTable>
        ) : (
          <div className="surface flex items-center gap-3 p-6 text-body-sm text-fg-muted"><Bell className="size-5" />No templates yet. Notifications still send with sensible built-in copy.</div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-h4">Recent deliveries</p>
        {recent.length ? (
          <AdminTable headers={["Recipient", "Event", "Channel", "Title", "When", "Status"]} dense>
            {recent.map((n) => (
              <Row key={n.id}>
                <Cell className="font-medium">{n.user}</Cell>
                <Cell className="text-caption text-fg-muted">{enumLabel(n.event)}</Cell>
                <Cell className="text-caption">{enumLabel(n.channel)}</Cell>
                <Cell className="max-w-64 truncate text-caption text-fg-muted">{n.title}{n.error ? <span className="block text-danger">{n.error}</span> : null}</Cell>
                <Cell className="text-caption text-fg-subtle">{relativeTime(new Date(n.createdAt))}</Cell>
                <Cell><Badge variant={statusVariant(n.status)}>{enumLabel(n.status)}</Badge></Cell>
              </Row>
            ))}
          </AdminTable>
        ) : <p className="surface p-6 text-body-sm text-fg-muted">Nothing sent yet.</p>}
      </section>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Edit template" : "New template"}</DialogTitle><DialogDescription>Available placeholders: {PLACEHOLDERS}</DialogDescription></DialogHeader>
          {editing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Event" htmlFor="nt-event"><SimpleSelect value={editing.event ?? events[0]!} onValueChange={(v) => setEditing({ ...editing, event: v })} options={events.map((e) => ({ value: e, label: enumLabel(e) }))} /></Field>
              <Field label="Channel" htmlFor="nt-channel"><SimpleSelect value={editing.channel ?? "EMAIL"} onValueChange={(v) => setEditing({ ...editing, channel: v })} options={CHANNELS.map((c) => ({ value: c, label: enumLabel(c) }))} /></Field>
              <Field label="Locale" htmlFor="nt-locale"><Input id="nt-locale" value={editing.locale ?? "en"} onChange={(e) => setEditing({ ...editing, locale: e.target.value })} /></Field>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><Label htmlFor="nt-active">Active</Label><Switch id="nt-active" checked={editing.isActive ?? true} onCheckedChange={(v) => setEditing({ ...editing, isActive: v })} /></div>
              {editing.channel === "EMAIL" || editing.channel === "PUSH" ? <Field label={editing.channel === "PUSH" ? "Title" : "Subject"} htmlFor="nt-subject" className="sm:col-span-2"><Input id="nt-subject" value={editing.subject ?? ""} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} /></Field> : null}
              <Field label="Body" htmlFor="nt-body" error={errors.body} required className="sm:col-span-2"><Textarea id="nt-body" rows={6} value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} /></Field>
            </div>
          ) : null}
          <DialogFooter><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button loading={pending} onClick={() => start(async () => { if (!editing) return; setErrors({}); const res = await saveNotificationTemplateAction({ id: editing.id, event: editing.event ?? events[0]!, channel: editing.channel ?? "EMAIL", locale: editing.locale ?? "en", subject: editing.subject, body: editing.body ?? "", isActive: editing.isActive ?? true }); if (!res.ok) { setErrors(res.error.fields ?? {}); toast.error(res.error.message); return; } toast.success("Template saved."); setEditing(null); router.refresh(); })}>Save template</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={broadcast} onOpenChange={setBroadcast}>
        <DialogContent>
          <DialogHeader><DialogTitle>Broadcast an announcement</DialogTitle><DialogDescription>Sends to every recipient in the chosen audience on the selected channels.</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <Field label="Title" htmlFor="bc-title" error={errors.title} required><Input id="bc-title" value={message.title} onChange={(e) => setMessage({ ...message, title: e.target.value })} /></Field>
            <Field label="Message" htmlFor="bc-body" error={errors.body} required><Textarea id="bc-body" rows={4} value={message.body} onChange={(e) => setMessage({ ...message, body: e.target.value })} /></Field>
            <Field label="Audience" htmlFor="bc-aud"><SimpleSelect value={message.audience} onValueChange={(v) => setMessage({ ...message, audience: v as typeof message.audience })} options={[{ value: "ALL_STUDENTS", label: "All students" }, { value: "ALL_INSTRUCTORS", label: "All instructors" }, { value: "COURSE", label: "Students on one course" }]} /></Field>
            {message.audience === "COURSE" ? <Field label="Course" htmlFor="bc-course"><SimpleSelect value={message.courseId} onValueChange={(v) => setMessage({ ...message, courseId: v })} options={courses.map((c) => ({ value: c.id, label: c.title }))} /></Field> : null}
            <div className="grid gap-1.5">
              <Label>Channels</Label>
              <div className="flex flex-wrap gap-3">{CHANNELS.map((c) => <label key={c} className="flex items-center gap-2 text-sm"><Checkbox checked={message.channels.includes(c)} onCheckedChange={(v) => setMessage({ ...message, channels: v ? [...message.channels, c] : message.channels.filter((x) => x !== c) })} />{enumLabel(c)}</label>)}</div>
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setBroadcast(false)}>Cancel</Button><Button loading={pending} disabled={!message.title.trim() || !message.body.trim() || !message.channels.length || (message.audience === "COURSE" && !message.courseId)} onClick={() => start(async () => { setErrors({}); const res = await broadcastAnnouncementAction({ title: message.title.trim(), body: message.body.trim(), audience: message.audience, courseId: message.courseId || null, channels: message.channels }); if (!res.ok) { setErrors(res.error.fields ?? {}); toast.error(res.error.message); return; } toast.success(`Sent to ${res.data.count} people.`); setBroadcast(false); setMessage({ ...message, title: "", body: "" }); router.refresh(); })}>Send broadcast</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
