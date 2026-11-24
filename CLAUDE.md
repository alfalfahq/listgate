# Working on Listgate

- Same structure as Propchat and Dwellicious: npm workspaces `apps/web`, `apps/admin`, `packages/db` (Postgres + Drizzle,
  PGlite locally), plus `apps/ftp` (the FTP receiver, runs on its own droplet). Next.js 15 App Router, TypeScript, Tailwind v3.
- Schema changes: edit `packages/db/src/schema.ts`, run `npm run db:generate`, commit the migration.
- The core path lives in `packages/db/src` so web, admin and scripts share it:
  `reaxml.ts` (parse) → `ingest.ts` (store, hash, version) → `outbox.ts` (queue, sign, push, retry) and `payload.ts` (what partners get).
- `payload.ts` is a contract with partners. Add fields freely; never rename or remove one without bumping `PAYLOAD_VERSION`
  and telling partners. Respect `displayAddress`/`priceDisplay`: only `confidential` partners get hidden values.
- Every listing change must go through `ingestFeed` (or `enqueue`) so partners hear about it. Don't update `listings` directly.
- Write actions in the web app use `requireAgency(..., { write: true })` so admin view-as stays read-only.
  Log meaningful actions with `audit()`; they show in admin Activity.
- Email goes through Resend SMTP (`SMTP_URL`, `EMAIL_FROM`), same as Propchat.
- Brand: navy `#0D2D4F`, cyan `#2AC4EA` (navy text on cyan, never white), teal `#0E7C99`, ink `#262E3B`,
  Manrope, pill buttons. Admin mirrors Propchat's admin with the navy sidebar.
- Never scrape portals. Listings only come from REAXML feeds the agency authorises.
- Checks before pushing: `npm test && npm run typecheck && npm run build`.
