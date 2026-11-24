import Link from "next/link";
import { and, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { agencies, fullAddress, getDb, listings } from "@listgate/db";
import { ago } from "@/lib/format";
import { PageHeader, Pill, SearchBox, StatusPill, TableCard, Tabs } from "@/app/kit";

export const dynamic = "force-dynamic";

export default async function Listings({ searchParams }: { searchParams: Promise<{ q?: string; agency?: string; show?: string }> }) {
  const { q, agency, show = "live" } = await searchParams;
  const where: SQL[] = [];
  if (show === "live") where.push(isNull(listings.removedAt));
  if (show === "removed") where.push(eq(listings.status, "withdrawn"));
  if (agency && /^[0-9a-f-]{36}$/i.test(agency)) where.push(eq(listings.agencyId, agency));
  if (q) where.push(or(ilike(listings.street, `%${q}%`), ilike(listings.suburb, `%${q}%`), ilike(listings.extId, `%${q}%`), ilike(listings.postcode, `${q}%`))!);
  const db = await getDb();
  const rows = await db
    .select({ l: listings, agency: agencies.name })
    .from(listings)
    .innerJoin(agencies, eq(agencies.id, listings.agencyId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(listings.updatedAt))
    .limit(200);
  const qs = (s: string) => `/listings?show=${s}${agency ? `&agency=${agency}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  return (
    <div className="space-y-6">
      <PageHeader icon="home2" title="Listings" sub="Every listing Listgate holds, most recently changed first (up to 200)." />
      <SearchBox action="/listings" q={q} placeholder="Street, suburb, postcode or ID">
        <input type="hidden" name="show" value={show} />
        {agency && <input type="hidden" name="agency" value={agency} />}
      </SearchBox>
      <Tabs label="Show" current={show} tabs={[{ key: "live", label: "Live", href: qs("live") }, { key: "all", label: "All", href: qs("all") }, { key: "removed", label: "Withdrawn", href: qs("removed") }]} />
      <TableCard empty={rows.length ? false : "No listings."}>
        <thead><tr><th>Property</th><th>Agency</th><th>Status</th><th>Price</th><th>Beds</th><th>Version</th><th>Updated</th></tr></thead>
        <tbody>
          {rows.map(({ l, agency: name }) => (
            <tr key={l.id}>
              <td><Link href={`/listings/${l.id}`} className="font-medium">{fullAddress(l) || l.extId}</Link>{!l.displayAddress && <> <Pill>Hidden address</Pill></>}<span className="block text-xs text-zinc-500">{l.extId} · {l.propertyType ?? l.category}</span></td>
              <td><Link href={`/agencies/${l.agencyId}`}>{name}</Link></td>
              <td><StatusPill status={l.status} /></td>
              <td className="text-sm">{l.priceText ?? "—"}</td>
              <td>{l.beds ?? "—"}</td>
              <td>v{l.version}</td>
              <td className="text-zinc-500">{ago(l.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}
