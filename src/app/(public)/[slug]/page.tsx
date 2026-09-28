import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPage } from "@/server/services/cms";
import { renderSections } from "@/components/marketing/section-renderer";
import { buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/json-ld";

export const revalidate = 300;

const RESERVED = new Set(["home", "courses", "programs", "learning-paths", "instructors", "events", "success-stories", "blog", "admissions", "apply", "contact", "careers", "certificates", "verify", "about", "sign-in", "sign-up", "delete-account"]);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublishedPage(slug);
  if (!page) return {};
  return buildMetadata({ title: page.seoTitle ?? page.title, description: page.seoDescription, path: `/${slug}`, image: page.ogImage?.url ?? null, noindex: page.noindex, canonical: page.canonicalUrl });
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (RESERVED.has(slug)) notFound();
  const page = await getPublishedPage(slug);
  if (!page) notFound();
  return (
    <>
      {page.schemaJson ? <JsonLd data={page.schemaJson as Record<string, unknown>} /> : null}
      {page.sections.length ? (
        renderSections(page.sections)
      ) : (
        <section className="container-x py-24">
          <h1 className="text-h1">{page.title}</h1>
        </section>
      )}
    </>
  );
}
