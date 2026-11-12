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
};

const HEADERS: Record<keyof ImportedRefund, RegExp> = {
  client_name: /^(ism|f\.?i\.?sh|mijoz|name|client|имя|клиент|фио)/i,
  phone: /^(telefon|tel|phone|nomer|raqam|телефон|номер)/i,
  amount: /^(summa|sum|amount|сумма|miqdor)/i,
  card_number: /^(karta raqami|karta|card|карта|номер карты)/i,
  card_holder: /^(karta egasi|egasi|holder|card holder|владелец)/i,
  reason: /^(sabab|reason|причина|izoh)/i,
  stage: /^(bosqich|holat|stage|этап)/i,
};

const num = (v: string) =>
  Number(
    v
      .replace(/[^\d.,-]/g, "")
      .replace(/\s/g, "")
      .replace(",", "."),
  ) || 0;

/**
 * Rows from an imported sheet (the first row is the header, in Uzbek,
 * Russian or English). Rows without a name or amount are left out and
 * counted as skipped.
 */
export function parseRefundSheet(table: string[][]): { rows: ImportedRefund[]; skipped: number } {
  if (table.length < 2) return { rows: [], skipped: 0 };
  const header = table[0]!.map((h) => h.trim());
  const col = (k: keyof ImportedRefund) => header.findIndex((h) => HEADERS[k].test(h));
  // "Karta egasi" would also match "karta": look for the holder first.
  const idx = {
    client_name: col("client_name"),
    phone: col("phone"),
    amount: col("amount"),
    card_holder: col("card_holder"),
    card_number: header.findIndex(
      (h, i) =>
        HEADERS.card_number.test(h) && i !== header.findIndex((x) => HEADERS.card_holder.test(x)),
    ),
    reason: col("reason"),
    stage: col("stage"),
  };
  const rows: ImportedRefund[] = [];
  let skipped = 0;
  for (const line of table.slice(1)) {
    const cell = (i: number) => (i >= 0 ? (line[i] ?? "").trim() : "");
    const name = cell(idx.client_name);
    const amount = num(cell(idx.amount));
    if (!line.some((c) => c.trim())) continue;
    if (!name || amount <= 0) {
      skipped += 1;
      continue;
    }
    const stageText = cell(idx.stage).toLowerCase();
    rows.push({
      client_name: name.slice(0, 200),
      phone: cell(idx.phone) || null,
      amount,
      card_number: cleanCardNumber(cell(idx.card_number)),
      card_holder: cell(idx.card_holder) || null,
      reason: cell(idx.reason) || null,
      stage: /keyin|after|после|qabul qilingan/.test(stageText) ? "after" : "before",
    });
  }
  return { rows, skipped };
}

/* ---- Settings (org_general_settings.refund_rules) ---------------------- */

export type RefundRules = {
  /** The Telegram group / channel (telegram_bound_chats.chat_id) that gets every receipt. */
  chatId: number | null;
  notifyGroup: boolean;
  notifyClient: boolean;
  /** The client's message; {name} and {amount} are filled in. Empty = the standard one. */
  clientText: string;
};

export const DEFAULT_REFUND_RULES: RefundRules = {
  chatId: null,
  notifyGroup: true,
  notifyClient: true,
  clientText: "",
};

export function parseRefundRules(raw: unknown): RefundRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_REFUND_RULES;
  const o = raw as Record<string, unknown>;
  return {
    chatId: typeof o["chatId"] === "number" && Number.isFinite(o["chatId"]) ? o["chatId"] : null,
    notifyGroup: o["notifyGroup"] !== false,
    notifyClient: o["notifyClient"] !== false,
    clientText: typeof o["clientText"] === "string" ? o["clientText"].slice(0, 1000) : "",
  };
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
