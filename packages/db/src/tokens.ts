// One-time tokens for magic links, invites and admin view-as. Only a SHA-256 of each
// token is stored; the raw token lives in the link we hand out.
import { createHash, randomBytes } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as s from "./schema";

type Db = NodePgDatabase<typeof s>;

export const newToken = () => randomBytes(32).toString("base64url");
/** Secret for a feed URL / FTP password (agencies and CRM sources share the endpoint). */
export const newFeedToken = () => randomBytes(24).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function createLoginToken(
  db: Db,
  opts: {
    purpose: "login" | "invite" | "impersonate";
    email?: string | null;
    userId?: string | null;
    agencyId?: string | null;
    agencyRole?: (typeof s.agencyRole.enumValues)[number] | null;
    invitedByUserId?: string | null;
    ttlHours?: number;
  }
) {
  const raw = newToken();
  await db.insert(s.loginTokens).values({
    tokenHash: hashToken(raw),
    purpose: opts.purpose,
    email: opts.email?.trim().toLowerCase() || null,
    userId: opts.userId ?? null,
    agencyId: opts.agencyId ?? null,
    agencyRole: opts.agencyRole ?? null,
    invitedByUserId: opts.invitedByUserId ?? null,
    expiresAt: new Date(Date.now() + (opts.ttlHours ?? (opts.purpose === "invite" ? 24 * 14 : 1)) * 3_600_000),
  });
  return raw;
}

export const inviteLink = (raw: string) => `${appUrl()}/join/${raw}`;
export const loginLink = (raw: string) => `${appUrl()}/auth/${raw}`;

export function initials(name: string) {
  const w = name.replace(/[^\p{L} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
