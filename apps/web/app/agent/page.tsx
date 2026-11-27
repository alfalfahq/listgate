import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { fullAddress, getDb, partners as partnersT, sources } from "@listgate/db";
import { AgentSignIn, ListingSearch, OfficeUnlocks } from "@/components/AgentParts";
import { SignOutButton } from "@/components/AuthForms";
import { Logo } from "@/components/Logo";
import { agentOffices } from "@/lib/agent";
import { listedPartners } from "@/lib/agency";
import { currentUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { ssoOn } from "@/lib/crm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unlock your listings · Listgate" };

const STATUS: Record<string, string> = { current: "For sale", under_offer: "Under offer", sold: "Sold", leased: "Leased" };

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <h3 className="font-bold text-navy">{title}</h3>
      {hint && <p className="mb-3 mt-0.5 text-sm text-slate-600">{hint}</p>}
      {children}
    </div>
  );
}

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await currentUser();
  const { error } = await searchParams;
  const db = await getDb();
  const crmSignIns = (await db.select().from(sources).orderBy(asc(sources.name))).filter(ssoOn);
  const header = (
    <header className="bg-navy">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
        <Link href="/" aria-label="Listgate home"><Logo height={26} white /></Link>
        <span className="flex-1" />
        {me && <SignOutButton className="text-sm font-semibold text-white/80" />}
      </div>
    </header>
  );
  const err = error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>;
  const crmButtons = crmSignIns.map((s) => (
    <a key={s.id} href={`/api/crm-auth/${s.slug}/start`} className="btn-navy block py-3 text-center">{s.sso?.label || `Sign in with ${s.name}`}</a>
  ));

  if (!me) {
    return (
      <>
        {header}
        <main className="mx-auto max-w-md px-4 py-14">
          <h1 className="text-2xl font-bold text-navy">Unlock your listings</h1>
          <p className="mt-2 text-slate-600">Your CRM sends your listings to Listgate, but nothing goes anywhere until you choose. Sign in to pick where they go.</p>
          <div className="card mt-6 flex flex-col gap-4 p-5">
            {err}
            {crmButtons}
            {crmButtons.length > 0 && <p className="text-center text-xs text-slate-500">or with the email on your listings</p>}
            <AgentSignIn />
          </div>
        </main>
      </>
    );
  }

  const [offices, listed, propPartners] = await Promise.all([
    agentOffices(me),
    listedPartners(),
    db.select().from(partnersT).where(and(eq(partnersT.listed, true), eq(partnersT.active, true), eq(partnersT.acceptsProperties, true))).orderBy(asc(partnersT.sort)),
  ]);
  const tiles = listed.map((p) => ({ id: p.id, name: p.name, description: p.description }));
  const propTiles = propPartners.map((p) => ({ id: p.id, name: p.name, description: p.description }));
  return (
    <>
      {header}
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
        <div>
          <h1 className="text-2xl font-bold text-navy">Your listings</h1>
          <p className="mt-1 text-slate-600">Signed in as {me.email}. Choose which partners get your listings and properties, or approve the whole office if you&apos;re a principal.</p>
        </div>
        {err}
        {!offices.length && (
          <section className="card flex flex-col gap-3 p-6">
            <p className="font-semibold text-navy">No listings with {me.email} yet.</p>
            <p className="text-sm text-slate-600">Your CRM needs to send Listgate listings with this email as the listing agent. If your CRM offers it, sign in with it instead.</p>
            {crmButtons}
          </section>
        )}
        {offices.map((o) => {
          const st = o.standing;
          const approve = st.verifiedMode ? (st.principal ? "verified" : "no") : "tick";
          const locked = o.agency.agentsLockedAt ? o.agency.agentsLockedReason || "yes" : null;
          const verifyBtn = st.verifiedMode && !st.verified && ssoOn(o.source);
          return (
            <section key={o.agency.id} className="card p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-teal">{o.source.name}</p>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="text-lg font-bold text-navy">{o.agency.name}</h2>
                {st.verified && <span className="rounded-full bg-sky px-2.5 py-0.5 text-xs font-semibold text-navy">Verified by {o.source.name}{st.role ? ` · ${st.role}` : ""}</span>}
              </div>
              <p className="text-sm text-slate-600">{o.mine.length} of your listings · {o.officeCount} in the office{o.props.office ? ` · ${o.props.office} properties in the office database` : ""}</p>
              {verifyBtn && (
                <p className="mt-2 text-sm">
                  <a className="font-semibold text-teal underline" href={`/api/crm-auth/${o.source.slug}/start`}>Sign in with {o.source.name}</a> to confirm your role. Principals can then approve the whole office.
                </p>
              )}
              {o.mine.length > 0 && (
                <ul className="mt-3 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                  {o.mine.slice(0, 8).map((l) => (
                    <li key={l.id} className="truncate">{fullAddress(l) || l.headline || l.extId} <span className="text-slate-400">· {l.kind === "rent" && l.status === "current" ? "For rent" : STATUS[l.status] ?? l.status}</span></li>
                  ))}
                  {o.mine.length > 8 && <li className="text-slate-500">and {o.mine.length - 8} more</li>}
                </ul>
              )}
              <Section title="Listings" hint="Where your listings go.">
                <OfficeUnlocks kind="listings" sourceId={o.source.id} agencyId={o.agency.id} officeName={o.agency.name} partners={tiles} mineOn={o.mineOn} officeOn={o.officeOn} myCount={o.mine.length} officeCount={o.officeCount} viewingAs={me.viewingAs} approve={approve} crmName={o.source.name} locked={locked} contact={config.contactEmail} />
              </Section>
              {o.props.office > 0 && (
                <Section title="Property database" hint="Addresses and property details from your CRM. No owner or contact details are ever stored or shared.">
                  <OfficeUnlocks kind="properties" sourceId={o.source.id} agencyId={o.agency.id} officeName={o.agency.name} partners={propTiles} mineOn={o.props.mineOn} officeOn={o.props.officeOn} myCount={o.props.mine} officeCount={o.props.office} viewingAs={me.viewingAs} approve={approve} crmName={o.source.name} locked={locked} contact={config.contactEmail} />
                </Section>
              )}
              {!locked && (
                <Section title="Remove a listing from a partner" hint={st.principal ? "Search any listing in the office and stop it going to a particular partner." : "Search your listings and stop one going to a particular partner."}>
                  <ListingSearch agencyId={o.agency.id} partners={tiles} viewingAs={me.viewingAs} />
                </Section>
              )}
            </section>
          );
        })}
      </main>
    </>
  );
}
