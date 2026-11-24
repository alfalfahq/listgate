import { asc, desc } from "drizzle-orm";
import { getDb, projectTasks } from "@listgate/db";
import { requireAdmin } from "@/lib/auth";
import { ago } from "@/lib/format";
import { PageHeader, Section } from "@/app/kit";
import { ResetForm } from "@/app/crm-client";
import { CopyButton } from "@/app/copy-button";
import { addProjectTask, deleteProjectTask, toggleProjectTask, updateProjectTask } from "@/app/project-actions";

export const dynamic = "force-dynamic";

const APP = "https://cloud.digitalocean.com/apps/74a037d8-86b8-4559-9188-aadbc63b694c";

// The places Listgate runs from. Edit here when something moves.
const LINKS: { group: string; items: { label: string; href: string; note?: string }[] }[] = [
  {
    group: "Listgate",
    items: [
      { label: "Website", href: "https://listgate.com.au" },
      { label: "App dashboard", href: "https://listgate.com.au/app" },
      { label: "Code on GitHub", href: "https://github.com/alfalfahq/listgate", note: "alfalfahq/listgate · main deploys" },
    ],
  },
  {
    group: "Hosting · DigitalOcean",
    items: [
      { label: "App overview and deploys", href: APP },
      { label: "Web settings and keys", href: `${APP}/settings/web` },
      { label: "Admin settings and keys", href: `${APP}/settings/admin` },
      { label: "Runtime logs", href: `${APP}/logs` },
      { label: "API tokens", href: "https://cloud.digitalocean.com/account/api/tokens" },
      { label: "Billing", href: "https://cloud.digitalocean.com/account/billing" },
    ],
  },
  {
    group: "Email and DNS",
    items: [
      { label: "Resend · emails sent", href: "https://resend.com/emails" },
      { label: "Netregistry · listgate.com.au DNS", href: "https://www.netregistry.com.au" },
    ],
  },
  {
    group: "Partners",
    items: [
      { label: "Stash Property", href: "https://stashproperty.com.au" },
      { label: "Propchat", href: "https://propchat.com.au" },
      { label: "Dwellicious", href: "https://dwellicious.com.au" },
    ],
  },
  {
    group: "Business",
    items: [
      { label: "ABN lookup · Alfalfa Projects", href: "https://abr.business.gov.au/ABN/View?abn=24631835535", note: "ABN 24 631 835 535" },
      { label: "ASIC Connect · business names", href: "https://connectonline.asic.gov.au" },
      { label: "IP Australia · trade marks", href: "https://www.ipaustralia.gov.au/trade-marks" },
    ],
  },
];

type Task = typeof projectTasks.$inferSelect;

// Context Claude needs to pick a task up cold in a normal chat.
const CONTEXT = `Context: I'm Colin, building Listgate (listgate.com.au), a listing distribution gateway: agency CRMs send REAXML in, and Listgate pushes normalised listings to the partners each agency switches on (Stash, Propchat, Dwellicious and others) by signed webhook or a pull API. It's owned by Alfalfa Projects Pty Ltd (ABN 24 631 835 535). Code is in the GitHub repo alfalfahq/listgate (Next.js 15, TypeScript, Tailwind, Drizzle/Postgres, npm workspaces apps/web, apps/admin, packages/db) and auto-deploys to DigitalOcean App Platform from main; the FTP receiver (apps/ftp) runs on a small droplet. Email goes through Resend. I enter all keys and passwords myself.`;

