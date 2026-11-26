import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/admin/filter-bar";
import { OpportunityManager } from "@/components/admin/opportunity-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { toNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const [sp] = await Promise.all([searchParams, requirePermission("career.jobs.manage")]);
  const [jobs, employers, skills] = await Promise.all([
    prisma.job.findMany({
      where: { ...(sp.status ? { status: sp.status as "OPEN" } : {}), ...(sp.q ? { OR: [{ title: { contains: sp.q } }, { employer: { name: { contains: sp.q } } }] } : {}) },
      orderBy: { createdAt: "desc" },
      include: { employer: { select: { id: true, name: true } }, skills: { include: { skill: { select: { id: true, name: true } } } }, applications: { select: { id: true, status: true, matchScore: true, student: { select: { id: true, user: { select: { name: true } } } } } } },
    }),
    prisma.employer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.skill.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Jobs" description="Openings from hiring partners, matched to graduates by skill." />
      <FilterBar searchPlaceholder="Job title or employer" filters={[{ key: "status", label: "statuses", options: [{ value: "DRAFT", label: "Draft" }, { value: "OPEN", label: "Open" }, { value: "CLOSED", label: "Closed" }, { value: "FILLED", label: "Filled" }] }]} />
      {employers.length ? (
        <OpportunityManager
          kind="job"
          employers={employers}
          skills={skills}
          items={jobs.map((j) => ({ id: j.id, title: j.title, slug: j.slug, description: j.description ?? "", employerId: j.employerId, employerName: j.employer.name, type: j.type, location: j.location ?? "", isRemote: j.isRemote, salaryMin: j.salaryMin ? toNumber(j.salaryMin) : null, salaryMax: j.salaryMax ? toNumber(j.salaryMax) : null, currency: j.currency, status: j.status, closesAt: j.closesAt ? j.closesAt.toISOString().slice(0, 10) : "", skills: j.skills.map((s) => ({ skillId: s.skillId, name: s.skill.name, required: s.required })), applications: j.applications.map((a) => ({ id: a.id, status: a.status, matchScore: a.matchScore, studentId: a.student.id, studentName: a.student.user.name })) }))}
        />
      ) : (
        <EmptyState icon={<Briefcase />} title="Add an employer first." description="Jobs belong to a hiring partner. Create one on the employers page." />
      )}
    </div>
  );
}
