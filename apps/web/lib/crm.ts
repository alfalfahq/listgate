// Signing agents in with their CRM (OAuth 2.0 authorization code), or from a signed link inside the CRM.
// Either way we learn the agent's CRM user id, email, office and role, and remember it as a crm_identities row.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { crmIdentities, getDb, sources, users } from "@listgate/db";
import { audit } from "./audit";
import { createSession, currentUser, isPlatformAdmin } from "./auth";
import { config } from "./config";

type Source = typeof sources.$inferSelect;
export const ssoOn = (s: Pick<Source, "sso">) => !!(s.sso?.enabled && s.sso.clientId && s.sso.authorizeUrl && s.sso.tokenUrl && s.sso.userinfoUrl);
export const redirectUri = (slug: string) => `${config.appUrl}/api/crm-auth/${slug}/callback`;

/** "data.user.email" → value. */
export function pick(o: unknown, path?: string): string | null {
  if (!path) return null;
  const v = path.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined), o);
  return v == null || typeof v === "object" ? null : String(v).trim() || null;
}

export async function sourceBySlug(slug: string) {
  const db = await getDb();
  const [s] = await db.select().from(sources).where(eq(sources.slug, slug));
  return s ?? null;
}

const STATE_COOKIE = "lg_crm_state";

export async function startUrl(s: Source) {
  const state = randomBytes(18).toString("base64url");
  (await cookies()).set(STATE_COOKIE, `${s.slug}.${state}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  const u = new URL(s.sso!.authorizeUrl!);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", s.sso!.clientId!);
  u.searchParams.set("redirect_uri", redirectUri(s.slug));
  u.searchParams.set("state", state);
  if (s.sso!.scope) u.searchParams.set("scope", s.sso!.scope);
  return u.toString();
}

export type CrmUser = { id: string; email: string | null; name: string | null; office: string | null; role: string | null };

/** Code → token → userinfo. Throws with a message fit to show the agent. */
export async function finishOAuth(s: Source, code: string, state: string): Promise<CrmUser> {
  const jar = await cookies();
  const want = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!want || want !== `${s.slug}.${state}`) throw new Error("That sign-in link expired. Start again.");
  const sso = s.sso!;
  const tok = await fetch(sso.tokenUrl!, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", authorization: `Basic ${Buffer.from(`${sso.clientId}:${sso.clientSecret ?? ""}`).toString("base64")}` },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(s.slug), client_id: sso.clientId!, ...(sso.clientSecret ? { client_secret: sso.clientSecret } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  const tj = (await tok.json().catch(() => ({}))) as { access_token?: string };
  if (!tok.ok || !tj.access_token) throw new Error(`${s.name} didn't accept the sign-in (${tok.status}).`);
  const ui = await fetch(sso.userinfoUrl!, { headers: { authorization: `Bearer ${tj.access_token}`, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  const info = await ui.json().catch(() => null);
  if (!ui.ok || !info) throw new Error(`Couldn't read your details from ${s.name} (${ui.status}).`);
  const id = pick(info, sso.idPath || "id") ?? pick(info, "sub");
  if (!id) throw new Error(`${s.name} didn't say who you are.`);
  return { id, email: pick(info, sso.emailPath || "email")?.toLowerCase() ?? null, name: pick(info, sso.namePath || "name"), office: pick(info, sso.officePath || "office_id"), role: pick(info, sso.rolePath || "role") };
}

/**
 * Signed link from inside the CRM:
 *   /crm/<slug>/link?uid=&email=&name=&office=&role=&t=<unix secs>&sig=<hex HMAC-SHA256>
 * sig signs "uid|email|office|role|t" (empty string for a missing value) with the source's link secret. Valid 5 minutes.
 */
export function verifyLink(s: Source, q: URLSearchParams): CrmUser {
  if (!s.linkSecret) throw new Error("Signed links aren't set up for this CRM.");
  const f = (k: string) => (q.get(k) ?? "").trim();
  const t = Number(f("t"));
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) throw new Error("This link has expired. Open it again from your CRM.");
  const want = createHmac("sha256", s.linkSecret).update([f("uid"), f("email"), f("office"), f("role"), f("t")].join("|")).digest();
  const got = Buffer.from(f("sig"), "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new Error("This link isn't valid. Open it again from your CRM.");
  if (!f("uid")) throw new Error("The link didn't say who you are.");
  return { id: f("uid"), email: f("email").toLowerCase() || null, name: f("name") || null, office: f("office") || null, role: f("role") || null };
}

export const isPrincipalRole = (s: Source, role: string | null) => {
  const list = (s.sso?.principalRoles || "principal,admin,office admin,owner,director").split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
  return !!role && list.includes(role.toLowerCase());
};

/**
 * Finds or creates the Listgate user, remembers the CRM identity, signs them in.
 *
 * The CRM decides what email it reports, and a CRM user can often edit their own. So a CRM identity is
 * only ever attached to an existing Listgate account when that person is already signed in to it here
 * (they've proved they own it). Otherwise a new CRM identity can only create a brand-new account.
 * Platform admins never sign in through a CRM.
 */
export async function signInCrmUser(s: Source, u: CrmUser, via: "oauth" | "link") {
  const db = await getDb();
  const [known] = await db.select().from(crmIdentities).where(and(eq(crmIdentities.sourceId, s.id), eq(crmIdentities.crmUserId, u.id)));
  let userId = known?.userId;
  if (!userId) {
    if (!u.email) throw new Error(`${s.name} didn't give us your email, so we can't set up your Listgate login.`);
    const [row] = await db.select().from(users).where(sql`lower(${users.email}) = ${u.email}`).limit(1);
    if (row) {
      const me = await currentUser();
      if (!me || me.viewingAs || me.id !== row.id) {
        throw new Error(`There's already a Listgate account for ${u.email}. Sign in to Listgate first, then open this from ${s.name} again to connect it.`);
      }
      userId = row.id;
      await audit({ actor: { id: row.id, name: row.name }, action: "agent.crm_linked", entityType: "user", entityId: row.id, data: { via: s.name } });
    } else {
      const name = u.name || u.email.split("@")[0];
      const [created] = await db.insert(users).values({ email: u.email, name, firstName: name.split(" ")[0] }).returning();
      await audit({ actor: { id: created.id, name: created.name }, action: "agent.joined", entityType: "user", entityId: created.id, data: { via: s.name } });
      userId = created.id;
    }
  }
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target || isPlatformAdmin(target)) throw new Error("This account can't sign in through a CRM. Sign in to Listgate with your password.");
  const values = { email: u.email, officeRef: u.office, role: u.role, isPrincipal: isPrincipalRole(s, u.role), via, lastSeenAt: new Date(), updatedAt: new Date() };
  await db.insert(crmIdentities).values({ sourceId: s.id, crmUserId: u.id, userId, ...values }).onConflictDoUpdate({ target: [crmIdentities.sourceId, crmIdentities.crmUserId], set: values });
  await createSession(userId);
}
