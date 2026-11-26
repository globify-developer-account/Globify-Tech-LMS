import "server-only";
import { unstable_cache, revalidatePath, revalidateTag } from "next/cache";
import { prisma, type Prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { sanitizeRichText, readingMinutes, stripHtml } from "@/lib/sanitize";
import { slugify } from "@/lib/utils";
import { sectionDataSchemas } from "@/lib/validation/cms";
import type { BlogPostInput, PageInput } from "@/lib/validation/cms";
import type { ContentStatus, PageSectionType } from "@prisma/client";

// ───────────── Pages & sections ─────────────

export const getPublishedPage = unstable_cache(
  async (slug: string) =>
    prisma.page.findFirst({
      where: { slug, status: "PUBLISHED", deletedAt: null },
      include: { sections: { where: { isVisible: true }, orderBy: { order: "asc" } }, ogImage: { select: { url: true } } },
    }),
  ["page"],
  { tags: ["pages"], revalidate: 300 },
);

export async function listPages(filters: { q?: string; status?: ContentStatus }) {
  return prisma.page.findMany({ where: { deletedAt: null, ...(filters.status ? { status: filters.status } : {}), ...(filters.q ? { OR: [{ title: { contains: filters.q } }, { slug: { contains: filters.q } }] } : {}) }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { sections: true } }, createdBy: { select: { name: true } } } });
}

export async function getPageForEditing(id: string) {
  const page = await prisma.page.findFirst({ where: { id, deletedAt: null }, include: { sections: { orderBy: { order: "asc" } }, ogImage: true } });
  if (!page) throw AppError.notFound("Page");
  return page;
}

export async function upsertPage(input: PageInput & { id?: string }, userId: string) {
  const data = { title: input.title, locale: input.locale, seoTitle: input.seoTitle || null, seoDescription: input.seoDescription || null, canonicalUrl: input.canonicalUrl || null, ogImageMediaId: input.ogImageMediaId ?? null, noindex: input.noindex, schemaJson: (input.schemaJson ?? undefined) as never };
  if (input.id) {
    const page = await prisma.page.update({ where: { id: input.id }, data: { ...data, ...(input.slug ? { slug: input.slug } : {}) } });
    revalidatePage(page.slug);
    return page;
  }
  let slug = input.slug ?? slugify(input.title);
  let i = 2;
  while (await prisma.page.findUnique({ where: { slug } })) slug = `${slugify(input.title)}-${i++}`;
  return prisma.page.create({ data: { ...data, slug, createdById: userId } });
}

export function validateSectionData(type: PageSectionType, data: unknown) {
  const schema = sectionDataSchemas[type];
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw AppError.validation("Section content is incomplete.", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), [i.message]])));
  const out = parsed.data as Record<string, unknown>;
  for (const key of ["body", "description"]) if (typeof out[key] === "string") out[key] = sanitizeRichText(out[key] as string);
  return out;
}

export async function upsertSection(input: { id?: string; pageId: string; type: PageSectionType; name?: string; data: unknown; isVisible: boolean; order?: number }) {
  const data = validateSectionData(input.type, input.data);
  if (input.id) {
    const s = await prisma.pageSection.update({ where: { id: input.id }, data: { type: input.type, name: input.name || null, data: data as never, isVisible: input.isVisible } });
    await revalidatePageById(input.pageId);
    return s;
  }
  const count = await prisma.pageSection.count({ where: { pageId: input.pageId } });
  const s = await prisma.pageSection.create({ data: { pageId: input.pageId, type: input.type, name: input.name || null, data: data as never, isVisible: input.isVisible, order: input.order ?? count } });
  await revalidatePageById(input.pageId);
  return s;
}

export async function duplicateSection(id: string) {
  const s = await prisma.pageSection.findUnique({ where: { id } });
  if (!s) throw AppError.notFound("Section");
  await prisma.pageSection.updateMany({ where: { pageId: s.pageId, order: { gt: s.order } }, data: { order: { increment: 1 } } });
  const copy = await prisma.pageSection.create({ data: { pageId: s.pageId, type: s.type, name: s.name ? `${s.name} (copy)` : null, data: s.data as never, isVisible: s.isVisible, order: s.order + 1 } });
  await revalidatePageById(s.pageId);
  return copy;
}

