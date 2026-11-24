import { defineConfig } from "drizzle-kit";

// `npm run db:generate` diffs src/schema.ts against the existing migrations and
// writes a new SQL migration into ./migrations. It does not need a database.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
});
