// Server-only. A client's payment went through: the link is marked paid,
// the lead moves to the company's paid stage of its funnel, and the team
// sees it in the lead's history, the bell and a push.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { orgManagers, sendPush } from "@/lib/push/push.server";
import { formatSom, pickPaidStage, type StageRow } from "./paid-stage";
import { loadMerchant } from "./merchant.server";

export type LinkRow = {
  id: string;
  organization_id: string;
  lead_id: string;
  amount: number;
  status: string;
  provider: string | null;
  provider_transaction_id: string | null;
  provider_data: Record<string, unknown>;
  description: string | null;
};

export async function findLink(organizationId: string, id: string): Promise<LinkRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabaseAdmin
    .from("lead_payment_links")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as LinkRow | null) ?? null;
}

const PROVIDER_NAME: Record<string, string> = { payme: "Payme", click: "Click" };

export async function settleLinkPaid(link: LinkRow, provider: "payme" | "click"): Promise<void> {
  const paidAt = new Date().toISOString();
  // Only the first confirmation counts (a retried callback changes nothing).
  const { data: updated } = await supabaseAdmin
    .from("lead_payment_links")
    .update({ status: "paid", paid_at: paidAt, provider })
    .eq("id", link.id)
    .neq("status", "paid")
    .select("id");
  if (!updated?.length) return;

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, name, owner_id, stage_id, funnel")
    .eq("id", link.lead_id)
    .maybeSingle();
  if (!lead) return;

  const amount = `${formatSom(Number(link.amount))} so'm`;
  const merchant = await loadMerchant(link.organization_id);
  const { data: stages } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, pipeline_name, position, is_won, is_lost")
    .eq("organization_id", link.organization_id);
  const current = (stages ?? []).find((s) => s.id === lead.stage_id);
  const target = pickPaidStage(
    (stages ?? []) as StageRow[],
    current?.pipeline_name ?? lead.funnel ?? null,
    merchant?.paidStages ?? {},
  );
  if (target && target !== lead.stage_id) {
    await supabaseAdmin.from("leads").update({ stage_id: target }).eq("id", lead.id);
  }

  await supabaseAdmin.from("lead_activities").insert({
    organization_id: link.organization_id,
    lead_id: lead.id,
    type: "note",
    content: `💳 To'lov qabul qilindi: ${amount} (${PROVIDER_NAME[provider]})${link.description ? ` — ${link.description}` : ""}`,
  });

  const recipients = lead.owner_id ? [lead.owner_id] : await orgManagers(link.organization_id);
  await supabaseAdmin
    .from("notifications")
    .insert(
      recipients.map((uid) => ({
        organization_id: link.organization_id,
        user_id: uid,
        type: "LeadPaid",
        title: "To'lov qabul qilindi",
        body: `${lead.name} · ${amount} · ${PROVIDER_NAME[provider]}`,
        link: `/crm/leads/${lead.id}`,
      })),
    )
    .then(
      () => undefined,
      () => undefined,
    );
  await sendPush(link.organization_id, recipients, {
    kind: "new_lead",
    title: `💳 ${lead.name || "Mijoz"} to'ladi`,
    body: `${amount} · ${PROVIDER_NAME[provider]}`,
    url: `/crm/leads/${lead.id}`,
    tag: `paid:${link.id}`,
  }).catch(() => undefined);
}
