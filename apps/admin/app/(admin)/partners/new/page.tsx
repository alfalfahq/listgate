import { createPartner } from "@/app/actions";
import { PageHeader } from "@/app/kit";
import { ActionForm, Field } from "@/app/ui";
import { PartnerFields } from "../form";

export default function NewPartner() {
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon="network" title="Add partner" sub="You'll get a signing secret for their webhook, and can issue an API key for pulling." />
      <ActionForm action={createPartner} submit="Create partner">
        <Field label="Short name (used in URLs)"><input name="slug" className="input" placeholder="e.g. homely" /></Field>
        <PartnerFields />
      </ActionForm>
    </div>
  );
}
