// Cleaning what comes in with a new lead, before it reaches a manager:
// phone numbers in one +<code> format (the company's countries, see
// phone-rules.ts), made-up numbers turned away, a
// message pasted into the name field moved out of it, and plain spam
// recognised. Pure (no I/O), so the web form, the bot, the import and the
// quick-add dialog all clean the same way, and it is unit-tested.

import {
  DEFAULT_PHONE_RULES,
  countryOfInternational,
  phoneCountry,
  readLocalNumber,
  type PhoneCountry,
  type PhoneRules,
} from "@/lib/phone-rules";

export type PhoneCheck =
  | { ok: true; phone: string; country: PhoneCountry | null }
  | { ok: false; reason: "empty" | "invalid" | "fake" | "country" };

// Uzbek "beautiful" numbers (90 777 77 77, 90 505 05 05) are real and sold
// on purpose, so only the classic made-up ones are refused: one digit nine
// times, an all-zero or 1234567 subscriber part.
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

function isFake(international: string, country: PhoneCountry | null): boolean {
  if (country?.code === "UZ") {
    const uz = international.slice(3);
    return /^(\d)\1{8}$/.test(uz) || UZ_FAKE_SUBSCRIBERS.includes(uz.slice(2));
  }
  return looksMadeUp(international);
}

/**
 * A phone in the one stored format, "+<country code><number>":
 * "+998901234567" for 901234567, 998901234567, +998 90 123-45-67 or
 * 8 90 123 45 67. A number typed without its country code is read as the
 * company's first listed country it fits (src/lib/phone-rules.ts --
 * Uzbekistan alone by default), a foreign one must come with its code (or
 * as 7XXXXXXXXXX). Made-up numbers (+21312312312, 991234567...) are refused
 * as "fake"; with `onlyListed`, other countries' numbers as "country".
 */
export function checkPhone(
  raw: string | null | undefined,
  rules: PhoneRules = DEFAULT_PHONE_RULES,
): PhoneCheck {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, reason: "empty" };
  let digits = text.replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "invalid" };
  const plus = text.startsWith("+") || text.startsWith("00");
  if (text.startsWith("00")) digits = digits.replace(/^00/, "");
  const listed = rules.countries.map(phoneCountry);

  let international: string | null = null;
  let country: PhoneCountry | null = null;
  if (!plus) {
    const local = readLocalNumber(digits, listed);
    if (local) {
      international = local.international;
      country = local.country;
    } else if (digits.length >= 11) {
      // A full international number typed without "+" (77015554218).
      country = countryOfInternational(digits);
      if (country) international = digits;
    }
    if (!international) return { ok: false, reason: "invalid" };
  } else {
    if (digits.length < 10 || digits.length > 15) return { ok: false, reason: "invalid" };
    international = digits;
    country = countryOfInternational(digits);
    // The listed countries first: +7 with a 7xx number is Kazakh, not Russian.
    country = countryOfInternational(digits, listed) ?? country;
    // +998 with a number no Uzbek operator gives out.
    if (!country && digits.startsWith("998")) return { ok: false, reason: "invalid" };
  }

  if (isFake(international, country)) return { ok: false, reason: "fake" };
  if (rules.onlyListed && !(country && rules.countries.includes(country.code))) {
    return { ok: false, reason: "country" };
  }
  return { ok: true, phone: `+${international}`, country };
}

/** The stored form of a phone, or null when it is empty, invalid or made up. */
export function cleanPhone(
  raw: string | null | undefined,
  rules: PhoneRules = DEFAULT_PHONE_RULES,
): string | null {
  const c = checkPhone(raw, rules);
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
