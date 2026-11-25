// Ombor (warehouse) rules that need no database: stock status and the
// repeat-sale forecast (when a client's goods run out, from the gaps
// between their own delivered orders).

export type StockState = "ok" | "low" | "out";

/** Free stock (on hand minus reserved) against the product's minimum. */
export function stockState(qty: number, reserved: number, minStock: number): StockState {
  const free = qty - reserved;
  if (free <= 0) return "out";
  if (minStock > 0 && free < minStock) return "low";
  return "ok";
}

export type RepeatOrder = {
  leadId: string | null;
  status: string;
  total: number;
  deliveredAt: string | null;
  createdAt: string;
  productIds: string[];
};

export type RepeatCandidate = {
  leadId: string;
  orders: number;
  totalSpent: number;
  avgCheck: number;
  /** Average days between the client's orders (null with one order and no fallback). */
  intervalDays: number | null;
  lastAt: string;
  /** When the next order is expected (last + interval). */
  dueAt: string | null;
  /** Days from `now` to dueAt: negative = overdue. */
  dueInDays: number | null;
  /** Products in their orders, most often first. */
  usualProducts: string[];
};

const DAY = 86_400_000;

/**
 * One row per client with at least one delivered order. A client with a
 * single order gets `fallbackDays` (the company's typical gap) as interval.
 */
export function repeatCandidates(
  orders: RepeatOrder[],
  now: Date = new Date(),
  fallbackDays: number | null = 30,
): RepeatCandidate[] {
  const byLead = new Map<string, RepeatOrder[]>();
  for (const o of orders) {
    if (!o.leadId || o.status !== "delivered") continue;
    byLead.set(o.leadId, [...(byLead.get(o.leadId) ?? []), o]);
  }
  const out: RepeatCandidate[] = [];
  for (const [leadId, list] of byLead) {
    const times = list
      .map((o) => Date.parse(o.deliveredAt ?? o.createdAt))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    if (!times.length) continue;
    let interval: number | null = fallbackDays;
    if (times.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < times.length; i++) gaps.push((times[i]! - times[i - 1]!) / DAY);
      interval = Math.max(1, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
    const last = times[times.length - 1]!;
    const due = interval == null ? null : last + interval * DAY;
    const totalSpent = list.reduce((s, o) => s + (o.total || 0), 0);
    const counts = new Map<string, number>();
    for (const o of list)
      for (const p of new Set(o.productIds)) counts.set(p, (counts.get(p) ?? 0) + 1);
    out.push({
      leadId,
      orders: list.length,
      totalSpent,
      avgCheck: Math.round(totalSpent / list.length),
      intervalDays: interval,
      lastAt: new Date(last).toISOString(),
      dueAt: due == null ? null : new Date(due).toISOString(),
      dueInDays: due == null ? null : Math.round((due - now.getTime()) / DAY),
      usualProducts: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p),
    });
  }
  return out.sort((a, b) => (a.dueInDays ?? 1e9) - (b.dueInDays ?? 1e9));
}

/** Clients whose goods run out within `days` (or already did, but not long ago). */
export function dueSoon(list: RepeatCandidate[], days = 7, staleAfter = 60): RepeatCandidate[] {
  return list.filter(
    (c) => c.dueInDays != null && c.dueInDays <= days && c.dueInDays >= -staleAfter,
  );
}

/** Clients silent for longer than `days` past their expected order. */
export function dormant(list: RepeatCandidate[], days = 60): RepeatCandidate[] {
  return list.filter((c) => c.dueInDays != null && c.dueInDays < -days);
}

