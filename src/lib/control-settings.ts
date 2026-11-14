// Nazorat → «Sozlash»: how Normativ, Jarimalar, KPI and Reja va fakt count
// and what the team's celebrations say. Stored in
// org_general_settings.control_settings (one JSON per company); the
// database reads the celebration part too (check_plan_milestones). Pure, so
// the parsing and the numbers are tested.

export const KPI_METRICS = [
  "callsMade",
  "callsConnected",
  "totalCallMinutes",
  "totalLeads",
  "salesCount",
  "revenue",
  "conversionPct",
  "meetingsCount",
] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];

export const CELEBRATION_STYLES = [
  "confetti",
  "fireworks",
  "rocket",
  "trophy",
  "balloons",
] as const;
export type CelebrationStyle = (typeof CELEBRATION_STYLES)[number];

/** How many pieces a plan is cut into; a celebration fires at each one. */
export const PLAN_PARTS = [2, 4, 5, 8, 10] as const;

export const FINE_RULES = [
  "Ishlanmagan yangi lid",
  "Bajarilmagan zadacha",
  "Noto'g'ri LOST",
  "Javobsiz kiruvchi aloqa",
] as const;
export type FineRule = (typeof FINE_RULES)[number];

export type CelebrationRule = { on: boolean; text: string; style: CelebrationStyle };

export type ControlSettings = {
  normativ: {
    /** Pace at or above this % of where the month should be: «Rejada». */
    onTrack: number;
    /** At or above this (and below onTrack): «Xavf ostida»; below: «Ortda». */
    atRisk: number;
    basis: "revenue" | "deals";
    /** Empty = every funnel counts. */
    pipelineIds: string[];
    excludeInterns: boolean;
  };
  kpi: {
    metrics: Record<KpiMetric, boolean>;
    /** The month's target per person for each figure (0 = none). */
    targets: Record<KpiMetric, number>;
    /** How much each figure weighs in the KPI score. */
    weights: Record<KpiMetric, number>;
    meetingTags: string[];
  };
  fines: {
    auto: boolean;
    /** At most this much in fines per person per month (null = no limit). */
    monthlyCap: number | null;
    notifyPerson: boolean;
  };
  celebrations: {
    /** The team's (or a funnel's) plan: each part reached, and the whole plan. */
    team: CelebrationRule & { doneText: string };
    /** A manager's own plan. */
    personal: CelebrationRule & { audience: "all" | "self" };
    /** The day's first sale in the company. */
    firstSale: CelebrationRule;
    /** The funnel's «Sotuv bayrami» look. */
    sale: { style: CelebrationStyle };
    sound: boolean;
    seconds: number;
  };
};

