"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ticket } from "lucide-react";
import { applyDiscountCodeAction } from "@/server/actions/student";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { formatMoney } from "@/lib/utils";

/** "Have a discount code?" on an unpaid invoice: offer codes, referral coupons. */
export function DiscountCodeForm({ invoiceId, currency }: { invoiceId: string; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-body-sm font-medium text-accent hover:underline">
        <Ticket className="size-4" /> Have a discount code?
      </button>
    );
  }

  const apply = () =>
    start(async () => {
      setError(null);
      const res = await applyDiscountCodeAction({ invoiceId, code });
      if (!res.ok) {
        setError(res.error.fields?.code?.[0] ?? res.error.message);
        return;
      }
      toast.success(`Code ${res.data.code} applied: ${formatMoney(res.data.discountAmount, currency)} off.`);
      setOpen(false);
      setCode("");
      router.refresh();
    });

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) apply();
      }}
    >
      <label htmlFor="discount-code" className="text-body-sm font-medium">Discount code</label>
      <div className="flex gap-2">
        <Input id="discount-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. GLOBIFY20" autoComplete="off" autoCapitalize="characters" aria-invalid={!!error} aria-describedby={error ? "discount-code-error" : undefined} />
        <Button type="submit" variant="secondary" loading={pending} disabled={!code.trim()}>Apply</Button>
      </div>
      {error ? <p id="discount-code-error" className="text-caption text-danger">{error}</p> : null}
    </form>
  );
}
