import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { agencies, agencyMembers, auditLog, getDb, users } from "@listgate/db";
import { actionLabel, ago, date } from "@/lib/format";
import { canSeeMoney, requireAdmin, isPlatformAdmin } from "@/lib/auth";
import { setAdminAccess, viewAs } from "@/app/actions";
import { ADMIN_ROLES } from "@listgate/db";
import { AgencyMark, Avatar, PageHeader, Pill, Section } from "@/app/kit";

export const dynamic = "force-dynamic";

export default async function Person({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const me = await requireAdmin();
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) notFound();
  const [biz, events] = await Promise.all([
    db
      .select({ a: agencies, role: agencyMembers.role })
      .from(agencyMembers)
      .innerJoin(agencies, eq(agencies.id, agencyMembers.agencyId))
      .where(eq(agencyMembers.userId, id))
      .orderBy(asc(agencies.name)),
    db.select().from(auditLog).where(eq(auditLog.actorUserId, id)).orderBy(desc(auditLog.createdAt)).limit(40),
  ]);

  return (
    <>
      <Link href="/users" className="text-sm text-zinc-500 hover:text-zinc-900">← Users</Link>
      <div className="mt-2">
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-3">
              <Avatar name={u.name} size="h-10 w-10 text-sm" />
              {u.name}
              {isPlatformAdmin(u) && <Pill tone="violet">{u.adminRole === "tech" && canSeeMoney(u) === false ? "Admin · Tech" : "Admin"}</Pill>}
              {!u.passwordHash && <Pill tone="amber">No password</Pill>}
            </span>
          }
          sub={[u.email, u.phone, `Joined ${date(u.createdAt)}`, `Last sign-in ${ago(u.lastLoginAt)}`].filter(Boolean).join(" · ")}
          actions={
            <>
              <a href={`mailto:${u.email}`} className="btn-secondary">Email</a>
              {u.phone && <a href={`tel:${u.phone.replace(/[^\d+]/g, "")}`} className="btn-secondary">Call</a>}
              {u.id !== me.id && <form action={viewAs}><input type="hidden" name="userId" value={u.id} /><button className="btn-secondary">View as</button></form>}
            </>
          }
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Activity">
            <div className="card divide-y divide-zinc-100">
              {events.length ? events.map((e) => (
                <div key={e.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm"><span>{actionLabel(e.action)}</span><span className="text-zinc-500">{ago(e.createdAt)}</span></div>
              )) : <p className="px-4 py-6 text-sm text-zinc-500">Nothing yet.</p>}
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          {canSeeMoney(me) && u.id !== me.id && (
            <Section title="Listgate admin access">
              <form action={setAdminAccess} key={`${u.isPlatformAdmin}|${u.adminRole}`} className="card space-y-3 p-4">
                <input type="hidden" name="userId" value={u.id} />
                <select name="access" defaultValue={!u.isPlatformAdmin ? "none" : u.adminRole} className="input w-full" aria-label="Admin access">
                  <option value="none">Not an admin</option>
                  {ADMIN_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}: {r.hint}</option>)}
                </select>
                <button className="btn-secondary w-full">Save</button>
                {(process.env.ADMIN_EMAILS ?? "").toLowerCase().split(",").map((e) => e.trim()).includes(u.email.toLowerCase()) && (
                  <p className="text-xs text-zinc-500">They&apos;re in ADMIN_EMAILS, so they always have full access.</p>
                )}
              </form>
            </Section>
          )}
          <Section title="Agencies">
            <div className="card divide-y divide-zinc-100">
              {biz.length ? (
                biz.map(({ a, role }) => (
                  <Link key={a.id} href={`/agencies/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                    <AgencyMark name={a.name} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.name}</span><span className="text-xs capitalize text-zinc-500">{role}</span></span>
                  </Link>
                ))
              ) : (
                <p className="px-4 py-6 text-sm text-zinc-500">Not part of an agency.</p>
              )}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
