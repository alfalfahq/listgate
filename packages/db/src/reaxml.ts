// REAXML parser. CRMs (VaultRE, Agentbox, Rex, Box+Dice, MyDesktop…) already export this format to
// realestate.com.au and Domain; the agency adds Listgate as one more export destination.
// This file only turns XML into normalised listings. ingest.ts stores them and queues partner pushes.
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { Inspection, ListingStatus, Media } from "./schema";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

type Any = Record<string, unknown>;
const arr = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
export const txt = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number") return String(v).trim() || undefined;
  if (typeof v === "object" && "#text" in (v as Any)) return txt((v as Any)["#text"]);
  return undefined;
};
const int = (v: unknown) => {
  const n = parseInt((txt(v) || "").replace(/[^\d.-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};
const float = (v: unknown) => {
  const n = parseFloat((txt(v) || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const attr = (v: unknown, name: string) => (v && typeof v === "object" ? txt((v as Any)[`@_${name}`]) : undefined);
const yes = (v: unknown, dflt = false) => {
  const s = (typeof v === "object" ? attr(v, "value") ?? txt(v) : txt(v))?.toLowerCase();
  if (!s) return dflt;
  return s === "yes" || s === "true" || s === "1";
};

/** REAXML top-level elements and whether they're for sale or rent. */
export const CATEGORIES: Record<string, "sale" | "rent"> = {
  residential: "sale",
  land: "sale",
  rural: "sale",
  commercial: "sale",
  commercialLand: "sale",
  business: "sale",
  rental: "rent",
  holidayRental: "rent",
};

export type ParsedAgent = { extId: string; name: string; email: string | null; phone: string | null; photo: string | null };

export type ParsedListing = {
  extId: string;
  category: string;
  status: ListingStatus;
  kind: "sale" | "rent";
  propertyType: string | null;
  unitNumber: string | null;
  streetNumber: string | null;
  street: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  displayAddress: boolean;
  priceText: string | null;
  price: number | null;
  priceDisplay: boolean;
  rentPerWeek: number | null;
  soldPrice: number | null;
  soldPriceDisplay: boolean;
  soldDate: string | null;
  auctionAt: string | null;
  beds: number | null;
  baths: number | null;
  cars: number | null;
  landArea: number | null;
  landAreaUnit: string | null;
  buildingArea: number | null;
  headline: string | null;
  description: string | null;
  images: Media[];
  floorplans: Media[];
  videoUrl: string | null;
  inspections: Inspection[];
  agentExtIds: string[];
  agents: ParsedAgent[];
  modTime: string | null;
  raw: Record<string, unknown>;
};

export type ParsedFeed = { agentId: string | null; listings: ParsedListing[]; skipped: number };

const media = (node: unknown, kind: Media["kind"]): Media[] =>
  arr(node as Any | Any[])
    .map((im) => ({ url: attr(im, "url") || attr(im, "file") || "", id: attr(im, "id") || "", kind }))
    .filter((m) => /^https?:\/\//i.test(m.url))
    // "m" is the main photo, then a, b, c…
    .sort((a, b) => (a.id === "m" ? -1 : b.id === "m" ? 1 : (a.id || "").localeCompare(b.id || "")));

function status(item: Any): ListingStatus {
  const s = (attr(item, "status") || "current").toLowerCase().replace(/[\s_-]/g, "");
  if (s === "sold") return "sold";
  if (s === "leased") return "leased";
  if (s === "withdrawn" || s === "deleted") return "withdrawn";
  if (s === "offmarket") return "off_market";
  if (yes(item.underOffer)) return "under_offer";
  return "current";
}

function agent(ag: Any): ParsedAgent | null {
  const name = txt(ag.name);
  if (!name) return null;
  const email = txt(ag.email)?.toLowerCase() ?? null;
  const phones = arr(ag.telephone as unknown);
  const phone = (phones.find((p) => attr(p, "type") === "mobile") ? txt(phones.find((p) => attr(p, "type") === "mobile")) : txt(phones[0])) ?? null;
  const photo = attr(ag.agentPhoto, "url") || txt(ag.photo) || null;
  return { extId: (email || name).toLowerCase(), name, email, phone, photo };
}

export function parseListing(tag: string, item: Any): ParsedListing | null {
  const extId = txt(item.uniqueID);
  if (!extId) return null;
  const kind = CATEGORIES[tag];
  const st = status(item);
  const addr = (item.address || {}) as Any;
  const feat = (item.features || {}) as Any;
  const sold = (item.soldDetails || {}) as Any;
  const soldNode = sold.soldPrice ?? sold.price;
  const rentNode = arr(item.rent as Any | Any[])[0];
  const price = int(item.price);
  const priceDisplay = yes(attr(item.price, "display"), false);
  const rentPerWeek = rentNode ? (attr(rentNode, "period") === "month" ? Math.round(((int(rentNode) ?? 0) * 12) / 52) || null : int(rentNode)) : null;
  const priceText =
    txt(item.priceView) ||
    (kind === "rent" && rentPerWeek ? `$${rentPerWeek.toLocaleString("en-AU")} per week` : undefined) ||
    (priceDisplay && price ? `$${price.toLocaleString("en-AU")}` : undefined) ||
    null;
  const land = (item.landDetails || {}) as Any;
  const building = (item.buildingDetails || {}) as Any;
  const objects = (item.objects || item.images || {}) as Any;
  const agents = arr(item.listingAgent as Any | Any[]).map(agent).filter((a): a is ParsedAgent => !!a);
  const inspections = arr(((item.inspectionTimes || {}) as Any).inspection as unknown)
    .map((i) => txt(i))
    .filter((s): s is string => !!s)
    .map((text) => ({ start: text, text }));
  const video = arr(item.videoLink as unknown).map((v) => attr(v, "href") || txt(v)).find(Boolean) || null;
  const cars = (int(feat.garages) ?? 0) + (int(feat.carports) ?? 0) + (int(feat.openSpaces) ?? 0);
  const auction = (item.auction || {}) as Any;

  return {
    extId,
    category: tag,
    status: st,
    kind,
    propertyType: attr(item.category, "name") || attr(item.commercialCategory, "name") || attr(item.landCategory, "name") || null,
    unitNumber: txt(addr.subNumber) ?? txt(addr.lotNumber) ?? null,
    streetNumber: txt(addr.streetNumber) ?? null,
    street: txt(addr.street) ?? null,
    suburb: txt(addr.suburb) ?? null,
    state: txt(addr.state)?.toUpperCase() ?? null,
    postcode: txt(addr.postcode) ?? null,
    displayAddress: yes(attr(addr, "display") ?? "yes", true),
    priceText,
    price,
    priceDisplay,
    rentPerWeek,
    soldPrice: int(soldNode),
    soldPriceDisplay: yes(attr(soldNode, "display") ?? "no", false),
    soldDate: txt(sold.soldDate ?? sold.date) ?? null,
    auctionAt: attr(auction, "date") || txt(auction) || null,
    beds: int(feat.bedrooms),
    baths: int(feat.bathrooms),
    cars: cars || null,
    landArea: float(land.area),
    landAreaUnit: attr(land.area, "unit") || null,
    buildingArea: float(building.area),
    headline: txt(item.headline) ?? null,
    description: txt(item.description) ?? null,
    images: media(objects.img, "photo"),
    floorplans: media(objects.floorplan, "floorplan"),
    videoUrl: video,
    inspections,
    agentExtIds: agents.map((a) => a.extId),
    agents,
    modTime: attr(item, "modTime") || null,
    raw: item,
  };
}

/** Parses a REAXML document (a <propertyList> with any number of listings). Throws on unreadable XML. */
export function parseReaxml(xml: string): ParsedFeed {
  if (!xml.includes("<")) throw new Error("Expected REAXML.");
  let doc: Any;
  try {
    doc = parser.parse(xml) as Any;
  } catch (e) {
    throw new Error(`Couldn't read the XML: ${e instanceof Error ? e.message : String(e)}`);
  }
  const root = (doc.propertyList || doc) as Any;
  if (!root || typeof root !== "object") throw new Error("No <propertyList> in the file.");
  const out: ParsedListing[] = [];
  let skipped = 0;
  let agentId: string | null = null;
  for (const tag of Object.keys(CATEGORIES)) {
    for (const item of arr(root[tag] as Any | Any[])) {
      if (!item || typeof item !== "object") continue;
      agentId ||= txt(item.agentID) ?? null;
      const l = parseListing(tag, item);
      if (l) out.push(l);
      else skipped++;
    }
  }
  return { agentId, listings: out, skipped };
}

/** Hash of what partners see. A resend with the same content doesn't bump the version or push again. */
export function contentHash(l: ParsedListing) {
  const { raw: _raw, modTime: _m, agents, ...rest } = l;
  return createHash("sha256").update(JSON.stringify({ ...rest, agents })).digest("hex").slice(0, 32);
}
