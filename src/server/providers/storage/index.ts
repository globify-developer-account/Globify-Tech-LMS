import "server-only";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/config/env";
import { absoluteUrl } from "@/lib/utils";

export interface PresignedUpload {
  uploadUrl: string;
  method: "PUT";
  headers?: Record<string, string>;
  publicUrl: string;
  expiresInSeconds: number;
}

export interface StorageProvider {
  readonly name: string;
  getSignedUploadUrl(key: string, mime: string, size: number): Promise<PresignedUpload>;
  getSignedReadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  putObject(key: string, body: Buffer | Uint8Array, mime: string): Promise<{ url: string }>;
  deleteObject(key: string): Promise<void>;
  publicUrl(key: string): string;
}

const LOCAL_ROOT = path.join(process.cwd(), ".storage");

function localSignature(key: string, expires: number): string {
  return createHmac("sha256", env().AUTH_SECRET).update(`${key}:${expires}`).digest("hex");
}

/** A different message from the upload signature, so a read link can never be used to overwrite the file. */
function localReadSignature(key: string, expires: number): string {
  return createHmac("sha256", env().AUTH_SECRET).update(`read:${key}:${expires}`).digest("hex");
}

/** Dev driver: files live in ./.storage and are served by /api/storage/[...key]. */
class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  publicUrl(key: string) {
    return absoluteUrl(`/api/storage/${key}`);
  }
  async getSignedUploadUrl(key: string): Promise<PresignedUpload> {
    const expires = Date.now() + 15 * 60 * 1000;
    const sig = localSignature(key, expires);
    return {
      uploadUrl: absoluteUrl(`/api/storage/${key}?expires=${expires}&sig=${sig}`),
      method: "PUT",
      publicUrl: this.publicUrl(key),
      expiresInSeconds: 900,
    };
  }
  async getSignedReadUrl(key: string, expiresInSeconds = 3600) {
    const expires = Date.now() + expiresInSeconds * 1000;
    return absoluteUrl(`/api/storage/${key}?expires=${expires}&rsig=${localReadSignature(key, expires)}`);
  }
  async putObject(key: string, body: Buffer | Uint8Array) {
    const file = path.join(LOCAL_ROOT, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return { url: this.publicUrl(key) };
  }
  async deleteObject(key: string) {
    await unlink(path.join(LOCAL_ROOT, key)).catch(() => undefined);
  }
  /** Used by the local PUT/GET route handler. */
  static verify(key: string, expires: string | null, sig: string | null): boolean {
    if (!expires || !sig) return false;
    if (Number(expires) < Date.now()) return false;
    return localSignature(key, Number(expires)) === sig;
  }
  /** Used by the local GET route for private files. */
  static verifyRead(key: string, expires: string | null, sig: string | null): boolean {
    if (!expires || !sig || !/^[0-9a-f]{64}$/.test(sig)) return false;
    if (Number(expires) < Date.now()) return false;
    const expected = Buffer.from(localReadSignature(key, Number(expires)), "hex");
    return timingSafeEqual(expected, Buffer.from(sig, "hex"));
  }
  static async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(path.join(LOCAL_ROOT, key));
    } catch {
      return null;
    }
  }
  static root() {
    return LOCAL_ROOT;
  }
}

/**
 * The S3 client for AWS or an S3-compatible store (Cloudflare R2).
 *
 * Checksums only when a request needs one: since @aws-sdk 3.729 the default
 * adds a CRC32 of the (empty) body to presigned PUT links, so a browser that
 * then uploads the real file is rejected by R2 (and by AWS) as a checksum
 * mismatch — every upload failed. Cloudflare's R2 docs recommend this setting.
 */
export function s3Client(config: { region: string; endpoint?: string; accessKeyId: string; secretAccessKey: string }): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: !!config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private client: S3Client;
  private bucket: string;
  constructor() {
    const e = env();
    if (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) throw new Error("S3 storage is not configured");
    this.bucket = e.S3_BUCKET;
    this.client = s3Client({ region: e.S3_REGION, endpoint: e.S3_ENDPOINT, accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY });
  }
  publicUrl(key: string) {
    const base = env().S3_PUBLIC_URL;
    if (base) return `${base.replace(/\/$/, "")}/${key}`;
    const endpoint = env().S3_ENDPOINT;
    return endpoint ? `${endpoint.replace(/\/$/, "")}/${this.bucket}/${key}` : `https://${this.bucket}.s3.${env().S3_REGION}.amazonaws.com/${key}`;
  }
  async getSignedUploadUrl(key: string, mime: string, size: number): Promise<PresignedUpload> {
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mime, ContentLength: size });
    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn: 900 });
    return { uploadUrl, method: "PUT", publicUrl: this.publicUrl(key), expiresInSeconds: 900 };
  }
  async getSignedReadUrl(key: string, expiresInSeconds = 3600) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }
  async putObject(key: string, body: Buffer | Uint8Array, mime: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mime }));
    return { url: this.publicUrl(key) };
  }
  async deleteObject(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let provider: StorageProvider | undefined;
export function storage(): StorageProvider {
  if (provider) return provider;
  provider = env().STORAGE_DRIVER === "s3" ? new S3StorageProvider() : new LocalStorageProvider();
  return provider;
}

export { LocalStorageProvider };
