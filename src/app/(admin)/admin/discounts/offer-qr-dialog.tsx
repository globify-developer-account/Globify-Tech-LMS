"use client";

import * as React from "react";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function svgToPng(svg: string, size: number): Promise<Blob> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));
}

/** Print-ready QR for a discount: scanning opens /o/:code, which applies the offer at enrolment. */
export function OfferQrDialog({ offer, linkBase, onClose }: { offer: { code: string; name: string; isActive: boolean } | null; linkBase: string; onClose: () => void }) {
  const link = offer ? `${linkBase}${encodeURIComponent(offer.code)}` : "";
  const [svg, setSvg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!link) return;
    let cancelled = false;
    // Loaded on demand so the QR library isn't in the admin bundle until it's needed.
    import("@/lib/offer-qr")
      .then(({ brandedQrSvg }) => brandedQrSvg(link, 2048))
      .then((s) => !cancelled && setSvg(s))
      .catch(() => !cancelled && toast.error("Couldn't create the QR code."));
    return () => {
      cancelled = true;
      setSvg(null);
    };
  }, [link]);

  const file = offer ? `globify-offer-${offer.code.toLowerCase()}` : "";
  return (
    <Dialog open={!!offer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>QR code · {offer?.code}</DialogTitle>
          <DialogDescription>For flyers, posters and social posts. Scanning opens the offer page; the code is then applied automatically when the visitor enrols on the website.</DialogDescription>
        </DialogHeader>
        {offer && !offer.isActive ? <Alert variant="warning" title="This code is inactive">People who scan it will see that the offer isn&apos;t active. Switch it on before sharing.</Alert> : null}
        <div className="flex flex-col items-center gap-3">
          <div className="grid size-64 place-items-center rounded-lg border border-border bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL; nothing for next/image to optimise */}
            {svg ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={`QR code for ${link}`} className="size-full" /> : <span className="text-caption text-fg-subtle">Creating…</span>}
          </div>
          <div className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-caption">{link}</code>
            <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copied."), () => toast.error("Couldn't copy the link."))}><Copy /> Copy</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" disabled={!svg} onClick={() => svg && saveBlob(new Blob([svg], { type: "image/svg+xml" }), `${file}.svg`)}><Download /> SVG (print)</Button>
          <Button
            disabled={!svg}
            loading={busy}
            onClick={async () => {
              if (!svg) return;
              setBusy(true);
              try {
                saveBlob(await svgToPng(svg, 2048), `${file}.png`);
              } catch {
                toast.error("Couldn't create the PNG. Download the SVG instead.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download /> PNG (2048 px)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
