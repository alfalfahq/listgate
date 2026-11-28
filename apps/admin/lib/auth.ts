// Admin sign-in uses the same Listgate accounts and passwords as the app.
// Only platform admins get in: users flagged in the database, or listed in ADMIN_EMAILS.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { auditLog, getDb, hashToken, newToken, sessions, users } from "@listgate/db";
import { clearFailures, clientIp, lockedFor, noteFailure } from "./throttle";

export const ADMIN_COOKIE = "lg_admin";
const HOURS = 12;

function scryptAsync(pw: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pw.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

async function verifyPassword(pw: string, stored: string | null | undefined) {
  if (!stored?.startsWith("scrypt$")) return false;
  const [, salt, key] = stored.split("$");
  const expected = Buffer.from(key, "base64");
  const actual = await scryptAsync(pw, Buffer.from(salt, "base64"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isPlatformAdmin(u: { email: string; isPlatformAdmin: boolean }) {
  if (u.isPlatformAdmin) return true;
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(u.email.toLowerCase());
}

/** Checks the email and password; on success starts a 12-hour admin session. Returns false otherwise. */
export async function signIn(email: string, password: string) {
  const byEmail = `admin:${email.trim().toLowerCase()}`;
  const byIp = `admin-ip:${await clientIp()}`;
  if (lockedFor(byEmail, 5) || lockedFor(byIp, 20)) {
    await new Promise((r) => setTimeout(r, 600));
    return false;
  }
  const db = await getDb();
  const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`).limit(1);
  const ok = !!u && (await verifyPassword(password, u.passwordHash)) && isPlatformAdmin(u);
  if (!ok) {
    noteFailure(byEmail);
    noteFailure(byIp);
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return false;
  }
  clearFailures(byEmail);
  const raw = newToken();
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db.insert(sessions).values({ tokenHash: hashToken(raw), userId: u.id, userAgent: `admin · ${ua ?? ""}`.slice(0, 300), expiresAt: new Date(Date.now() + HOURS * 3_600_000) });
  await db.insert(auditLog).values({ actorUserId: u.id, actorLabel: u.name, action: "admin.signed_in", entityType: "user", entityId: u.id });
  (await cookies()).set(ADMIN_COOKIE, raw, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: HOURS * 3600 });
  return true;
}

export async function signOut() {
  const jar = await cookies();
  const raw = jar.get(ADMIN_COOKIE)?.value;
  if (raw) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(raw)));
  }
  jar.delete(ADMIN_COOKIE);
}

export const getAdmin = cache(async () => {
  const raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!raw) return null;
  const db = await getDb();
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(raw)), gt(sessions.expiresAt, new Date())));
  // Still checked every request, so removing someone from ADMIN_EMAILS locks them out at once.
  return row && isPlatformAdmin(row.user) ? row.user : null;
});

export async function requireAdmin() {
  const u = await getAdmin();
  if (!u) redirect("/login");
  return u;
}

/** People in ADMIN_EMAILS are always full admins; anyone else follows their admin role. */
export function canSeeMoney(u: { email: string; adminRole: string }) {
  const owners = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return owners.includes(u.email.toLowerCase()) || u.adminRole !== "tech";
}

/** For money pages (marketing, revenue, AI costs, credits): tech admins are sent to the overview. */
export async function requireMoney() {
  const u = await requireAdmin();
  if (!canSeeMoney(u)) redirect("/?denied=money");
  return u;
}
