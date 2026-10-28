// Where a lead goes once its client has paid: the stage the company picked
// for that funnel, else the funnel's won stage, else nowhere. Pure, so the
// rule is unit-tested; settle.server.ts applies it.

export type StageRow = {
  id: string;
  pipeline_name: string | null;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  name?: string | null;
};

export function pickPaidStage(
  stages: StageRow[],
  pipelineName: string | null,
  configured: Record<string, unknown>,
): string | null {
  const funnel = pipelineName ?? "";
  const inFunnel = stages.filter((s) => (s.pipeline_name ?? "") === funnel);
  const chosen = configured[funnel];
  if (typeof chosen === "string" && inFunnel.some((s) => s.id === chosen)) return chosen;
  const won = inFunnel
    .filter((s) => s.is_won && !s.is_lost)
    .sort((a, b) => a.position - b.position);
  return won[0]?.id ?? null;
}

/** "990 000" -- so'm with thin grouping, for messages and the pay page. */
export function formatSom(amount: number): string {
  return String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Whole so'm between 1 000 and 100 000 000, or null. */
export function parseAmount(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[\s,]/g, ""));
  if (!Number.isFinite(n)) return null;
  const v = Math.round(n);
  return v >= 1000 && v <= 100_000_000 ? v : null;
}

/** Payme's checkout page for one bill (amount in tiyin, back to `back` when done). */
export function paymeCheckoutUrl(merchantId: string, linkId: string, amount: number, back: string) {
  const raw = `m=${merchantId};ac.order_id=${linkId};a=${Math.round(amount * 100)};l=uz;c=${back}`;
  return `https://checkout.paycom.uz/${btoa(raw)}`;
}

/** Click's checkout page for one bill. */
export function clickCheckoutUrl(
  serviceId: string,
  merchantId: string,
  linkId: string,
  amount: number,
  back: string,
) {
  const q = new URLSearchParams({
    service_id: serviceId,
    merchant_id: merchantId,
    amount: String(Math.round(amount)),
    transaction_param: linkId,
    return_url: back,
  });
  return `https://my.click.uz/services/pay?${q.toString()}`;
}
