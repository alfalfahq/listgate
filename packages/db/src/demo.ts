// First-run data. Safe to re-run on every deploy.
// - Platform admins: every address in ADMIN_EMAILS gets a user (no password; they sign in with an
//   emailed link, then set a password). Locally, admin@listgate.local / listgate-dev.
// - Partners: Stash, Propchat and Dwellicious are created (paused, no webhook) if missing.
// - Demo agency with a few listings: only locally (no DATABASE_URL) or when SEED_DEMO=1.
import { randomBytes, scryptSync } from "node:crypto";
import { count } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as s from "./schema";

type Db = NodePgDatabase<typeof s>;

function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = scryptSync(pw.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

const secret = (p: string) => `${p}_${randomBytes(24).toString("base64url")}`;

export const STARTER_PARTNERS = [
  { slug: "stash", name: "Stash Property", website: "https://stashproperty.com.au", description: "Property data and research for agents, buyer's agents and brokers.", confidential: true, sort: 10 },
  { slug: "propchat", name: "Propchat", website: "https://propchat.com.au", description: "Listing channels for agents, vendors and buyers.", confidential: false, sort: 20 },
  { slug: "dwellicious", name: "Dwellicious", website: "https://dwellicious.com.au", description: "Agency websites. Your listings show on your Dwellicious site.", confidential: false, sort: 30 },
];

export async function seedDemo(db: Db): Promise<boolean> {
  const local = !process.env.DATABASE_URL;

  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (local) admins.push("admin@listgate.local");
  for (const email of admins) {
    await db
      .insert(s.users)
      .values({
        email,
        name: email === "admin@listgate.local" ? "Local admin" : email.split("@")[0],
        isPlatformAdmin: true,
        passwordHash: email === "admin@listgate.local" ? hashPassword("listgate-dev") : null,
      })
      .onConflictDoNothing();
  }

  for (const p of STARTER_PARTNERS) {
    await db.insert(s.partners).values({ ...p, signingSecret: secret("whsec"), active: false }).onConflictDoNothing();
  }

  if (!local && process.env.SEED_DEMO !== "1") return false;
  const [{ n }] = await db.select({ n: count() }).from(s.agencies);
  if (n > 0) return false;

  await db.insert(s.agencies).values({
    name: "Harper & Vale (demo)",
    slug: "harper-and-vale",
    initials: "HV",
    crm: "VaultRE",
    suburb: "New Farm",
    state: "QLD",
    feedToken: "demo-feed-token-harper-and-vale",
    authorisedAt: new Date(),
    authorisedBy: "Local admin",
  });
  return true;
}
