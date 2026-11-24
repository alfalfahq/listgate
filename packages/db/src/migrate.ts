// Applies pending migrations. Runs before each deploy (App Platform pre-deploy job)
// and via `npm run db:migrate`.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { getDb, migrationsFolder, pgConfig } from "./index";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // PGlite migrates itself when opened.
    await getDb();
    console.log("Local PGlite database is migrated.");
    process.exit(0);
  }
  const pool = new Pool({ ...pgConfig(url), max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: migrationsFolder() });
  await pool.end();
  console.log("Migrations applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
