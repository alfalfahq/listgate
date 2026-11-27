// What partners receive, by webhook push or the pull API. Version 1. Change carefully: partners parse this.
import { mediaView, type MediaAsset } from "./media";
import type { agencies, agents, listings, partners } from "./schema";

type Listing = typeof listings.$inferSelect;
type Agent = typeof agents.$inferSelect;
type Agency = Pick<typeof agencies.$inferSelect, "id" | "name" | "reaxmlAgentId" | "suburb" | "state" | "website">;
type Partner = Pick<typeof partners.$inferSelect, "confidential">;

export const PAYLOAD_VERSION = 1;

export function fullAddress(l: Pick<Listing, "unitNumber" | "streetNumber" | "street" | "suburb" | "state" | "postcode">) {
  const street = [l.unitNumber && l.streetNumber ? `${l.unitNumber}/${l.streetNumber}` : l.unitNumber || l.streetNumber, l.street].filter(Boolean).join(" ");
  return [street, [l.suburb, l.state, l.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function listingPayload(
  l: Listing,
  agency: Agency,
  agentRows: Agent[],
  partner: Partner,
  partnerAgencyRef?: string | null,
  media?: { assets: Map<string, MediaAsset>; publicUrl: ((key: string) => string) | null }
) {
  const view = (m: Listing["images"][number]) => mediaView(m, media?.assets.get(m.url), media?.publicUrl ?? null);
  const photos = l.images.map(view);
  const plans = l.floorplans.map(view);
  const showAddress = l.displayAddress || partner.confidential;
  const showPrice = l.priceDisplay || partner.confidential;
  const showSold = l.soldPriceDisplay || partner.confidential;
  const x = l.extras ?? {};
  const byExt = new Map(agentRows.map((a) => [a.extId, a]));
  return {
    id: l.id,
    agencyListingId: l.extId,
    version: l.version,
    status: l.status,
    kind: l.kind,
    category: l.category,
    propertyType: l.propertyType,
    address: {
      display: l.displayAddress,
      unitNumber: showAddress ? l.unitNumber : null,
      streetNumber: showAddress ? l.streetNumber : null,
      street: showAddress ? l.street : null,
      suburb: l.suburb,
      state: l.state,
      postcode: l.postcode,
      full: showAddress ? fullAddress(l) : fullAddress({ unitNumber: null, streetNumber: null, street: null, suburb: l.suburb, state: l.state, postcode: l.postcode }),
    },
    price: { text: l.priceText, value: showPrice ? l.price : null, display: l.priceDisplay },
    rentPerWeek: l.rentPerWeek,
    sold: l.status === "sold" || l.soldDate ? { price: showSold ? l.soldPrice : null, display: l.soldPriceDisplay, date: l.soldDate } : null,
    auctionAt: l.auctionAt,
    features: { beds: l.beds, baths: l.baths, cars: l.cars, landArea: l.landArea, landAreaUnit: l.landAreaUnit, buildingArea: l.buildingArea },
    // Optional extras, top-level so partners can read them by name. Missing means the feed didn't say.
    ensuites: x.ensuites ?? null,
    toilets: x.toilets ?? null,
    livingAreas: x.livingAreas ?? null,
    garages: x.garages ?? null,
    carports: x.carports ?? null,
    featureList: x.featureList ?? [],
    councilRates: x.councilRates ?? null,
    waterRates: x.waterRates ?? null,
    strataFees: x.strataFees ?? null,
    energyRating: x.energyRating ?? null,
    yearBuilt: x.yearBuilt ?? null,
    dateAvailable: x.dateAvailable ?? null,
    bond: x.bond ?? null,
    headline: l.headline,
    description: l.description,
    // Listgate-hosted copies when we have them (full size), else the CRM's link.
    images: photos.map((m) => m.url),
    floorplans: plans.map((m) => m.url),
    // Sizes, dimensions and the CRM's original link for each image. hosted=false means it's still the CRM's link.
    media: { photos, floorplans: plans },
    videoUrl: l.videoUrl,
    inspections: l.inspections,
    agents: l.agentExtIds
      .map((id) => byExt.get(id))
      .filter((a): a is Agent => !!a)
      .map((a) => ({ name: a.name, email: a.email, phone: a.phone, photo: a.photo })),
    agency: { id: agency.id, name: agency.name, reaxmlAgentId: agency.reaxmlAgentId, ref: partnerAgencyRef ?? null },
    firstSeenAt: l.firstSeenAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    removedAt: l.removedAt?.toISOString() ?? null,
  };
}

export type ListingPayload = ReturnType<typeof listingPayload>;

export function removedPayload(l: Pick<Listing, "id" | "extId" | "version">, agency: Pick<Agency, "id" | "name">, ref?: string | null) {
  return { id: l.id, agencyListingId: l.extId, version: l.version, agency: { id: agency.id, name: agency.name, ref: ref ?? null } };
}