export async function deleteSection(id: string) {
  const s = await prisma.pageSection.delete({ where: { id } });
  await revalidatePageById(s.pageId);
}

export async function reorderSections(pageId: string, ids: string[]) {
  await prisma.$transaction(ids.map((id, order) => prisma.pageSection.update({ where: { id, pageId }, data: { order } })));
  await revalidatePageById(pageId);
}

export async function setPageStatus(id: string, action: "publish" | "unpublish" | "schedule" | "archive", scheduledAt?: Date | null) {
  const page = await prisma.page.findUnique({ where: { id } });
  if (!page) throw AppError.notFound("Page");
  const data: Prisma.PageUpdateInput =
    action === "publish" ? { status: "PUBLISHED", publishedAt: page.publishedAt ?? new Date(), scheduledAt: null }
    : action === "unpublish" ? { status: "DRAFT" }
    : action === "archive" ? { status: "ARCHIVED" }
    : { status: "SCHEDULED", scheduledAt: scheduledAt ?? null };
  const updated = await prisma.page.update({ where: { id }, data });
  revalidatePage(updated.slug);
  return updated;
}

/** Job: publish scheduled pages and posts whose time has come. */
export async function publishScheduledContent() {
  const now = new Date();
  const [pages, posts] = await Promise.all([
    prisma.page.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now } } }),
    prisma.blogPost.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now } } }),
  ]);
  for (const p of pages) {
    await prisma.page.update({ where: { id: p.id }, data: { status: "PUBLISHED", publishedAt: now } });
    revalidatePage(p.slug);
  }
  for (const p of posts) {
    await prisma.blogPost.update({ where: { id: p.id }, data: { status: "PUBLISHED", publishedAt: now } });
    revalidateBlog(p.slug);
  }
  return pages.length + posts.length;
}

async function revalidatePageById(pageId: string) {
  const p = await prisma.page.findUnique({ where: { id: pageId }, select: { slug: true } });
  if (p) revalidatePage(p.slug);
}

export function revalidatePage(slug: string) {
  revalidateTag("pages", "max");
  revalidatePath(slug === "home" ? "/" : `/${slug}`);
}

// ───────────── Navigation ─────────────

export const getNavigation = unstable_cache(
  async (key: string) => {
    const nav = await prisma.navigation.findUnique({ where: { key }, include: { items: { where: { isVisible: true }, orderBy: { order: "asc" } } } });
    if (!nav) return [];
    const byParent = new Map<string | null, typeof nav.items>();
    for (const item of nav.items) {
      const list = byParent.get(item.parentId) ?? [];
      list.push(item);
      byParent.set(item.parentId, list);
    }
    return (byParent.get(null) ?? []).map((item) => ({ id: item.id, label: item.label, href: item.href, description: item.description, children: (byParent.get(item.id) ?? []).map((c) => ({ id: c.id, label: c.label, href: c.href, description: c.description })) }));
  },
  ["navigation"],
  { tags: ["navigation"], revalidate: 600 },
);

export async function upsertNavigationItem(input: { id?: string; navigationId: string; parentId?: string | null; label: string; href: string; description?: string; openInNewTab: boolean; isVisible: boolean; order?: number }) {
  const data = { navigationId: input.navigationId, parentId: input.parentId ?? null, label: input.label, href: input.href, description: input.description || null, openInNewTab: input.openInNewTab, isVisible: input.isVisible };
  const item = input.id ? await prisma.navigationItem.update({ where: { id: input.id }, data }) : await prisma.navigationItem.create({ data: { ...data, order: input.order ?? (await prisma.navigationItem.count({ where: { navigationId: input.navigationId, parentId: input.parentId ?? null } })) } });
  revalidateTag("navigation", "max");
  revalidatePath("/", "layout");
  return item;
}

export async function deleteNavigationItem(id: string) {
  await prisma.navigationItem.delete({ where: { id } });
  revalidateTag("navigation", "max");
  revalidatePath("/", "layout");
}

export async function reorderNavigation(ids: string[]) {
  await prisma.$transaction(ids.map((id, order) => prisma.navigationItem.update({ where: { id }, data: { order } })));
  revalidateTag("navigation", "max");
  revalidatePath("/", "layout");
}

