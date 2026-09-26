import "server-only";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { storage } from "@/server/providers/storage";
import { AppError } from "@/server/errors";
import type { MediaKind } from "@prisma/client";

const LIMITS_MB = { image: 10, video: 2048, document: 25, any: 25 } as const;

const ALLOWED: Record<keyof typeof LIMITS_MB, Array<{ mime: RegExp; ext: string[] }>> = {
  image: [{ mime: /^image\/(png|jpe?g|webp|gif|avif|svg\+xml)$/, ext: [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"] }],
  video: [{ mime: /^video\/(mp4|webm|quicktime|x-matroska)$/, ext: [".mp4", ".webm", ".mov", ".mkv"] }],
  document: [
    { mime: /^application\/pdf$/, ext: [".pdf"] },
    { mime: /^application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/, ext: [".doc", ".docx"] },
    { mime: /^application\/(zip|x-zip-compressed)$/, ext: [".zip"] },
    { mime: /^text\/(plain|csv|markdown)$/, ext: [".txt", ".csv", ".md"] },
    { mime: /^audio\/(mpeg|wav|ogg|mp4)$/, ext: [".mp3", ".wav", ".ogg", ".m4a"] },
  ],
  any: [],
};
ALLOWED.any = [...ALLOWED.image, ...ALLOWED.video, ...ALLOWED.document];

export const presignSchema = z.object({
  fileName: z.string().min(1).max(200),
  mime: z.string().min(3).max(120),
  size: z.number().int().positive(),
  kind: z.enum(["image", "video", "document", "any"]).default("any"),
  folder: z.string().max(60).regex(/^[a-z0-9\-/]*$/).optional(),
});
export type PresignInput = z.infer<typeof presignSchema>;

function kindFromMime(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime === "application/pdf" || mime.includes("word") || mime.startsWith("text/")) return "DOCUMENT";
  return "OTHER";
}

function safeName(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base = path
    .basename(name, ext)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "file"}${ext}`;
}

export function validateUpload(input: PresignInput) {
  const ext = path.extname(input.fileName).toLowerCase();
  const rules = ALLOWED[input.kind];
  const allowed = rules.some((r) => r.mime.test(input.mime) && r.ext.includes(ext));
  if (!allowed) throw AppError.validation(`That file type isn't supported here (${input.mime || ext}).`);
  const limit = LIMITS_MB[input.kind] * 1024 * 1024;
  if (input.size > limit) throw AppError.validation(`Files must be smaller than ${LIMITS_MB[input.kind]} MB.`);
}

/** Creates a pending Media record and returns a presigned upload target. */
export async function presignUpload(input: PresignInput, uploadedById: string) {
  validateUpload(input);
  const name = safeName(input.fileName);
  const folder = input.folder?.replace(/^\/+|\/+$/g, "") || "uploads";
  // Students' task uploads for Hermes are private until the institute approves them (brief §18).
  const isPublic = !(folder === "student-content" || folder.startsWith("student-content/"));
  const key = `${folder}/${new Date().getFullYear()}/${randomUUID()}-${name}`;
  const signed = await storage().getSignedUploadUrl(key, input.mime, input.size);
  const media = await prisma.media.create({
    data: {
      key,
      url: signed.publicUrl,
      kind: kindFromMime(input.mime),
      mime: input.mime,
      size: input.size,
      fileName: input.fileName,
      uploadedById,
      isPublic,
      metadata: { pending: true },
    },
  });
  return { mediaId: media.id, uploadUrl: signed.uploadUrl, method: signed.method, headers: signed.headers, publicUrl: signed.publicUrl, key };
}

export async function completeUpload(mediaId: string, uploadedById: string, meta?: { width?: number; height?: number; durationSeconds?: number; alt?: string }) {
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) throw AppError.notFound("Upload");
  if (media.uploadedById !== uploadedById) throw AppError.forbidden();
  return prisma.media.update({
    where: { id: mediaId },
    data: { metadata: { pending: false }, width: meta?.width, height: meta?.height, durationSeconds: meta?.durationSeconds, alt: meta?.alt },
  });
}

/** Server-side upload (PDFs, generated artwork). */
export async function storeGeneratedFile(params: { key: string; body: Buffer; mime: string; fileName: string; uploadedById?: string | null; isPublic?: boolean }) {
  const { url } = await storage().putObject(params.key, params.body, params.mime);
  return prisma.media.upsert({
    where: { key: params.key },
    update: { url, size: params.body.byteLength, mime: params.mime, fileName: params.fileName },
    create: {
      key: params.key,
      url,
      kind: kindFromMime(params.mime),
      mime: params.mime,
      size: params.body.byteLength,
      fileName: params.fileName,
      uploadedById: params.uploadedById ?? null,
      isPublic: params.isPublic ?? true,
    },
  });
}

export async function deleteMedia(mediaId: string) {
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) return;
  await storage().deleteObject(media.key).catch(() => undefined);
  await prisma.media.update({ where: { id: mediaId }, data: { deletedAt: new Date() } });
}

export async function listMedia(params: { q?: string; kind?: MediaKind; folderId?: string | null; page?: number; pageSize?: number }) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 40;
  const where = {
    deletedAt: null,
    ...(params.kind ? { kind: params.kind } : {}),
    ...(params.folderId !== undefined ? { folderId: params.folderId } : {}),
    ...(params.q ? { OR: [{ fileName: { contains: params.q, mode: "insensitive" as const } }, { alt: { contains: params.q, mode: "insensitive" as const } }, { tags: { has: params.q } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.media.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { folder: true, uploadedBy: { select: { name: true } } } }),
    prisma.media.count({ where }),
  ]);
  return { items, total, page, pageSize };
}