/** Default stages of a new warehouse funnel and the order status each stands for. */
export const WAREHOUSE_STAGES: {
  name: string;
  color: string;
  orderStatus: string | null;
  stageValue: "new" | "in_work" | "expected" | "sale" | "refused";
  probability: number;
  isWon?: boolean;
  isLost?: boolean;
}[] = [
  { name: "Yangi mijoz", color: "#94A3B8", orderStatus: null, stageValue: "new", probability: 10 },
  {
    name: "Buyurtma",
    color: "#3B82F6",
    orderStatus: "new",
    stageValue: "in_work",
    probability: 40,
  },
  {
    name: "Tayyorlanmoqda",
    color: "#F59E0B",
    orderStatus: "preparing",
    stageValue: "in_work",
    probability: 60,
  },
  {
    name: "Yig'ilmoqda",
    color: "#8B5CF6",
    orderStatus: "picking",
    stageValue: "expected",
    probability: 75,
  },
  {
    name: "Yo'lda",
    color: "#0EA5E9",
    orderStatus: "shipped",
    stageValue: "expected",
    probability: 90,
  },
  {
    name: "Yetkazildi",
    color: "#10B981",
    orderStatus: "delivered",
    stageValue: "sale",
    probability: 100,
    isWon: true,
  },
  {
    name: "Bekor qilindi",
    color: "#EF4444",
    orderStatus: "cancelled",
    stageValue: "refused",
    probability: 0,
    isLost: true,
  },
];

// The funnel filter's "Ombor" group (warehouse funnels only): three ready
// presets and the order fields. Kept in the URL as one `wh` value,
// "p=due;s=new,shipped;pr=<id>,<id>;min=100;max=" (empty parts dropped).
export type WhPreset = "" | "due" | "dormant" | "noOrder";
export type WhFilter = {
  preset: WhPreset;
  /** Status of the client's latest order. */
  statuses: string[];
  /** Bought any of these products. */
  productIds: string[];
  /** All delivered orders together, from-to. */
  spentMin: number | null;
  spentMax: number | null;
};
export const EMPTY_WH_FILTER: WhFilter = {
  preset: "",
  statuses: [],
  productIds: [],
  spentMin: null,
  spentMax: null,
};

export function parseWhFilter(raw: string | undefined | null): WhFilter {
  const out: WhFilter = { ...EMPTY_WH_FILTER, statuses: [], productIds: [] };
  for (const part of (raw ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const k = part.slice(0, i);
    const v = decodeURIComponent(part.slice(i + 1));
    const num = v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v);
    if (k === "p" && (v === "due" || v === "dormant" || v === "noOrder")) out.preset = v;
    else if (k === "s") out.statuses = v.split(",").filter(Boolean);
    else if (k === "pr") out.productIds = v.split(",").filter(Boolean);
    else if (k === "min") out.spentMin = num;
    else if (k === "max") out.spentMax = num;
  }
  return out;
}

export function encodeWhFilter(f: WhFilter): string {
  const parts: string[] = [];
  if (f.preset) parts.push(`p=${f.preset}`);
  if (f.statuses.length) parts.push(`s=${encodeURIComponent(f.statuses.join(","))}`);
  if (f.productIds.length) parts.push(`pr=${encodeURIComponent(f.productIds.join(","))}`);
  if (f.spentMin != null) parts.push(`min=${f.spentMin}`);
  if (f.spentMax != null) parts.push(`max=${f.spentMax}`);
  return parts.join(";");
}

export function whFilterCount(f: WhFilter): number {
  return (
    (f.preset ? 1 : 0) +
    (f.statuses.length ? 1 : 0) +
    (f.productIds.length ? 1 : 0) +
    (f.spentMin != null || f.spentMax != null ? 1 : 0)
  );
}

/** What the filter needs to know about each client, built once from the orders. */
export type WhLeadFacts = {
  lastStatus: Map<string, string>;
  spent: Map<string, number>;
  products: Map<string, Set<string>>;
  due: Set<string>;
  dormant: Set<string>;
};

export function whLeadFacts(
  orders: (RepeatOrder & { leadId: string | null })[],
  now: Date = new Date(),
): WhLeadFacts {
  const lastStatus = new Map<string, string>();
  const lastAt = new Map<string, number>();
  const spent = new Map<string, number>();
  const products = new Map<string, Set<string>>();
  for (const o of orders) {
    if (!o.leadId) continue;
    const at = Date.parse(o.createdAt);
    if (!lastAt.has(o.leadId) || at > lastAt.get(o.leadId)!) {
      lastAt.set(o.leadId, at);
      lastStatus.set(o.leadId, o.status);
    }
    if (o.status === "delivered") spent.set(o.leadId, (spent.get(o.leadId) ?? 0) + (o.total || 0));
    if (o.status !== "cancelled") {
      const set = products.get(o.leadId) ?? new Set<string>();
      for (const p of o.productIds) set.add(p);
      products.set(o.leadId, set);
    }
  }
  const list = repeatCandidates(orders, now);
  return {
    lastStatus,
    spent,
    products,
    due: new Set(dueSoon(list).map((c) => c.leadId)),
    dormant: new Set(dormant(list).map((c) => c.leadId)),
  };
}