// ───────────── Blog ─────────────

export const BLOG_CARD_SELECT = { id: true, slug: true, title: true, excerpt: true, publishedAt: true, readingMinutes: true, featured: { select: { url: true, alt: true } }, category: { select: { slug: true, name: true } }, author: { select: { name: true, avatar: { select: { url: true } } } } } satisfies Prisma.BlogPostSelect;

export async function listPublishedPosts(params: { page?: number; pageSize?: number; category?: string; tag?: string; q?: string }) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 9;
  const where: Prisma.BlogPostWhereInput = { status: "PUBLISHED", deletedAt: null, ...(params.category ? { category: { slug: params.category } } : {}), ...(params.tag ? { tags: { some: { tag: { slug: params.tag } } } } : {}), ...(params.q ? { OR: [{ title: { contains: params.q } }, { excerpt: { contains: params.q } }] } : {}) };
  const [items, total] = await Promise.all([prisma.blogPost.findMany({ where, orderBy: { publishedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: BLOG_CARD_SELECT }), prisma.blogPost.count({ where })]);
  return { items, total, page, pageSize };
}

export const getRecentPosts = unstable_cache(async (limit = 3) => prisma.blogPost.findMany({ where: { status: "PUBLISHED", deletedAt: null }, orderBy: { publishedAt: "desc" }, take: limit, select: BLOG_CARD_SELECT }), ["recent-posts"], { tags: ["blog"], revalidate: 300 });

export async function getPublishedPost(slug: string) {
  return prisma.blogPost.findFirst({ where: { slug, status: "PUBLISHED", deletedAt: null }, include: { featured: true, ogImage: true, category: true, tags: { include: { tag: true } }, author: { select: { name: true, avatar: { select: { url: true } }, instructorProfile: { select: { slug: true, title: true } } } } } });
}

export async function listPostsForStaff(filters: { q?: string; status?: ContentStatus; page?: number; pageSize?: number }) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const where: Prisma.BlogPostWhereInput = { deletedAt: null, ...(filters.status ? { status: filters.status } : {}), ...(filters.q ? { title: { contains: filters.q } } : {}) };
  const [items, total] = await Promise.all([prisma.blogPost.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { author: { select: { name: true } }, category: true } }), prisma.blogPost.count({ where })]);
  return { items, total, page, pageSize };
}

export async function getPostForEditing(id: string) {
  const post = await prisma.blogPost.findFirst({ where: { id, deletedAt: null }, include: { tags: { include: { tag: true } }, featured: true, category: true } });
  if (!post) throw AppError.notFound("Post");
  return post;
}

export async function upsertPost(input: BlogPostInput & { id?: string }, authorId: string) {
  const content = input.content ? sanitizeRichText(input.content) : null;
  const status = input.status === "PUBLISHED" || input.status === "SCHEDULED" ? input.status : input.status;
  const base = { title: input.title, excerpt: input.excerpt || (content ? stripHtml(content).slice(0, 200) : null), content, categoryId: input.categoryId ?? null, featuredMediaId: input.featuredMediaId ?? null, status, scheduledAt: input.status === "SCHEDULED" ? (input.scheduledAt ?? null) : null, readingMinutes: readingMinutes(content), seoTitle: input.seoTitle || null, seoDescription: input.seoDescription || null, canonicalUrl: input.canonicalUrl || null, ogImageMediaId: input.ogImageMediaId ?? null, noindex: input.noindex };
  const tagIds = await Promise.all(input.tagNames.map(async (name) => (await prisma.blogTag.upsert({ where: { slug: slugify(name) }, update: {}, create: { slug: slugify(name), name } })).id));
  const post = await prisma.$transaction(async (tx) => {
    let p;
    if (input.id) {
      const existing = await tx.blogPost.findUniqueOrThrow({ where: { id: input.id } });
      p = await tx.blogPost.update({ where: { id: input.id }, data: { ...base, ...(input.slug ? { slug: input.slug } : {}), publishedAt: status === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : existing.publishedAt } });
      await tx.blogPostTag.deleteMany({ where: { postId: p.id } });
    } else {
      let slug = input.slug ?? slugify(input.title);
      let i = 2;
      while (await tx.blogPost.findUnique({ where: { slug } })) slug = `${slugify(input.title)}-${i++}`;
      p = await tx.blogPost.create({ data: { ...base, slug, authorId, publishedAt: status === "PUBLISHED" ? new Date() : null } });
    }
    if (tagIds.length) await tx.blogPostTag.createMany({ data: tagIds.map((tagId) => ({ postId: p.id, tagId })) });
    return p;
  });
  revalidateBlog(post.slug);
  return post;
}

