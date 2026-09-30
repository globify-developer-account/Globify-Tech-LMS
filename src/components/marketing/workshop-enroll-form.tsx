"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { CalendarDays, CalendarPlus, CheckCircle2, Clock, MapPin, MessageCircle, Video } from "lucide-react";
import { enrollWorkshopAction } from "@/server/actions/workshops";
import type { WorkshopSession } from "@/server/services/workshops";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SimpleSelect } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem, RadioCard } from "@/components/ui/radio-group";
import { calendarLink, formatWorkshopDate, optionLabel, workshopTimeRange, WORKSHOP_ATTENDANCE, WORKSHOP_LEVELS, WORKSHOP_OCCUPATIONS, WORKSHOP_REFERRERS, WORKSHOP_TRACKS } from "@/lib/workshops";
import { cn } from "@/lib/utils";

export interface WorkshopEnrollFormProps {
  sessions: WorkshopSession[];
  /** YYYY-MM-DD to preselect, e.g. from a `?date=` link. */
  initialDate?: string;
  defaults?: { name?: string; email?: string };
  campusAddress: string;
  whatsapp: string;
}

function SessionOption({ session, selected }: { session: WorkshopSession; selected: boolean }) {
  const id = React.useId();
  const open = session.status === "OPEN";
  const badge =
    session.status === "FULL" ? <Badge variant="danger">Full</Badge>
    : session.status === "CANCELLED" ? <Badge variant="default">Cancelled this week</Badge>
    : session.status === "PENDING" ? <Badge variant="default">Details coming soon</Badge>
    : session.status === "CLOSED" ? <Badge variant="default">Closed</Badge>
    : session.seatsLeft == null ? <Badge variant="success">Open</Badge>
    : session.seatsLeft <= 5 ? <Badge variant="warning">{session.seatsLeft} {session.seatsLeft === 1 ? "seat" : "seats"} left</Badge>
    : <Badge variant="success">{session.seatsLeft} seats left</Badge>;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-surface p-4 transition-colors",
        open ? "cursor-pointer hover:border-border-strong" : "cursor-not-allowed opacity-60",
        selected && "border-accent bg-accent-soft/40",
      )}
    >
      <RadioGroupItem value={session.date} id={id} disabled={!open} className="mt-0.5" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-fg">{formatWorkshopDate(session.date, { year: undefined })}</span>
          {badge}
        </span>
        {session.hasTopic ? <span className="text-body-sm text-fg">{session.title}</span> : null}
        <span className="text-body-sm text-fg-muted">{workshopTimeRange()}</span>
      </span>
    </label>
  );
}

