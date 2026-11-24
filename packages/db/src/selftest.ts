// End-to-end check of the feed → listing → partner push path, against a throwaway embedded database
// and a local webhook receiver. Run: npm run selftest -w @listgate/db
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "listgate-selftest-"));
delete process.env.DATABASE_URL;

async function main() {
  const { getDb, ingestFeed, deliverDue, enqueueAgencyForPartner, agencies, agencyPartners, deliveries, listings, partners } = await import("./index");
  const db = await getDb();
  const xml = fs.readFileSync(new URL("../fixtures/sample-reaxml.xml", import.meta.url), "utf8");

  // Local partner webhook that checks signatures.
  const got: { event: string; body: any }[] = [];
  const secret = "whsec_test";
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const sig = String(req.headers["x-listgate-signature"] || "");
      const [, t, v1] = /t=(\d+),v1=([0-9a-f]+)/.exec(sig) || [];
      const ok = v1 === createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
      got.push({ event: String(req.headers["x-listgate-event"]), body: JSON.parse(raw) });
      res.statusCode = ok ? 200 : 401;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;

  const [agency] = await db.select().from(agencies).where(eq(agencies.slug, "harper-and-vale"));
  assert.ok(agency, "demo agency seeded");
  const [stash] = await db.update(partners).set({ webhookUrl: `http://127.0.0.1:${port}/hook`, signingSecret: secret, active: true }).where(eq(partners.slug, "stash")).returning();
  const [propchat] = await db.update(partners).set({ webhookUrl: `http://127.0.0.1:${port}/hook`, signingSecret: secret, active: true, kinds: ["sale"], includeSold: false }).where(eq(partners.slug, "propchat")).returning();
  await db.insert(agencyPartners).values({ agencyId: agency.id, partnerId: stash.id });

  // 1. First feed: 4 new listings, 4 pushes to Stash.
  const r1 = await ingestFeed(db, agency, xml, { via: "upload", fileName: "sample.xml" });
  assert.deepEqual([r1.received, r1.created, r1.updated, r1.unchanged, r1.removed, r1.queued], [4, 4, 0, 0, 0, 4]);
  await deliverDue(db);
  assert.equal(got.length, 4);
  const hidden = got.find((g) => g.body.listing.agencyListingId === "DEMO-1002")!.body.listing;
  assert.equal(hidden.address.display, false);
  assert.equal(hidden.address.street, "Sample Road", "Stash is confidential, so it gets the hidden address");
  assert.equal(hidden.status, "under_offer");
  const sold = got.find((g) => g.body.listing.agencyListingId === "DEMO-0901")!.body.listing;
  assert.equal(sold.sold.price, 1210000);
  const rental = got.find((g) => g.body.listing.agencyListingId === "DEMO-R201")!.body.listing;
  assert.equal(rental.rentPerWeek, 650);

  // 2. Same file again: nothing changed, nothing pushed.
  const r2 = await ingestFeed(db, agency, xml, { via: "http" });
  assert.equal(r2.unchanged, 4);
  assert.equal(r2.queued, 0);

  // 3. A price change and a withdrawal.
  const xml3 = xml
    .replace("Offers over $1,450,000", "Offers over $1,395,000")
    .replace('<rental modTime="2026-11-25-09:00:00" status="current">', '<rental modTime="2026-11-26-09:00:00" status="withdrawn">');
  const r3 = await ingestFeed(db, agency, xml3, { via: "http" });
  assert.equal(r3.updated, 1);
  assert.equal(r3.removed, 1);
  got.length = 0;
  await deliverDue(db);
  assert.deepEqual(got.map((g) => g.event).sort(), ["listing.removed", "listing.upserted"]);
  assert.equal(got.find((g) => g.event === "listing.upserted")!.body.listing.version, 2);

  // 4. Switching Propchat on backfills only what it takes (sale, not sold) and hides the hidden address.
  await db.insert(agencyPartners).values({ agencyId: agency.id, partnerId: propchat.id });
  await enqueueAgencyForPartner(db, agency.id, propchat, "backfill");
  got.length = 0;
  await deliverDue(db);
  const pc = got.filter((g) => g.event === "listing.upserted").map((g) => g.body.listing);
  assert.deepEqual(pc.map((l) => l.agencyListingId).sort(), ["DEMO-1001", "DEMO-1002"]);
  assert.equal(pc.find((l) => l.agencyListingId === "DEMO-1002")!.address.street, null);
  assert.equal(pc.find((l) => l.agencyListingId === "DEMO-1001")!.price.value, null, "hidden price withheld");

  // 5. A partner that's down: retried with backoff, not lost.
  await db.update(partners).set({ webhookUrl: "http://127.0.0.1:1/down" }).where(eq(partners.id, stash.id));
  await ingestFeed(db, agency, xml3.replace("Offers over $1,395,000", "Auction"), { via: "http" });
  await deliverDue(db);
  const failed = await db.select().from(deliveries).where(eq(deliveries.status, "failed"));
  assert.equal(failed.length, 1);
  assert.ok(failed[0].nextAttemptAt > new Date());

  // 6. Bad XML is logged and refused.
  await assert.rejects(ingestFeed(db, agency, "not xml", { via: "http" }));

  const n = await db.select().from(listings).where(eq(listings.agencyId, agency.id));
  assert.equal(n.length, 4);
  server.close();
  console.log("selftest passed");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
