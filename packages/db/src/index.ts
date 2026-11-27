// Database client shared by the web app, the admin app and scripts.
//
// - DATABASE_URL set   → node-postgres pool (DigitalOcean managed Postgres in prod).
// - DATABASE_URL unset → PGlite, an embedded Postgres stored in <repo>/.pglite.
//   It migrates and seeds itself on first use, so local dev needs no setup.
//   Only one process can open it at a time (run web OR admin locally, not both,
//   or point both at a real Postgres).

import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

export * from "./schema";
export * from "./tokens";
export * from "./reaxml";
export * from "./payload";
export * from "./outbox";
export * from "./ingest";
export * from "./properties";
export * from "./media";
export { schema };

export type Db = NodePgDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __listgate_db: Promise<Db> | undefined;
}

/** Repo root: the nearest parent folder that contains packages/db. */
export function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "packages", "db", "migrations"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

export const migrationsFolder = () => path.join(repoRoot(), "packages", "db", "migrations");

export function pgConfig(url: string): PoolConfig {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // Strip sslmode: recent `pg` treats sslmode=require as verify-full, which
  // overrides the ssl option below. TLS is configured explicitly instead.
  let connectionString = url;
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    connectionString = u.toString();
  } catch {
    /* not a URL — use as-is */
  }
  const ca = process.env.DATABASE_CA_CERT;
  return {
    connectionString,
    // With DigitalOcean's CA (App Platform provides it as ${db.CA_CERT}) verify the
    // server; without it, still encrypt but accept the managed cluster's cert.
    ssl: local ? undefined : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  };
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    return drizzlePg(new Pool(pgConfig(url)), { schema });
  }

  // Local development: embedded Postgres.
  const [{ PGlite }, { drizzle: drizzleLite }, { migrate }, { seedDemo }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
    import("./demo"),
  ]);
  const dir = process.env.PGLITE_DIR ?? path.join(repoRoot(), ".pglite");
  const client = new PGlite(dir);
  const db = drizzleLite(client, { schema });
  await migrate(db, { migrationsFolder: migrationsFolder() });
  // The pglite and node-postgres drivers share the same query-builder API.
  const typed = db as unknown as Db;
  await seedDemo(typed);
  return typed;
}

export function getDb(): Promise<Db> {
  if (!globalThis.__listgate_db) {
    globalThis.__listgate_db = connect().catch((err) => {
      globalThis.__listgate_db = undefined;
      throw err;
    });
  }
  return globalThis.__listgate_db;
}
