import { desc, eq, ilike, or, sql } from "drizzle-orm";
import Link from "next/link";
import { agencies, agencyMembers, getDb, users } from "@listgate/db";
import { ago, date } from "@/lib/format";
import { Avatar, PageHeader, Pill, SearchBox, TableCard, Tabs } from "@/app/kit";
import { viewAs } from "@/app/actions";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const { q = "", show = "all" } = await searchParams;
  const me = await requireAdmin();
  const db = await getDb();
  const staffOf = db
    .select({
      userId: agencyMembers.userId,
      list: sql<string>`string_agg(${agencies.name} || '|' || ${agencies.id} || '|' || ${agencyMembers.role}, ';;' order by ${agencies.name})`.as("list"),
    })
    .from(agencyMembers)
    .innerJoin(agencies, eq(agencies.id, agencyMembers.agencyId))
    .groupBy(agencyMembers.userId)
    .as("s");
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const search = q ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined;
  const all = await db
    .select({ u: users, staff: staffOf.list })
    .from(users)
    .leftJoin(staffOf, eq(staffOf.userId, users.id))
    .where(search)
    .orderBy(desc(users.createdAt))
    .limit(500);
  const isAdmin = (r: (typeof all)[number]) => r.u.isPlatformAdmin || adminEmails.includes(r.u.email.toLowerCase());
  const rows = all.filter((r) => (show === "staff" ? !!r.staff : show === "admins" ? isAdmin(r) : true));
  const qs = (s: string) => `/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(s !== "all" ? { show: s } : {}) })}`;

  return (
    <>
      <PageHeader icon="users" title="Users" sub={`${rows.length} ${rows.length === 1 ? "person" : "people"}${q ? ` matching "${q}"` : ""}`} />
      <Tabs
        label="Filter users"
        current={show}
        tabs={[
          { key: "all", label: `All · ${all.length}`, href: qs("all") },
          { key: "staff", label: `Agency people · ${all.filter((r) => r.staff).length}`, href: qs("staff") },
          { key: "admins", label: "Listgate admins", href: qs("admins") },
        ]}
      />
      <div className="mt-5">
        <SearchBox action="/users" q={q} placeholder="Search name or email">
          {show !== "all" && <input type="hidden" name="show" value={show} />}
        </SearchBox>
      </div>
      <div className="mt-4">
        <TableCard empty={!rows.length && "No one found."}>
          <thead><tr><th>Person</th><th>Agencies</th><th>Joined</th><th className="num">Last sign-in</th><th /></tr></thead>
          <tbody>
            {rows.map(({ u, staff }) => (
              <tr key={u.id}>
                <td>
                  <span className="flex items-center gap-3">
                    <Avatar name={u.name} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-medium"><Link href={`/users/${u.id}`} className="hover:underline">{u.name}</Link>{(u.isPlatformAdmin || adminEmails.includes(u.email.toLowerCase())) && <Pill tone="violet">Admin</Pill>}{!u.passwordHash && <Pill tone="amber">No password</Pill>}</span>
                      <span className="block truncate text-xs text-zinc-500">{u.email}</span>
                    </span>
                  </span>
                </td>
                <td>
                  <span className="flex flex-wrap gap-1.5">
                    {(staff ?? "").split(";;").filter(Boolean).map((s) => {
                      const [name, id, role] = s.split("|");
                      return (
                        <Link key={id} href={`/agencies/${id}`} className="pill bg-zinc-100 text-zinc-700 hover:bg-zinc-200">
                          {name} <span className="ml-1 text-zinc-400">{role}</span>
                        </Link>
                      );
                    })}
                    {!staff && <span className="text-zinc-400">—</span>}
                  </span>
                </td>
                <td className="text-zinc-500">{date(u.createdAt)}</td>
                <td className="num text-zinc-500">{u.lastLoginAt ? ago(u.lastLoginAt) : "Not yet"}</td>
                <td className="text-right">
                  {u.id !== me.id && (
                    <form action={viewAs}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button className="btn-secondary h-8 min-h-0 whitespace-nowrap px-2.5 text-xs" title={`Open the app as ${u.name} for an hour, look only`}>View as</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </div>
    </>
  );
}