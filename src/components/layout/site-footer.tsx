import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { site } from "@/config/site";

// Install referrer, so footer installs show up as their own campaign in Play Console.
const PLAY_FOOTER_URL = `${site.apps.android}&referrer=${encodeURIComponent("utm_source=globifytech.com&utm_medium=website&utm_campaign=footer")}`;

export interface FooterColumn {
  id: string;
  label: string;
  items: Array<{ id: string; label: string; href: string }>;
}

export function SiteFooter({ columns, labels }: { columns: FooterColumn[]; labels: { tagline: string; rights: string; campus: string; privacy: string; terms: string } }) {
  return (
    <footer className="border-t border-border bg-bg-subtle">
      <div className="container-x grid gap-12 py-16 md:grid-cols-12">
        <div className="flex flex-col gap-4 md:col-span-4">
          <Logo />
          <p className="max-w-xs text-body-sm text-fg-muted">{labels.tagline}</p>
          <div className="flex flex-col gap-1 text-body-sm text-fg-muted">
            <p className="text-label text-fg-subtle">{labels.campus}</p>
            <p>{site.contact.address}</p>
            <a href={`tel:${site.contact.admissionsPhone.replace(/\s/g, "")}`} className="hover:text-fg">
              {site.contact.admissionsPhone}
            </a>
            <a href={`mailto:${site.contact.email}`} className="hover:text-fg">
              {site.contact.email}
            </a>
            <p className="text-caption text-fg-subtle">{site.contact.hours}</p>
          </div>
          {/* Google's official badge, unmodified as its brand guidelines require; the artwork has its own padding, hence -ms-2.
              unoptimized: a 5 KB static file, served as-is rather than through the image optimiser. */}
          <a href={PLAY_FOOTER_URL} target="_blank" rel="noopener" className="-ms-2 w-fit rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <Image src="/badges/google-play-badge.png" alt="Get it on Google Play" width={646} height={250} unoptimized className="h-14 w-auto" />
          </a>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-8 md:grid-cols-4">
          {columns.map((col) => (
            <div key={col.id} className="flex flex-col gap-3">
              <p className="text-label text-fg-subtle">{col.label}</p>
              <ul className="flex flex-col gap-2">
                {col.items.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="text-body-sm text-fg-muted transition-colors hover:text-fg">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container-x flex flex-col items-start justify-between gap-3 py-6 text-caption text-fg-subtle sm:flex-row sm:items-center">
          <p>{labels.rights}</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-fg">
              {labels.privacy}
            </Link>
            <Link href="/terms" className="hover:text-fg">
              {labels.terms}
            </Link>
            <Link href="/verify" className="hover:text-fg">
              Verify a certificate
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
