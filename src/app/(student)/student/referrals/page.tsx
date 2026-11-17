import type { Metadata } from "next";
import { Gift, Share2, Ticket } from "lucide-react";
import { requireStudentProfile } from "@/server/auth/session";
import { referralSummary } from "@/server/services/referrals";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Refer a friend" };
export const dynamic = "force-dynamic";

const couponBadge = { AVAILABLE: { variant: "success", label: "Ready to use" }, USED: { variant: "default", label: "Used" }, EXPIRED: { variant: "warning", label: "Expired" } } as const;

export default async function ReferralsPage() {
  const { studentId } = await requireStudentProfile();
  const r = await referralSummary(studentId);
  const share = r.shareUrl ? `https://wa.me/?text=${encodeURIComponent(`Join me at Globify Tech! Sign up with my code ${r.code} and get ${r.rules.friendDiscountPercent}% off your first course: ${r.shareUrl}`)}` : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Refer a friend" description={`Your friend gets ${r.rules.friendDiscountPercent}% off their first course. When they enrol${r.rules.paidCoursesOnly ? " in a paid course" : ""}, you get ${r.rules.referrerDiscountPercent}% off your next fee.`} />
      {r.welcome ? (
        <section className="surface p-5">
          <p className="text-h4 flex items-center gap-2"><Ticket className="size-5 text-accent" /> Your welcome gift from {r.welcome.from}</p>
          <p className="mt-2 text-sm text-fg-muted">{r.welcome.percent}% off your first course with code <span className="font-mono font-medium text-fg">{r.welcome.code}</span>{r.welcome.validTo ? ` · valid until ${formatDate(r.welcome.validTo)}` : ""}</p>
          <Badge className="mt-3" variant={couponBadge[r.welcome.status].variant}>{couponBadge[r.welcome.status].label}</Badge>
        </section>
      ) : null}
      {r.enabled && r.code ? (
        <section className="surface-raised relative overflow-hidden p-6">
          <span className="absolute inset-y-0 start-0 w-1.5 gradient-brand" aria-hidden />
          <p className="text-caption text-fg-subtle">Your referral code</p>
          <p className="mt-1 font-mono text-h2 tracking-wider">{r.code}</p>
          <p className="mt-3 break-all text-sm text-fg-muted">{r.shareUrl}</p>
          {share ? <Button asChild className="mt-4"><a href={share} target="_blank" rel="noreferrer"><Share2 /> Share on WhatsApp</a></Button> : null}
          <p className="mt-4 text-sm text-fg-muted">{r.stats.invited} friend{r.stats.invited === 1 ? "" : "s"} joined · {r.stats.enrolled} enrolled</p>
        </section>
      ) : (
        <EmptyState icon={<Gift />} title="Referrals are paused" description="Check back soon." />
      )}
      {r.rewards.length ? (
        <section className="surface p-5">
          <p className="text-h4">Your rewards</p>
          <ul className="mt-3 flex flex-col gap-2">
            {r.rewards.map((c) => (
              <li key={c.code} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span><span className="font-mono font-medium">{c.code}</span> · {c.percent}% off{c.validTo ? ` · until ${formatDate(c.validTo)}` : ""}</span>
                <Badge variant={couponBadge[c.status].variant}>{couponBadge[c.status].label}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {r.referrals.length ? (
        <section className="surface p-5">
          <p className="text-h4">Friends you invited</p>
          <ul className="mt-3 flex flex-col gap-2">
            {r.referrals.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{f.friend}<span className="block text-caption text-fg-subtle">Joined {formatDate(f.joinedAt)}</span></span>
                <Badge variant={f.status === "REWARDED" ? "success" : "info"}>{f.status === "REWARDED" ? "Enrolled" : "Signed up"}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
