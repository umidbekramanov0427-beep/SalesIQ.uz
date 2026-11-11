// How a company's phone numbers are written down (Admin -> Telefon raqamlari
// formati): which countries its clients call from, in order. A number typed
// without a country code is read as the first listed country it fits -- so
// "901234567" is Uzbek for a Tashkent company, while a company working with
// Russia can list Russia too and get "89123456789" as +79123456789. Every
// number is stored the same way, "+<country code><number>", so duplicate
// search, telephony and SMS keep matching. Stored in
// org_general_settings.phone_rules; Uzbekistan alone until set.

export type CountryCode =
  | "UZ"
  | "RU"
  | "KZ"
  | "KG"
  | "TJ"
  | "TM"
  | "AZ"
  | "TR"
  | "AE"
  | "US"
  | "GB"
  | "DE"
  | "KR"
  | "CN"
  | "BY"
  | "UA"
  | "GE";

export type PhoneCountry = {
  code: CountryCode;
  flag: string;
  /** The international dialling code, digits only. */
  dial: string;
  /** Lengths of the national number (without the dialling code). */
  lengths: number[];
  /** The old domestic prefix people still type ("8 90 ...", "0 532 ..."). */
  trunk: string | null;
  /** What the national number may start with. */
  first: RegExp;
  /** An example national number, as people write it. */
  example: string;
  /** The country's name: Uzbek, Russian, English. */
  names: { uz: string; ru: string; en: string };
};

export const PHONE_COUNTRIES: PhoneCountry[] = [
  {
    code: "UZ",
    flag: "🇺🇿",
    dial: "998",
    lengths: [9],
    trunk: "8",
    first: /^[3-9]/,
    example: "90 482 37 15",
    names: { uz: "O'zbekiston", ru: "Узбекистан", en: "Uzbekistan" },
  },
  {
    code: "RU",
    flag: "🇷🇺",
    dial: "7",
    lengths: [10],
    trunk: "8",
    first: /^[3489]/,
    example: "916 482 37 15",
    names: { uz: "Rossiya", ru: "Россия", en: "Russia" },
  },
  {
    code: "KZ",
    flag: "🇰🇿",
    dial: "7",
    lengths: [10],
    trunk: "8",
    first: /^[67]/,
    example: "701 482 37 15",
    names: { uz: "Qozog'iston", ru: "Казахстан", en: "Kazakhstan" },
  },
  {
    code: "KG",
    flag: "🇰🇬",
    dial: "996",
    lengths: [9],
    trunk: "0",
    first: /^[2-9]/,
    example: "700 482 915",
    names: { uz: "Qirg'iziston", ru: "Киргизия", en: "Kyrgyzstan" },
  },
  {
    code: "TJ",
    flag: "🇹🇯",
    dial: "992",
    lengths: [9],
    trunk: null,
    first: /^[3-9]/,
    example: "90 482 3715",
    names: { uz: "Tojikiston", ru: "Таджикистан", en: "Tajikistan" },
  },
  {
    code: "TM",
    flag: "🇹🇲",
    dial: "993",
    lengths: [8],
    trunk: "8",
    first: /^[1-7]/,
    example: "65 482371",
    names: { uz: "Turkmaniston", ru: "Туркменистан", en: "Turkmenistan" },
  },
  {
    code: "AZ",
    flag: "🇦🇿",
    dial: "994",
    lengths: [9],
    trunk: "0",
    first: /^[1-9]/,
    example: "50 482 37 15",
    names: { uz: "Ozarbayjon", ru: "Азербайджан", en: "Azerbaijan" },
  },
  {
    code: "TR",
    flag: "🇹🇷",
    dial: "90",
    lengths: [10],
    trunk: "0",
    first: /^[2-5]/,
    example: "532 482 37 15",
    names: { uz: "Turkiya", ru: "Турция", en: "Turkey" },
  },
  {
    code: "AE",
    flag: "🇦🇪",
    dial: "971",
    lengths: [8, 9],
    trunk: "0",
    first: /^[2-9]/,
    example: "50 482 3715",
    names: { uz: "BAA", ru: "ОАЭ", en: "UAE" },
  },
  {
    code: "US",
    flag: "🇺🇸",
    dial: "1",
    lengths: [10],
    trunk: null,
    first: /^[2-9]/,
    example: "201 482 3715",
    names: { uz: "AQSH", ru: "США", en: "USA" },
  },
  {
    code: "GB",
    flag: "🇬🇧",
    dial: "44",
    lengths: [10],
    trunk: "0",
    first: /^[1-9]/,
    example: "7400 482371",
    names: { uz: "Buyuk Britaniya", ru: "Великобритания", en: "United Kingdom" },
  },
  {
    code: "DE",
    flag: "🇩🇪",
    dial: "49",
    lengths: [10, 11],
    trunk: "0",
    first: /^[1-9]/,
    example: "151 48237159",
    names: { uz: "Germaniya", ru: "Германия", en: "Germany" },
  },
  {
    code: "KR",
    flag: "🇰🇷",
    dial: "82",
    lengths: [9, 10],
    trunk: "0",
    first: /^[1-9]/,
    example: "10 4823 7159",
    names: { uz: "Janubiy Koreya", ru: "Южная Корея", en: "South Korea" },
  },
  {
    code: "CN",
    flag: "🇨🇳",
    dial: "86",
    lengths: [11],
    trunk: null,
    first: /^1/,
    example: "131 4823 7159",
    names: { uz: "Xitoy", ru: "Китай", en: "China" },
  },
  {
    code: "BY",
    flag: "🇧🇾",
    dial: "375",
    lengths: [9],
    trunk: "80",
    first: /^[1-9]/,
    example: "29 482 37 15",
    names: { uz: "Belarus", ru: "Беларусь", en: "Belarus" },
  },
  {
    code: "UA",
    flag: "🇺🇦",
    dial: "380",
    lengths: [9],
    trunk: "0",
    first: /^[3-9]/,
    example: "50 482 3715",
    names: { uz: "Ukraina", ru: "Украина", en: "Ukraine" },
  },
  {
    code: "GE",
    flag: "🇬🇪",
    dial: "995",
    lengths: [9],
    trunk: null,
    first: /^[3-9]/,
    example: "555 48 23 71",
    names: { uz: "Gruziya", ru: "Грузия", en: "Georgia" },
  },
];

