import type { Metadata } from "next";
import { CalendarDays, Clock, MapPin, Laptop, Users, Wrench, Compass, MessageCircle, Ticket } from "lucide-react";
import { getSession } from "@/server/auth/session";
import { getWorkshopSessions } from "@/server/services/workshops";
import { PageHero } from "@/components/marketing/page-hero";
import { WorkshopEnrollForm } from "@/components/marketing/workshop-enroll-form";
import { buildMetadata } from "@/lib/seo";
import { workshopTimeRange } from "@/lib/workshops";
import { site } from "@/config/site";

// Seat counts must be current, and the form pre-fills from the session cookie.
export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Saturday Workshop — free, every week",
  description: "Reserve a free seat at the Globify Tech Saturday Workshop in Faisalabad. Two hands-on hours with an instructor, every Saturday. Pick a date and enroll online.",
  path: "/workshop",
});

const STEPS = [
  { title: "Pick a Saturday", body: "Choose any of the next four Saturdays. Seats are limited so we can keep groups small." },
  { title: "Get your confirmation", body: "You’ll get an email straight away and a WhatsApp hello from a counsellor before the day." },
  { title: "Show up and build", body: "Arrive 15 minutes early with a laptop if you have one. We provide the rest." },
];

const HIGHLIGHTS = [
  { icon: Wrench, title: "Hands-on, not a lecture", body: "You leave with something you made: a landing page, an ad campaign, an AI automation or a design." },
  { icon: Users, title: "Meet instructors and students", body: "Ask real questions about the courses, the job market and freelancing before you commit to anything." },
  { icon: Compass, title: "Find your track", body: "Not sure whether it’s AI, marketing, development or design? Saturday is the low-pressure way to find out." },
  { icon: Ticket, title: "Free, no strings", body: "No fee, no sales pitch. If a course fits you, admissions will tell you honestly what it involves." },
];

const FAQ = [
  { q: "Who is it for?", a: "Anyone 15+ who is curious about tech careers: students, graduates, professionals switching fields, and parents exploring for their children." },
  { q: "Do I need a laptop?", a: "Bring one if you can. If not, tell us in the form and we’ll pair you with someone or set up a campus machine." },
  { q: "Can I come more than once?", a: "Yes. Each Saturday covers a different topic. Enroll again with the same email for another week." },
  { q: "What if I can’t make it?", a: "WhatsApp us before Saturday so another person can take the seat, then enroll for a later week." },
];

export default async function WorkshopPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [{ date }, sessions, session] = await Promise.all([searchParams, getWorkshopSessions(), getSession()]);
  const open = sessions.filter((s) => s.status === "OPEN");
  const wa = site.contact.whatsapp.replace(/[^0-9]/g, "");

  return (
    <>
      <PageHero
        eyebrow="Saturday Workshop"
        title="A free, hands-on workshop. Every Saturday."
        description="Two hours on campus in Faisalabad with a Globify instructor. Build something real, meet current students and find the course that fits you. Reserve a seat below."
        crumbs={[{ label: "Home", href: "/" }, { label: "Events", href: "/events" }, { label: "Saturday Workshop" }]}
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-body-sm text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4 text-accent" /> Every Saturday
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-4 text-accent" /> {workshopTimeRange()}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 text-accent" /> Kohinoor Plaza, Jaranwala Road, Faisalabad
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Laptop className="size-4 text-accent" /> Free · small groups
          </span>
        </div>
      </PageHero>

      <div className="container-x grid gap-10 py-12 md:py-16 lg:grid-cols-12 lg:gap-14">
        <div className="flex flex-col gap-10 lg:col-span-5">
          <section className="flex flex-col gap-4">
            <h2 className="text-h3 text-fg">How it works</h2>
            <ol className="flex flex-col gap-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex items-start gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-fg">{i + 1}</span>
                  <div>
                    <p className="font-medium text-fg">{s.title}</p>
                    <p className="text-body-sm text-fg-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-h3 text-fg">What happens on Saturday</h2>
            <ul className="grid gap-4">
              {HIGHLIGHTS.map((h) => (
                <li key={h.title} className="flex items-start gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <h.icon className="size-5" />
                  </span>
                  <div>
                    <p className="font-medium text-fg">{h.title}</p>
                    <p className="text-body-sm text-fg-muted">{h.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {open.length ? (
            <section className="flex flex-col gap-3 rounded-xl border border-border bg-bg-subtle p-5">
              <p className="text-label text-fg-subtle">Next open Saturdays</p>
              <ul className="flex flex-col gap-2 text-body-sm">
                {open.map((s) => (
                  <li key={s.date} className="flex items-center justify-between gap-3">
                    <span className="text-fg">{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Karachi" }).format(new Date(s.startsAt))}{s.hasTopic ? <span className="text-fg-muted"> · {s.title}</span> : null}</span>
                    <span className="shrink-0 text-fg-muted">{s.seatsLeft == null ? "Open" : `${s.seatsLeft} seats left`}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="flex flex-col gap-4">
            <h2 className="text-h3 text-fg">Good to know</h2>
            <dl className="flex flex-col gap-4">
              {FAQ.map((f) => (
                <div key={f.q}>
                  <dt className="font-medium text-fg">{f.q}</dt>
                  <dd className="text-body-sm text-fg-muted">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="surface surface-hover flex items-center gap-4 p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
              <MessageCircle className="size-5" />
            </span>
            <span className="flex flex-col">
              <span className="font-medium text-fg">Questions? WhatsApp us</span>
              <span className="text-body-sm text-fg-muted">{site.contact.whatsapp} · {site.contact.hours}</span>
            </span>
          </a>
        </div>

        <div className="lg:col-span-7">
          <WorkshopEnrollForm sessions={sessions} initialDate={date} defaults={session ? { name: session.name, email: session.email } : undefined} campusAddress={site.contact.address} whatsapp={site.contact.whatsapp} />
        </div>
      </div>
    </>
  );
}
