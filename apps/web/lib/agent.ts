// Agents on a CRM-wide feed: which offices their email appears in, and what they've unlocked.
import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { agencies, agencyPartners, agentListings, agentPartners, agents, getDb, listings, sources } from "@listgate/db";

export type Office = Awaited<ReturnType<typeof agentOffices>>[number];

/** Offices (agencies from a CRM-wide feed) where this email is a listing agent, with their listings and unlocks. */
export async function agentOffices(email: string) {
  const db = await getDb();
  const e = email.trim().toLowerCase();
  const rows = await db
    .selectDistinct({ agency: agencies, source: sources })
    .from(agents)
    .innerJoin(agencies, eq(agencies.id, agents.agencyId))
    .innerJoin(sources, eq(sources.id, agencies.sourceId))
    .where(and(sql`lower(${agents.email}) = ${e}`, isNotNull(agencies.sourceId), isNull(agencies.suspendedAt)))
    .orderBy(asc(sources.name), asc(agencies.name));
  return Promise.all(
    rows.map(async ({ agency, source }) => {
      const mine = (await agentListings(db, source.id, e, { live: true })).filter((l) => l.agencyId === agency.id);
      const [{ n }] = await db.select({ n: count() }).from(listings).where(and(eq(listings.agencyId, agency.id), isNull(listings.removedAt)));
      const unlocks = await db.select().from(agentPartners).where(and(eq(agentPartners.sourceId, source.id), eq(agentPartners.email, e), eq(agentPartners.enabled, true)));
      const office = await db.select().from(agencyPartners).where(and(eq(agencyPartners.agencyId, agency.id), eq(agencyPartners.enabled, true)));
      return { agency, source, mine, officeCount: n, mineOn: unlocks.map((u) => u.partnerId), officeOn: office.map((o) => ({ partnerId: o.partnerId, by: o.changedByName, at: o.updatedAt })) };
    })
  );
}

/** True if this email is a listing agent at the agency (and the agency came from a CRM-wide feed). Locked offices aren't checked here. */
export async function isAgentAt(email: string, agencyId: string) {
  const db = await getDb();
  const [a] = await db
    .select({ id: agents.id })
    .from(agents)
    .innerJoin(agencies, eq(agencies.id, agents.agencyId))
    .where(and(eq(agents.agencyId, agencyId), sql`lower(${agents.email}) = ${email.trim().toLowerCase()}`, isNotNull(agencies.sourceId)))
    .limit(1);
  return !!a;
}

/** True if this email is a listing agent anywhere in this CRM source. */
export async function isAgentInSource(email: string, sourceId: string) {
  const db = await getDb();
  const [a] = await db
    .select({ id: agents.id })
    .from(agents)
    .innerJoin(agencies, eq(agencies.id, agents.agencyId))
    .where(and(eq(agencies.sourceId, sourceId), sql`lower(${agents.email}) = ${email.trim().toLowerCase()}`))
    .limit(1);
  return !!a;
}