function taskPrompt(t: Task) {
  return [
    `Help me with this Listgate to-do: ${t.title}`,
    t.note ? `Details: ${t.note}` : "",
    t.link ? `Where it's done: ${t.link}` : "",
    `Section: ${t.section}`,
    "",
    CONTEXT,
    "",
    "Walk me through it step by step, tell me exactly what to click or type, and say when it's done.",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

function allPrompt(tasks: Task[]) {
  const sections = [...new Set(tasks.map((t) => t.section))];
  const list = sections
    .map((s) => `${s}:\n` + tasks.filter((t) => t.section === s).map((t) => `- ${t.title}${t.note ? ` (${t.note})` : ""}${t.link ? ` [${t.link}]` : ""}`).join("\n"))
    .join("\n\n");
  return `Here's my open Listgate to-do list. Help me work through it: suggest the order, then take me through the first one step by step.\n\n${list}\n\n${CONTEXT}`;
}

function Check({ t }: { t: Task }) {
  return (
    <form action={toggleProjectTask} className="pt-0.5">
      <input type="hidden" name="id" value={t.id} />
      <button
        aria-label={t.doneAt ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
        className={`flex h-5 w-5 items-center justify-center rounded border ${t.doneAt ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 hover:border-zinc-900"}`}
      >
        {t.doneAt && (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
        )}
      </button>
    </form>
  );
}

function TaskRow({ t }: { t: Task }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <Check t={t} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${t.doneAt ? "text-zinc-400 line-through" : "text-zinc-900"}`}>{t.title}</p>
        {t.note && <p className={`mt-0.5 whitespace-pre-line break-words text-xs ${t.doneAt ? "text-zinc-400" : "text-zinc-600"}`}>{t.note}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          {t.link && (
            <a href={t.link} target="_blank" rel="noreferrer" className="font-medium text-sky-700 underline-offset-2 hover:underline">
              Open {new URL(t.link).hostname.replace(/^www\./, "")} ↗
            </a>
          )}
          {!t.doneAt && <CopyButton text={taskPrompt(t)} />}
          {t.doneAt && <span>Done {ago(t.doneAt)}</span>}
          <details className="group">
            <summary className="cursor-pointer list-none text-zinc-400 hover:text-zinc-700">Edit</summary>
            <form action={updateProjectTask} className="mt-2 grid gap-2 sm:w-[32rem]">
              <input type="hidden" name="id" value={t.id} />
              <input name="title" defaultValue={t.title} required className="input" aria-label="Task" />
              <textarea name="note" defaultValue={t.note ?? ""} rows={2} className="input" aria-label="Note" placeholder="Note" />
              <div className="grid gap-2 sm:grid-cols-2">
                <input name="link" defaultValue={t.link ?? ""} className="input" aria-label="Link" placeholder="https://…" />
                <input name="section" defaultValue={t.section} list="project-sections" className="input" aria-label="Section" />
              </div>
              <div className="flex gap-2"><button className="btn-secondary">Save</button></div>
            </form>
          </details>
        </div>
      </div>
      <form action={deleteProjectTask}>
        <input type="hidden" name="id" value={t.id} />
        <button className="rounded px-1.5 py-1 text-xs text-zinc-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`Delete "${t.title}"`}>Delete</button>
      </form>
    </li>
  );
}

export default async function Project() {
  await requireAdmin();
  const db = await getDb();
  const all = await db.select().from(projectTasks).orderBy(asc(projectTasks.sort), desc(projectTasks.createdAt));
  const open = all.filter((t) => !t.doneAt);
  const finished = all.filter((t) => t.doneAt).sort((a, b) => +b.doneAt! - +a.doneAt!);
  const sections = [...new Set(all.map((t) => t.section))];
  const groups = [...new Set(open.map((t) => t.section))].map((s) => ({ s, tasks: open.filter((t) => t.section === s) }));

  return (
    <>
      <PageHeader icon="project"
        title="Project"
        sub={`${open.length} to do · ${finished.length} done · setup, business admin and the apps Listgate runs on`}
        actions={open.length > 0 ? <CopyButton text={allPrompt(open)} label="Copy whole list for Claude" className="btn-secondary" /> : undefined}
      />
      <datalist id="project-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div className="card p-4">
            <ResetForm action={addProjectTask} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
              <label className="sr-only" htmlFor="pt-title">New task</label>
              <input id="pt-title" name="title" required className="input" placeholder="Add a task… e.g. Set up Google Search Console" />
              <label className="sr-only" htmlFor="pt-section">Section</label>
              <input id="pt-section" name="section" list="project-sections" className="input" placeholder="Section" />
              <button className="btn-secondary">Add</button>
              <label className="sr-only" htmlFor="pt-note">Note</label>
              <input id="pt-note" name="note" className="input sm:col-span-2" placeholder="Note (optional)" />
              <label className="sr-only" htmlFor="pt-link">Link</label>
              <input id="pt-link" name="link" className="input" placeholder="Link (optional)" />
            </ResetForm>
          </div>

          {groups.length === 0 && <div className="card p-6 text-sm text-zinc-500">Nothing to do. Nice.</div>}
          {groups.map(({ s, tasks }) => (
            <Section key={s} title={`${s} · ${tasks.length}`}>
              <ul className="card divide-y divide-zinc-100 px-4">{tasks.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
            </Section>
          ))}

          {finished.length > 0 && (
            <details className="card px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-700">Done · {finished.length}</summary>
              <ul className="mt-1 divide-y divide-zinc-100">{finished.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
            </details>
          )}
        </div>

        <aside className="space-y-4">
          {LINKS.map((g) => (
            <div key={g.group} className="card p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{g.group}</h2>
              <ul className="space-y-1.5">
                {g.items.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noreferrer" className="group flex items-start justify-between gap-2 rounded-md px-1.5 py-1 hover:bg-zinc-50">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-zinc-900">{l.label}</span>
                        {l.note && <span className="block text-xs text-zinc-500">{l.note}</span>}
                      </span>
                      <span aria-hidden="true" className="pt-0.5 text-xs text-zinc-400 group-hover:text-zinc-700">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
