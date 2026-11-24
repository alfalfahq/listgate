// Sessions, passwords and the signed-in user. Same approach as Propchat.
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { agencyMembers, getDb, hashToken, newToken, sessions, users } from "@listgate/db";

export const SESSION_COOKIE = "lg_session";
const SESSION_DAYS = 30;

function scryptAsync(pw: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pw.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string | null | undefined) {
  if (!stored?.startsWith("scrypt$")) return false;
  const [, salt, key] = stored.split("$");
  const expected = Buffer.from(key, "base64");
  const actual = await scryptAsync(pw, Buffer.from(salt, "base64"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function passwordProblem(pw: string) {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 200) return "That password is too long.";
  return null;
}

export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
export const normaliseEmail = (e: string) => e.trim().toLowerCase();

export function isPlatformAdmin(u: { email: string; isPlatformAdmin: boolean }) {
  if (u.isPlatformAdmin) return true;
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(u.email.toLowerCase());
}

/** Only call from a server action or route handler (it sets a cookie). */
export async function createSession(userId: string, opts: { impersonatorId?: string } = {}) {
  const raw = newToken();
  const db = await getDb();
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  // Admin "view as" sessions last an hour, are read-only, and don't count as the person signing in.
  const seconds = opts.impersonatorId ? 3600 : SESSION_DAYS * 86_400;
  await db.insert(sessions).values({
    tokenHash: hashToken(raw),
    userId,
    userAgent: ua,
    impersonatorId: opts.impersonatorId ?? null,
    expiresAt: new Date(Date.now() + seconds * 1000),
  });
  if (!opts.impersonatorId) await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  (await cookies()).set(SESSION_COOKIE, raw, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: seconds });
}

export async function destroySession() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(raw)));
  }
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = { id: string; email: string; name: string; admin: boolean; viewingAs: boolean; signedInAt: Date };

export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const db = await getDb();
  const [row] = await db
    .select({ user: users, impersonatorId: sessions.impersonatorId, createdAt: sessions.createdAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(raw)), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  const viewingAs = !!row.impersonatorId;
  return { id: row.user.id, email: row.user.email, name: row.user.name, admin: !viewingAs && isPlatformAdmin(row.user), viewingAs, signedInAt: row.createdAt };
});

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser(opts: { write?: boolean } = {}) {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Please sign in.");
  if (opts.write && u.viewingAs) throw new HttpError(403, "You're viewing as this person, so changes are switched off.");
  return u;
}

export async function requireAdmin() {
  const u = await requireUser({ write: true });
  if (!u.admin) throw new HttpError(403, "Listgate admins only.");
  return u;
}

export async function canAccessAgency(user: CurrentUser, agencyId: string) {
  if (user.admin) return true;
  const db = await getDb();
  const [m] = await db
    .select({ role: agencyMembers.role })
    .from(agencyMembers)
    .where(and(eq(agencyMembers.userId, user.id), eq(agencyMembers.agencyId, agencyId)));
  return !!m;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

export async function requireAgency(agencyId: string, opts: { write?: boolean } = {}) {
  const user = await requireUser(opts);
  if (!isUuid(agencyId) || !(await canAccessAgency(user, agencyId))) throw new HttpError(403, "No access to this agency.");
  return user;
}

/** Wraps a route handler so thrown HttpErrors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 500 });
    }
  };
}
