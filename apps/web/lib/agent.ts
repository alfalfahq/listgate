// Agents on a CRM-wide feed: which offices they belong to, what they can approve, and what they've unlocked.
// They're known by the email on their listings (email sign-in) and, when the CRM supports it, by a verified
// CRM identity (user id, office, role). With CRM sign-in switched on, only a verified principal approves a whole office.
import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  agencies,
  agencyPartners,
  agencyPropertyPartners,
  agentListings,
  agentPartners,
  agentProperties,
  agentPropertyPartners,
  agents,
  crmIdentities,
  getDb,
  listingExclusions,
  listings,
  partnersForListing,
  properties,
  sources,
  thumbsFor,
} from "@listgate/db";
import { ssoOn } from "./crm";

type Me = { id: string; email: string };
type Agency = typeof agencies.$inferSelect;
type Source = typeof sources.$inferSelect;

/** Everything one office needs to know about this user. */
async function standing(me: Me, agency: Agency, source: Source) {
  const db = await getDb();
  const ids = await db.select().from(crmIdentities).where(and(eq(crmIdentities.userId, me.id), eq(crmIdentities.sourceId, source.id)));
  const here = ids.filter((i) => i.officeRef && i.officeRef === agency.reaxmlAgentId);
  const email = me.email.toLowerCase();
  const refs = [...new Set([email, ...ids.map((i) => i.crmUserId.toLowerCase()), ...ids.map((i) => i.email ?? "").filter(Boolean)])];
  const [onListing] = await db.select({ id: agents.id }).from(agents).where(and(eq(agents.agencyId, agency.id), sql`lower(${agents.email}) = ${email}`)).limit(1);
  const verifiedMode = ssoOn(source) || !!source.linkSecret;
  const principal = here.some((i) => i.isPrincipal);
  return {
    refs,
    isAgent: !!onListing || here.length > 0,
    verified: here.length > 0,
    principal,
    verifiedMode,
    // With CRM sign-in on, whole-office approval needs a verified principal. Without it, a tick box.
    canApproveOffice: verifiedMode ? principal : !!onListing || here.length > 0,
    role: here[0]?.role ?? null,
  };
}
export type Standing = Awaited<ReturnType<typeof standing>>;

/** Offices this user can see: where their email is on a listing, or their CRM sign-in says they work. */
export async function agentOffices(me: Me) {
  const db = await getDb();
  const e = me.email.toLowerCase();
  const byEmail = await db
    .selectDistinct({ agency: agencies, source: sources })
    .from(agents)
    .innerJoin(agencies, eq(agencies.id, agents.agencyId))
    .innerJoin(sources, eq(sources.id, agencies.sourceId))
    .where(and(sql`lower(${agents.email}) = ${e}`, isNotNull(agencies.sourceId), isNull(agencies.suspendedAt)));
  const ids = await db.select().from(crmIdentities).where(and(eq(crmIdentities.userId, me.id), isNotNull(crmIdentities.officeRef)));
  const byCrm = ids.length
    ? await db
        .select({ agency: agencies, source: sources })
        .from(agencies)
        .innerJoin(sources, eq(sources.id, agencies.sourceId))
        .where(and(isNull(agencies.suspendedAt), or(...ids.map((i) => and(eq(agencies.sourceId, i.sourceId), eq(agencies.reaxmlAgentId, i.officeRef!))))))
    : [];
  const seen = new Set<string>();
  const rows = [...byEmail, ...byCrm].filter((r) => (seen.has(r.agency.id) ? false : (seen.add(r.agency.id), true))).sort((a, b) => a.source.name.localeCompare(b.source.name) || a.agency.name.localeCompare(b.agency.name));

  return Promise.all(
    rows.map(async ({ agency, source }) => {
      const st = await standing(me, agency, source);
      const mine = (await agentListings(db, source.id, e, { live: true })).filter((l) => l.agencyId === agency.id);
      const photoOf = (l: (typeof mine)[number]) => l.images.find((m) => !m.kind || m.kind === "photo")?.url ?? null;
      const thumbMap = await thumbsFor(db, mine.slice(0, 4).map(photoOf));
      const photos = Object.fromEntries(mine.slice(0, 4).map((l) => [l.id, thumbMap.get(photoOf(l) ?? "") ?? photoOf(l)]));
      const [{ n }] = await db.select({ n: count() }).from(listings).where(and(eq(listings.agencyId, agency.id), isNull(listings.removedAt)));
      const unlocks = await db.select().from(agentPartners).where(and(eq(agentPartners.sourceId, source.id), eq(agentPartners.email, e), eq(agentPartners.enabled, true)));
      const office = await db.select().from(agencyPartners).where(and(eq(agencyPartners.agencyId, agency.id), eq(agencyPartners.enabled, true)));
      const myProps = (await agentProperties(db, agency.id, st.refs)).length;
      const [{ n: propCount }] = await db.select({ n: count() }).from(properties).where(and(eq(properties.agencyId, agency.id), isNull(properties.removedAt)));
      const propMine = await db.select().from(agentPropertyPartners).where(and(eq(agentPropertyPartners.sourceId, source.id), inArray(agentPropertyPartners.ref, st.refs), eq(agentPropertyPartners.enabled, true)));
      const propOffice = await db.select().from(agencyPropertyPartners).where(and(eq(agencyPropertyPartners.agencyId, agency.id), eq(agencyPropertyPartners.enabled, true)));
      return {
        agency,
        source,
        standing: st,
        mine,
        photos,
        officeCount: n,
        mineOn: unlocks.map((u) => u.partnerId),
        officeOn: office.map((o) => ({ partnerId: o.partnerId, by: o.changedByName })),
        props: { mine: myProps, office: propCount, mineOn: [...new Set(propMine.map((p) => p.partnerId))], officeOn: propOffice.map((o) => ({ partnerId: o.partnerId, by: o.approvedBy })) },
      };
    })
  );
}
export type Office = Awaited<ReturnType<typeof agentOffices>>[number];

