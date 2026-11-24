// Admin people shared by tickets and the project list.
import { asc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, users } from "@listgate/db";

/** Listgate admins: people who can be assigned a ticket. */
export async function adminUsers() {
  const db = await getDb();
  const emails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(emails.length ? or(eq(users.isPlatformAdmin, true), inArray(sql`lower(${users.email})`, emails)) : eq(users.isPlatformAdmin, true))
    .orderBy(asc(users.name));
}
