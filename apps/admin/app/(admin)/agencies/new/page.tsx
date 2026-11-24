import { asc } from "drizzle-orm";
import { CRMS, getDb, partners } from "@listgate/db";
import { createAgency } from "@/app/actions";
import { PageHeader } from "@/app/kit";
import { ActionForm, Field } from "@/app/ui";

export const dynamic = "force-dynamic";

export default async function NewAgency() {
  const db = await getDb();
  const ps = await db.select().from(partners).orderBy(asc(partners.sort), asc(partners.name));
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon="building" title="Add agency" sub="Creates its feed key. Invite the owner to let them see the feed and choose partners." />
      <ActionForm action={createAgency} submit="Create agency">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Agency name"><input name="name" className="input" required /></Field>
          <Field label="CRM">
            <select name="crm" className="input" defaultValue="">
              <option value="">Not sure yet</option>
              {CRMS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Suburb"><input name="suburb" className="input" /></Field>
          <Field label="State"><input name="state" className="input" placeholder="QLD" maxLength={3} /></Field>
          <Field label="Office email"><input name="contactEmail" type="email" className="input" /></Field>
          <Field label="REAXML agent ID (optional)"><input name="reaxmlAgentId" className="input" placeholder="Filled in from the first feed" /></Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="label">Send listings to</legend>
          {ps.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="partner" value={p.id} /> {p.name} {!p.active && <span className="text-xs text-zinc-500">(paused)</span>}
            </label>
          ))}
          <p className="text-xs text-zinc-500">Only tick these if the agency has authorised it. Otherwise their owner switches partners on themselves.</p>
        </fieldset>
        <div className="grid gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2">
          <Field label="Owner's name (optional)"><input name="ownerName" className="input" /></Field>
          <Field label="Owner's email (optional)"><input name="ownerEmail" type="email" className="input" /></Field>
        </div>
      </ActionForm>
    </div>
  );
}
