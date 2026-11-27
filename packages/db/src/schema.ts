// Listgate database schema.
//
//   Agency ──< AgencyMember >── User
//     │
//     ├──< Listing, Agent        (from the agency's REAXML feed, one canonical copy)
//     ├──< FeedRun               (every feed file received, for the feed log)
//     └──< AgencyPartner >── Partner   (which partners the agency sends its listings to)
//
//   Partner ──< Delivery          (outbox: one row per listing change per partner, pushed by webhook)
//
// Change this file, then run `npm run db:generate` to write a new migration.

import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const agencyRole = pgEnum("agency_role", ["owner", "editor"]);
export const tokenPurpose = pgEnum("token_purpose", ["login", "invite", "impersonate"]);
export const listingStatus = pgEnum("listing_status", ["current", "under_offer", "sold", "leased", "withdrawn", "off_market"]);
export const listingKind = pgEnum("listing_kind", ["sale", "rent"]);
export const deliveryStatus = pgEnum("delivery_status", ["pending", "sent", "failed", "dead"]);
export type DeliveryStatus = (typeof deliveryStatus.enumValues)[number];
export type ListingStatus = (typeof listingStatus.enumValues)[number];

export type AdminRole = "full" | "tech";
export const ADMIN_ROLES: { value: AdminRole; label: string; hint: string }[] = [
  { value: "full", label: "Full access", hint: "Everything" },
  { value: "tech", label: "Tech", hint: "Everything except partner keys" },
];

/** CRMs that already export REAXML. Shown as a dropdown when adding an agency; free text is fine too. */
export const CRMS = ["VaultRE", "Agentbox", "Rex", "Box+Dice", "MyDesktop", "Eagle", "LockedOn", "Console Cloud", "PropertyTree", "Agent Point", "Other"] as const;

/** Where a feed file came in. */
export type FeedVia = "http" | "ftp" | "upload";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// People and agencies
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    // Listgate staff: can use the admin site and see every agency.
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    adminRole: text("admin_role").$type<AdminRole>().notNull().default("full"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)]
);

/** Column → Listgate property field. `column` is the CRM's header (or JSON key, dots for nesting). */
export type PropertyMapping = {
  fields: Partial<Record<PropertyField, { column: string; transform?: "ha_to_m2" | "list" | "yes_no" | "none" }>>;
  updatedAt?: string;
  updatedBy?: string;
};
export const PROPERTY_FIELDS = [
  "extId", "officeRef", "agentRefs", "addressLine", "unitNumber", "streetNumber", "street", "suburb", "state", "postcode",
  "lat", "lng", "propertyType", "beds", "baths", "cars", "landArea", "buildingArea", "yearBuilt", "features",
  "lastSaleDate", "lastSalePrice",
] as const;
export type PropertyField = (typeof PROPERTY_FIELDS)[number];

/** OAuth settings for signing agents in with their CRM. Paths are dotted keys into the userinfo JSON. */
export type SourceSso = {
  enabled?: boolean;
  label?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  idPath?: string;
  emailPath?: string;
  namePath?: string;
  officePath?: string;
  rolePath?: string;
  // Role values (comma-separated, case-insensitive) that may approve a whole office.
  principalRoles?: string;
};

/**
 * A CRM sending one feed for every agency on it (e.g. LockedOn). The feed is split into agencies by <agentID>.
 * Nothing from a source goes to partners until an agent signs in and unlocks their own listings (agentPartners),
 * or an agency is set up and turns partners on itself.
 */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    // Secret in the CRM's feed URL (and its FTP password). Same endpoint as agency feeds.
    feedToken: text("feed_token").notNull(),
    contactEmail: text("contact_email"),
    notes: text("notes"),
    lastFeedAt: timestamp("last_feed_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    // Property database feed: its own token, so it can be cut off without touching listings.
    propertyToken: text("property_token"),
    // How the CRM's columns map to Listgate's property fields (set in admin from a sample upload).
    propertyMapping: jsonb("property_mapping").$type<PropertyMapping>(),
    // Headers and a few rows from the last unmapped upload, for the mapping screen. Cleared when the mapping is saved.
    propertySample: jsonb("property_sample").$type<{ columns: string[]; rows: Record<string, string>[]; at: string }>(),
    lastPropertyFeedAt: timestamp("last_property_feed_at", { withTimezone: true }),
    // Sign in with the CRM (OAuth 2.0 authorization code). Off until clientId is set.
    sso: jsonb("sso").$type<SourceSso>(),
    // Shared secret for signed "Manage on Listgate" links from inside the CRM (fallback to OAuth).
    linkSecret: text("link_secret"),
    ...timestamps,
  },
  (t) => [uniqueIndex("sources_slug_unique").on(t.slug), uniqueIndex("sources_feed_token_unique").on(t.feedToken), uniqueIndex("sources_property_token_unique").on(t.propertyToken)]
);

