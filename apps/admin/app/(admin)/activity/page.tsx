import Link from "next/link";
import { desc, eq, ilike, or } from "drizzle-orm";
import { agencies, auditLog, getDb } from "@listgate/db";
import { actionLabel, ago, date } from "@/lib/format";
import { AgencyMark, Avatar, PageHeader, SearchBox, TableCard } from "@/app/kit";

export const dynamic = "force-dynamic";

export default async function Activity({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const db = await getDb();
  const rows = await db
    .select({ l: auditLog, agency: agencies.name, agencyId: agencies.id })
    .from(auditLog)
    .leftJoin(agencies, eq(agencies.id, auditLog.agencyId))
    .where(q ? or(ilike(auditLog.action, `%${q}%`), ilike(auditLog.actorLabel, `%${q}%`), ilike(agencies.name, `%${q}%`)) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(300);

  return (
    <>
      <PageHeader icon="pulse" title="Activity" sub="The audit log: sign-ins, builds, deploys, invites, credits and more, newest first." />
      <div className="mt-5">
        <SearchBox action="/activity" q={q} placeholder="Search person, action or agency" />
      </div>
      <div className="mt-4">
        <TableCard empty={!rows.length && "Nothing logged yet."}>
          <thead><tr><th>Who</th><th>What</th><th>Agency</th><th>Details</th><th className="num">When</th></tr></thead>
          <tbody>
            {rows.map(({ l, agency, agencyId }) => (
              <tr key={l.id}>
                <td><span className="flex items-center gap-2.5"><Avatar name={l.actorLabel} size="h-7 w-7 text-[10px]" /><span className="font-medium">{l.actorLabel}</span></span></td>
                <td>{actionLabel(l.action)}</td>
                <td>
                  {agency && agencyId ? (
                    <Link href={`/agencies/${agencyId}`} className="flex items-center gap-2 hover:underline"><AgencyMark name={agency} size="h-6 w-6 text-[10px]" />{agency}</Link>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="max-w-xs truncate text-xs text-zinc-500" title={l.data ? JSON.stringify(l.data) : undefined}>{l.data ? summarise(l.data) : l.entityType}</td>
                <td className="num whitespace-nowrap text-zinc-500" title={date(l.createdAt)}>{ago(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </div>
    </>
  );
}

function summarise(d: unknown) {
  if (!d || typeof d !== "object") return "";
  return Object.entries(d as Record<string, unknown>)
    .filter(([k]) => !/id$/i.test(k))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ");
}
