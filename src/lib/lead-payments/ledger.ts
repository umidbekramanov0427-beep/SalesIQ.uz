// A lead's payments ledger: every payment the client made (cash, card,
// transfer, Payme, Click), what is still owed against the deal's sum, and
// the stage the lead should stand in for what has been paid -- a partial
// payment stage ("Yarim to'lov", "Предоплата") once something is paid, the
// paid/won stage once it is all paid. Pure, so it is unit-tested; the
// server (ledger.server.ts, settle.server.ts) applies it.
import { pickPaidStage, type StageRow } from "./paid-stage";

export const PAYMENT_METHODS = ["cash", "card", "transfer", "payme", "click", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && (PAYMENT_METHODS as readonly string[]).includes(v);
}

export type LedgerSummary = {
  total: number;
  paid: number;
  /** What is still owed (never below zero). */
  remaining: number;
  /** 0..100, for the progress bar; 0 when the deal has no sum. */
  percent: number;
  state: "none" | "partial" | "full";
};

export function ledgerSummary(total: number, payments: { amount: number }[]): LedgerSummary {
  const sum = Math.round(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const deal = Math.max(0, Math.round(Number(total) || 0));
  const remaining = Math.max(0, deal - sum);
  const state = sum <= 0 ? "none" : deal > 0 && sum < deal ? "partial" : "full";
  const percent = deal > 0 ? Math.min(100, Math.round((sum / deal) * 100)) : sum > 0 ? 100 : 0;
  return { total: deal, paid: sum, remaining, percent, state };
}

// A stage that means "paid in part": Uzbek, Russian and English names.
const PARTIAL_RE =
  /(yarim|qisman|bo'lib|avans|oldindan|предоплат|частичн|аванс|partial|prepay|deposit)/i;

/**
 * Where the lead should move for what has been paid, or null to leave it.
 * Only ever forward: a lead already further along (or closed as lost) stays.
 */
export function ledgerStage(input: {
  stages: StageRow[];
  currentStageId: string | null;
  pipeline: string | null;
  summary: LedgerSummary;
  configured: Record<string, unknown>;
}): string | null {
  const { stages, currentStageId, summary } = input;
  if (summary.state === "none") return null;
  const current = stages.find((s) => s.id === currentStageId) ?? null;
  if (current?.is_lost || current?.is_won) return null;
  const funnel = current?.pipeline_name ?? input.pipeline ?? "";
  let target: string | null = null;
  if (summary.state === "full") {
    target = pickPaidStage(stages, funnel, input.configured);
  } else {
    const partial = stages
      .filter(
        (s) =>
          (s.pipeline_name ?? "") === funnel &&
          !s.is_won &&
          !s.is_lost &&
          PARTIAL_RE.test(s.name ?? ""),
      )
      .sort((a, b) => a.position - b.position);
    target = partial[0]?.id ?? null;
  }
  if (!target || target === currentStageId) return null;
  const to = stages.find((s) => s.id === target);
  if (current && to && !to.is_won && to.position <= current.position) return null;
  return target;
}

/** "next payment" date state for the card: overdue, today, or later. */
export function nextPaymentState(
  date: string | null | undefined,
  today: Date,
): "overdue" | "today" | "later" | null {
  if (!date) return null;
  const d = date.slice(0, 10);
  const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return d < t ? "overdue" : d === t ? "today" : "later";
}
