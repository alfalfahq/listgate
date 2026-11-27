import type { partners } from "@listgate/db";
import { Field } from "@/app/ui";

type P = Partial<typeof partners.$inferSelect>;

/** Shared fields for adding and editing a partner. */
export function PartnerFields({ p = {} }: { p?: P }) {
  const kinds = p.kinds?.length ? p.kinds : ["sale", "rent"];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><input name="name" defaultValue={p.name ?? ""} className="input" required /></Field>
        <Field label="Website"><input name="website" defaultValue={p.website ?? ""} className="input" placeholder="https://" /></Field>
      </div>
      <Field label="What agencies see (one line)"><input name="description" defaultValue={p.description ?? ""} className="input" /></Field>
      <Field label="Webhook URL (leave empty for pull only)"><input name="webhookUrl" defaultValue={p.webhookUrl ?? ""} className="input font-mono text-xs" placeholder="https://partner.example/listgate/webhook" /></Field>
      <fieldset className="grid gap-2 text-sm sm:grid-cols-2">
        <legend className="label">Takes</legend>
        <label className="flex items-center gap-2"><input type="checkbox" name="kinds" value="sale" defaultChecked={kinds.includes("sale")} /> For sale</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="kinds" value="rent" defaultChecked={kinds.includes("rent")} /> For rent</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="includeSold" defaultChecked={p.includeSold ?? true} /> Sold and leased results</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="confidential" defaultChecked={p.confidential ?? false} /> Hidden addresses and prices (data use only)</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="acceptsProperties" defaultChecked={p.acceptsProperties ?? false} /> CRM property databases (offices still approve)</label>
      </fieldset>
      <fieldset className="grid gap-2 text-sm sm:grid-cols-2">
        <legend className="label">Status</legend>
        <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={p.active ?? false} /> Active (sending)</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="listed" defaultChecked={p.listed ?? true} /> Agencies can choose it</label>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Give up after this many tries"><input name="maxAttempts" type="number" min={1} max={50} defaultValue={p.maxAttempts ?? 12} className="input" /></Field>
        <Field label="Order in lists"><input name="sort" type="number" defaultValue={p.sort ?? 100} className="input" /></Field>
      </div>
    </>
  );
}