export async function softDeletePost(id: string) {
  const p = await prisma.blogPost.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
  revalidateBlog(p.slug);
}

export function revalidateBlog(slug?: string) {
  revalidateTag("blog", "max");
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
}

// ───────────── Marketing content ─────────────

export const getFeaturedTestimonials = unstable_cache(async (limit = 6, featuredOnly = true) => prisma.testimonial.findMany({ where: { isApproved: true, ...(featuredOnly ? { isFeatured: true } : {}) }, orderBy: [{ order: "asc" }, { createdAt: "desc" }], take: limit, include: { avatar: { select: { url: true } } } }), ["testimonials"], { tags: ["content"], revalidate: 600 });

export const getFaqs = unstable_cache(async (group = "general", limit = 10) => prisma.faq.findMany({ where: { isVisible: true, group }, orderBy: { order: "asc" }, take: limit }), ["faqs"], { tags: ["content"], revalidate: 600 });

export const getUpcomingEvents = unstable_cache(async (limit = 3) => prisma.event.findMany({ where: { status: "PUBLISHED", startsAt: { gte: new Date(Date.now() - 86400000) } }, orderBy: { startsAt: "asc" }, take: limit, include: { cover: { select: { url: true, alt: true } }, campus: { select: { name: true, city: true } }, _count: { select: { registrations: true } } } }), ["events"], { tags: ["content"], revalidate: 300 });

export const getFeaturedStories = unstable_cache(async (limit = 3) => prisma.successStory.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }], take: limit, include: { cover: { select: { url: true, alt: true } } } }), ["stories"], { tags: ["content"], revalidate: 600 });

export const getPublicInstructors = unstable_cache(async (limit = 8, featuredOnly = false) => prisma.instructorProfile.findMany({ where: { isPublic: true, ...(featuredOnly ? { isFeatured: true } : {}) }, orderBy: [{ isFeatured: "desc" }, { createdAt: "asc" }], take: limit, include: { user: { select: { name: true, avatar: { select: { url: true } } } }, courses: { include: { course: { select: { slug: true, title: true, status: true } } } } } }), ["instructors"], { tags: ["content", "courses"], revalidate: 600 });

export const getPublishedPrograms = unstable_cache(async (limit = 6) => prisma.program.findMany({ where: { status: "PUBLISHED", deletedAt: null }, orderBy: [{ featured: "desc" }, { publishedAt: "desc" }], take: limit, include: { artwork: { select: { url: true } }, courses: { orderBy: { order: "asc" }, include: { course: { select: { slug: true, title: true, category: { select: { artworkKey: true } } } } } } } }), ["programs"], { tags: ["courses"], revalidate: 600 });

export const getPublishedPaths = unstable_cache(async (limit = 6) => prisma.learningPath.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ featured: "desc" }, { createdAt: "asc" }], take: limit, include: { steps: { orderBy: { order: "asc" }, include: { course: { select: { slug: true, title: true } } } } } }), ["paths"], { tags: ["courses"], revalidate: 600 });

export function revalidateContent() {
  revalidateTag("content", "max");
  revalidatePath("/");
}

export async function registerForEvent(input: { eventId: string; name: string; email: string; phone?: string; userId?: string | null }) {
  const event = await prisma.event.findUnique({ where: { id: input.eventId }, include: { _count: { select: { registrations: true } } } });
  if (!event || event.status !== "PUBLISHED") throw AppError.notFound("Event");
  if (event.capacity && event._count.registrations >= event.capacity) throw AppError.conflict("This event is full.");
  return prisma.eventRegistration.upsert({ where: { eventId_email: { eventId: event.id, email: input.email.toLowerCase() } }, update: { name: input.name, phone: input.phone || null, userId: input.userId ?? undefined }, create: { eventId: event.id, name: input.name, email: input.email.toLowerCase(), phone: input.phone || null, userId: input.userId ?? null } });
}
