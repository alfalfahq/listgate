// Listing photos and floorplans, copied from the CRM into Listgate's own storage (DigitalOcean Spaces + CDN).
// Each image is downloaded once, checked, and stored in three sizes as JPEG:
//   <CDN>/media/<hash>/thumb.jpg (400px) · medium.jpg (1200px) · full.jpg (2400px, never upscaled)
// Partners get these URLs (and the CRM's original as originalUrl). New listings wait briefly so the first push
// already carries Listgate URLs; if copying takes longer, the listing is pushed again (new version) when it's done.
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "./index";
import { enqueue } from "./outbox";
import { listings, mediaAssets, type Media } from "./schema";

type Listing = typeof listings.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export const SIZES = { thumb: 400, medium: 1200, full: 2400 } as const;

/** Where files go. Real: Spaces via the S3 API. Tests: an in-memory map. */
export type MediaStore = { put(key: string, body: Buffer, contentType: string): Promise<void>; publicUrl(key: string): string };

export function mediaConfig() {
  const key = process.env.SPACES_KEY;
  const secret = process.env.SPACES_SECRET;
  if (!key || !secret) return null;
  const region = process.env.SPACES_REGION || "syd1";
  const bucket = process.env.SPACES_BUCKET || "listgate-media";
  return { key, secret, region, bucket, cdn: (process.env.SPACES_CDN_URL || `https://${bucket}.${region}.cdn.digitaloceanspaces.com`).replace(/\/$/, "") };
}

let store: MediaStore | null | undefined;
/** The Spaces store, or null when SPACES_KEY/SPACES_SECRET aren't set (copying is then off and CRM links are used). */
export async function spacesStore(): Promise<MediaStore | null> {
  if (store !== undefined) return store;
  const c = mediaConfig();
  if (!c) return (store = null);
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({ region: "us-east-1", endpoint: `https://${c.region}.digitaloceanspaces.com`, credentials: { accessKeyId: c.key, secretAccessKey: c.secret } });
  store = {
    async put(key, body, contentType) {
      await s3.send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: body, ContentType: contentType, ACL: "public-read", CacheControl: "public, max-age=31536000, immutable" }));
    },
    publicUrl: (key) => `${c.cdn}/${key}`,
  };
  return store;
}
/** How to turn a stored key into a public URL, without starting an S3 client. Null when copying is off. */
export function mediaPublicUrl(): ((key: string) => string) | null {
  if (store) return store.publicUrl;
  const c = mediaConfig();
  return c ? (key) => `${c.cdn}/${key}` : null;
}

/** Tracks every listing's images; returns the ids of listings that still have some to copy (when copying is on). */
export async function listingsAwaitingMedia(db: Db, rows: Pick<Listing, "id" | "images" | "floorplans">[]) {
  const out = new Set<string>();
  if (!mediaPublicUrl()) return out;
  await trackListingMedia(db, rows);
  const urls = [...new Set(rows.flatMap(listingUrls))];
  if (!urls.length) return out;
  const pending = new Set((await db.select({ u: mediaAssets.sourceUrl }).from(mediaAssets).where(and(inArray(mediaAssets.sourceUrl, urls), eq(mediaAssets.status, "pending")))).map((r) => r.u));
  for (const r of rows) if (listingUrls(r).some((u) => pending.has(u))) out.add(r.id);
  return out;
}

/** Tests swap in their own store. */
export function setMediaStore(s: MediaStore | null) {
  store = s;
}

const copyable = (m: Media) => /^https?:\/\//i.test(m.url) && (!m.kind || m.kind === "photo" || m.kind === "floorplan");
const listingUrls = (l: Pick<Listing, "images" | "floorplans">) => [...l.images, ...l.floorplans].filter(copyable).map((m) => m.url.slice(0, 2000));

/** Records the listing's images for copying. Returns how many aren't copied yet. */
export async function trackListingMedia(db: Db, rows: Pick<Listing, "images" | "floorplans">[]) {
  const urls = [...new Set(rows.flatMap(listingUrls))];
  if (!urls.length) return 0;
  for (let i = 0; i < urls.length; i += 500) await db.insert(mediaAssets).values(urls.slice(i, i + 500).map((sourceUrl) => ({ sourceUrl }))).onConflictDoNothing();
  const pending = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(and(inArray(mediaAssets.sourceUrl, urls), eq(mediaAssets.status, "pending")));
  return pending.length;
}

/** Stored copies for these URLs (only finished ones). */
export async function assetsFor(db: Db, l: Pick<Listing, "images" | "floorplans">) {
  const urls = listingUrls(l);
  if (!urls.length) return new Map<string, MediaAsset>();
  const rows = await db.select().from(mediaAssets).where(and(inArray(mediaAssets.sourceUrl, urls), eq(mediaAssets.status, "ok")));
  return new Map(rows.map((r) => [r.sourceUrl, r]));
}

/** What partners get for one image: Listgate's sizes when copied, the CRM link otherwise. */
export function mediaView(m: Media, a: MediaAsset | undefined, publicUrl: ((key: string) => string) | null) {
  if (!a || !a.contentHash || !publicUrl) return { url: m.url, thumb: null, medium: null, full: null, width: null, height: null, originalUrl: m.url, hosted: false };
  const k = (s: keyof typeof SIZES) => publicUrl(`media/${a.contentHash}/${s}.jpg`);
  return { url: k("full"), thumb: k("thumb"), medium: k("medium"), full: k("full"), width: a.width, height: a.height, originalUrl: m.url, hosted: true };
}

const backoff = (n: number) => Math.min(60_000 * 4 ** Math.max(0, n - 1), 24 * 3_600_000);
const MAX_BYTES = 40 * 1024 * 1024;