export const agencies = pgTable(
  "agencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    initials: text("initials").notNull(),
    // The agency's REAXML agentID (what its CRM puts in <agentID>). Optional: the feed token is what identifies it.
    reaxmlAgentId: text("reaxml_agent_id"),
    crm: text("crm"),
    suburb: text("suburb"),
    state: text("state"),
    abn: text("abn"),
    contactEmail: text("contact_email"),
    website: text("website"),
    // Feed token: the secret in the HTTP feed URL, and the FTP password. Rotating it breaks the old URL.
    feedToken: text("feed_token").notNull(),
    // Who authorised Listgate to receive and distribute this agency's listings.
    authorisedAt: timestamp("authorised_at", { withTimezone: true }),
    authorisedBy: text("authorised_by"),
    lastFeedAt: timestamp("last_feed_at", { withTimezone: true }),
    notes: text("notes"),
    // Suspended agencies' feeds are refused and nothing is sent to partners.
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    // Set when the agency was created from a CRM-wide feed: reaxmlAgentId is then its id within that CRM.
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    // Listgate admin lock (e.g. after a complaint): agents can't change anything for this office, and their own
    // unlocks stop applying to its listings. Only partners set at agency level (by admin) still get them.
    agentsLockedAt: timestamp("agents_locked_at", { withTimezone: true }),
    agentsLockedReason: text("agents_locked_reason"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("agencies_slug_unique").on(t.slug),
    uniqueIndex("agencies_feed_token_unique").on(t.feedToken),
    uniqueIndex("agencies_source_agent_unique").on(t.sourceId, t.reaxmlAgentId),
  ]
);

export const agencyMembers = pgTable(
  "agency_members",
  {
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: agencyRole("role").notNull().default("editor"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.agencyId, t.userId] }), index("agency_members_user_idx").on(t.userId)]
);

// ---------------------------------------------------------------------------
// Sign-in: sessions, and one-time tokens for magic links, invites and view-as
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    impersonatorId: uuid("impersonator_id").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_unique").on(t.tokenHash), index("sessions_user_idx").on(t.userId)]
);

export const loginTokens = pgTable(
  "login_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    purpose: tokenPurpose("purpose").notNull(),
    email: text("email"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "cascade" }),
    agencyRole: agencyRole("agency_role"),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("login_tokens_token_unique").on(t.tokenHash)]
);

// ---------------------------------------------------------------------------
// Listings: one canonical copy per agency listing, normalised from REAXML
// ---------------------------------------------------------------------------

