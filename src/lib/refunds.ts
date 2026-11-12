// Pul qaytarish: clients who refused (before or after being accepted) and
// must get their money back. A manager switches "Pul qaytarish" on in the
// lead card, the refund lands in the Pul qaytarish section with the card to
// pay back to, and once the transfer's receipt is uploaded the bot sends it
// to the client. Pure helpers shared by the page, the server and the tests.

export type RefundStage = "before" | "after";
export type RefundStatus = "pending" | "refunded" | "cancelled";

export type RefundRow = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  client_name: string;
  phone: string | null;
  amount: number;
  paid_amount: number | null;
  card_number: string | null;
  card_holder: string | null;
  reason: string | null;
  stage: RefundStage;
  status: RefundStatus;
  receipt_path: string | null;
  receipt_name: string | null;
  notified_at: string | null;
  notify_error: string | null;
  refunded_at: string | null;
  refunded_by: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

/** Digits only; null unless it looks like a bank card (12-19 digits). */
export function cleanCardNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 12 && digits.length <= 19 ? digits : null;
}

/** "8600 1234 5678 9012" */
export function formatCard(digits: string | null | undefined): string {
  if (!digits) return "";
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** The bank by the card's first digits (Uzcard, Humo, Visa, Mastercard). */
export function cardBrand(digits: string | null | undefined): string | null {
  if (!digits) return null;
  if (digits.startsWith("8600") || digits.startsWith("5614")) return "Uzcard";
  if (digits.startsWith("9860")) return "Humo";
  if (digits.startsWith("4")) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
  return null;
}

export type RefundSummary = {
  total: number;
  pending: number;
  refunded: number;
  cancelled: number;
  /** Money still to send back (pending). */
  toPay: number;
  /** Money already sent back. */
  paidBack: number;
  before: number;
  after: number;
};

export function refundSummary(
  rows: Pick<RefundRow, "status" | "amount" | "stage">[],
): RefundSummary {
  const s: RefundSummary = {
    total: 0,
    pending: 0,
    refunded: 0,
    cancelled: 0,
    toPay: 0,
    paidBack: 0,
    before: 0,
    after: 0,
  };
  for (const r of rows) {
    if (r.status === "cancelled") {
      s.cancelled += 1;
      continue;
    }
    s.total += 1;
    if (r.stage === "after") s.after += 1;
    else s.before += 1;
    const amount = Number(r.amount) || 0;
    if (r.status === "refunded") {
      s.refunded += 1;
      s.paidBack += amount;
    } else {
      s.pending += 1;
      s.toPay += amount;
    }
  }
  return s;
}

/** The message the bot sends with the receipt. */
export function refundMessage(name: string, amountText: string): string {
  const who = name.trim() ? `, ${name.trim()}` : "";
  return (
    `Assalomu alaykum${who}!\n\n` +
    `Pulingiz qaytarildi: ${amountText}.\n` +
    `To'lov cheki ilova qilindi. Savollaringiz bo'lsa, shu yerga yozing.`
  );
}

export type ImportedRefund = {
  client_name: string;
  phone: string | null;
  amount: number;
  card_number: string | null;
  card_holder: string | null;
  reason: string | null;
  stage: RefundStage;
  paid_amount: number | null;
  note: string | null;
};

/* ---- Import: the person matches the file's columns to these fields ------ */

export type RefundImportField =
  | "client_name"
  | "phone"
  | "amount"
  | "card_number"
  | "card_holder"
  | "reason"
  | "stage"
  | "paid_amount"
  | "note";

/** The fields in the order the matching screen shows them. */
export const REFUND_IMPORT_FIELDS: { key: RefundImportField; required: boolean }[] = [
  { key: "client_name", required: true },
  { key: "amount", required: true },
  { key: "phone", required: false },
  { key: "card_number", required: false },
  { key: "card_holder", required: false },
  { key: "reason", required: false },
  { key: "stage", required: false },
  { key: "paid_amount", required: false },
  { key: "note", required: false },
];

/** field -> column index in the header row (-1 / missing = not imported). */
export type RefundMapping = Partial<Record<RefundImportField, number>>;

// Header names in Uzbek (Latin and Cyrillic), Russian and English. Checked
// in this order, so the more specific ones ("karta egasi", "to'langan
// summa") claim their column before the general ones ("karta", "summa").
const SYNONYMS: [RefundImportField, RegExp][] = [
  ["card_holder", /(karta\s*egasi|egasi|holder|владел|эгаси|f\.?i\.?o\s*kart)/i],
  ["paid_amount", /(to.?lagan|to.?langan|paid|оплач|тўлаган|tolov|to.?lov)/i],
  ["card_number", /(karta|card|карт|plastik|пластик)/i],
  ["phone", /(telefon|tel\b|phone|nomer|номер|телефон|mobil|моб|raqam)/i],
  [
    "client_name",
    /(^ism|ismi|f\.?i\.?sh|mijoz|name|client|имя|клиент|фио|исм|мижоз|o.?quvchi|student|контакт)/i,
  ],
  ["amount", /(summa|sum\b|amount|сумм|miqdor|qaytar|возврат|pul)/i],
  ["reason", /(sabab|reason|причин|сабаб)/i],
  ["stage", /(bosqich|stage|этап|босқич|qabul)/i],
  ["note", /(izoh|note|comment|коммент|примеч|изоҳ)/i],
];

const clean = (v: unknown) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** Best guess for each field from the header names; each column is used once. */
export function guessRefundMapping(headers: string[]): RefundMapping {
  const map: RefundMapping = {};
  const used = new Set<number>();
  for (const [field, re] of SYNONYMS) {
    if (map[field] !== undefined) continue;
    const i = headers.findIndex((h, idx) => !used.has(idx) && re.test(clean(h)));
    if (i >= 0) {
      map[field] = i;
      used.add(i);
    }
  }
  return map;
}

/**
 * Which of the first rows is the header: the one whose cells match the most
 * field names (a sheet often starts with a title or empty lines).
 */
export function guessHeaderRow(table: string[][]): number {
  let best = 0;
  let bestScore = -1;
  table.slice(0, 10).forEach((row, i) => {
    const score = Object.keys(guessRefundMapping(row.map(clean))).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

const num = (v: string) =>
  Number(
    v
      .replace(/[^\d.,-]/g, "")
      .replace(/\s/g, "")
      .replace(",", "."),
  ) || 0;

export type RefundImportResult = {
  rows: ImportedRefund[];
  skipped: number;
  /** Why rows were left out. */
  noName: number;
  noAmount: number;
};

/**
 * The rows under the header, read through the person's matching. A row
 * without an amount is left out; without a name it takes the phone as the
 * name (or is left out when there is none). Stage comes from its column,
 * otherwise the chosen default.
 */
export function buildRefundRows(
  table: string[][],
  headerRow: number,
  mapping: RefundMapping,
  defaults: { stage: RefundStage } = { stage: "before" },
): RefundImportResult {
  const res: RefundImportResult = { rows: [], skipped: 0, noName: 0, noAmount: 0 };
  for (const line of table.slice(headerRow + 1)) {
    if (!line.some((c) => clean(c))) continue;
    const cell = (f: RefundImportField) => {
      const i = mapping[f];
      return i === undefined || i < 0 ? "" : clean(line[i]);
    };
    const phone = cell("phone");
    const name = cell("client_name") || phone;
    const amount = num(cell("amount"));
    if (amount <= 0) {
      res.skipped += 1;
      res.noAmount += 1;
      continue;
    }
    if (!name) {
      res.skipped += 1;
      res.noName += 1;
      continue;
    }
    const stageText = cell("stage").toLowerCase();
    const paid = num(cell("paid_amount"));
    res.rows.push({
      client_name: name.slice(0, 200),
      phone: phone || null,
      amount,
      card_number: cleanCardNumber(cell("card_number")),
      card_holder: cell("card_holder") || null,
      reason: cell("reason") || null,
      stage: !stageText
        ? defaults.stage
        : /keyin|after|после|кейин/.test(stageText)
          ? "after"
          : "before",
      paid_amount: paid > 0 ? paid : null,
      note: cell("note") || null,
    });
  }
  return res;
}

/**
 * Rows from an imported sheet with no hand matching: the header row and the
 * columns are guessed (Uzbek, Russian or English names).
 */
export function parseRefundSheet(table: string[][]): RefundImportResult {
  if (table.length < 2) return { rows: [], skipped: 0, noName: 0, noAmount: 0 };
  const h = guessHeaderRow(table);
  return buildRefundRows(table, h, guessRefundMapping(table[h]!.map(clean)));
}

/* ---- Settings (org_general_settings.refund_rules) ---------------------- */

export type RefundRules = {
  /** The Telegram group / channel (telegram_bound_chats.chat_id) that gets every receipt. */
  chatId: number | null;
  notifyGroup: boolean;
  notifyClient: boolean;
  /** The client's message; {name} and {amount} are filled in. Empty = the standard one. */
  clientText: string;
  /** Days to pay back a client who refused before being accepted. */
  beforeDays: number;
  /** Days to pay back a client who refused after being accepted. */
  afterDays: number;
  /** Remind the responsible manager and the admins as the deadline nears and passes. */
  remind: boolean;
};

export const DEFAULT_REFUND_RULES: RefundRules = {
  chatId: null,
  notifyGroup: true,
  notifyClient: true,
  clientText: "",
  beforeDays: 3,
  afterDays: 7,
  remind: true,
};

export function parseRefundRules(raw: unknown): RefundRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_REFUND_RULES;
  const o = raw as Record<string, unknown>;
  return {
    chatId: typeof o["chatId"] === "number" && Number.isFinite(o["chatId"]) ? o["chatId"] : null,
    notifyGroup: o["notifyGroup"] !== false,
    notifyClient: o["notifyClient"] !== false,
    clientText: typeof o["clientText"] === "string" ? o["clientText"].slice(0, 1000) : "",
    beforeDays: days(o["beforeDays"], DEFAULT_REFUND_RULES.beforeDays),
    afterDays: days(o["afterDays"], DEFAULT_REFUND_RULES.afterDays),
    remind: o["remind"] !== false,
  };
}

const days = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(60, Math.max(1, Math.round(v))) : fallback;

/* ---- Deadline: refused before acceptance -> beforeDays, after -> afterDays */

const DAY_MS = 86_400_000;

/** When the money must be back: the day it was added plus the stage's days. */
export function refundDueAt(
  r: Pick<RefundRow, "created_at" | "stage">,
  rules: Pick<RefundRules, "beforeDays" | "afterDays">,
): Date {
  const n = r.stage === "after" ? rules.afterDays : rules.beforeDays;
  return new Date(new Date(r.created_at).getTime() + n * DAY_MS);
}

export type RefundDue =
  | { kind: "done" }
  | { kind: "overdue"; days: number; due: Date }
  | { kind: "today"; due: Date }
  | { kind: "left"; days: number; due: Date };

/** Where a refund stands against its deadline (whole days, by Tashkent dates). */
export function refundDue(
  r: Pick<RefundRow, "created_at" | "stage" | "status">,
  rules: Pick<RefundRules, "beforeDays" | "afterDays">,
  now: Date = new Date(),
): RefundDue {
  if (r.status !== "pending") return { kind: "done" };
  const due = refundDueAt(r, rules);
  const day = (d: Date) => Math.floor((d.getTime() + 5 * 3_600_000) / DAY_MS);
  const diff = day(due) - day(now);
  if (diff < 0) return { kind: "overdue", days: -diff, due };
  if (diff === 0) return { kind: "today", due };
  return { kind: "left", days: diff, due };
}

/** A reminder is due: within a day of the deadline or past it, at most once a day. */
export function refundNeedsReminder(
  r: Pick<RefundRow, "created_at" | "stage" | "status"> & { reminded_at: string | null },
  rules: Pick<RefundRules, "beforeDays" | "afterDays" | "remind">,
  now: Date = new Date(),
): boolean {
  if (!rules.remind || r.status !== "pending") return false;
  const due = refundDueAt(r, rules).getTime();
  if (now.getTime() < due - DAY_MS) return false;
  return !r.reminded_at || now.getTime() - new Date(r.reminded_at).getTime() >= 20 * 3_600_000;
}

/** The client's message: the company's own text (with {name}, {amount}) or the standard one. */
export function clientRefundText(rules: RefundRules, name: string, amountText: string): string {
  if (!rules.clientText.trim()) return refundMessage(name, amountText);
  return rules.clientText.replace(/\{name\}/g, name.trim()).replace(/\{amount\}/g, amountText);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The group's caption (HTML): who, how much, to which card, and the link into the CRM. */
export function groupRefundText(r: {
  name: string;
  phone: string | null;
  amountText: string;
  card: string | null;
  holder: string | null;
  reason: string | null;
  stage: RefundStage;
  by: string | null;
  link: string;
  notified: boolean;
}): string {
  const lines = [
    "💸 <b>Pul qaytarildi</b>",
    "",
    `👤 ${esc(r.name)}`,
    r.phone ? `📞 ${esc(r.phone)}` : null,
    `💰 <b>${esc(r.amountText)}</b>`,
    r.card ? `💳 ${formatCard(r.card)}${r.holder ? ` — ${esc(r.holder)}` : ""}` : null,
    `📌 ${r.stage === "after" ? "Qabuldan keyin otkaz" : "Qabuldan oldin otkaz"}`,
    r.reason ? `📝 ${esc(r.reason)}` : null,
    r.by ? `👨‍💼 Qaytardi: ${esc(r.by)}` : null,
    r.notified ? "✅ Chek mijozga yuborildi" : "⚠️ Chek mijozga yuborilmadi",
    "",
    `🔗 <a href="${esc(r.link)}">CRM'da ochish</a>`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

/* ---- Analytics -------------------------------------------------------- */

export type RefundGroup = {
  key: string | null;
  count: number;
  amount: number;
  refunded: number;
  refundedAmount: number;
};

/** Refunds (cancelled left out) grouped by any key: reason, employee, funnel... */
export function groupRefunds<T extends Pick<RefundRow, "status" | "amount">>(
  rows: T[],
  keyOf: (r: T) => string | null,
): RefundGroup[] {
  const map = new Map<string | null, RefundGroup>();
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    const k = keyOf(r)?.trim() || null;
    const g = map.get(k) ?? { key: k, count: 0, amount: 0, refunded: 0, refundedAmount: 0 };
    const a = Number(r.amount) || 0;
    g.count += 1;
    g.amount += a;
    if (r.status === "refunded") {
      g.refunded += 1;
      g.refundedAmount += a;
    }
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
}

export type RefundWeek = { week: string; requested: number; refunded: number };

/** Requests and refunds per week (Monday, Tashkent) for the last `weeks` weeks. */
export function weeklyRefunds(
  rows: Pick<RefundRow, "status" | "created_at" | "refunded_at">[],
  now: Date,
  weeks = 8,
): RefundWeek[] {
  const DAY = 86_400_000;
  const local = (iso: string | Date) => new Date(new Date(iso).getTime() + 5 * 3_600_000);
  const monday = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return new Date(x.getTime() - ((x.getUTCDay() + 6) % 7) * DAY);
  };
  const thisWeek = monday(local(now));
  const out: RefundWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    out.push({
      week: new Date(thisWeek.getTime() - i * 7 * DAY).toISOString().slice(0, 10),
      requested: 0,
      refunded: 0,
    });
  }
  const idx = new Map(out.map((w, i) => [w.week, i]));
  const at = (iso: string) => idx.get(monday(local(iso)).toISOString().slice(0, 10));
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    const i = at(r.created_at);
    if (i != null) out[i]!.requested += 1;
    if (r.status === "refunded" && r.refunded_at) {
      const j = at(r.refunded_at);
      if (j != null) out[j]!.refunded += 1;
    }
  }
  return out;
}