/** The office and this user's standing in it, or null if they have none. */
export async function officeFor(me: Me, agencyId: string) {
  const db = await getDb();
  const [row] = await db.select({ agency: agencies, source: sources }).from(agencies).innerJoin(sources, eq(sources.id, agencies.sourceId)).where(eq(agencies.id, agencyId));
  if (!row) return null;
  const st = await standing(me, row.agency, row.source);
  return st.isAgent ? { ...row, standing: st } : null;
}

/** This user's standing anywhere in a CRM source (for "my listings / my properties", which span offices). */
export async function sourceStanding(me: Me, sourceId: string) {
  const db = await getDb();
  const [s] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!s) return null;
  const ids = await db.select().from(crmIdentities).where(and(eq(crmIdentities.userId, me.id), eq(crmIdentities.sourceId, sourceId)));
  const e = me.email.toLowerCase();
  const [a] = await db.select({ id: agents.id }).from(agents).innerJoin(agencies, eq(agencies.id, agents.agencyId)).where(and(eq(agencies.sourceId, sourceId), sql`lower(${agents.email}) = ${e}`)).limit(1);
  if (!a && !ids.length) return null;
  return { source: s, refs: [...new Set([e, ...ids.map((i) => i.crmUserId.toLowerCase()), ...ids.map((i) => i.email ?? "").filter(Boolean)])] };
}

/**
 * Listings this user can keep away from partners: their own, or (verified principal) the whole office.
 * Each with the partners it goes to now and the ones it's kept from.
 */
export async function searchListings(me: Me, agencyId: string, q: string) {
  const o = await officeFor(me, agencyId);
  if (!o) return null;
  const db = await getDb();
  const e = me.email.toLowerCase();
  const text = q.trim();
  const match = text ? or(ilike(listings.street, `%${text}%`), ilike(listings.suburb, `%${text}%`), ilike(listings.headline, `%${text}%`), ilike(listings.extId, `%${text}%`), ilike(sql`concat_ws(' ', ${listings.unitNumber}, ${listings.streetNumber}, ${listings.street})`, `%${text}%`)) : undefined;
  const all = o.standing.principal;
  const rows = all
    ? await db.select().from(listings).where(and(eq(listings.agencyId, agencyId), isNull(listings.removedAt), match)).orderBy(asc(listings.suburb), asc(listings.street)).limit(25)
    : (await agentListings(db, o.source.id, e, { live: true })).filter((l) => l.agencyId === agencyId && (!text || [l.street, l.suburb, l.headline, l.extId, `${l.streetNumber ?? ""} ${l.street ?? ""}`].some((v) => v?.toLowerCase().includes(text.toLowerCase())))).slice(0, 25);
  const first = (l: (typeof rows)[number]) => l.images.find((m) => !m.kind || m.kind === "photo")?.url ?? null;
  const thumbs = await thumbsFor(db, rows.map(first));
  const ex = rows.length ? await db.select().from(listingExclusions).where(inArray(listingExclusions.listingId, rows.map((r) => r.id))) : [];
  return {
    scope: all ? ("office" as const) : ("mine" as const),
    rows: await Promise.all(
      rows.map(async (l) => ({
        id: l.id,
        address: [[l.unitNumber && l.streetNumber ? `${l.unitNumber}/${l.streetNumber}` : l.streetNumber, l.street].filter(Boolean).join(" "), l.suburb].filter(Boolean).join(", ") || l.headline || l.extId,
        photo: thumbs.get(first(l) ?? "") ?? first(l),
        status: l.status,
        kind: l.kind,
        goingTo: [...(await partnersForListing(db, l))],
        keptFrom: ex.filter((x) => x.listingId === l.id).map((x) => ({ partnerId: x.partnerId, by: x.byName })),
      }))
    ),
  };
}

/** May this user keep this listing away from partners? Their own listing, or a verified principal of the office. */
export async function canExclude(me: Me, listingId: string) {
  const db = await getDb();
  const [l] = await db.select().from(listings).where(eq(listings.id, listingId));
  if (!l) return null;
  const o = await officeFor(me, l.agencyId);
  if (!o) return null;
  if (o.standing.principal) return l;
  const me2 = await db.select({ extId: agents.extId }).from(agents).where(and(eq(agents.agencyId, l.agencyId), sql`lower(${agents.email}) = ${me.email.toLowerCase()}`));
  return me2.some((a) => l.agentExtIds.includes(a.extId)) ? l : null;
}
