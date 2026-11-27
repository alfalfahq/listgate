import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { fullAddress, getDb, partners as partnersT, sources } from "@listgate/db";
import { AgentSignIn, ListingSearch, OfficeUnlocks, Thumb } from "@/components/AgentParts";
import { CARD_ICONS } from "@/components/CardTitle";
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

function Glyph({ name, className = "size-[18px]" }: { name: keyof typeof CARD_ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {CARD_ICONS[name]}
    </svg>
  );
}

/** A panel that folds away. Open by default only when it's the main job on the page. */
function Panel({ icon, title, hint, open, children }: { icon: keyof typeof CARD_ICONS; title: string; hint?: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-2xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cyan-soft text-teal"><Glyph name={icon} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-navy">{title}</span>
          {hint && <span className="block text-xs text-slate-500">{hint}</span>}
        </span>
        <svg viewBox="0 0 24 24" className="size-5 text-slate-400 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div className="border-t border-slate-100 px-4 pb-4 pt-2">{children}</div>
    </details>
  );
}

function Stat({ icon, n, label }: { icon: keyof typeof CARD_ICONS; n: number; label: string }) {
  return (
    <span className="flex items-center gap-2 rounded-xl bg-sky px-3 py-2">
      <span className="text-teal"><Glyph name={icon} className="size-4" /></span>
      <span className="text-sm"><b className="text-navy">{n.toLocaleString("en-AU")}</b> <span className="text-slate-600">{label}</span></span>
    </span>
  );
}

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await currentUser();
  const { error } = await searchParams;
  const db = await getDb();
  const crmSignIns = (await db.select().from(sources).orderBy(asc(sources.name))).filter(ssoOn);
  const header = (
    <header className="bg-navy">
      <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4">
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
  const tiles = listed.map((p) => ({ id: p.id, name: p.name, description: p.description, website: p.website }));
  const propTiles = propPartners.map((p) => ({ id: p.id, name: p.name, description: p.description, website: p.website }));
  const first = me.name?.split(" ")[0] || "there";
  return (
    <>
      {header}
      <div className="bg-navy pb-16">
        <div className="mx-auto max-w-4xl px-4 pt-6">
          <h1 className="text-3xl font-bold text-white">Hi {first}</h1>
          <p className="mt-1 text-white/75">You choose where your listings go. Nothing is shared until you say so.</p>
        </div>
      </div>
      <main className="mx-auto -mt-10 flex max-w-4xl flex-col gap-6 px-4 pb-16">
        {err}
        {!offices.length && (
          <section className="card flex flex-col gap-3 p-6">
            <p className="font-semibold text-navy">We haven&apos;t received any listings with {me.email} yet.</p>
            <p className="text-sm text-slate-600">Once your CRM sends us a listing with this email on it, it&apos;ll show up here. If your listings use a different email, sign out and use that one.</p>
            {crmButtons}
          </section>
        )}
        {offices.map((o) => {
          const st = o.standing;
          const approve = st.verifiedMode ? (st.principal ? "verified" : "no") : "tick";
          const locked = o.agency.agentsLockedAt ? o.agency.agentsLockedReason || "yes" : null;
          const verifyBtn = st.verifiedMode && !st.verified && ssoOn(o.source);
          const photo = (l: (typeof o.mine)[number]) => l.images.find((m) => !m.kind || m.kind === "photo")?.url ?? null;
          return (
            <section key={o.agency.id} className="card flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy text-white"><Glyph name="building" className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold leading-tight text-navy">{o.agency.name}</h2>
                  <p className="text-xs text-slate-500">via {o.source.name}</p>
                </div>
                {st.verified && (
                  <span className="flex items-center gap-1.5 rounded-full bg-cyan-soft px-3 py-1 text-xs font-semibold text-navy">
                    <Glyph name="shield" className="size-3.5" /> {st.role ? st.role.replace(/\b\w/g, (c) => c.toUpperCase()) : "Verified"}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Stat icon="user" n={o.mine.length} label={o.mine.length === 1 ? "of your listings" : "of your listings"} />
                <Stat icon="building" n={o.officeCount} label="in the office" />
                {o.props.office > 0 && <Stat icon="map" n={o.props.office} label="properties" />}
              </div>

              {verifyBtn && (
                <p className="flex items-center gap-2 rounded-xl bg-sky px-3 py-2 text-sm text-ink">
                  <Glyph name="shield" className="size-4 text-teal" />
                  <span><a className="font-semibold text-teal underline" href={`/api/crm-auth/${o.source.slug}/start`}>Sign in with {o.source.name}</a> to confirm your role. Principals can share the whole office.</span>
                </p>
              )}

              {o.mine.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {o.mine.slice(0, 4).map((l) => (
                    <figure key={l.id} className="min-w-0">
                      <Thumb src={photo(l)} className="aspect-[4/3] w-full" />
                      <figcaption className="mt-1.5 truncate text-xs font-semibold text-ink">{fullAddress(l) || l.headline || l.extId}</figcaption>
                      <span className="text-xs text-slate-500">{l.kind === "rent" && l.status === "current" ? "For rent" : STATUS[l.status] ?? l.status}</span>
                    </figure>
                  ))}
                </div>
              )}
              {o.mine.length > 4 && <p className="-mt-2 text-xs text-slate-500">and {o.mine.length - 4} more</p>}

              <Panel icon="globe" title="Where your listings go" hint="Off, just yours, or the whole office" open>
                <OfficeUnlocks kind="listings" sourceId={o.source.id} agencyId={o.agency.id} officeName={o.agency.name} partners={tiles} mineOn={o.mineOn} officeOn={o.officeOn} myCount={o.mine.length} officeCount={o.officeCount} viewingAs={me.viewingAs} approve={approve} crmName={o.source.name} locked={locked} contact={config.contactEmail} />
              </Panel>
              {!locked && o.mine.length > 0 && (
                <Panel icon="image" title="Take a listing off a site" hint={st.principal ? "Any listing in the office" : "One of your listings"}>
                  <ListingSearch agencyId={o.agency.id} partners={tiles} viewingAs={me.viewingAs} />
                </Panel>
              )}
              {o.props.office > 0 && (
                <Panel icon="map" title="Property database" hint="Addresses and property details only. Never owner details.">
                  <OfficeUnlocks kind="properties" sourceId={o.source.id} agencyId={o.agency.id} officeName={o.agency.name} partners={propTiles} mineOn={o.props.mineOn} officeOn={o.props.officeOn} myCount={o.props.mine} officeCount={o.props.office} viewingAs={me.viewingAs} approve={approve} crmName={o.source.name} locked={locked} contact={config.contactEmail} />
                </Panel>
              )}
            </section>
          );
        })}
      </main>
    </>
  );
}
