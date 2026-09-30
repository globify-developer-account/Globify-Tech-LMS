import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter, type FooterColumn } from "@/components/layout/site-footer";
import { getNavigation } from "@/server/services/cms";
import { getSession } from "@/server/auth/session";
import { homeForPrincipal } from "@/lib/rbac";
import { JsonLd } from "@/components/seo/json-ld";
import { organizationJsonLd } from "@/lib/seo";

const DEFAULT_HEADER = [
  { id: "courses", label: "Courses", href: "/courses", description: null },
  { id: "programs", label: "Programs", href: "/programs", description: null },
  { id: "paths", label: "Learning Paths", href: "/learning-paths", description: null },
  { id: "instructors", label: "Instructors", href: "/instructors", description: null },
  { id: "stories", label: "Success Stories", href: "/success-stories", description: null },
  { id: "blog", label: "Blog", href: "/blog", description: null },
  { id: "admissions", label: "Admissions", href: "/admissions", description: null },
];

const DEFAULT_FOOTER: FooterColumn[] = [
  { id: "learn", label: "Learn", items: [{ id: "c", label: "Courses", href: "/courses" }, { id: "p", label: "Programs", href: "/programs" }, { id: "lp", label: "Learning paths", href: "/learning-paths" }, { id: "ev", label: "Events", href: "/events" }, { id: "ws", label: "Saturday workshop", href: "/workshop" }] },
  { id: "company", label: "Company", items: [{ id: "a", label: "About", href: "/about" }, { id: "i", label: "Instructors", href: "/instructors" }, { id: "s", label: "Success stories", href: "/success-stories" }, { id: "b", label: "Blog", href: "/blog" }, { id: "ca", label: "Careers", href: "/careers" }] },
  { id: "admissions", label: "Admissions", items: [{ id: "ad", label: "How admissions work", href: "/admissions" }, { id: "ap", label: "Apply online", href: "/apply" }, { id: "ct", label: "Contact", href: "/contact" }, { id: "ce", label: "Certificates", href: "/certificates" }] },
  { id: "students", label: "Students", items: [{ id: "si", label: "Sign in", href: "/sign-in" }, { id: "su", label: "Create account", href: "/sign-up" }, { id: "v", label: "Verify a certificate", href: "/verify" }] },
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [t, tf, headerNav, footerNav, session] = await Promise.all([getTranslations("nav"), getTranslations("footer"), getNavigation("header"), getNavigation("footer"), getSession()]);
  const header = headerNav.length ? headerNav : DEFAULT_HEADER;
  const footer: FooterColumn[] = footerNav.length ? footerNav.map((col) => ({ id: col.id, label: col.label, items: col.children.map((c) => ({ id: c.id, label: c.label, href: c.href })) })) : DEFAULT_FOOTER;
  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md">
        {t("skipToContent")}
      </a>
      <SiteHeader
        items={header}
        user={session ? { name: session.name, image: session.image, home: homeForPrincipal(session) } : null}
        labels={{ signIn: t("signIn"), signUp: t("signUp"), dashboard: t("dashboard"), openMenu: t("openMenu"), apply: t("apply") }}
      />
      <main id="content" className="flex-1">
        {children}
      </main>
      <SiteFooter columns={footer} labels={{ tagline: tf("tagline"), rights: tf("rights", { year: new Date().getFullYear() }), campus: tf("campus"), privacy: tf("privacy"), terms: tf("terms") }} />
    </>
  );
}