export function WorkshopEnrollForm({ sessions, initialDate, defaults, campusAddress, whatsapp }: WorkshopEnrollFormProps) {
  const [state, action, pending] = useActionState(enrollWorkshopAction, null);
  const firstOpen = sessions.find((s) => s.status === "OPEN");
  const preselected = sessions.find((s) => s.date === initialDate && s.status === "OPEN") ?? firstOpen;
  const [date, setDate] = React.useState<string>(preselected?.date ?? "");
  const [occupation, setOccupation] = React.useState("");
  const [track, setTrack] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [attendance, setAttendance] = React.useState("ON_CAMPUS");
  const [referrer, setReferrer] = React.useState("");
  // Text fields are controlled so a server-side validation error never wipes what was typed.
  const [text, setText] = React.useState({ name: defaults?.name ?? "", email: defaults?.email ?? "", phone: "", city: "", message: "" });
  const setField = (key: keyof typeof text) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText((t) => ({ ...t, [key]: e.target.value }));
  const utm = React.useMemo(() => {
    if (typeof window === "undefined") return {};
    const p = new URLSearchParams(window.location.search);
    return { utm_source: p.get("utm_source") ?? "", utm_medium: p.get("utm_medium") ?? "", utm_campaign: p.get("utm_campaign") ?? "" };
  }, []);
  const errors = state && !state.ok ? state.error.fields : undefined;
  const wa = whatsapp.replace(/[^0-9]/g, "");

  if (state?.ok) {
    const r = state.data;
    const online = r.attendance === "ONLINE";
    const start = new Date(r.startsAt);
    const end = new Date(r.endsAt);
    return (
      <div className="surface flex flex-col gap-6 p-6 md:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="size-12 text-success" />
          <h2 className="text-h2">{r.alreadyRegistered ? "You were already on the list." : "Your seat is reserved."}</h2>
          <p className="max-w-md text-body text-fg-muted">
            {r.alreadyRegistered ? "We’ve refreshed your details for" : "We’ve emailed a confirmation to"} <span className="font-medium text-fg">{r.alreadyRegistered ? formatWorkshopDate(r.date) : r.email}</span>. A counsellor will also say hello on WhatsApp before Saturday.
          </p>
        </div>
        <dl className="grid gap-4 rounded-xl border border-border bg-bg-subtle p-5 text-body-sm sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" />
            <div><dt className="text-label text-fg-subtle">When</dt><dd className="mt-1 font-medium text-fg">{formatWorkshopDate(r.date)}</dd><dd className="text-fg-muted">{workshopTimeRange()}</dd></div>
          </div>
          <div className="flex items-start gap-3">
            {online ? <Video className="mt-0.5 size-4 shrink-0 text-accent" /> : <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />}
            <div><dt className="text-label text-fg-subtle">{online ? "How" : "Where"}</dt><dd className="mt-1 font-medium text-fg">{online ? "Online" : "Globify Tech campus"}</dd><dd className="text-fg-muted">{online ? "Live link arrives on WhatsApp before we start." : campusAddress}</dd></div>
          </div>
          {r.title.startsWith("Saturday Workshop ·") ? null : (
            <div className="flex items-start gap-3 sm:col-span-2">
              <Clock className="mt-0.5 size-4 shrink-0 text-accent" />
              <div><dt className="text-label text-fg-subtle">This week’s topic</dt><dd className="mt-1 font-medium text-fg">{r.title}</dd></div>
            </div>
          )}
        </dl>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <a href={calendarLink({ title: r.title, start, end, location: online ? "Online (Globify Tech)" : campusAddress, details: `Free Saturday Workshop at Globify Tech. Details: ${typeof window !== "undefined" ? window.location.origin : ""}/workshop` })} target="_blank" rel="noreferrer">
              <CalendarPlus /> Add to Google Calendar
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi! I just reserved a seat for the Saturday Workshop on ${formatWorkshopDate(r.date, { year: undefined })}.`)}`} target="_blank" rel="noreferrer">
              <MessageCircle /> Message us on WhatsApp
            </a>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/courses">Browse courses</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="surface flex flex-col gap-8 p-6 md:p-8" noValidate>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {Object.entries(utm).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {state && !state.ok && !errors ? <Alert variant="danger">{state.error.message}</Alert> : null}
      {state && !state.ok && errors ? <Alert variant="warning">Please check the highlighted fields.</Alert> : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 flex flex-col gap-1">
          <span className="text-h4">1. Pick your Saturday</span>
          <span className="text-body-sm text-fg-muted">One seat per Saturday. You can come back for another week any time.</span>
        </legend>
        <input type="hidden" name="date" value={date} />
        {sessions.length ? (
          <RadioGroup value={date} onValueChange={setDate} className="grid gap-3 sm:grid-cols-2" aria-label="Workshop date">
            {sessions.map((s) => (
              <SessionOption key={s.date} session={s} selected={s.date === date} />
            ))}
          </RadioGroup>
        ) : null}
        {!firstOpen ? <Alert variant="neutral">Every upcoming Saturday is full or paused. Message us on WhatsApp and we’ll hold a seat for the next open week.</Alert> : null}
        {errors?.date ? <p role="alert" className="text-body-sm text-danger">{errors.date[0]}</p> : null}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 flex flex-col gap-1">
          <span className="text-h4">2. About you</span>
          <span className="text-body-sm text-fg-muted">We confirm seats on WhatsApp and email.</span>
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="ws-name" error={errors?.name} required>
            <Input id="ws-name" name="name" autoComplete="name" value={text.name} onChange={setField("name")} required invalid={!!errors?.name} />
          </Field>
          <Field label="WhatsApp number" htmlFor="ws-phone" error={errors?.phone} required>
            <Input id="ws-phone" name="phone" type="tel" autoComplete="tel" placeholder="03xx xxxxxxx" value={text.phone} onChange={setField("phone")} required invalid={!!errors?.phone} />
          </Field>
          <Field label="Email" htmlFor="ws-email" error={errors?.email} required>
            <Input id="ws-email" name="email" type="email" autoComplete="email" value={text.email} onChange={setField("email")} required invalid={!!errors?.email} />
          </Field>
          <Field label="City" htmlFor="ws-city" error={errors?.city}>
            <Input id="ws-city" name="city" autoComplete="address-level2" placeholder="Faisalabad" value={text.city} onChange={setField("city")} invalid={!!errors?.city} />
          </Field>
          <Field label="I am a…" htmlFor="ws-occupation" error={errors?.occupation} required>
            <input type="hidden" name="occupation" value={occupation} />
            <SimpleSelect value={occupation} onValueChange={setOccupation} placeholder="Choose one" invalid={!!errors?.occupation} options={WORKSHOP_OCCUPATIONS.map((o) => ({ value: o.value, label: o.label }))} />
          </Field>
          <Field label="What do you want to learn?" htmlFor="ws-track" error={errors?.track} required>
            <input type="hidden" name="track" value={track} />
            <SimpleSelect value={track} onValueChange={setTrack} placeholder="Choose a track" invalid={!!errors?.track} options={WORKSHOP_TRACKS.map((o) => ({ value: o.value, label: o.label }))} />
          </Field>
        </div>
        <Field label="Your experience so far" htmlFor="ws-level" error={errors?.level} required>
          <input type="hidden" name="level" value={level} />
          <RadioGroup value={level} onValueChange={setLevel} className="grid gap-2 sm:grid-cols-3" aria-label="Experience level">
            {WORKSHOP_LEVELS.map((o) => (
              <RadioCard key={o.value} value={o.value} title={o.label} description={o.description} className="p-3" />
            ))}
          </RadioGroup>
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 flex flex-col gap-1">
          <span className="text-h4">3. How will you join?</span>
        </legend>
        <input type="hidden" name="attendance" value={attendance} />
        <RadioGroup value={attendance} onValueChange={setAttendance} className="grid gap-2 sm:grid-cols-2" aria-label="Attendance">
          {WORKSHOP_ATTENDANCE.map((o) => (
            <RadioCard key={o.value} value={o.value} title={o.label} description={o.description} icon={o.value === "ONLINE" ? <Video /> : <MapPin />} />
          ))}
        </RadioGroup>
        {errors?.attendance ? <p role="alert" className="text-body-sm text-danger">{errors.attendance[0]}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How did you hear about us?" htmlFor="ws-referrer" error={errors?.referrer}>
            <input type="hidden" name="referrer" value={referrer} />
            <SimpleSelect value={referrer} onValueChange={setReferrer} placeholder="Optional" options={WORKSHOP_REFERRERS.map((o) => ({ value: o.value, label: o.label }))} />
          </Field>
        </div>
        <Field label="Anything you’d like us to know?" htmlFor="ws-message" error={errors?.message} hint="Questions, goals, or someone you’re bringing along.">
          <Textarea id="ws-message" name="message" rows={3} value={text.message} onChange={setField("message")} invalid={!!errors?.message} />
        </Field>
      </fieldset>

      <div className="flex flex-col gap-4 border-t border-border pt-6">
        <div className="flex flex-col gap-1">
          <label className="flex items-start gap-3 text-body-sm text-fg-muted">
            <Checkbox name="consent" className="mt-0.5" aria-invalid={!!errors?.consent} />
            <span>I agree that Globify Tech may contact me on WhatsApp and email about this workshop and related courses.</span>
          </label>
          {errors?.consent ? <p role="alert" className="text-body-sm text-danger">{errors.consent[0]}</p> : null}
        </div>
        <Button type="submit" size="lg" loading={pending} disabled={!firstOpen} className="w-full sm:w-auto sm:self-start">
          Reserve my seat{date ? ` for ${formatWorkshopDate(date, { weekday: undefined, year: undefined })}` : ""}
        </Button>
        <p className="text-caption text-fg-subtle">
          Free to attend. Selected: {date ? optionLabel(sessions.map((s) => ({ value: s.date, label: formatWorkshopDate(s.date) })), date) : "no date yet"}.
        </p>
      </div>
    </form>
  );
}
