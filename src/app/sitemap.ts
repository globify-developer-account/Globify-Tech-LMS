import type { MetadataRoute } from "next";
import { prisma } from "@/server/db/prisma";
import { absoluteUrl } from "@/lib/utils";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = ["/", "/about", "/courses", "/programs", "/learning-paths", "/instructors", "/events", "/success-stories", "/blog", "/admissions", "/apply", "/contact", "/careers", "/certificates", "/verify", "/delete-account"];
  const [courses, programs, paths, instructors, posts, pages, events, stories] = await Promise.all([
    prisma.course.findMany({ where: { status: "PUBLISHED", deletedAt: null, noindex: false }, select: { slug: true, updatedAt: true } }),
    prisma.program.findMany({ where: { status: "PUBLISHED", deletedAt: null }, select: { slug: true, updatedAt: true } }),
    prisma.learningPath.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    prisma.instructorProfile.findMany({ where: { isPublic: true }, select: { slug: true, updatedAt: true } }),
    prisma.blogPost.findMany({ where: { status: "PUBLISHED", deletedAt: null, noindex: false }, select: { slug: true, updatedAt: true } }),
    prisma.page.findMany({ where: { status: "PUBLISHED", deletedAt: null, noindex: false, NOT: { slug: "home" } }, select: { slug: true, updatedAt: true } }),
    prisma.event.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    prisma.successStory.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
  ]).catch(() => [[], [], [], [], [], [], [], []] as const);

  return [
    ...staticPaths.map((p) => ({ url: absoluteUrl(p), lastModified: new Date(), changeFrequency: "weekly" as const, priority: p === "/" ? 1 : 0.7 })),
    ...courses.map((c) => ({ url: absoluteUrl(`/courses/${c.slug}`), lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.9 })),
    ...programs.map((p) => ({ url: absoluteUrl(`/programs/${p.slug}`), lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...paths.map((p) => ({ url: absoluteUrl(`/learning-paths/${p.slug}`), lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...instructors.map((i) => ({ url: absoluteUrl(`/instructors/${i.slug}`), lastModified: i.updatedAt, changeFrequency: "monthly" as const, priority: 0.5 })),
    ...posts.map((p) => ({ url: absoluteUrl(`/blog/${p.slug}`), lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...pages.map((p) => ({ url: absoluteUrl(`/${p.slug}`), lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.5 })),
    ...events.map((e) => ({ url: absoluteUrl(`/events/${e.slug}`), lastModified: e.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...stories.map((s) => ({ url: absoluteUrl(`/success-stories/${s.slug}`), lastModified: s.updatedAt, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
