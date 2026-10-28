// Server-only. The lead payments ledger: adding and removing a payment,
// keeping leads.paid_amount in step, and moving the lead to the stage its
// payments call for (rules in ledger.ts). Payme/Click payments arrive here
// from settle.server.ts; cash, card and transfer from the lead card.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { formatSom, type StageRow } from "./paid-stage";
import { ledgerStage, ledgerSummary, type LedgerSummary, type PaymentMethod } from "./ledger";
import { loadMerchant } from "./merchant.server";

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma",
  payme: "Payme",
  click: "Click",
  other: "Boshqa",
};

/** True when the ledger table is not there yet (migration 20261207000000 not run). */
export function isLedgerMissing(error: { code?: string; message?: string } | null): boolean {
  return (
    !!error && (error.code === "42P01" || /lead_payments|paid_amount/.test(error.message ?? ""))
  );
}

/**
 * Re-adds the lead's payments, stores the sum on the lead and moves it to
 * the stage they call for. Returns the summary and the stage it moved to.
 */
export async function recalcLedger(
  organizationId: string,
  leadId: string,
): Promise<{ summary: LedgerSummary; movedTo: string | null } | null> {
  const [{ data: lead }, { data: rows, error }] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .select("id, budget, stage_id, funnel")
      .eq("id", leadId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabaseAdmin
      .from("lead_payments")
      .select("amount")
      .eq("lead_id", leadId)
      .eq("organization_id", organizationId),
  ]);
  if (!lead || error) return null;
  const summary = ledgerSummary(Number(lead.budget) || 0, rows ?? []);

  const [{ data: stages }, merchant] = await Promise.all([
    supabaseAdmin
      .from("pipeline_stages")
      .select("id, name, pipeline_name, position, is_won, is_lost")
      .eq("organization_id", organizationId),
    loadMerchant(organizationId),
  ]);
  const movedTo = ledgerStage({
    stages: (stages ?? []) as StageRow[],
    currentStageId: lead.stage_id,
    pipeline: lead.funnel ?? null,
    summary,
    configured: merchant?.paidStages ?? {},
  });
  await supabaseAdmin
    .from("leads")
    .update(
      movedTo ? { paid_amount: summary.paid, stage_id: movedTo } : { paid_amount: summary.paid },
    )
    .eq("id", leadId)
    .eq("organization_id", organizationId);
  return { summary, movedTo };
}

export async function addLeadPayment(input: {
  organizationId: string;
  leadId: string;
  amount: number;
  method: PaymentMethod;
  paidAt?: string | null;
  note?: string | null;
  linkId?: string | null;
  createdBy?: string | null;
}): Promise<{ id: string } | { error: string; missing?: boolean }> {
  const { data, error } = await supabaseAdmin
    .from("lead_payments")
    .insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      amount: Math.round(input.amount),
      method: input.method,
      paid_at: input.paidAt ?? new Date().toISOString(),
      note: input.note?.trim() || null,
      link_id: input.linkId ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message, missing: isLedgerMissing(error) };
  // A client who paid has plainly been reached: the speed-to-lead timer stops.
  await supabaseAdmin
    .from("leads")
    .update({ first_contact_at: new Date().toISOString() })
    .eq("id", input.leadId)
    .is("first_contact_at", null);
  const res = await recalcLedger(input.organizationId, input.leadId);
  // A Payme/Click payment writes its own history line (settle.server.ts).
  if (!input.linkId) {
    const remaining =
      res && res.summary.total > 0
        ? res.summary.remaining > 0
          ? ` · qoldiq ${formatSom(res.summary.remaining)} so'm`
          : " · to'liq to'landi"
        : "";
    await supabaseAdmin.from("lead_activities").insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      type: "note",
      created_by: input.createdBy ?? null,
      content: `💵 To'lov: ${formatSom(input.amount)} so'm (${METHOD_LABEL[input.method]})${input.note?.trim() ? ` — ${input.note.trim()}` : ""}${remaining}`,
    });
  }
  return { id: data.id };
}