export type Inspection = { start: string; end?: string; text: string };
/** Optional "at a glance" facts from the feed. Every key is optional; partners get them top-level in the payload. */
export type ListingExtras = {
  ensuites?: number;
  toilets?: number;
  livingAreas?: number;
  garages?: number;
  carports?: number;
  featureList?: string[];
  councilRates?: string;
  waterRates?: string;
  strataFees?: string;
  energyRating?: string;
  yearBuilt?: number;
  dateAvailable?: string;
  bond?: number;
};
export type Media = { url: string; id?: string; kind?: "photo" | "floorplan" | "video" | "doc" };

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    // Email (or name when there's no email), lower-cased: how one agent is recognised across listings.
    extId: text("ext_id").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    photo: text("photo"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("agents_agency_ext_unique").on(t.agencyId, t.extId), index("agents_email_idx").on(sql`lower(${t.email})`)]
);

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    // REAXML <uniqueID>.
    extId: text("ext_id").notNull(),
    // REAXML element the listing came in: residential, rental, land, rural, commercial, commercialLand, business, holidayRental.
    category: text("category").notNull(),
    status: listingStatus("status").notNull().default("current"),
    kind: listingKind("kind").notNull().default("sale"),
    propertyType: text("property_type"),
    // Address. displayAddress=false means the agent asked for the street address to be hidden: partners must respect it.
    unitNumber: text("unit_number"),
    streetNumber: text("street_number"),
    street: text("street"),
    suburb: text("suburb"),
    state: text("state"),
    postcode: text("postcode"),
    displayAddress: boolean("display_address").notNull().default(true),
    priceText: text("price_text"),
    price: integer("price"),
    priceDisplay: boolean("price_display").notNull().default(false),
    rentPerWeek: integer("rent_per_week"),
    soldPrice: integer("sold_price"),
    soldPriceDisplay: boolean("sold_price_display").notNull().default(false),
    soldDate: text("sold_date"),
    auctionAt: text("auction_at"),
    beds: integer("beds"),
    baths: integer("baths"),
    cars: integer("cars"),
    landArea: doublePrecision("land_area"),
    landAreaUnit: text("land_area_unit"),
    buildingArea: doublePrecision("building_area"),
    headline: text("headline"),
    description: text("description"),
    images: jsonb("images").$type<Media[]>().notNull().default([]),
    floorplans: jsonb("floorplans").$type<Media[]>().notNull().default([]),
    videoUrl: text("video_url"),
    inspections: jsonb("inspections").$type<Inspection[]>().notNull().default([]),
    agentExtIds: jsonb("agent_ext_ids").$type<string[]>().notNull().default([]),
    extras: jsonb("extras").$type<ListingExtras>().notNull().default({}),
    // Everything else in the REAXML element, parsed, for partners that want fields we don't normalise.
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    // REAXML modTime, and a hash of the normalised content: unchanged resends don't go to partners again.
    modTime: text("mod_time"),
    contentHash: text("content_hash").notNull(),
    // Goes up by one every time the content changes. Sent to partners so they can ignore out-of-order pushes.
    version: integer("version").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when the feed withdrew or deleted it (status withdrawn/off_market). Partners get listing.removed.
    removedAt: timestamp("removed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("listings_agency_ext_unique").on(t.agencyId, t.extId),
    index("listings_updated_idx").on(t.updatedAt),
    index("listings_agency_status_idx").on(t.agencyId, t.status),
    index("listings_suburb_idx").on(t.state, t.suburb),
  ]
);

export const feedRuns = pgTable(
  "feed_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "cascade" }),
    via: text("via").$type<FeedVia>().notNull(),
    fileName: text("file_name"),
    bytes: integer("bytes").notNull().default(0),
    received: integer("received").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    unchanged: integer("unchanged").notNull().default(0),
    removed: integer("removed").notNull().default(0),
    error: text("error"),
    ms: integer("ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("feed_runs_agency_time_idx").on(t.agencyId, t.createdAt), index("feed_runs_time_idx").on(t.createdAt)]
);

// ---------------------------------------------------------------------------
// Partners: products that receive listings (Stash, Propchat, Dwellicious…)
// ---------------------------------------------------------------------------

export const partners = pgTable(
  "partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    website: text("website"),
    // Push: we POST every change here, signed with signingSecret (X-Listgate-Signature). Empty = pull only.
    webhookUrl: text("webhook_url"),
    signingSecret: text("signing_secret").notNull(),
    // Pull: partners call /api/v1/* with this key (Authorization: Bearer lg_…). Only a hash is stored.
    apiKeyHash: text("api_key_hash"),
    apiKeyLast4: text("api_key_last4"),
    // Which listings the partner takes: sale, rent, sold/leased results. Empty means everything.
    kinds: jsonb("kinds").$type<("sale" | "rent")[]>().notNull().default([]),
    includeSold: boolean("include_sold").notNull().default(true),
    // Off: a hidden street address, hidden price or undisclosed sold price is left out of what this partner gets.
    // On: they get them, flagged display=false, and must not show them publicly (e.g. Stash, for data only).
    confidential: boolean("confidential").notNull().default(false),
    // Shown to agencies as a choice. Hidden partners are only turned on by Listgate admin.
    listed: boolean("listed").notNull().default(true),
    // Allowed to receive CRM property databases (separate from listings; offices still have to approve).
    acceptsProperties: boolean("accepts_properties").notNull().default(false),
    active: boolean("active").notNull().default(true),
    // Stop pushing after this many failures in a row (the delivery is marked dead and can be retried in admin).
    maxAttempts: integer("max_attempts").notNull().default(12),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    lastError: text("last_error"),
    sort: integer("sort").notNull().default(100),
    ...timestamps,
  },
  (t) => [uniqueIndex("partners_slug_unique").on(t.slug), uniqueIndex("partners_api_key_unique").on(t.apiKeyHash)]
);

