import Link from "next/link";
import { Logo } from "@/components/Logo";
import { config } from "@/lib/config";

const FEATURES = [
  { t: "Simple opt-in", d: "One tick when the listing is created. No new workflow, no extra admin." },
  { t: "One feed, many outcomes", d: "The same REAXML your CRM already sends can power portals, CRMs, buyer tools, alerts and AI." },
  { t: "Open competition", d: "New products compete on experience, reach and value, not on who has the listings." },
  { t: "Lower dependence", d: "Your listings stop building one platform and start working for your business." },
  { t: "More innovation", d: "Proptech challengers get the data they need to build something better." },
  { t: "Better outcomes", d: "Buyers and sellers get more choice in how they find and sell property." },
];

const COVERAGE = [
  { p: "REA", a: "~13m", c: 100 },
  { p: "Domain", a: "~9m", c: 90 },
  { p: "View", a: "<1m", c: 70 },
  { p: "Homely", a: "<1m", c: 70 },
  { p: "Property Mate", a: "<1m", c: 70 },
];

const STEPS = [
  { t: "You create the listing", d: "Entered once in your CRM, the same way it is today." },
  { t: "Tick the box", d: "Alongside your other portals, send the listing to Listgate." },
  { t: "Distribute to the ecosystem", d: "Listgate sends it to the approved platforms you switch on." },
  { t: "Let competition happen", d: "More products compete on experience, reach and value, not just access." },
  { t: "Industry-aligned commercialisation", d: "Once a platform makes money from the data, it pays for it." },
];

const FLOW = ["Your CRM", "Listgate", "Discovery", "Your website", "Your data"];

