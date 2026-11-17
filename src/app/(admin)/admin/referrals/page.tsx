import type { Metadata } from "next";
import Link from "next/link";
import { Gift } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { getSetting } from "@/server/services/settings";
import { PageHeader } from "@/components/layout/page-header";
import { AdminTable, Row, Cell } from "@/components/admin/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Referrals" };
export const dynamic = "force-dynamic";

type Coupon = { code: string; usedCount: number; maxUses: number | null } | null;
const couponCell = (c: Coupon) =>
  c ? (
    <span className="font-mono text-caption">
      {c.code}
      <span className="block font-sans text-fg-subtle">{c.maxUses != null && c.usedCount >= c.maxUses ? "used" : "not used yet"}</span>
    </span>
  ) : null;

export default async function ReferralsPage() {
  await requirePermission("discounts.manage");
  const [referrals, counts, friendPct, referrerPct, enabled] = await Promise.all([
    prisma.referral.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        referrer: { select: { studentNumber: true, user: { select: { name: true } } } },
        referee: { select: { name: true, email: true } },
        friendDiscount: { select: { code: true, usedCount: true, maxUses: true } },
        referrerDiscount: { select: { code: true, usedCount: true, maxUses: true } },
      },
    }),
    prisma.referral.groupBy({ by: ["status"], _count: { _all: true } }),
    getSetting("referrals.friendDiscountPercent"),
    getSetting("referrals.referrerDiscountPercent"),
    getSetting("referrals.enabled"),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Referrals"
        description={`Friends who signed up with a student's code. ${enabled ? `Friends get ${friendPct}% off their first course; referrers get ${referrerPct}% off when the friend enrols.` : "Referrals are switched off."}`}
        actions={<Button asChild size="sm" variant="secondary"><Link href="/admin/settings">Referral settings</Link></Button>}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface p-4"><p className="text-caption text-fg-subtle">Signed up</p><p className="text-h3">{countOf("SIGNED_UP") + countOf("REWARDED")}</p></div>
        <div className="surface p-4"><p className="text-caption text-fg-subtle">Enrolled (rewarded)</p><p className="text-h3">{countOf("REWARDED")}</p></div>
        <div className="surface p-4"><p className="text-caption text-fg-subtle">Waiting to enrol</p><p className="text-h3">{countOf("SIGNED_UP")}</p></div>
      </div>
      {referrals.length ? (
        <AdminTable headers={["Referrer", "Friend", "Signed up", "Status", "Friend's coupon", "Referrer's reward"]}>
          {referrals.map((r) => (
            <Row key={r.id}>
              <Cell><span className="font-medium">{r.referrer.user.name}</span><span className="block text-caption text-fg-subtle">{r.referrer.studentNumber} · {r.code}</span></Cell>
              <Cell><span className="font-medium">{r.referee.name}</span><span className="block text-caption text-fg-subtle">{r.referee.email}</span></Cell>
              <Cell muted>{formatDate(r.createdAt)}</Cell>
              <Cell>
                <Badge variant={r.status === "REWARDED" ? "success" : r.status === "VOID" ? "default" : "info"}>{r.status === "REWARDED" ? "Enrolled" : r.status === "VOID" ? "Void" : "Signed up"}</Badge>
                {r.rewardedAt ? <span className="block text-caption text-fg-subtle">{formatDate(r.rewardedAt)}</span> : null}
              </Cell>
              <Cell>{couponCell(r.friendDiscount)}</Cell>
              <Cell>{couponCell(r.referrerDiscount)}</Cell>
            </Row>
          ))}
        </AdminTable>
      ) : (
        <EmptyState icon={<Gift />} title="No referrals yet" description="Students find their code under Refer a friend, in the app and on the website." />
      )}
    </div>
  );
}
