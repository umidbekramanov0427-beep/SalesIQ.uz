// Marketing AI tahlilchi: what the AI is given and what is kept of its
// answer. Pure.
//   * factsOf: the period's figures (and the previous period's) as a small
//     JSON the model reads -- the only numbers it may use;
//   * the answer is findings in a strict shape (problem, evidence, analysis,
//     assumptions, recommendations, priority); validateFindings drops a
//     finding whose evidence cites a number that is not in the facts, so a
//     made-up figure never reaches the page;
//   * inputHash: the cache key -- the same facts are not sent twice.
import type { Metrics, Priority } from "@/lib/marketing-ai/metrics";

export type Facts = Record<string, unknown>;

const r2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);
const pct = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 10);

export function factsOf(m: Metrics, prev: Metrics | null): Facts {
  const one = (x: Metrics) => ({
    leads: x.funnel.leads,
    picked_up: x.funnel.pickedUp,
    watched_webinar: x.funnel.watched,
    qualified: x.funnel.qualified,
    not_qualified: x.funnel.notQualified,
    not_decided: x.funnel.pending,
    not_qualified_reasons: x.funnel.reasons,
    prepaid: x.funnel.advance,
    paid_full: x.funnel.full,
    revenue_uzs: Math.round(x.funnel.revenue),
    pickup_rate_pct: pct(x.rates.pickUp),
    qual_rate_pct: pct(x.rates.qual),
    lead_to_prepaid_pct: pct(x.rates.leadToAdvance),
    prepaid_to_full_pct: pct(x.rates.advanceToFull),
    spend_uzs: x.efficiency.spend,
    cpl_uzs: x.efficiency.cpl,
    cpql_uzs: x.efficiency.cpql,
    cac_uzs: x.efficiency.cac,
    roas: r2(x.efficiency.roas),
    roi_pct: x.efficiency.roi,
    webinars: x.audience.webinars,
    registrations: x.audience.registrations,
    peak_avg: x.audience.peakAvg,
    attendance_pct: pct(x.audience.attendance),
    drop_from_peak_pct: pct(x.audience.dropAvg),
    worst_stage: x.audience.worst,
    subscribers: x.audience.subscribers,
    subscribers_change: x.audience.subscribersDelta,
  });
  return {
    period: m.period,
    current: one(m),
    previous: prev ? one(prev) : null,
    missing_data: m.missing,
    campaigns: m.campaigns.slice(0, 15).map((c) => ({
      name: c.name,
      leads: c.leads,
      qualified: c.qualified,
      qual_rate_pct: pct(c.qualRate),
      prepaid: c.advance,
      paid_full: c.full,
      spend_uzs: c.spend,
      cpl_uzs: c.cpl,
      cpql_uzs: c.cpql,
      roas: r2(c.roas),
      wrong_or_no_number: c.reasons.wrong_number + c.reasons.no_number,
    })),
  };
}

export type Finding = {
  problem: string;
  evidence: string[];
  analysis: string;
  assumptions: string[];
  recommendations: string[];
  priority: Priority;
  metric: string | null;
};

/** Every number in the facts (and its common roundings), for checking the evidence. */
export function numbersIn(value: unknown, out = new Set<number>()): Set<number> {
  if (typeof value === "number" && Number.isFinite(value)) {
    out.add(value);
    out.add(Math.round(value));
    out.add(Math.round(value * 10) / 10);
  } else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, out));
  else if (value && typeof value === "object")
    Object.values(value).forEach((v) => numbersIn(v, out));
  return out;
}

