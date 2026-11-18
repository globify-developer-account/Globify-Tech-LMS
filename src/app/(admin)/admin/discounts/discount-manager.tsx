"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, QrCode, Ticket } from "lucide-react";
import { saveDiscountAction } from "@/server/actions/admin";
import { AdminTable, Row, Cell } from "@/components/admin/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SimpleSelect } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toaster";
import { formatDate, formatMoney } from "@/lib/utils";
import { OfferQrDialog } from "./offer-qr-dialog";

/** `personal`: a one-person referral coupon (WELCOME-/REF-), which is never shared as an offer QR. */
export interface DiscountRow { id: string; code: string; name: string; type: "PERCENT" | "FIXED"; value: number; maxUses: number | null; usedCount: number; validFrom: string; validTo: string; courseIds: string[]; isActive: boolean; invoices: number; personal: boolean }

const EMPTY: Omit<DiscountRow, "id" | "usedCount" | "invoices" | "personal"> = { code: "", name: "", type: "PERCENT", value: 10, maxUses: null, validFrom: "", validTo: "", courseIds: [], isActive: true };

export function DiscountManager({ discounts, courses, offerLinkBase }: { discounts: DiscountRow[]; courses: Array<{ id: string; title: string }>; offerLinkBase: string }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<(typeof EMPTY & { id?: string }) | null>(null);
  const [qrFor, setQrFor] = React.useState<DiscountRow | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, start] = React.useTransition();
  const save = () =>
    start(async () => {
      if (!editing) return;
      setErrors({});
      const res = await saveDiscountAction({ code: editing.code, name: editing.name, type: editing.type, value: editing.value, maxUses: editing.maxUses, validFrom: editing.validFrom ? new Date(editing.validFrom) : null, validTo: editing.validTo ? new Date(editing.validTo) : null, courseIds: editing.courseIds, isActive: editing.isActive }, editing.id);
      if (!res.ok) { setErrors(res.error.fields ?? {}); toast.error(res.error.message); return; }
      toast.success("Discount saved.");
      setEditing(null);
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Button size="sm" onClick={() => setEditing({ ...EMPTY })}><Plus /> New discount</Button></div>
      {discounts.length ? (
        <AdminTable headers={["Code", "Name", "Value", "Scope", "Valid", { label: "Used", align: "end" }, "Status", { label: "", align: "end" }]}>
          {discounts.map((d) => (
            <Row key={d.id}>
              <Cell><code className="rounded bg-bg-muted px-1.5 py-0.5 text-caption font-medium">{d.code}</code></Cell>
              <Cell muted>{d.name}</Cell>
              <Cell className="tabular-nums">{d.type === "PERCENT" ? `${d.value}%` : formatMoney(d.value)}</Cell>
              <Cell className="text-caption text-fg-muted">{d.courseIds.length ? `${d.courseIds.length} course${d.courseIds.length > 1 ? "s" : ""}` : "All courses"}</Cell>
              <Cell className="text-caption text-fg-muted">{d.validFrom ? formatDate(new Date(d.validFrom)) : "Always"}{d.validTo ? ` → ${formatDate(new Date(d.validTo))}` : ""}</Cell>
              <Cell align="end">{d.usedCount}{d.maxUses ? <span className="text-fg-subtle">/{d.maxUses}</span> : null}</Cell>
              <Cell>{d.isActive ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</Cell>
              <Cell align="end">
                {d.personal ? null : <Button variant="ghost" size="sm" onClick={() => setQrFor(d)} aria-label={`QR code for ${d.code}`}><QrCode /> QR</Button>}
                <Button variant="ghost" size="sm" onClick={() => setEditing({ ...d })}>Edit</Button>
              </Cell>
            </Row>
          ))}
        </AdminTable>
      ) : (
        <EmptyState icon={<Ticket />} title="No discount codes yet." description="Create a code to run a promotion on one course or the whole catalogue." action={<Button size="sm" onClick={() => setEditing({ ...EMPTY })}>Create a code</Button>} />
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Edit discount" : "New discount"}</DialogTitle><DialogDescription>Codes are case-insensitive and validated when an invoice is raised.</DialogDescription></DialogHeader>
          {editing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" htmlFor="d-code" error={errors.code} required><Input id="d-code" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} placeholder="EARLYBIRD" /></Field>
              <Field label="Name" htmlFor="d-name" error={errors.name} required><Input id="d-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Early bird, March intake" /></Field>
              <Field label="Type" htmlFor="d-type"><SimpleSelect value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v as "PERCENT" | "FIXED" })} options={[{ value: "PERCENT", label: "Percentage" }, { value: "FIXED", label: "Fixed amount" }]} /></Field>
              <Field label={editing.type === "PERCENT" ? "Percent off" : "Amount off"} htmlFor="d-value" error={errors.value} required><Input id="d-value" type="number" min={0} step="0.01" value={editing.value} onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })} /></Field>
              <Field label="Maximum uses" htmlFor="d-max" hint="Blank means unlimited."><Input id="d-max" type="number" min={1} value={editing.maxUses ?? ""} onChange={(e) => setEditing({ ...editing, maxUses: e.target.value ? Number(e.target.value) : null })} /></Field>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><Label htmlFor="d-active">Active</Label><Switch id="d-active" checked={editing.isActive} onCheckedChange={(v) => setEditing({ ...editing, isActive: v })} /></div>
              <Field label="Valid from" htmlFor="d-from"><Input id="d-from" type="date" value={editing.validFrom} onChange={(e) => setEditing({ ...editing, validFrom: e.target.value })} /></Field>
              <Field label="Valid to" htmlFor="d-to"><Input id="d-to" type="date" value={editing.validTo} onChange={(e) => setEditing({ ...editing, validTo: e.target.value })} /></Field>
              <div className="sm:col-span-2">
                <Label className="mb-2 block">Courses <span className="text-caption text-fg-subtle">(none selected means every course)</span></Label>
                <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                  {courses.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-0 hover:bg-bg-subtle">
                      <Checkbox checked={editing.courseIds.includes(c.id)} onCheckedChange={(v) => setEditing({ ...editing, courseIds: v ? [...editing.courseIds, c.id] : editing.courseIds.filter((x) => x !== c.id) })} />
                      {c.title}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button loading={pending} onClick={save}>Save discount</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <OfferQrDialog offer={qrFor} linkBase={offerLinkBase} onClose={() => setQrFor(null)} />
    </div>
  );
}
