// Javob qoidalari (Admin -> CRM): how fast a client must get an answer and
// the card-number guard.
//  - warnMinutes / escalateMinutes: a new lead nobody has called or written
//    to, or a client's message nobody answered, turns amber after the first
//    and red after the second; the manager is reminded at the first, the
//    head of sales hears at the second (speed-to-lead.server.ts). 5 / 15
//    until a company sets its own.
//  - cardWarning: a message or a saved reply that carries a bank card number
//    asks the person to confirm before it goes to a client -- so a manager
//    doesn't hand a client their own card by mistake (or on purpose).
// Stored in org_general_settings.reply_rules.

export type ReplyRules = {
  warnMinutes: number;
  escalateMinutes: number;
  cardWarning: boolean;
};

export const DEFAULT_REPLY_RULES: ReplyRules = {
  warnMinutes: 5,
  escalateMinutes: 15,
  cardWarning: true,
};

const MAX_MINUTES = 24 * 60;

/** The saved rules; bad values fall back, and the second limit is never below the first. */
export function parseReplyRules(raw: unknown): ReplyRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_REPLY_RULES;
  const o = raw as Record<string, unknown>;
  const minutes = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= MAX_MINUTES
      ? Math.round(v)
      : fallback;
  const warn = minutes(o["warnMinutes"], DEFAULT_REPLY_RULES.warnMinutes);
  const escalate = Math.max(
    warn,
    minutes(o["escalateMinutes"], DEFAULT_REPLY_RULES.escalateMinutes),
  );
  return {
    warnMinutes: warn,
    escalateMinutes: escalate,
    cardWarning: o["cardWarning"] !== false,
  };
}

export type CardHit = { brand: string; masked: string };

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function brandOf(digits: string): string | null {
  if (digits.startsWith("8600") || digits.startsWith("5614")) return "Uzcard";
  if (digits.startsWith("9860")) return "Humo";
  if (/^220[0-4]/.test(digits)) return "Mir";
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
  if (/^62/.test(digits)) return "UnionPay";
  return null;
}

/**
 * Bank card numbers in a text: 16-19 digits, written together or in groups
 * of digits split by spaces or dashes, of a known card network and passing
 * the card checksum (so a phone number or an order number isn't one).
 */
export function findCardNumbers(text: string): CardHit[] {
  const hits: CardHit[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/(?<!\d)\d(?:[ -]?\d){15,18}(?!\d)/g)) {
    const digits = m[0].replace(/\D/g, "");
    const brand = brandOf(digits);
    if (!brand || !luhn(digits) || seen.has(digits)) continue;
    seen.add(digits);
    hits.push({ brand, masked: `${digits.slice(0, 4)} •••• •••• ${digits.slice(-4)}` });
  }
  return hits;
}
