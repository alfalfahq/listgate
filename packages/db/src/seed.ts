// Inserts the demo agency if the database has no agencies yet. Safe to re-run.
import { seedDemo } from "./demo";
import { getDb } from "./index";

async function main() {
  const db = await getDb();
  const created = await seedDemo(db);
  console.log(created ? "Demo agency created." : "Database already has data; nothing seeded.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
