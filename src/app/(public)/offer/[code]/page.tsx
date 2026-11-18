import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { Button } from "@/components/ui/button";
import { getSession } from "@/server/auth/session";
import { offerPreview, type OfferPreview } from "@/server/services/offers";
import { buildMetadata } from "@/lib/seo";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

function headline(offer: Extract<OfferPreview, { valid: true }>): string {
  const amount = offer.type === "PERCENT" ? `${offer.value}% off` : `${formatMoney(offer.value)} off`;
  const scope = !offer.courses.length ? "any course" : offer.courses.length === 1 ? offer.courses[0]!.title : `${offer.courses.length} selected courses`;
  return `${amount} ${scope}`;
}

const ENDED: Record<Extract<OfferPreview, { valid: false }>["reason"], { title: string; description: string }> = {
  unknown: { title: "We couldn't find that offer.", description: "Check the code, or browse our courses to see what's on." },
  inactive: { title: "This offer isn't active right now.", description: "Browse our courses, or follow us for the next promotion." },
  expired: { title: "This offer has ended.", description: "Browse our courses, or follow us for the next promotion." },
  "used-up": { title: "This offer has been fully claimed.", description: "Browse our courses, or follow us for the next promotion." },
};

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const offer = await offerPreview((await params).code);
  return buildMetadata({ title: offer.valid ? `${headline(offer)} | Offer ${offer.code}` : "Offer", description: offer.valid ? offer.name : undefined, path: `/offer/${offer.code}`, noindex: true });
}

export default async function OfferPage({ params }: { params: Promise<{ code: string }> }) {
  const [offer, session] = await Promise.all([params.then((p) => offerPreview(p.code)), getSession()]);

  if (!offer.valid) {
    const ended = ENDED[offer.reason];
    return (
      <PageHero eyebrow="Offer" title={ended.title} description={ended.description} crumbs={[{ label: "Home", href: "/" }, { label: "Offer" }]}>
        <div className="mt-4"><Button asChild><Link href="/courses">Browse courses</Link></Button></div>
      </PageHero>
    );
  }

  return (
    <>
      <PageHero eyebrow="Special offer" title={headline(offer)} description={offer.name} crumbs={[{ label: "Home", href: "/" }, { label: "Offer" }]}>
        <div className="mt-4 flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-accent px-4 py-2 text-xl font-semibold tracking-wider">
              <Ticket className="size-5 text-accent" aria-hidden /> {offer.code}
            </span>
            <span className="text-body-sm text-fg-muted">{offer.validTo ? `Valid until ${formatDate(offer.validTo)}` : "Limited-time offer"}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {session ? (
              <Button asChild><Link href="/courses">Choose a course</Link></Button>
            ) : (
              <>
                <Button asChild><Link href="/sign-up?next=%2Fcourses">Create your free account</Link></Button>
                <Button asChild variant="secondary"><Link href="/courses">Browse courses</Link></Button>
              </>
            )}
          </div>
        </div>
      </PageHero>
      <div className="container-x flex max-w-2xl flex-col gap-6 py-12">
        {offer.courses.length > 1 ? (
          <section>
            <h2 className="mb-3 font-semibold">Courses in this offer</h2>
            <ul className="flex flex-col gap-2 text-body-sm">
              {offer.courses.map((c) => <li key={c.slug}><Link href={`/courses/${c.slug}`} className="text-accent hover:underline">{c.title}</Link></li>)}
            </ul>
          </section>
        ) : null}
        <section className="text-body-sm text-fg-muted">
          <h2 className="mb-3 font-semibold text-fg">How to claim it</h2>
          <ol className="flex list-decimal flex-col gap-2 ps-5">
            <li>{session ? "Pick a course" : "Create your account (or sign in), then pick a course"} and press <strong>Enrol</strong> on this device. The code is applied to your invoice automatically.</li>
            <li>Enrolling in the Globify Tech app or on another device? Open your invoice on the website, choose <strong>Have a discount code?</strong> and enter <strong>{offer.code}</strong>.</li>
          </ol>
        </section>
      </div>
    </>
  );
}
