import { and, asc, eq } from "drizzle-orm";
import { agencies, agencyMembers, getDb, partners } from "@listgate/db";
import { HttpError, type CurrentUser } from "./auth";

export type Agency = typeof agencies.$inferSelect;

export async function getAgency(id: string) {
  const db = await getDb();
  const [a] = await db.select().from(agencies).where(eq(agencies.id, id));
  return a ?? null;
}

/** Agencies this person can open (all of them for Listgate staff). */
export async function agenciesFor(user: CurrentUser) {
  const db = await getDb();
  if (user.admin) return db.select({ agency: agencies, role: agencyMembers.role }).from(agencies).leftJoin(agencyMembers, and(eq(agencyMembers.agencyId, agencies.id), eq(agencyMembers.userId, user.id))).orderBy(asc(agencies.name));
  return db.select({ agency: agencies, role: agencyMembers.role }).from(agencyMembers).innerJoin(agencies, eq(agencies.id, agencyMembers.agencyId)).where(eq(agencyMembers.userId, user.id)).orderBy(asc(agencies.name));
}

export async function roleIn(user: CurrentUser, agencyId: string) {
  if (user.admin) return "owner" as const;
  const db = await getDb();
  const [m] = await db.select({ role: agencyMembers.role }).from(agencyMembers).where(and(eq(agencyMembers.userId, user.id), eq(agencyMembers.agencyId, agencyId)));
  return m?.role ?? null;
}

export async function requireOwner(user: CurrentUser, agencyId: string) {
  if ((await roleIn(user, agencyId)) !== "owner") throw new HttpError(403, "Only owners can change this.");
}

/** Partners agencies can choose from: active and listed. */
export async function listedPartners() {
  const db = await getDb();
  return db.select().from(partners).where(and(eq(partners.listed, true), eq(partners.active, true))).orderBy(asc(partners.sort), asc(partners.name));
}