async function download(url: string) {
  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000), headers: { "user-agent": "Listgate/1.0 (+https://listgate.com.au)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const type = r.headers.get("content-type") || "";
  if (type && !/^image\//i.test(type) && !/octet-stream/i.test(type)) throw new Error(`Not an image (${type.slice(0, 40)})`);
  if (Number(r.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("Image too large");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("Image too large");
  if (buf.length < 100) throw new Error("Empty image");
  return buf;
}

/** One image: download, check, make sizes, store. */
async function copyOne(db: Db, a: MediaAsset, s: MediaStore) {
  const sharp = (await import("sharp")).default;
  try {
    const buf = await download(a.sourceUrl);
    const img = sharp(buf, { failOn: "error", limitInputPixels: 120_000_000 }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) throw new Error("Unreadable image");
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 40);
    for (const [name, px] of Object.entries(SIZES)) {
      const out = await sharp(buf, { limitInputPixels: 120_000_000 })
        .rotate()
        .resize({ width: px, height: px, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: name === "thumb" ? 76 : 82, mozjpeg: true, progressive: true })
        .toBuffer();
      await s.put(`media/${hash}/${name}.jpg`, out, "image/jpeg");
    }
    const portrait = (meta.orientation ?? 1) >= 5;
    await db
      .update(mediaAssets)
      .set({ status: "ok", contentHash: hash, width: portrait ? meta.height : meta.width, height: portrait ? meta.width : meta.height, bytes: buf.length, error: null, storedAt: new Date(), lockedUntil: null, attempts: a.attempts + 1 })
      .where(eq(mediaAssets.id, a.id));
    return true;
  } catch (e) {
    const attempts = a.attempts + 1;
    await db
      .update(mediaAssets)
      .set({ status: attempts >= 6 ? "failed" : "pending", attempts, error: (e instanceof Error ? e.message : String(e)).slice(0, 300), nextAttemptAt: new Date(Date.now() + backoff(attempts)), lockedUntil: null })
      .where(eq(mediaAssets.id, a.id));
    return false;
  }
}

/**
 * Copies due images (a few at a time), then re-pushes listings whose images are now all settled.
 * Safe to run on several instances: rows are claimed with SKIP LOCKED.
 */
export async function copyDueMedia(db: Db, limit = 12, s?: MediaStore | null) {
  const st = s === undefined ? await spacesStore() : s;
  if (!st) return { copied: 0, failed: 0, repushed: 0 };
  const now = new Date();
  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.status, "pending"), lte(mediaAssets.nextAttemptAt, now), or(isNull(mediaAssets.lockedUntil), lt(mediaAssets.lockedUntil, now))))
      .orderBy(mediaAssets.nextAttemptAt)
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length) await tx.update(mediaAssets).set({ lockedUntil: new Date(Date.now() + 5 * 60_000) }).where(inArray(mediaAssets.id, due.map((d) => d.id)));
    return due;
  });
  if (!claimed.length) return { copied: 0, failed: 0, repushed: 0 };
  let copied = 0;
  let failed = 0;
  // A few in parallel: downloads are the slow part.
  for (let i = 0; i < claimed.length; i += 4) {
    const r = await Promise.all(claimed.slice(i, i + 4).map((a) => copyOne(db, a, st)));
    for (const ok of r) ok ? copied++ : failed++;
  }
  const repushed = await repushSettled(db, claimed.map((a) => a.sourceUrl));
  return { copied, failed, repushed };
}

/** Listings using any of these URLs whose images are now all copied (or given up on): new version, pushed again. */
async function repushSettled(db: Db, urls: string[]) {
  const touched = new Map<string, Listing>();
  for (const u of urls) {
    const rows = await db
      .select()
      .from(listings)
      .where(or(sql`${listings.images} @> ${JSON.stringify([{ url: u }])}::jsonb`, sql`${listings.floorplans} @> ${JSON.stringify([{ url: u }])}::jsonb`));
    for (const r of rows) touched.set(r.id, r);
  }
  let n = 0;
  for (const l of touched.values()) {
    const all = listingUrls(l);
    const left = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(and(inArray(mediaAssets.sourceUrl, all), eq(mediaAssets.status, "pending")));
    if (left.length) continue;
    // New version so partners that skip same-or-older versions still take it; same content hash (nothing in the feed changed).
    const [bumped] = await db.update(listings).set({ version: sql`${listings.version} + 1`, updatedAt: new Date() }).where(eq(listings.id, l.id)).returning();
    n += await enqueue(db, l.agencyId, [bumped]);
  }
  return n;
}

/** Counts for admin. */
export async function mediaStats(db: Db) {
  const rows = await db.select({ status: mediaAssets.status, n: sql<number>`count(*)::int` }).from(mediaAssets).groupBy(mediaAssets.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<MediaAsset["status"], number>>;
}

/** CRM photo URL → Listgate thumbnail when copied (else the original), for screens that show small photos. */
export async function thumbsFor(db: Db, urls: (string | null | undefined)[]) {
  const list = [...new Set(urls.filter((u): u is string => !!u))];
  const out = new Map(list.map((u) => [u, u]));
  const pub = mediaPublicUrl();
  if (!pub || !list.length) return out;
  const rows = await db.select({ u: mediaAssets.sourceUrl, h: mediaAssets.contentHash }).from(mediaAssets).where(and(inArray(mediaAssets.sourceUrl, list), eq(mediaAssets.status, "ok")));
  for (const r of rows) if (r.h) out.set(r.u, pub(`media/${r.h}/medium.jpg`));
  return out;
}
