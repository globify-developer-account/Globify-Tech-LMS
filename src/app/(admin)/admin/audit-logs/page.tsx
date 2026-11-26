import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { prisma, type Prisma } from "@/server/db/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/admin/filter-bar";
import { AdminTable, Row, Cell } from "@/components/admin/table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { AuditDetails } from "./audit-details";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit logs" };
export const dynamic = "force-dynamic";

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<{ q?: string; entity?: string; actor?: string; page?: string }> }) {
  const [sp] = await Promise.all([searchParams, requirePermission("audit.read")]);
  const page = Number(sp.page ?? 1) || 1;
  const pageSize = 50;
  const where: Prisma.AuditLogWhereInput = {
    ...(sp.entity ? { entityType: sp.entity } : {}),
    ...(sp.actor ? { actorId: sp.actor } : {}),
    ...(sp.q ? { OR: [{ action: { contains: sp.q } }, { entityId: { contains: sp.q } }, { actor: { name: { contains: sp.q } } }, { actor: { email: { contains: sp.q } } }] } : {}),
  };
  const [rows, total, entities] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { actor: { select: { id: true, name: true, email: true } } } }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);
  const hrefFor = (p: number) => { const q = new URLSearchParams(); if (sp.q) q.set("q", sp.q); if (sp.entity) q.set("entity", sp.entity); if (sp.actor) q.set("actor", sp.actor); q.set("page", String(p)); return `/admin/audit-logs?${q}`; };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit logs" description="Immutable record of every sensitive action. Entries cannot be edited or deleted from the application." />
      <FilterBar searchPlaceholder="Search action, entity id or actor" filters={[{ key: "entity", label: "entities", options: entities.map((e) => ({ value: e.entityType, label: e.entityType })) }]} />
      {rows.length ? (
        <AdminTable headers={["When", "Actor", "Action", "Entity", "Request", { label: "Details", align: "end" }]} dense>
          {rows.map((r) => (
            <Row key={r.id}>
              <Cell className="whitespace-nowrap text-caption text-fg-muted">{formatDateTime(r.createdAt)}</Cell>
              <Cell>{r.actor ? <span className="text-sm"><span className="font-medium">{r.actor.name}</span><span className="block text-caption text-fg-subtle">{r.actor.email}</span></span> : <Badge variant="default">System</Badge>}</Cell>
              <Cell><code className="rounded bg-bg-muted px-1.5 py-0.5 text-caption">{r.action}</code></Cell>
              <Cell className="text-caption"><span className="font-medium">{r.entityType}</span>{r.entityId ? <span className="block max-w-56 truncate text-fg-subtle">{r.entityId}</span> : null}</Cell>
              <Cell className="text-caption text-fg-subtle">{r.ip ?? "—"}{r.requestId ? <span className="block truncate">{r.requestId.slice(0, 12)}</span> : null}</Cell>
              <Cell align="end"><AuditDetails before={r.before} after={r.after} userAgent={r.userAgent} roles={r.actorRoles} /></Cell>
            </Row>
          ))}
        </AdminTable>
      ) : (
        <EmptyState icon={<ScrollText />} title="No audit entries match." />
      )}
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={hrefFor} />
    </div>
  );
}
