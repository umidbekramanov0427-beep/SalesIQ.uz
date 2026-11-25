// A person's own preferences from Sozlamalar → Profil (5CRM's profile
// window): «Tizim sozlamalari» (time zone, country, date / time format,
// currency) and «Ko'rinish» (text size and control size). Stored in
// profiles.prefs; the look is applied to <html> as data attributes that
// styles.css turns into zoom levels.

export const FONT_SIZES = ["sm", "md", "lg", "xl"] as const;
export type FontSize = (typeof FONT_SIZES)[number];
export const SHAPE_SIZES = ["compact", "normal", "wide", "large"] as const;
export type ShapeSize = (typeof SHAPE_SIZES)[number];

/** How much each size scales, as shown next to the choice («100%»). */
export const FONT_ZOOM: Record<FontSize, number> = { sm: 0.9, md: 1, lg: 1.1, xl: 1.2 };
export const SHAPE_ZOOM: Record<ShapeSize, number> = {
  compact: 0.92,
  normal: 1,
  wide: 1.06,
  large: 1.12,
};

export const DATE_FORMATS = ["DD.MM.YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY"] as const;
export const TIME_FORMATS = ["24h", "12h"] as const;
export const PREF_CURRENCIES = ["UZS", "USD", "RUB", "EUR"] as const;
export const COUNTRIES = [
  { code: "UZ", dial: "+998" },
  { code: "KZ", dial: "+7" },
  { code: "KG", dial: "+996" },
  { code: "TJ", dial: "+992" },
  { code: "RU", dial: "+7" },
  { code: "TR", dial: "+90" },
] as const;
export const TIME_ZONES = [
  "Asia/Tashkent",
  "Asia/Almaty",
  "Asia/Bishkek",
  "Asia/Dushanbe",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Asia/Dubai",
  "UTC",
] as const;

export type ProfilePrefs = {
  timezone: string;
  country: string;
  dateFormat: (typeof DATE_FORMATS)[number];
  timeFormat: (typeof TIME_FORMATS)[number];
  currency: (typeof PREF_CURRENCIES)[number];
  fontSize: FontSize;
  shapeSize: ShapeSize;
};

export const DEFAULT_PREFS: ProfilePrefs = {
  timezone: "Asia/Tashkent",
  country: "UZ",
  dateFormat: "DD.MM.YYYY",
  timeFormat: "24h",
  currency: "UZS",
  fontSize: "md",
  shapeSize: "normal",
};

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

/** Stored JSON (possibly old or partial) → a full, valid set of preferences. */
export function readPrefs(raw: unknown): ProfilePrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    timezone:
      typeof r["timezone"] === "string" && r["timezone"] ? r["timezone"] : DEFAULT_PREFS.timezone,
    country:
      typeof r["country"] === "string" && r["country"] ? r["country"] : DEFAULT_PREFS.country,
    dateFormat: pick(DATE_FORMATS, r["dateFormat"], DEFAULT_PREFS.dateFormat),
    timeFormat: pick(TIME_FORMATS, r["timeFormat"], DEFAULT_PREFS.timeFormat),
    currency: pick(PREF_CURRENCIES, r["currency"], DEFAULT_PREFS.currency),
    fontSize: pick(FONT_SIZES, r["fontSize"], DEFAULT_PREFS.fontSize),
    shapeSize: pick(SHAPE_SIZES, r["shapeSize"], DEFAULT_PREFS.shapeSize),
  };
}

const LOOK_KEY = "salesiq.look";

/** Puts the look on <html> (and remembers it for the next first paint). */
export function applyLook(p: Pick<ProfilePrefs, "fontSize" | "shapeSize">): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (p.fontSize === "md") html.removeAttribute("data-font");
  else html.setAttribute("data-font", p.fontSize);
  if (p.shapeSize === "normal") html.removeAttribute("data-shape");
  else html.setAttribute("data-shape", p.shapeSize);
  try {
    localStorage.setItem(
      LOOK_KEY,
      JSON.stringify({ fontSize: p.fontSize, shapeSize: p.shapeSize }),
    );
  } catch {
    /* private mode */
  }
}

/** The look remembered in this browser, for before the profile has loaded. */
export function rememberedLook(): Pick<ProfilePrefs, "fontSize" | "shapeSize"> {
  try {
    const p = readPrefs(JSON.parse(localStorage.getItem(LOOK_KEY) ?? "{}"));
    return { fontSize: p.fontSize, shapeSize: p.shapeSize };
  } catch {
    return { fontSize: "md", shapeSize: "normal" };
  }
}

/** A random code for the open business card link (no look-alike letters). */
export function vcardCode(length = 12): string {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

/** The statuses everyone starts with (5CRM's «Holatlar»). */
export const DEFAULT_STATUSES = ["atWork", "lunch", "meeting", "onCall", "vacation"] as const;
