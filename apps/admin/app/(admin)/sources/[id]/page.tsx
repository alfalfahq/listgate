import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { FIELD_LABELS, getDb, normalise, propertyRuns, PROPERTY_FIELDS, sources, suggestMapping } from "@listgate/db";
import { rotateLinkSecret, rotatePropertyToken, rotateSourceToken, savePropertyMapping, saveSourceSso } from "@/app/actions";
import { CopyButton } from "@/app/copy-button";
import { PageHeader, Pill, Section, TableCard } from "@/app/kit";
import { ActionForm, Field } from "@/app/ui";
import { ago, APP_URL, feedUrl } from "@/lib/format";

export const dynamic = "force-dynamic";

const PERSONAL = /owner|vendor|contact|buyer|tenant|landlord|purchaser|phone|mobile|^e-?mail$|first.?name|last.?name|surname/i;

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [s] = await db.select().from(sources).where(eq(sources.id, id));
  if (!s) notFound();
  const runs = await db.select().from(propertyRuns).where(eq(propertyRuns.sourceId, s.id)).orderBy(desc(propertyRuns.createdAt)).limit(20);
  const propUrl = s.propertyToken ? `${APP_URL}/api/feeds/properties/${s.propertyToken}` : null;
  const columns = s.propertySample?.columns ?? [...new Set(Object.values(s.propertyMapping?.fields ?? {}).map((f) => f!.column))];
  const mapping = s.propertyMapping ?? (s.propertySample ? suggestMapping(columns) : null);
  const preview = mapping && s.propertySample ? s.propertySample.rows.slice(0, 5).map((r) => normalise(r, mapping)) : [];
  const ignored = mapping ? columns.filter((c) => !Object.values(mapping.fields).some((f) => f?.column === c)) : [];
  const sso = s.sso ?? {};
  return (
    <div className="space-y-8">
      <Link href="/sources" className="text-sm text-zinc-500">← CRM feeds</Link>
      <PageHeader icon="bolt" title={s.name} sub={`Listings last received ${ago(s.lastFeedAt)} · properties ${ago(s.lastPropertyFeedAt)}`} actions={<Link href={`/agencies?crm=${encodeURIComponent(s.name)}`} className="btn-secondary">Offices</Link>} />

      <Section title="Listing feed (REAXML)" icon="inbox">
        <p className="text-sm"><code className="break-all text-xs">{feedUrl(s.feedToken)}</code> <CopyButton text={feedUrl(s.feedToken)} label="Copy" className="text-xs" /></p>
        <form action={rotateSourceToken} className="mt-2"><input type="hidden" name="sourceId" value={s.id} /><button className="text-xs font-semibold text-rose-700">New token (old URL stops at once)</button></form>
      </Section>

      <Section title="Property database feed" icon="home2">
        {propUrl ? (
          <div className="space-y-2 text-sm">
            <p><code className="break-all text-xs">{propUrl}</code> <CopyButton text={propUrl} label="Copy" className="text-xs" /></p>
            <p className="text-zinc-600">POST CSV, a JSON array or NDJSON (gzip fine, up to 100 MB). <code>?mode=snapshot</code> removes properties missing from the file (only in offices in the file); default <code>delta</code> leaves them. <code>?office=&lt;id&gt;</code> for one-office files without an office column. Answers 202 with a run id; <code>GET ?run=&lt;id&gt;</code> for the result.</p>
            <form action={rotatePropertyToken}><input type="hidden" name="sourceId" value={s.id} /><button className="text-xs font-semibold text-rose-700">New token (old URL stops at once)</button></form>
          </div>
        ) : (
          <form action={rotatePropertyToken} className="space-y-2">
            <input type="hidden" name="sourceId" value={s.id} />
            <p className="text-sm text-zinc-600">Off. Turn it on to get a separate URL and token for the CRM's property database.</p>
            <button className="btn-primary">Turn on property feed</button>
          </form>
        )}
      </Section>

      {propUrl && (
        <Section title="Column mapping" icon="list">
          {!mapping ? (
            <p className="text-sm text-zinc-600">Ask {s.name} to send a first file. Nothing is stored until the columns are mapped; the file&apos;s headers and a few rows are kept here so you can map them, then deleted when you save.</p>
          ) : (
            <ActionForm action={savePropertyMapping} submit="Save mapping">
              <input type="hidden" name="sourceId" value={s.id} />
              {s.propertySample && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">A file arrived {ago(new Date(s.propertySample.at))} with columns that need mapping. Guesses are filled in: check them, then save.</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {PROPERTY_FIELDS.map((f) => (
                  <Field key={f} label={FIELD_LABELS[f]}>
                    <div className="flex gap-2">
                      <select name={`col_${f}`} defaultValue={mapping.fields[f]?.column ?? ""} className="input flex-1">
                        <option value="">Not in the file</option>
                        {columns.map((c) => <option key={c} value={c}>{c}{PERSONAL.test(c) ? " (looks personal)" : ""}</option>)}
                      </select>
                      {(f === "landArea" || f === "buildingArea") && (
                        <select name={`tr_${f}`} defaultValue={mapping.fields[f]?.transform === "ha_to_m2" ? "ha_to_m2" : "none"} className="input w-28" aria-label="Unit">
                          <option value="none">m²</option>
                          <option value="ha_to_m2">hectares</option>
                        </select>
                      )}
                    </div>
                  </Field>
                ))}
              </div>
              {ignored.length > 0 && <p className="text-xs text-zinc-500">Dropped on arrival, never stored: {ignored.join(", ")}</p>}
              {s.propertyMapping?.updatedAt && <p className="text-xs text-zinc-500">Last saved by {s.propertyMapping.updatedBy} {ago(new Date(s.propertyMapping.updatedAt))}.</p>}
            </ActionForm>
          )}
          {preview.length > 0 && (
            <div className="mt-4">
              <p className="label">Preview (normalised, as partners will see it)</p>
              <TableCard>
                <thead><tr><th>ID</th><th>Office</th><th>Address</th><th>Type</th><th>Bed/Bath/Car</th><th>Land</th><th>Agents</th></tr></thead>
                <tbody>
                  {preview.map((r, i) =>
                    r.ok ? (
                      <tr key={i}>
                        <td className="text-xs">{r.p.extId}</td>
                        <td className="text-xs">{r.p.officeRef ?? "—"}</td>
                        <td className="text-xs">{[[r.p.unitNumber && `${r.p.unitNumber}/`, r.p.streetNumber, " ", r.p.street].filter(Boolean).join(""), r.p.suburb, r.p.state, r.p.postcode].filter(Boolean).join(", ")}</td>
                        <td className="text-xs">{r.p.propertyType}</td>
                        <td className="text-xs">{[r.p.beds, r.p.baths, r.p.cars].map((n) => n ?? "–").join(" / ")}</td>
                        <td className="text-xs">{r.p.landArea ? `${r.p.landArea} m²` : ""}</td>
                        <td className="text-xs">{r.p.agentRefs.join(", ")}</td>
                      </tr>
                    ) : (
                      <tr key={i}><td colSpan={7} className="text-xs text-rose-700">Row skipped: {r.error}</td></tr>
                    )
                  )}
                </tbody>
              </TableCard>
            </div>
          )}
        </Section>
      )}

      {propUrl && (
        <Section title="Property uploads" icon="clock">
          <TableCard empty={runs.length ? false : "No uploads yet."}>
            <thead><tr><th>When</th><th>Status</th><th>Mode</th><th>Rows</th><th>Offices</th><th>New</th><th>Changed</th><th>Same</th><th>Removed</th><th>Skipped</th><th>Note</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="text-zinc-500">{ago(r.createdAt)}</td>
                  <td>{r.status === "done" ? <Pill tone="green">Done</Pill> : r.status === "failed" ? <Pill tone="red">Failed</Pill> : r.status === "needs_mapping" ? <Pill tone="amber">Needs mapping</Pill> : <Pill>{r.status}</Pill>}</td>
                  <td className="text-xs">{r.mode}</td>
                  <td>{r.rows}</td><td>{r.offices}</td><td>{r.created}</td><td>{r.updated}</td><td>{r.unchanged}</td><td>{r.removed}</td><td>{r.skipped}</td>
                  <td className="max-w-xs truncate text-xs text-zinc-500">{r.error}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </Section>
      )}

      <Section title={`Sign in with ${s.name}`} icon="users">
        <p className="mb-3 text-sm text-zinc-600">
          With this on, agents sign in with {s.name} and Listgate learns their office and role. Only a principal or office admin can then approve a whole office (no tick box). Give {s.name} this redirect URL: <code className="text-xs">{APP_URL}/api/crm-auth/{s.slug}/callback</code>
        </p>
        <ActionForm action={saveSourceSso} submit="Save sign-in settings">
          <input type="hidden" name="sourceId" value={s.id} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={!!sso.enabled} /> Switched on</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Button text"><input name="label" defaultValue={sso.label ?? ""} placeholder={`Sign in with ${s.name}`} className="input" /></Field>
            <Field label="Scope (if they need one)"><input name="scope" defaultValue={sso.scope ?? ""} className="input" /></Field>
            <Field label="Authorize URL"><input name="authorizeUrl" defaultValue={sso.authorizeUrl ?? ""} className="input font-mono text-xs" placeholder="https://" /></Field>
            <Field label="Token URL"><input name="tokenUrl" defaultValue={sso.tokenUrl ?? ""} className="input font-mono text-xs" placeholder="https://" /></Field>
            <Field label="Userinfo URL"><input name="userinfoUrl" defaultValue={sso.userinfoUrl ?? ""} className="input font-mono text-xs" placeholder="https://" /></Field>
            <Field label="Client ID"><input name="clientId" defaultValue={sso.clientId ?? ""} className="input font-mono text-xs" /></Field>
            <Field label={`Client secret${sso.clientSecret ? " (saved; leave blank to keep)" : ""}`}><input name="clientSecret" type="password" autoComplete="off" className="input font-mono text-xs" /></Field>
            <Field label="Roles that can approve a whole office (comma-separated)"><input name="principalRoles" defaultValue={sso.principalRoles ?? ""} placeholder="principal, admin, office admin, owner, director" className="input" /></Field>
          </div>
          <p className="label">Where to find each detail in their userinfo reply (dots for nesting)</p>
          <div className="grid gap-3 sm:grid-cols-5">
            <Field label="User ID"><input name="idPath" defaultValue={sso.idPath ?? ""} placeholder="id" className="input font-mono text-xs" /></Field>
            <Field label="Email"><input name="emailPath" defaultValue={sso.emailPath ?? ""} placeholder="email" className="input font-mono text-xs" /></Field>
            <Field label="Name"><input name="namePath" defaultValue={sso.namePath ?? ""} placeholder="name" className="input font-mono text-xs" /></Field>
            <Field label="Office ID"><input name="officePath" defaultValue={sso.officePath ?? ""} placeholder="office_id" className="input font-mono text-xs" /></Field>
            <Field label="Role"><input name="rolePath" defaultValue={sso.rolePath ?? ""} placeholder="role" className="input font-mono text-xs" /></Field>
          </div>
        </ActionForm>

        <div className="mt-6 border-t border-zinc-100 pt-4 text-sm">
          <p className="font-semibold">Signed link from inside {s.name} (if they can&apos;t do OAuth)</p>
          <p className="mt-1 text-zinc-600">
            {s.name} links agents to <code className="text-xs">{APP_URL}/crm/{s.slug}/link?uid=&amp;email=&amp;name=&amp;office=&amp;role=&amp;t=&amp;sig=</code>, where <code className="text-xs">t</code> is the time in Unix seconds and <code className="text-xs">sig</code> is the hex HMAC-SHA256 of <code className="text-xs">uid|email|office|role|t</code> with the secret below. Links work for 5 minutes. Turning this on also means only verified principals can approve whole offices.
          </p>
          {s.linkSecret ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <CopyButton text={s.linkSecret} label="Copy secret" className="text-xs" />
              <form action={rotateLinkSecret}><input type="hidden" name="sourceId" value={s.id} /><button className="text-xs font-semibold text-rose-700">New secret</button></form>
              <form action={rotateLinkSecret}><input type="hidden" name="sourceId" value={s.id} /><input type="hidden" name="off" value="1" /><button className="text-xs font-semibold text-zinc-600">Turn off</button></form>
            </div>
          ) : (
            <form action={rotateLinkSecret} className="mt-2"><input type="hidden" name="sourceId" value={s.id} /><button className="btn-secondary">Create link secret</button></form>
          )}
        </div>
      </Section>
    </div>
  );
}
