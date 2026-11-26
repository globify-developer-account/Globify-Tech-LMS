import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/admin/filter-bar";
import { OpportunityManager } from "@/components/admin/opportunity-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { toNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Internships" };
export const dynamic = "force-dynamic";

export default async function InternshipsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const [sp] = await Promise.all([searchParams, requirePermission("career.jobs.manage")]);
  const [internships, employers, skills] = await Promise.all([
    prisma.internship.findMany({
      where: { ...(sp.status ? { status: sp.status as "OPEN" } : {}), ...(sp.q ? { OR: [{ title: { contains: sp.q } }, { employer: { name: { contains: sp.q } } }] } : {}) },
      orderBy: { createdAt: "desc" },
      include: { employer: { select: { id: true, name: true } }, skills: { include: { skill: { select: { id: true, name: true } } } }, applications: { select: { id: true, status: true, matchScore: true, student: { select: { id: true, user: { select: { name: true } } } } } } },
    }),
    prisma.employer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.skill.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Internships" description="Paid and unpaid placements for current students and recent graduates." />
      <FilterBar searchPlaceholder="Internship title or employer" filters={[{ key: "status", label: "statuses", options: [{ value: "DRAFT", label: "Draft" }, { value: "OPEN", label: "Open" }, { value: "CLOSED", label: "Closed" }, { value: "FILLED", label: "Filled" }] }]} />
      {employers.length ? (
        <OpportunityManager
          kind="internship"
          employers={employers}
          skills={skills}
          items={internships.map((j) => ({ id: j.id, title: j.title, slug: j.slug, description: j.description ?? "", employerId: j.employerId, employerName: j.employer.name, location: j.location ?? "", isRemote: j.isRemote, durationWeeks: j.durationWeeks, stipend: j.stipend ? toNumber(j.stipend) : null, currency: j.currency, status: j.status, closesAt: j.closesAt ? j.closesAt.toISOString().slice(0, 10) : "", skills: j.skills.map((s) => ({ skillId: s.skillId, name: s.skill.name, required: s.required })), applications: j.applications.map((a) => ({ id: a.id, status: a.status, matchScore: a.matchScore, studentId: a.student.id, studentName: a.student.user.name })) }))}
        />
      ) : (
        <EmptyState icon={<Briefcase />} title="Add an employer first." description="Internships belong to a hiring partner. Create one on the employers page." />
      )}
    </div>
  );
}