export const DEFAULT_TEXTS = {
  team: "Tabriklayman! Biz rejamizning {pct}% ini bosib o'tdik — {fact} / {target}",
  teamDone: "Reja to'liq bajarildi! {fact} — bu {target} rejaning 100% i",
  personal: "{name} shaxsiy rejasining {pct}% ini bajardi!",
  firstSale: "Bugungi birinchi sotuv! {name} ochib berdi",
} as const;

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  normativ: { onTrack: 90, atRisk: 60, basis: "revenue", pipelineIds: [], excludeInterns: false },
  kpi: {
    metrics: Object.fromEntries(KPI_METRICS.map((m) => [m, true])) as Record<KpiMetric, boolean>,
    targets: Object.fromEntries(KPI_METRICS.map((m) => [m, 0])) as Record<KpiMetric, number>,
    weights: {
      callsMade: 1,
      callsConnected: 1,
      totalCallMinutes: 1,
      totalLeads: 0,
      salesCount: 2,
      revenue: 3,
      conversionPct: 1,
      meetingsCount: 1,
    },
    meetingTags: ["uchrashuv", "ofis", "meeting"],
  },
  fines: { auto: true, monthlyCap: null, notifyPerson: true },
  celebrations: {
    team: {
      on: true,
      text: DEFAULT_TEXTS.team,
      doneText: DEFAULT_TEXTS.teamDone,
      style: "confetti",
    },
    personal: { on: true, text: DEFAULT_TEXTS.personal, style: "trophy", audience: "all" },
    firstSale: { on: false, text: DEFAULT_TEXTS.firstSale, style: "rocket" },
    sale: { style: "confetti" },
    sound: true,
    seconds: 6,
  },
};

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const num = (v: unknown, def: number, min: number, max: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
const text = (v: unknown, def: string, max = 300) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : def;
const style = (v: unknown, def: CelebrationStyle): CelebrationStyle =>
  (CELEBRATION_STYLES as readonly string[]).includes(v as string) ? (v as CelebrationStyle) : def;
const strList = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string" && !!x.trim()))]
        .map((x) => x.trim())
        .slice(0, max)
    : [];

/** Any saved value → complete settings (bad or missing parts fall back to the defaults). */
export function parseControlSettings(raw: unknown): ControlSettings {
  const r = obj(raw);
  const d = DEFAULT_CONTROL_SETTINGS;
  const n = obj(r["normativ"]);
  const onTrack = num(n["onTrack"], d.normativ.onTrack, 1, 200);
  const k = obj(r["kpi"]);
  const km = obj(k["metrics"]);
  const kt = obj(k["targets"]);
  const kw = obj(k["weights"]);
  const f = obj(r["fines"]);
  const c = obj(r["celebrations"]);
  const ct = obj(c["team"]);
  const cp = obj(c["personal"]);
  const cf = obj(c["firstSale"]);
  const tags = strList(k["meetingTags"], 20).map((x) => x.toLowerCase());
  return {
    normativ: {
      onTrack,
      atRisk: Math.min(onTrack, num(n["atRisk"], d.normativ.atRisk, 0, 200)),
      basis: n["basis"] === "deals" ? "deals" : "revenue",
      pipelineIds: strList(n["pipelineIds"], 100),
      excludeInterns: bool(n["excludeInterns"], d.normativ.excludeInterns),
    },
    kpi: {
      metrics: Object.fromEntries(
        KPI_METRICS.map((m) => [m, bool(km[m], d.kpi.metrics[m])]),
      ) as Record<KpiMetric, boolean>,
      targets: Object.fromEntries(KPI_METRICS.map((m) => [m, num(kt[m], 0, 0, 1e15)])) as Record<
        KpiMetric,
        number
      >,
      weights: Object.fromEntries(
        KPI_METRICS.map((m) => [m, num(kw[m], d.kpi.weights[m], 0, 10)]),
      ) as Record<KpiMetric, number>,
      meetingTags: Array.isArray(k["meetingTags"]) ? tags : d.kpi.meetingTags,
    },
    fines: {
      auto: bool(f["auto"], d.fines.auto),
      monthlyCap:
        f["monthlyCap"] == null || f["monthlyCap"] === ""
          ? null
          : num(f["monthlyCap"], 0, 0, 1e15) || null,
      notifyPerson: bool(f["notifyPerson"], d.fines.notifyPerson),
    },
    celebrations: {
      team: {
        on: bool(ct["on"], d.celebrations.team.on),
        text: text(ct["text"], d.celebrations.team.text),
        doneText: text(ct["doneText"], d.celebrations.team.doneText),
        style: style(ct["style"], d.celebrations.team.style),
      },
      personal: {
        on: bool(cp["on"], d.celebrations.personal.on),
        text: text(cp["text"], d.celebrations.personal.text),
        style: style(cp["style"], d.celebrations.personal.style),
        audience: cp["audience"] === "self" ? "self" : "all",
      },
      firstSale: {
        on: bool(cf["on"], d.celebrations.firstSale.on),
        text: text(cf["text"], d.celebrations.firstSale.text),
        style: style(cf["style"], d.celebrations.firstSale.style),
      },
      sale: { style: style(obj(c["sale"])["style"], d.celebrations.sale.style) },
      sound: bool(c["sound"], d.celebrations.sound),
      seconds: Math.round(num(c["seconds"], d.celebrations.seconds, 3, 15)),
    },
  };
}

/** Fills {name}-style places; unknown places stay as written. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

/** 1 250 000 000 → "1,25 mlrd", 250 000 000 → "250 mln", 85 000 → "85 ming". */
export function shortMoney(n: number): string {
  const abs = Math.abs(n);
  const fmt = (v: number) => (Math.round(v * 100) / 100).toString().replace(".", ",");
  if (abs >= 1e9) return `${fmt(n / 1e9)} mlrd`;
  if (abs >= 1e6) return `${fmt(n / 1e6)} mln`;
  if (abs >= 1e3) return `${fmt(n / 1e3)} ming`;
  return String(Math.round(n));
}

export type PlanPart = { part: number; pct: number; amount: number };

/** The plan's checkpoints: 4 parts of 1 mlrd → 250 mln (25%), 500 mln (50%)… */
export function planParts(target: number, parts: number): PlanPart[] {
  const n = Math.max(1, Math.round(parts));
  return Array.from({ length: n }, (_, i) => ({
    part: i + 1,
    pct: Math.round(((i + 1) / n) * 1000) / 10,
    amount: Math.round((target * (i + 1)) / n),
  }));
}

/** How many of the parts the fact has reached (0…parts). */
export function partsReached(fact: number, target: number, parts: number): number {
  if (!(target > 0) || !(parts > 0)) return 0;
  return Math.min(parts, Math.floor((fact / target) * parts + 1e-9));
}

/** Working days in a YYYY-MM-01 month for ISO weekdays (1 = Monday … 7 = Sunday). */
export function workDaysInMonth(month: string, weekdays: readonly number[]): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= days; d++) {
    const wd = new Date(y, m - 1, d).getDay() || 7;
    if (weekdays.includes(wd)) n++;
  }
  return n;
}

