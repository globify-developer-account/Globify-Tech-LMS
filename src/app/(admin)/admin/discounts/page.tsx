import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { DiscountManager } from "./discount-manager";
import { absoluteUrl, toNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Discounts" };
export const dynamic = "force-dynamic";

export default async function DiscountsPage() {
  await requirePermission("discounts.manage");
  const [discounts, courses] = await Promise.all([
    prisma.discount.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { invoices: true } }, referralWelcome: { select: { id: true } }, referralReward: { select: { id: true } } } }),
    prisma.course.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Discounts" description="Promo codes. Students enter them on their invoice, admins when raising one, and a code's QR link applies it automatically at enrolment." />
      <DiscountManager
        courses={courses}
        offerLinkBase={absoluteUrl("/o/")}
        discounts={discounts.map((d) => ({ id: d.id, code: d.code, name: d.name, type: d.type, value: toNumber(d.value), maxUses: d.maxUses, usedCount: d.usedCount, validFrom: d.validFrom ? d.validFrom.toISOString().slice(0, 10) : "", validTo: d.validTo ? d.validTo.toISOString().slice(0, 10) : "", courseIds: d.courseIds, isActive: d.isActive, invoices: d._count.invoices, personal: !!(d.referralWelcome || d.referralReward) }))}
      />
    </div>
  );
}