export default function Home() {
  return (
    <>
      <header className="bg-navy">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-5">
          <Logo height={28} white />
          <span className="flex-1" />
          <a href="#crms" className="hidden text-sm font-semibold text-white/80 sm:inline">CRMs &amp; partners</a>
          <Link href="/help" className="hidden text-sm font-semibold text-white/80 sm:inline">Help</Link>
          <Link href="/login" className="btn-cyan px-4 py-2">Sign in</Link>
        </div>
      </header>

      <main>
        <section className="bg-navy pb-20 pt-14 text-white">
          <div className="mx-auto max-w-6xl px-4">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-cyan">Listing distribution</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-[1.05] md:text-6xl">The industry doesn&apos;t need another portal.</h1>
            <p className="mt-4 max-w-2xl text-2xl font-semibold text-cyan md:text-3xl">It needs thousands of them.</p>
            <p className="mt-6 max-w-2xl text-lg text-white/80">Listgate is the layer behind them. Agents tick one box in their CRM, and their listings reach the products they choose.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#how" className="btn-cyan px-6 py-3 text-base">How it works</a>
              <a href={`mailto:${config.contactEmail}`} className="btn border-[1.5px] border-white/30 px-6 py-3 text-base text-white hover:border-cyan">Talk to us</a>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-extrabold text-navy">Listgate is not another portal</h2>
          <p className="mt-2 text-lg text-slate-600">It&apos;s the layer behind them.</p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.t} className="card p-5">
                <p className="font-bold text-navy">{f.t}</p>
                <p className="mt-1 text-sm text-slate-600">{f.d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-sky py-16">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-2">
            <div>
              <h2 className="text-3xl font-extrabold text-navy">The industry doesn&apos;t need a monopoly on listings</h2>
              <p className="mt-3 text-slate-700">Right now the industry doesn&apos;t have a choice. It&apos;s time to create one, but not by building another portal.</p>
              <h3 className="mt-8 text-xl font-bold text-navy">Control of listings is control of the market</h3>
              <ul className="mt-3 flex flex-col gap-2 text-slate-700">
                {["You create the listing", "The data gets locked away", "Innovation gets blocked", "The industry stays dependent", "Your listings build their platform, not your business"].map((x) => (
                  <li key={x} className="flex gap-2"><span aria-hidden className="font-bold text-red-600">✗</span>{x}</li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <p className="font-bold text-navy">For Sale listing coverage</p>
              <p className="text-xs text-slate-500">Share of the market leader&apos;s listings, April 2026</p>
              <ul className="mt-4 flex flex-col gap-3">
                {COVERAGE.map((c) => (
                  <li key={c.p}>
                    <div className="flex justify-between text-sm"><span className="font-semibold">{c.p}</span><span className="text-slate-500">{c.a} monthly · {c.c}%</span></div>
                    <div className="mt-1 h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-teal" style={{ width: `${c.c}%` }} /></div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-extrabold text-navy">From your CRM to the entire market</h2>
          <ol className="mt-8 flex flex-col items-stretch gap-2 md:flex-row md:items-center">
            {FLOW.map((f, i) => (
              <li key={f} className="flex items-center gap-2 md:flex-1">
                <span className={`flex-1 rounded-full px-4 py-3 text-center text-sm font-bold ${f === "Listgate" ? "bg-cyan text-navy" : "bg-navy text-white"}`}>{f}</span>
                {i < FLOW.length - 1 && <span aria-hidden className="hidden text-xl text-slate-400 md:inline">→</span>}
              </li>
            ))}
          </ol>
        </section>

        <section id="how" className="bg-navy py-16 text-white">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-extrabold">Just tick the box</h2>
            <p className="mt-2 max-w-2xl text-white/80">No new workflow. No extra admin. No new platform. Just one simple choice when the listing is created.</p>
            <h3 className="mt-10 text-xl font-bold text-cyan">When listings are open, competition follows</h3>
            <ol className="mt-5 grid gap-4 md:grid-cols-5">
              {STEPS.map((s, i) => (
                <li key={s.t} className="rounded-xl bg-white/5 p-4">
                  <span className="flex size-8 items-center justify-center rounded-full bg-cyan text-sm font-extrabold text-navy">{i + 1}</span>
                  <p className="mt-3 font-bold">{s.t}</p>
                  <p className="mt-1 text-sm text-white/75">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="crms" className="mx-auto grid max-w-6xl gap-5 px-4 py-16 md:grid-cols-2">
          <div className="card p-6">
            <h2 className="text-xl font-extrabold text-navy">For CRMs</h2>
            <p className="mt-2 text-slate-700">Add Listgate as a portal. Send the same REAXML you send to realestate.com.au and Domain, by HTTP POST or FTP. Each agency gets its own feed key.</p>
            <Link href="/help" className="mt-3 inline-block text-sm font-bold">Feed setup guide →</Link>
          </div>
          <div className="card p-6">
            <h2 className="text-xl font-extrabold text-navy">For partners</h2>
            <p className="mt-2 text-slate-700">Get one clean JSON feed of every listing from agencies that choose you: signed webhooks on every change, or pull it from the API.</p>
            <a href={`mailto:${config.contactEmail}?subject=Listgate%20partner`} className="mt-3 inline-block text-sm font-bold">Become a partner →</a>
          </div>
        </section>

        <section className="bg-sky py-16">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="text-3xl font-extrabold text-navy">What does this mean for agents?</h2>
            <p className="mt-4 text-lg text-slate-700">Your listings, your choice. You decide which products get them, you can switch any of them off, and you keep using the CRM you already have.</p>
            <Link href="/login" className="btn-navy mt-8 px-6 py-3 text-base">Sign in to your agency</Link>
          </div>
        </section>
      </main>

      <footer className="bg-navy py-8 text-sm text-white/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4">
          <Logo height={22} white />
          <span className="flex-1">An offshoot of <a href="https://alfalfa.com.au" className="text-cyan">Alfalfa Projects</a></span>
          <span>© {new Date().getFullYear()} Alfalfa Projects Pty Ltd</span>
        </div>
      </footer>
    </>
  );
}