export function whLeadMatches(leadId: string, f: WhFilter, facts: WhLeadFacts): boolean {
  if (f.preset === "due" && !facts.due.has(leadId)) return false;
  if (f.preset === "dormant" && !facts.dormant.has(leadId)) return false;
  if (f.preset === "noOrder" && facts.lastStatus.has(leadId)) return false;
  if (f.statuses.length && !f.statuses.includes(facts.lastStatus.get(leadId) ?? "")) return false;
  if (f.productIds.length) {
    const bought = facts.products.get(leadId);
    if (!bought || !f.productIds.some((p) => bought.has(p))) return false;
  }
  const s = facts.spent.get(leadId) ?? 0;
  if (f.spentMin != null && s < f.spentMin) return false;
  if (f.spentMax != null && s > f.spentMax) return false;
  return true;
}

// Mahsulotlarni Excel'dan yuklash: a table pasted from Excel (tab-separated)
// or a CSV file. The header row is recognised in uz/ru/en; without one the
// columns are read in this order: name, SKU, category, unit, price, cost,
// minimum, quantity on hand.
export type ImportedProduct = {
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  price: number;
  cost: number;
  minStock: number;
  qty: number;
};

const IMPORT_COLS: [keyof ImportedProduct, RegExp][] = [
  ["sku", /^(sku|kod|артикул|код|article)/i],
  ["category", /^(kategor|категор|categor|guruh|группа)/i],
  ["unit", /^(birlik|unit|ед|o'lchov)/i],
  ["cost", /^(tannarx|cost|себест|kirim narx|закуп)/i],
  ["price", /^(narx|price|цена|sotuv narx)/i],
  ["minStock", /^(min)/i],
  ["qty", /^(qoldiq|soni|qty|quantity|остат|кол|miqdor)/i],
  ["name", /^(nomi|nom|name|наимен|название|mahsulot|товар|product)/i],
];

const toNumber = (v: string | undefined) => {
  const n = Number((v ?? "").replace(/[\s\u00a0]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function splitRow(line: string, sep: string): string[] {
  if (sep === "\t") return line.split("\t").map((c) => c.trim());
  // CSV with quotes.
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === sep && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseProductTable(text: string): ImportedProduct[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0]!;
  const sep = first.includes("\t")
    ? "\t"
    : first.split(";").length > first.split(",").length
      ? ";"
      : ",";
  const head = splitRow(first, sep);
  const map = new Map<keyof ImportedProduct, number>();
  head.forEach((h, i) => {
    const hit = IMPORT_COLS.find(([key, re]) => re.test(h.trim()) && !map.has(key));
    if (hit) map.set(hit[0], i);
  });
  const hasHeader = map.has("name");
  const order: (keyof ImportedProduct)[] = [
    "name",
    "sku",
    "category",
    "unit",
    "price",
    "cost",
    "minStock",
    "qty",
  ];
  const col = (k: keyof ImportedProduct) => (hasHeader ? map.get(k) : order.indexOf(k));
  const out: ImportedProduct[] = [];
  for (const line of hasHeader ? lines.slice(1) : lines) {
    const c = splitRow(line, sep);
    const at = (k: keyof ImportedProduct) => {
      const i = col(k);
      return i == null || i < 0 ? undefined : c[i];
    };
    const name = (at("name") ?? "").trim();
    if (!name) continue;
    out.push({
      name,
      sku: at("sku")?.trim() || null,
      category: at("category")?.trim() || null,
      unit: at("unit")?.trim() || "dona",
      price: toNumber(at("price")),
      cost: toNumber(at("cost")),
      minStock: toNumber(at("minStock")),
      qty: toNumber(at("qty")),
    });
  }
  return out;
}
