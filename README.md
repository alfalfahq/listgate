# Listgate

The distribution layer behind property portals. Agency CRMs send Listgate the same REAXML they send to
realestate.com.au and Domain; Listgate keeps one clean copy of every listing and pushes it to the partners
each agency switches on (Stash, Propchat, Dwellicious, and anyone else we approve). Built the same way as
Propchat and Dwellicious.

## Layout

```
apps/web      listgate.com.au          homepage, agency app (/app), REAXML feed endpoint, partner API (/api/v1)
apps/admin    admin.listgate.com.au    Listgate staff admin (same accounts, ADMIN_EMAILS only)
apps/ftp      ftp.listgate.com.au      FTP receiver for CRMs that only export by FTP (own droplet)
packages/db   shared schema, migrations, and the core: REAXML parser, ingest, partner outbox
```

Data model: Agency → Listing + Agent (from its feed), FeedRun (every file received), AgencyPartner (which
partners it sends to). Partner → Delivery (outbox of pushes). Plus users, sessions, audit log, tickets, wiki,
project list, same as the other apps.

## How it works

**In.** Each agency has a feed token. The CRM adds Listgate as a portal and sends REAXML by
- HTTP: `POST https://listgate.com.au/api/feeds/reaxml/<token>` (raw XML or a multipart file), or
- FTP: `ftp.listgate.com.au`, username = agency slug, password = feed token.

Admin and agency owners can also upload a file by hand. Every file is logged in the feed log.

**Store.** `ingestFeed` parses the file, upserts agents and listings, and hashes each listing's content.
A resend with nothing changed is skipped; a change bumps the listing's `version`; `withdrawn`/`offmarket`
sets `removedAt`. Some CRMs send updates without photos, so existing photos are kept when a file has none.

**Out.** Every change is queued in `deliveries` for each partner the agency has switched on (a queued push
that hasn't gone yet is updated in place, so ten resends still mean one push). The web app runs the worker
every 15 seconds and straight after each feed. It POSTs JSON to the partner's webhook:

```
X-Listgate-Event: listing.upserted | listing.removed | ping
X-Listgate-Delivery: <id>
X-Listgate-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<body>" with the partner's signing secret>
```

2xx or 410 is done; anything else retries at 1, 2, 4, 8… minutes (max 6 hours) until the partner's
`maxAttempts`, then waits in admin under Deliveries → Gave up. Partners should compare `version` and ignore
older ones.

Partners can also pull with an API key (`Authorization: Bearer lg_live_…`):
- `GET /api/v1/listings?updatedSince=<ISO>&cursor=&limit=` — page until `nextCursor` is null
- `GET /api/v1/listings/<id>`, `GET /api/v1/agencies`, `GET /api/v1/me`

Partners only ever see agencies that switched them on. Switching on sends everything live; switching off
sends `listing.removed` for everything. Each partner can be limited to sale or rent, with or without
sold/leased results. Hidden addresses and prices are left out unless the partner is marked
**confidential** (data use only, e.g. Stash).

## Develop

```bash
npm install
npm run dev          # web on http://localhost:3000
npm run dev:admin    # admin on http://localhost:3001
npm test             # feed → listing → signed push, end to end against a throwaway database
```

Without `DATABASE_URL`, both use an embedded Postgres (PGlite) in `./.pglite` that migrates and seeds
itself: a demo agency (feed token `demo-feed-token-harper-and-vale`), the starter partners (paused), and a
local admin, `admin@listgate.local` / `listgate-dev`. Only one process can open PGlite at a time; to run web
and admin together, point both at a real Postgres. A sample feed is in `packages/db/fixtures/`.

```bash
curl -X POST --data-binary @packages/db/fixtures/sample-reaxml.xml -H 'content-type: application/xml' \
  http://localhost:3000/api/feeds/reaxml/demo-feed-token-harper-and-vale
```

## Database changes

1. Edit `packages/db/src/schema.ts`
2. `npm run db:generate` writes a new SQL migration to `packages/db/migrations`
3. Commit it. The `migrate` pre-deploy job applies it on the next deploy.

## Deploy

DigitalOcean App Platform (Sydney), spec in `.do/app.yaml`, same as Propchat and Dwellicious. Pushing to
`main` deploys: the `migrate` job runs first, then `web` and `admin`. The database is a new managed cluster
`listgate-db`.

One-time setup:
1. Create the app from `.do/app.yaml` (phase 1: app. and admin. subdomains), then set `SMTP_URL` and `FTP_RELAY_KEY` as encrypted env vars.
2. DNS for listgate.com.au (Netregistry, or move it to DigitalOcean): point `@`, `www`, `app` and `admin`
   at the app as App Platform shows. Re-create any email (MX) records first.
3. Resend: add `listgate.com.au`, add its DNS records, create a sending key for `SMTP_URL`.
4. Sign in: open https://listgate.com.au/login, choose "Email me a sign-in link" with the address in
   `ADMIN_EMAILS`, then set a password under Account. The same login works on admin.
5. Partners: in admin → Partners, set each one's webhook URL (or issue an API key), send a test ping,
   then mark it Active.
6. FTP (only once a CRM needs it): a $6 Ubuntu droplet in Sydney with Node 22,
   `git clone` this repo, `npm ci`, then run `npm start -w @listgate/ftp` under systemd with
   `APP_URL=https://listgate.com.au FTP_RELAY_KEY=<same> PASV_URL=<droplet IP>`. Open ports 21 and
   30000–30100. Point `ftp.listgate.com.au` at the droplet. Add `FTP_TLS_KEY`/`FTP_TLS_CERT` for FTPS.

### Replacing the old WordPress site

1. Snapshot the old Listgate droplet in DigitalOcean.
2. Point listgate.com.au at App Platform (step 2 above).
3. After a week with no issues, destroy the old droplet. The snapshot stays as the fallback.

## Next up

- Zip files over FTP (some CRMs bundle the XML)
- Copy photos to our own storage so partners aren't hot-linking CRM image URLs
- Per-partner usage reporting, for the "pay once you make money" model