const BY_CODE = new Map(PHONE_COUNTRIES.map((c) => [c.code, c]));
export const phoneCountry = (code: CountryCode) => BY_CODE.get(code)!;

export type PhoneRules = {
  /** In order: a number without a country code is read as the first that fits. */
  countries: CountryCode[];
  /** Turn away numbers of countries not in the list. */
  onlyListed: boolean;
};

export const DEFAULT_PHONE_RULES: PhoneRules = { countries: ["UZ"], onlyListed: false };

/** The saved rules, or Uzbekistan alone when unset or malformed. */
export function parsePhoneRules(raw: unknown): PhoneRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_PHONE_RULES;
  const o = raw as Record<string, unknown>;
  const countries = Array.isArray(o["countries"])
    ? [...new Set(o["countries"])].filter((c): c is CountryCode => BY_CODE.has(c as CountryCode))
    : [];
  return {
    countries: countries.length ? countries : DEFAULT_PHONE_RULES.countries,
    onlyListed: o["onlyListed"] === true,
  };
}

/** The country a full international number ("998901234567") belongs to, if any. */
export function countryOfInternational(
  digits: string,
  among: readonly PhoneCountry[] = PHONE_COUNTRIES,
): PhoneCountry | null {
  for (const c of among) {
    if (!digits.startsWith(c.dial)) continue;
    const national = digits.slice(c.dial.length);
    if (c.lengths.includes(national.length) && c.first.test(national)) return c;
  }
  return null;
}

/**
 * A number typed without "+": the first listed country it fits -- as its
 * national number, with the old domestic prefix, or with the dialling code
 * but no "+". Returns the full international digits.
 */
export function readLocalNumber(
  digits: string,
  countries: readonly PhoneCountry[],
): { country: PhoneCountry; international: string } | null {
  for (const c of countries) {
    const candidates = [
      digits,
      c.trunk && digits.startsWith(c.trunk) ? digits.slice(c.trunk.length) : null,
      digits.startsWith(c.dial) ? digits.slice(c.dial.length) : null,
    ];
    for (const national of candidates) {
      if (national && c.lengths.includes(national.length) && c.first.test(national)) {
        return { country: c, international: `${c.dial}${national}` };
      }
    }
  }
  return null;
}

/** "+998 90 123 45 67" style, for showing a stored number (spaces only). */
export function displayPhone(stored: string): string {
  const digits = stored.replace(/\D/g, "");
  const c = countryOfInternational(digits);
  if (!c) return stored;
  const n = digits.slice(c.dial.length);
  const groups =
    n.length === 9
      ? [n.slice(0, 2), n.slice(2, 5), n.slice(5, 7), n.slice(7)]
      : n.length === 10
        ? [n.slice(0, 3), n.slice(3, 6), n.slice(6, 8), n.slice(8)]
        : [n];
  return `+${c.dial} ${groups.join(" ")}`;
}

/** The country's name in the interface language. */
export function countryName(code: CountryCode, lang: string): string {
  const n = phoneCountry(code).names;
  return lang === "ru" ? n.ru : lang === "en" ? n.en : n.uz;
}
