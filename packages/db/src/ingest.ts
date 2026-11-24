// Stores a REAXML file for an agency and queues partner pushes for whatever changed.
// Used by the HTTP feed endpoint, the FTP receiver and admin uploads.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./index";
import { enqueue } from "./outbox";
import { contentHash, parseReaxml, type ParsedListing } from "./reaxml";
import { agencies, agents, feedRuns, listings, type FeedVia } from "./schema";

export type IngestResult = { received: number; created: number; updated: number; unchanged: number; removed: number; queued: number; runId: number };

type Agency = Pick<typeof agencies.$inferSelect, "id" | "suspendedAt" | "reaxmlAgentId">;

export class FeedError extends Error {}

export async function ingestFeed(db: Db, agency: Agency, xml: string, opts: { via: FeedVia; fileName?: string | null }): Promise<IngestResult> {
  const started = Date.now();
  const log = async (r: Partial<IngestResult>, error: string | null) => {
    const [run] = await db
      .insert(feedRuns)
      .values({ agencyId: agency.id, via: opts.via, fileName: opts.fileName?.slice(0, 200) ?? null, bytes: Buffer.byteLength(xml), received: r.received ?? 0, created: r.created ?? 0, updated: r.updated ?? 0, unchanged: r.unchanged ?? 0, removed: r.removed ?? 0, error, ms: Date.now() - started })
      .returning({ id: feedRuns.id });
    return run.id;
  };
  if (agency.suspendedAt) {
    await log({}, "Agency is suspended; feed refused.");
    throw new FeedError("This agency is suspended on Listgate.");
  }
  let feed: ReturnType<typeof parseReaxml>;
  try {
    feed = parseReaxml(xml);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log({}, msg);
    throw new FeedError(msg);
  }

  const res: IngestResult = { received: feed.listings.length, created: 0, updated: 0, unchanged: 0, removed: 0, queued: 0, runId: 0 };
  const changed: (typeof listings.$inferSelect)[] = [];

  await db.transaction(async (tx) => {
    const ids = feed.listings.map((l) => l.extId);
    const existing = ids.length
      ? await tx.select().from(listings).where(and(eq(listings.agencyId, agency.id), inArray(listings.extId, ids)))
      : [];
    const byExt = new Map(existing.map((l) => [l.extId, l]));

    // Agents first, deduplicated across the file.
    const seen = new Map<string, ParsedListing["agents"][number]>();
    for (const l of feed.listings) for (const a of l.agents) if (!seen.has(a.extId)) seen.set(a.extId, a);
    for (const a of seen.values()) {
      await tx
        .insert(agents)
        .values({ agencyId: agency.id, extId: a.extId, name: a.name, email: a.email, phone: a.phone, photo: a.photo })
        .onConflictDoUpdate({
          target: [agents.agencyId, agents.extId],
          set: {
            name: a.name,
            email: sql`coalesce(excluded.email, ${agents.email})`,
            phone: sql`coalesce(excluded.phone, ${agents.phone})`,
            photo: sql`coalesce(excluded.photo, ${agents.photo})`,
            active: true,
            updatedAt: new Date(),
          },
        });
    }

    for (const p of feed.listings) {
      const old = byExt.get(p.extId);
      const gone = p.status === "withdrawn" || p.status === "off_market";
      if (gone) {
        if (!old || old.removedAt) {
          res.unchanged++;
          continue;
        }
        const [row] = await tx
          .update(listings)
          .set({ status: p.status, removedAt: new Date(), version: old.version + 1, modTime: p.modTime, updatedAt: new Date() })
          .where(eq(listings.id, old.id))
          .returning();
        changed.push(row);
        res.removed++;
        continue;
      }
      // Some CRMs send updates without the photos (or an empty <objects/>): keep the ones we have.
      const merged: ParsedListing = { ...p, images: p.images.length ? p.images : old?.images ?? [], floorplans: p.floorplans.length ? p.floorplans : old?.floorplans ?? [] };
      const hash = contentHash(merged);
      if (old && old.contentHash === hash && !old.removedAt) {
        res.unchanged++;
        continue;
      }
      const { agents: _a, ...fields } = merged;
      const values = { ...fields, agencyId: agency.id, contentHash: hash, removedAt: null, updatedAt: new Date() };
      if (old) {
        const [row] = await tx.update(listings).set({ ...values, version: old.version + 1 }).where(eq(listings.id, old.id)).returning();
        changed.push(row);
        res.updated++;
      } else {
        const [row] = await tx.insert(listings).values({ ...values, version: 1 }).returning();
        changed.push(row);
        res.created++;
      }
    }

    res.queued = await enqueue(tx, agency.id, changed);
    await tx
      .update(agencies)
      .set({ lastFeedAt: new Date(), ...(feed.agentId && !agency.reaxmlAgentId ? { reaxmlAgentId: feed.agentId } : {}) })
      .where(eq(agencies.id, agency.id));
  });

  res.runId = await log(res, null);
  return res;
}

/** Finds the agency for a feed token. Tokens are long random strings; compare exactly. */
export async function agencyByFeedToken(db: Db, token: string) {
  if (!token || token.length < 16) return null;
  const [a] = await db.select().from(agencies).where(eq(agencies.feedToken, token));
  return a ?? null;
}