/** Numbers written in a sentence: "12 400", "38,5%", "1.2". */
export function numbersOf(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/-?\d[\d\s\u00a0]*(?:[.,]\d+)?/g)) {
    const raw = m[0].replace(/[\s\u00a0]/g, "").replace(",", ".");
    const n = Number(raw);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function known(n: number, facts: Set<number>): boolean {
  if (Math.abs(n) < 10 && Number.isInteger(n)) return true; // small counts ("3 kampaniya")
  for (const f of facts) {
    if (f === n) return true;
    const tol = Math.max(1, Math.abs(f) * 0.01);
    if (Math.abs(f - n) <= tol) return true;
  }
  return false;
}

const PRIORITIES: Priority[] = ["critical", "warning", "opportunity"];
const strs = (v: unknown, max: number) =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string" && !!x.trim())
        .map((x) => x.trim().slice(0, 400))
        .slice(0, max)
    : [];

/** Keeps the well-formed findings whose evidence uses only the facts' numbers. */
export function validateFindings(
  raw: unknown,
  facts: Facts,
): { findings: Finding[]; rejected: number } {
  const list =
    (raw && typeof raw === "object" ? (raw as { findings?: unknown }).findings : null) ?? [];
  const nums = numbersIn(facts);
  const findings: Finding[] = [];
  let rejected = 0;
  for (const f of Array.isArray(list) ? list : []) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    const problem = typeof o["problem"] === "string" ? o["problem"].trim().slice(0, 300) : "";
    const evidence = strs(o["evidence"], 6);
    const recommendations = strs(o["recommendations"], 5);
    if (!problem || !evidence.length || !recommendations.length) {
      rejected++;
      continue;
    }
    if (!evidence.every((e) => numbersOf(e).every((n) => known(n, nums)))) {
      rejected++;
      continue;
    }
    findings.push({
      problem,
      evidence,
      analysis: typeof o["analysis"] === "string" ? o["analysis"].trim().slice(0, 1200) : "",
      assumptions: strs(o["assumptions"], 4),
      recommendations,
      priority: PRIORITIES.includes(o["priority"] as Priority)
        ? (o["priority"] as Priority)
        : "warning",
      metric: typeof o["metric"] === "string" ? o["metric"].slice(0, 60) : null,
    });
  }
  return { findings: findings.slice(0, 8), rejected };
}

/** A stable short hash of the facts (FNV-1a over sorted JSON). */
export function inputHash(value: unknown): string {
  const json = JSON.stringify(sortKeys(value));
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + json.length.toString(16);
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  return v;
}

export const ANALYSIS_SYSTEM = `Siz marketing tahlilchisisiz (o'zbek tilida yozing). Sizga kompaniyaning SalesIQ'dagi haqiqiy raqamlari JSON ko'rinishida beriladi (current — tanlangan davr, previous — undan oldingi xuddi shunday davr).

Qoidalar:
- FAQAT berilgan raqamlardan foydalaning. Yangi raqam o'ylab topmang, hisoblamang, taxmin qilmang. "evidence" ichidagi har bir raqam JSON'da bo'lishi shart.
- Kval lid = telefonni ko'targan VA vebinarni ko'rgan lid. Sotuv bo'lgani kvalga ta'sir qilmaydi.
- Ma'lumot yetishmasa (missing_data), buni ochiq ayting va shu haqda xulosa chiqarmang.
- Faktni (raqam), taxminni (assumptions) va tavsiyani (recommendations) aralashtirmang.
- Tavsiyalar aniq va bajariladigan bo'lsin (kim, nima qiladi).
- priority: "critical" (pul yo'qotilyapti / jiddiy muammo), "warning" (yomonlashyapti), "opportunity" (o'sish imkoniyati).
- metric: muammo bog'liq ko'rsatkich kaliti, quyidagilardan biri: qual_rate, pickup_rate, bad_number_rate, attendance, drop_from_peak, roas, cpl, cpql, cac, lead_to_advance, advance_to_full, leads.

Faqat JSON qaytaring:
{"findings":[{"problem":"...","evidence":["raqamli fakt", "..."],"analysis":"...","assumptions":["..."],"recommendations":["1-qadam","2-qadam"],"priority":"critical|warning|opportunity","metric":"..."}]}
3-6 ta eng muhim topilma, eng muhimi birinchi.`;
