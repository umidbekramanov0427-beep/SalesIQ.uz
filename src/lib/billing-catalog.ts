// Hisob va to'lov (5CRM style): what a company can buy and what it costs.
// The platform owner sets the prices (platform_settings.billing_catalog,
// Platforma -> Sozlamalar); missing ones fall back to DEFAULT_CATALOG.
// quote() turns a cart -- seats, months, modules -- into the price table the
// page shows and the amount the server takes from the balance. Pure: the
// page and the server share it, so both always agree on the sum.
import type { Feature } from "@/lib/plan-gating";

/** Modules a company can switch on; each opens one gated feature. */
export const BILLING_MODULES = [
  "telephony",
  "analytics",
  "integrations",
  "automation",
  "bulk",
  "forms",
  "esign",
  "warehouse",
] as const;
export type BillingModule = (typeof BILLING_MODULES)[number];

/** Modules charged per seat (the rest are one price for the company). */
export const PER_SEAT_MODULES: ReadonlySet<BillingModule> = new Set(["telephony"]);

/** The feature (lib/plan-gating) each module opens; the warehouse has its own gate. */
export const MODULE_FEATURE: Partial<Record<BillingModule, Feature>> = {
  telephony: "telephony",
  analytics: "analytics",
  integrations: "integrations",
  automation: "automation",
  bulk: "bulk_messaging",
  forms: "web_forms",
  esign: "esignature",
};

/** Whether the company's active modules open `feature`. */
export function modulesGrant(modules: readonly string[] | null | undefined, feature: Feature) {
  if (!modules?.length) return false;
  return (Object.entries(MODULE_FEATURE) as [BillingModule, Feature][]).some(
    ([m, f]) => f === feature && modules.includes(m),
  );
}

/** 3 / 6 / 9 (+1 free) / 12 (+2 free) months, as in 5CRM. */
export const BILLING_PERIODS = [3, 6, 9, 12] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];
export const isBillingPeriod = (v: unknown): v is BillingPeriod =>
  (BILLING_PERIODS as readonly unknown[]).includes(v);
export const freeMonths = (m: number) => (m >= 12 ? 2 : m >= 9 ? 1 : 0);

export type CatalogPrice = { monthly: number; setup: number };

export type BillingCatalog = {
  /** CRM, per seat per month (every company buys it). */
  crmSeat: number;
  modules: Record<BillingModule, CatalogPrice>;
  /** Click / Payme commission added to a top-up, %. */
  commissionPct: number;
  /** The smallest top-up that is credited, so'm. */
  minTopup: number;
  maxSeats: number;
};

export const DEFAULT_CATALOG: BillingCatalog = {
  crmSeat: 50_000,
  modules: {
    telephony: { monthly: 50_000, setup: 0 },
    analytics: { monthly: 499_000, setup: 0 },
    integrations: { monthly: 599_000, setup: 0 },
    automation: { monthly: 599_000, setup: 0 },
    bulk: { monthly: 299_000, setup: 0 },
    forms: { monthly: 199_000, setup: 0 },
    esign: { monthly: 299_000, setup: 0 },
    warehouse: { monthly: 599_000, setup: 0 },
  },
  commissionPct: 1.5,
  minTopup: 1_000,
  maxSeats: 500,
};

const num = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** The owner's stored price list over the defaults (anything malformed keeps the default). */
export function parseCatalog(raw: unknown): BillingCatalog {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mods = (o["modules"] && typeof o["modules"] === "object" ? o["modules"] : {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const modules = Object.fromEntries(
    BILLING_MODULES.map((m) => {
      const d = DEFAULT_CATALOG.modules[m];
      const v = mods[m] ?? {};
      return [m, { monthly: num(v["monthly"], d.monthly), setup: num(v["setup"], d.setup) }];
    }),
  ) as Record<BillingModule, CatalogPrice>;
  return {
    crmSeat: num(o["crmSeat"], DEFAULT_CATALOG.crmSeat),
    modules,
    commissionPct: Math.min(10, num(o["commissionPct"], DEFAULT_CATALOG.commissionPct)),
    minTopup: num(o["minTopup"], DEFAULT_CATALOG.minTopup),
    maxSeats: Math.max(1, Math.round(num(o["maxSeats"], DEFAULT_CATALOG.maxSeats))),
  };
}

export type Cart = { seats: number; months: BillingPeriod; modules: BillingModule[] };

/** A cart from anything (the stored last purchase, a request body); null when unusable. */
export function parseCart(raw: unknown, catalog: BillingCatalog = DEFAULT_CATALOG): Cart | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seats = Math.round(num(o["seats"], 0));
  const months = o["months"];
  if (seats < 1 || seats > catalog.maxSeats || !isBillingPeriod(months)) return null;
  const mods = Array.isArray(o["modules"]) ? (o["modules"] as unknown[]) : [];
  const modules = BILLING_MODULES.filter((m) => mods.includes(m));
  return { seats, months, modules };
}

export type QuoteLine = {
  key: "crm" | BillingModule;
  /** Seats × price for per-seat lines, else 1. */
  qty: number;
  unit: number;
  first: number;
  monthly: number;
};

export type Quote = {
  lines: QuoteLine[];
  /** The first month (with one-time setup fees) and every month after it. */
  firstMonth: number;
  monthly: number;
  months: BillingPeriod;
  bonusMonths: number;
  /** Days the purchase adds: (months + bonus) × 30. */
  days: number;
  /** What the balance pays: the first month + (months − 1) × monthly. */
  total: number;
};

export function quote(cart: Cart, catalog: BillingCatalog): Quote {
  const lines: QuoteLine[] = [
    {
      key: "crm",
      qty: cart.seats,
      unit: catalog.crmSeat,
      first: cart.seats * catalog.crmSeat,
      monthly: cart.seats * catalog.crmSeat,
    },
  ];
  for (const m of BILLING_MODULES) {
    if (!cart.modules.includes(m)) continue;
    const p = catalog.modules[m];
    const qty = PER_SEAT_MODULES.has(m) ? cart.seats : 1;
    lines.push({
      key: m,
      qty,
      unit: p.monthly,
      first: qty * p.monthly + p.setup,
      monthly: qty * p.monthly,
    });
  }
  const firstMonth = lines.reduce((s, l) => s + l.first, 0);
  const monthly = lines.reduce((s, l) => s + l.monthly, 0);
  const bonus = freeMonths(cart.months);
  return {
    lines,
    firstMonth,
    monthly,
    months: cart.months,
    bonusMonths: bonus,
    days: (cart.months + bonus) * 30,
    total: firstMonth + monthly * (cart.months - 1),
  };
}

/** A top-up: what the client pays for `credit` to land on the balance (commission on top). */
export function topupCharge(credit: number, commissionPct: number): number {
  return Math.ceil(Math.max(0, credit) * (1 + commissionPct / 100));
}

/** What a paid top-up credits: the payment minus the commission. */
export function topupCredit(paid: number, commissionPct: number): number {
  return Math.floor(Math.max(0, paid) / (1 + commissionPct / 100));
}

/** Short of the balance: the credit still needed and what paying it costs. */
export function shortfall(total: number, balance: number, commissionPct: number) {
  const credit = Math.max(0, total - Math.max(0, balance));
  return { credit, charge: topupCharge(credit, commissionPct) };
}

/** The extra_seats a purchase sets: the seats bought above the plan's included ones. */
export function extraSeatsFor(seats: number, includedSeats: number | null): number {
  if (includedSeats === null) return 0;
  return Math.max(0, seats - includedSeats);
}