/** An agency sending its listings to a partner. Turning it off sends listing.removed for everything. */
export const agencyPartners = pgTable(
  "agency_partners",
  {
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    // Partner's own id for the agency, if they gave us one (sent with every push).
    partnerAgencyRef: text("partner_agency_ref"),
    changedById: uuid("changed_by_id").references(() => users.id, { onDelete: "set null" }),
    changedByName: text("changed_by_name"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.agencyId, t.partnerId] }), index("agency_partners_partner_idx").on(t.partnerId, t.enabled)]
);

/**
 * An agent unlocking their own listings from a CRM-wide feed for one partner. Keyed by the agent's email:
 * every listing in that source with this email as a listing agent goes to the partner.
 */
export const agentPartners = pgTable(
  "agent_partners",
  {
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    // Lower-cased. The agent proved it by signing in with a link sent to it.
    email: text("email").notNull(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.email, t.partnerId] }), index("agent_partners_partner_idx").on(t.partnerId)]
);

/** One listing kept away from one partner, whatever the agent or office unlocks say. */
export const listingExclusions = pgTable(
  "listing_exclusions",
  {
    listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    byName: text("by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.listingId, t.partnerId] })]
);

// ---------------------------------------------------------------------------
// CRM sign-in and property databases
// ---------------------------------------------------------------------------

/** A Listgate user as the CRM knows them (from signing in with the CRM, or a signed link). */
export const crmIdentities = pgTable(
  "crm_identities",
  {
    sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    crmUserId: text("crm_user_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    email: text("email"),
    officeRef: text("office_ref"),
    role: text("role"),
    isPrincipal: boolean("is_principal").notNull().default(false),
    via: text("via").$type<"oauth" | "link">().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.crmUserId] }), index("crm_identities_user_idx").on(t.userId)]
);

/** One property from a CRM's database, normalised. No owner or contact details: there are no columns for them. */
export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    extId: text("ext_id").notNull(),
    // CRM user ids and/or emails of the agents the property is assigned to, lower-cased.
    agentRefs: jsonb("agent_refs").$type<string[]>().notNull().default([]),
    unitNumber: text("unit_number"),
    streetNumber: text("street_number"),
    street: text("street"),
    suburb: text("suburb"),
    state: text("state"),
    postcode: text("postcode"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    propertyType: text("property_type"),
    beds: integer("beds"),
    baths: integer("baths"),
    cars: integer("cars"),
    landArea: doublePrecision("land_area"),
    buildingArea: doublePrecision("building_area"),
    yearBuilt: integer("year_built"),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    lastSaleDate: text("last_sale_date"),
    lastSalePrice: integer("last_sale_price"),
    contentHash: text("content_hash").notNull(),
    version: integer("version").notNull().default(1),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("properties_agency_ext_unique").on(t.agencyId, t.extId), index("properties_agency_idx").on(t.agencyId)]
);

/** A property database upload. Processed in the background. */
export const propertyRuns = pgTable(
  "property_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    status: text("status").$type<"queued" | "running" | "done" | "failed" | "needs_mapping">().notNull().default("queued"),
    mode: text("mode").$type<"snapshot" | "delta">().notNull().default("delta"),
    fileName: text("file_name"),
    bytes: integer("bytes").notNull().default(0),
    rows: integer("rows").notNull().default(0),
    offices: integer("offices").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    unchanged: integer("unchanged").notNull().default(0),
    removed: integer("removed").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    error: text("error"),
    ms: integer("ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("property_runs_source_idx").on(t.sourceId, t.createdAt)]
);

/** An agent sharing the properties assigned to them with a partner. `ref` = CRM user id or email, lower-cased. */
export const agentPropertyPartners = pgTable(
  "agent_property_partners",
  {
    sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    ref: text("ref").notNull(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.ref, t.partnerId] })]
);

/** A principal sharing the whole office's property database with a partner. */
export const agencyPropertyPartners = pgTable(
  "agency_property_partners",
  {
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    approvedBy: text("approved_by"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.agencyId, t.partnerId] })]
);

/**
 * What each partner may see, kept up to date on every upload and every unlock change. The pull API reads changes from
 * here in `changedAt` order; `visible=false` tells the partner to delete the property.
 */
