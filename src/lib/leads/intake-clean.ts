// Cleaning what comes in with a new lead, before it reaches a manager:
// phone numbers in one +998 format, made-up numbers turned away, a
// message pasted into the name field moved out of it, and plain spam
// recognised. Pure (no I/O), so the web form, the bot, the import and the
// quick-add dialog all clean the same way, and it is unit-tested.

export type PhoneCheck =
  { ok: true; phone: string } | { ok: false; reason: "empty" | "invalid" | "fake" };

// What follows 998: mobile operators (33, 50, 55, 77, 88, 90-99) and
// regional landlines (55, 61-79). A first digit outside these is no Uzbek
// number.
const UZ_FIRST_DIGIT = /^[3-9]/;
const UZ_FAKE_SUBSCRIBERS = ["0000000", "1234567", "7654321"];

const RUNS = ["0123456", "1234567", "2345678", "3456789", "9876543", "8765432", "7654321"];

/**
 * A foreign number nobody really has: seven of one digit in a row, a run
 * like 1234567, or a 2-3 digit block repeated to the end ("21312312312",
 * whose tail is 312 312 312).
 */
function looksMadeUp(digits: string): boolean {
  if (/(\d)\1{6,}/.test(digits)) return true;
  if (RUNS.some((run) => digits.includes(run))) return true;
  for (let start = 0; start <= 2; start++) {
    const tail = digits.slice(start);
    if (tail.length < 7) break;
    for (const size of [2, 3]) {
      const block = tail.slice(0, size);
      if (block.repeat(Math.ceil(tail.length / size)).slice(0, tail.length) === tail) return true;
    }
  }
  return false;
}

/**
 * A phone in the one stored format: "+998901234567" for Uzbek numbers
 * (typed as 901234567, 998901234567, +998 90 123-45-67, 8 90 123 45 67),
 * "+<digits>" for a foreign number typed with its country code. Made-up
 * numbers (+21312312312, 901111111, 991234567...) are refused as "fake".
 */
export function checkPhone(raw: string | null | undefined): PhoneCheck {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, reason: "empty" };
  let digits = text.replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "invalid" };
  const plus = text.startsWith("+") || text.startsWith("00");
  if (text.startsWith("00")) digits = digits.replace(/^00/, "");

  // Uzbek: 9 digits, or with 998 / an old "8" trunk prefix in front.
  let uz: string | null = null;
  if (digits.length === 9 && !plus) uz = digits;
  else if (digits.length === 12 && digits.startsWith("998")) uz = digits.slice(3);
  else if (digits.length === 10 && digits.startsWith("8") && !plus) uz = digits.slice(1);
  if (uz) {
    if (!UZ_FIRST_DIGIT.test(uz)) return { ok: false, reason: "invalid" };
    // Uzbek "beautiful" numbers (90 777 77 77, 90 505 05 05) are real and
    // sold on purpose, so only the classic made-up ones are refused: one
    // digit nine times, an all-zero or 1234567 subscriber part.
    const sub = uz.slice(2);
    if (/^(\d)\1{8}$/.test(uz) || UZ_FAKE_SUBSCRIBERS.includes(sub)) {
      return { ok: false, reason: "fake" };
    }
    return { ok: true, phone: `+998${uz}` };
  }

  // Foreign numbers must come with their country code.
  if (!plus && !(digits.length === 11 && digits.startsWith("7"))) {
    return { ok: false, reason: "invalid" };
  }
  if (digits.length < 10 || digits.length > 15) return { ok: false, reason: "invalid" };
  if (looksMadeUp(digits)) return { ok: false, reason: "fake" };
  return { ok: true, phone: `+${digits}` };
}

/** The stored form of a phone, or null when it is empty, invalid or made up. */
export function cleanPhone(raw: string | null | undefined): string | null {
  const c = checkPhone(raw);
  return c.ok ? c.phone : null;
}

const URL_RE =
  /(https?:\/\/|www\.|t\.me\/|\b[a-z0-9-]+\.(com|ru|net|org|xyz|top|info|io|site|online)\b)/i;
// Chinese/Japanese/Korean, Thai and Arabic scripts: never an Uzbek lead's name.
const FOREIGN_SCRIPT_RE = /[؀-ۿ฀-๿぀-ヿ㐀-鿿가-힯]/;
const LETTER_RE = /\p{L}/u;
const NAME_MAX = 60;

/** True when a name field is junk: a link, foreign-script spam, or no letters at all ("...", "123"). */
export function isJunkName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) return false;
  if (URL_RE.test(n) || FOREIGN_SCRIPT_RE.test(n)) return true;
  return !LETTER_RE.test(n);
}

/**
 * The lead's name, and the text that was in the name field when it was
 * really a message (long or several lines) -- that goes to the lead's
 * first note instead. A junk or empty name becomes "Mijoz +998...".
 */
export function cleanLeadName(
  name: string | null | undefined,
  phone: string | null,
): { name: string; movedText: string | null } {
  const raw = (name ?? "").replace(/\s+/g, " ").trim();
  const fallback = phone ? `Mijoz ${phone}` : "Mijoz";
  if (!raw || isJunkName(raw)) return { name: fallback, movedText: raw || null };
  const multiline = /\n/.test(name ?? "");
  if (raw.length > NAME_MAX || multiline) return { name: fallback, movedText: (name ?? "").trim() };
  return { name: raw, movedText: null };
}

/**
 * Spam that should not become a lead at all: a link or foreign-script text
 * in the name or message with no real way to reach the person (no valid
 * phone, no email).
 */
export function isSpamLead(input: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
}): boolean {
  const reachable = !!cleanPhone(input.phone) || /\S+@\S+\.\S+/.test(input.email ?? "");
  if (reachable) return false;
  const text = `${input.name ?? ""} ${input.note ?? ""}`;
  return URL_RE.test(text) || FOREIGN_SCRIPT_RE.test(text) || isJunkName(input.name);
}