/**
 * The KPI score: each figure against its target (capped at 150%), weighted.
 * Null when no figure has both a target and a weight.
 */
export function kpiScore(
  values: Partial<Record<KpiMetric, number>>,
  kpi: Pick<ControlSettings["kpi"], "targets" | "weights" | "metrics">,
): number | null {
  let sum = 0;
  let weight = 0;
  for (const m of KPI_METRICS) {
    const target = kpi.targets[m];
    const w = kpi.weights[m];
    if (!kpi.metrics[m] || !(target > 0) || !(w > 0)) continue;
    sum += Math.min(1.5, (values[m] ?? 0) / target) * w;
    weight += w;
  }
  return weight > 0 ? Math.round((sum / weight) * 100) : null;
}

/** Normativ status from the pace %, with the company's thresholds. */
export function paceStatus(
  pacePct: number,
  n: Pick<ControlSettings["normativ"], "onTrack" | "atRisk">,
): "onTrack" | "atRisk" | "behind" {
  return pacePct >= n.onTrack ? "onTrack" : pacePct >= n.atRisk ? "atRisk" : "behind";
}

/** What a team celebration notification carries in its link (`c` = kind, `s` = style, `pct`). */
export type CelebrationLink = { kind: string; style: CelebrationStyle | null; pct: number | null };

export function parseCelebrationLink(link: string | null | undefined): CelebrationLink {
  try {
    const u = new URL(link ?? "", "https://x.invalid");
    const pct = Number(u.searchParams.get("pct"));
    return {
      kind: u.searchParams.get("c") ?? "",
      style: style(u.searchParams.get("s"), "confetti"),
      pct: Number.isFinite(pct) && u.searchParams.has("pct") ? pct : null,
    };
  } catch {
    return { kind: "", style: null, pct: null };
  }
}