export const propertyShares = pgTable(
  "property_shares",
  {
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    visible: boolean("visible").notNull(),
    version: integer("version").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.partnerId, t.propertyId] }), index("property_shares_feed_idx").on(t.partnerId, t.changedAt, t.propertyId)]
);

export type DeliveryEvent = "listing.upserted" | "listing.removed" | "ping";

/** Outbox. A newer change to the same listing for the same partner replaces a delivery that hasn't gone yet. */
export const deliveries = pgTable(
  "deliveries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "cascade" }),
    event: text("event").$type<DeliveryEvent>().notNull(),
    listingVersion: integer("listing_version"),
    status: deliveryStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    // Claimed by a worker until this time, so two app instances don't send the same delivery.
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastStatus: integer("last_status"),
    lastError: text("last_error"),
    ms: integer("ms"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deliveries_due_idx").on(t.status, t.nextAttemptAt),
    index("deliveries_partner_time_idx").on(t.partnerId, t.createdAt),
    index("deliveries_listing_idx").on(t.listingId, t.partnerId),
  ]
);

// ---------------------------------------------------------------------------
// Admin: audit log, project list, tickets, wiki (same as Propchat and Dwellicious)
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(), // "agency.created", "partner.enabled"…
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "set null" }),
    data: jsonb("data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId), index("audit_log_agency_time_idx").on(t.agencyId, t.createdAt)]
);

/** "Sam" + "Lee" → "Sam Lee" (the full name the app shows). */
export const fullName = (first: string, last: string) => [first.trim(), last.trim()].filter(Boolean).join(" ");

// Admin project to-do list: setup and business tasks for running Listgate itself.
export const projectTasks = pgTable(
  "project_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    section: text("section").notNull().default("General"),
    title: text("title").notNull(),
    note: text("note"),
    link: text("link"),
    sort: integer("sort").notNull().default(0),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_tasks_open_idx").on(t.doneAt, t.sort)]
);

// Support tickets: agencies raise them from the app (Help), Listgate answers in admin.
export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved";
export type TicketKind = "problem" | "question" | "change" | "billing";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export const TICKET_STATUSES: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "New" },
  { value: "in_progress", label: "Working on it" },
  { value: "waiting", label: "Waiting on them" },
  { value: "resolved", label: "Resolved" },
];
export const TICKET_KINDS: { value: TicketKind; label: string }[] = [
  { value: "problem", label: "Something's not working" },
  { value: "question", label: "A question" },
  { value: "change", label: "A change or new feature" },
  { value: "billing", label: "Partners or data use" },
];
export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: bigserial("number", { mode: "number" }).notNull(),
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "set null" }),
    raisedByUserId: uuid("raised_by_user_id").references(() => users.id, { onDelete: "set null" }),
    raisedByName: text("raised_by_name").notNull(),
    raisedByEmail: text("raised_by_email").notNull(),
    kind: text("kind").$type<TicketKind>().notNull().default("problem"),
    subject: text("subject").notNull(),
    page: text("page"),
    status: text("status").$type<TicketStatus>().notNull().default("open"),
    priority: text("priority").$type<TicketPriority>().notNull().default("normal"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    description: text("description"),
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    dueOn: date("due_on", { mode: "string" }),
    rank: doublePrecision("rank").notNull().default(0),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex("tickets_number_unique").on(t.number), index("tickets_status_idx").on(t.status, t.lastActivityAt), index("tickets_agency_idx").on(t.agencyId)]
);
export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    fromStaff: boolean("from_staff").notNull().default(false),
    internal: boolean("internal").notNull().default(false),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ticket_messages_ticket_idx").on(t.ticketId, t.createdAt)]
);

// Wiki: pages are public at /help unless the page or a parent is internal. Partner API docs live here too.
export const wikiPages = pgTable(
  "wiki_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id"),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    emoji: text("emoji"),
    body: text("body").notNull().default(""),
    internal: boolean("internal").notNull().default(false),
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    sort: doublePrecision("sort").notNull().default(0),
    version: integer("version").notNull().default(1),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("wiki_pages_slug_unique").on(t.slug), index("wiki_pages_parent_idx").on(t.parentId, t.sort)]
);
export const wikiPageVersions = pgTable(
  "wiki_page_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    note: text("note"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("wiki_page_versions_unique").on(t.pageId, t.version)]
);
export const wikiComments = pgTable(
  "wiki_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wiki_comments_page_idx").on(t.pageId, t.createdAt)]
);
