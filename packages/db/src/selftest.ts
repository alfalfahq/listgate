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
  const { getDb, ingestFeed, ingestSourceFeed, setListingExclusion, ingestProperties, suggestMapping, setAgentPropertyUnlock, setOfficePropertyUnlock, propertyShares, properties, readTable, parseAddressLine, deliverDue, enqueueAgencyForPartner, setAgentUnlock, setOfficeUnlock, setAgentsLocked, agencies, agencyPartners, deliveries, listings, partners, sources } = await import("./index");
  const db = await getDb();
  const xml = fs.readFileSync(new URL("../fixtures/sample-reaxml.xml", import.meta.url), "utf8");

  // Local partner webhook that checks signatures.
  const got: { event: string; body: any; path?: string }[] = [];
  const secret = "whsec_test";
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const sig = String(req.headers["x-listgate-signature"] || "");
      const [, t, v1] = /t=(\d+),v1=([0-9a-f]+)/.exec(sig) || [];
      const ok = v1 === createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
      got.push({ event: String(req.headers["x-listgate-event"]), body: JSON.parse(raw), path: req.url });
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
  assert.equal(rental.dateAvailable, "2026-12-15");
  assert.equal(rental.bond, 2600);
  const rich = got.map((g) => g.body.listing).find((l) => l?.ensuites === 1)!;
  assert.ok(rich, "extras parsed");
  assert.deepEqual([rich.toilets, rich.livingAreas, rich.garages, rich.carports, rich.yearBuilt, rich.energyRating], [3, 2, 1, 1, 1998, "6"]);
  assert.deepEqual(rich.featureList, ["Air conditioning", "Pool", "Study", "Butler's pantry", "Solar panels"]);
  assert.deepEqual([rich.councilRates, rich.waterRates, rich.strataFees], ["$2,400 per year", "$1,100", null]);

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

  // 7. CRM-wide feed: split by agentID, nothing sent until an agent unlocks.
  const [dw] = await db.update(partners).set({ webhookUrl: `http://127.0.0.1:${port}/dw`, signingSecret: secret, active: true, kinds: [], includeSold: true }).where(eq(partners.slug, "dwellicious")).returning();
  assert.ok(dw, "dwellicious partner seeded");
  const [src] = await db.insert(sources).values({ name: "LockedOn", slug: "lockedon", feedToken: "lockedon-test-token-123456" }).returning();
  const item = (office: string, id: string, email: string) =>
    `<residential modTime="2026-11-27-10:00:00" status="current"><agentID>${office}</agentID><uniqueID>${id}</uniqueID><listingAgent id="1"><name>${email.split("@")[0]}</name><email>${email}</email></listingAgent><price display="yes">900000</price><address display="yes"><streetNumber>1</streetNumber><street>Test St</street><suburb>Paddington</suburb><state>QLD</state><postcode>4064</postcode></address><category name="House"/><headline>${id}</headline><features><bedrooms>3</bedrooms><bathrooms>1</bathrooms></features></residential>`;
  const crmXml = `<?xml version="1.0"?><propertyList>${item("OFF1", "L1", "amy@office1.test")}${item("OFF1", "L2", "ben@office1.test")}${item("OFF2", "L3", "amy@office1.test")}</propertyList>`;
  const sr = await ingestSourceFeed(db, src, crmXml, { via: "http" });
  assert.deepEqual([sr.agencies, sr.newAgencies, sr.created, sr.queued], [2, 2, 3, 0]);
  const again = await ingestSourceFeed(db, src, crmXml, { via: "http" });
  assert.deepEqual([again.newAgencies, again.unchanged], [0, 3]);
  const [off1] = await db.select().from(agencies).where(eq(agencies.reaxmlAgentId, "OFF1"));
  const [off2] = await db.select().from(agencies).where(eq(agencies.reaxmlAgentId, "OFF2"));
  const dwGot = async () => {
    got.length = 0;
    await deliverDue(db);
    return got.filter((g) => g.path === "/dw").map((g) => `${g.event === "listing.removed" ? "-" : "+"}${g.body.listing.agencyListingId}`).sort();
  };

  // Amy unlocks hers for Dwellicious: L1 (office 1) and L3 (office 2). Not Ben's L2.
  await setAgentUnlock(db, { sourceId: src.id, email: "Amy@Office1.test", partnerId: dw.id, enabled: true });
  assert.deepEqual(await dwGot(), ["+L1", "+L3"]);
  // An update to L2 still goes nowhere; an update to L1 goes to Dwellicious.
  await ingestSourceFeed(db, src, crmXml.replace("<headline>L2", "<headline>L2b").replace("<headline>L1", "<headline>L1b"), { via: "http" });
  assert.deepEqual(await dwGot(), ["+L1"]);

  // Amy approves the whole of office 1: Ben's L2 goes too.
  await setOfficeUnlock(db, { agencyId: off1.id, partner: dw, enabled: true, userId: null as unknown as string, userName: "Amy", authorisedBy: "Amy <amy@office1.test>" });
  assert.deepEqual(await dwGot(), ["+L1", "+L2"]);
  // Office-wide off again: L2 is removed, Amy's own L1 stays.
  await setOfficeUnlock(db, { agencyId: off1.id, partner: dw, enabled: false, userId: null as unknown as string, userName: "Amy" });
  assert.deepEqual(await dwGot(), ["+L1", "-L2"]);

  // Amy keeps L1 away from Dwellicious, then lets it through again.
  const [l1] = await db.select().from(listings).where(eq(listings.extId, "L1"));
  await setListingExclusion(db, { listingId: l1.id, partnerId: dw.id, excluded: true, byName: "Amy" });
  assert.deepEqual(await dwGot(), ["-L1"]);
  await ingestSourceFeed(db, src, crmXml.replace("<headline>L1", "<headline>L1c"), { via: "http" });
  assert.deepEqual(await dwGot(), ["-L1"], "still kept away after an update");
  await setListingExclusion(db, { listingId: l1.id, partnerId: dw.id, excluded: false });
  assert.deepEqual(await dwGot(), ["+L1"]);

  // A complaint: office 2 is locked, so Amy's unlock stops applying there.
  await setAgentsLocked(db, off2.id, true, "Principal asked us to stop");
  assert.deepEqual(await dwGot(), ["-L3"]);
  // Amy locks hers: L1 removed. L3 isn't sent again (already removed).
  await setAgentUnlock(db, { sourceId: src.id, email: "amy@office1.test", partnerId: dw.id, enabled: false });
  assert.deepEqual(await dwGot(), ["-L1"]);
  // 8. Property database: CSV with owner columns, mapped once; owner details never stored.
  assert.deepEqual(parseAddressLine("Unit 3/12 Smith St, Paddington QLD 4064"), { unitNumber: "3", streetNumber: "12", street: "Smith St", suburb: "Paddington", state: "QLD", postcode: "4064" });
  assert.equal(readTable('[{"id":1,"address":{"suburb":"Ascot"}}]').columns.join(), "id,address.suburb");
  const csv = (rows: string[]) => ["Property ID,Office ID,Agent Email,Address,Bedrooms,Land Size,Owner Name,Owner Phone", ...rows].join("\n");
  const p1 = 'P1,OFF1,amy@office1.test,"1 Test St, Paddington QLD 4064",3,0.06ha,Jane Citizen,0400 000 000';
  const p2 = 'P2,OFF1,ben@office1.test,"2 Test St, Paddington QLD 4064",4,600,John Citizen,0400 111 111';
  const p3 = 'P3,OFF1,,"3 Test St, Paddington QLD 4064",2,,Ann Citizen,0400 222 222';
  let [srcNow] = await db.select().from(sources).where(eq(sources.id, src.id));
  const first = await ingestProperties(db, srcNow, csv([p1, p2, p3]), { mode: "snapshot" });
  assert.equal(first.status, "needs_mapping");
  [srcNow] = await db.select().from(sources).where(eq(sources.id, src.id));
  const m = suggestMapping(srcNow.propertySample!.columns);
  assert.deepEqual(Object.keys(m.fields).sort(), ["addressLine", "agentRefs", "beds", "extId", "landArea", "officeRef"].sort(), "owner columns never suggested");
  [srcNow] = await db.update(sources).set({ propertyMapping: m, propertySample: null }).where(eq(sources.id, src.id)).returning();
  const second = await ingestProperties(db, srcNow, csv([p1, p2, p3]), { mode: "snapshot" });
  assert.deepEqual([second.status, second.created, second.offices], ["done", 3, 1]);
  const stored = await db.select().from(properties);
  assert.equal(stored.find((x) => x.extId === "P1")!.landArea, 600, "hectares converted");
  assert.ok(!JSON.stringify(stored).includes("Citizen"), "owner details never stored");
  const again2 = await ingestProperties(db, srcNow, csv([p1, p2, p3]), { mode: "snapshot" });
  assert.equal(again2.unchanged, 3);

  // Nobody sees them until unlocked. Amy shares hers; then the office shares all; then P3 drops out of a snapshot.
  await db.update(partners).set({ acceptsProperties: true }).where(eq(partners.id, dw.id));
  const visible = async () => (await db.select().from(propertyShares).innerJoin(properties, eq(properties.id, propertyShares.propertyId)).where(eq(propertyShares.visible, true))).map((r) => r.properties.extId).sort();
  assert.deepEqual(await visible(), []);
  await setAgentPropertyUnlock(db, { sourceId: src.id, refs: ["Amy@Office1.test"], partnerId: dw.id, enabled: true });
  assert.deepEqual(await visible(), ["P1"]);
  await setOfficePropertyUnlock(db, { agencyId: off1.id, partnerId: dw.id, enabled: true, by: "Amy (principal)" });
  assert.deepEqual(await visible(), ["P1", "P2", "P3"]);
  const third = await ingestProperties(db, srcNow, csv([p1, p2]), { mode: "snapshot" });
  assert.equal(third.removed, 1);
  assert.deepEqual(await visible(), ["P1", "P2"]);
  await setOfficePropertyUnlock(db, { agencyId: off1.id, partnerId: dw.id, enabled: false, by: "Amy" });
  assert.deepEqual(await visible(), ["P1"], "Amy's own share stays");
  const delta = await ingestProperties(db, srcNow, csv([p1]), { mode: "delta" });
  assert.equal(delta.removed, 0, "delta never removes");

  server.close();
  console.log("selftest passed");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
