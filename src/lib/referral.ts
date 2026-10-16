// Taklif dasturi (referrals): codes, rewards and the browser side of
// "?ref=CODE". Pure (plus localStorage), shared by the pages and
// referral.server.ts.

/** Extra trial days for a company that signed up through an invitation. */
export const REFERRED_BONUS_DAYS = 7;
/** Free days for the inviting company once the invited one first pays. */
export const REFERRER_BONUS_DAYS = 30;
/** A partner earns commission on the invited company's payments for this long. */
export const PARTNER_COMMISSION_MONTHS = 12;
/** How long a clicked invitation link is remembered in the browser. */
export const REF_MEMORY_DAYS = 60;

const STORE_KEY = "salesiq.ref";

/** Codes are 4-16 latin letters/digits, compared upper-case. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null;
}

const CYR: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "j",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "x",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ы: "i",
  э: "e",
  ю: "yu",
  я: "ya",
  ў: "o",
  қ: "q",
  ғ: "g",
  ҳ: "h",
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** "Baraka Savdo MChJ" → "BARAKA7KQ": the name's first word (up to 6) + 3 random. */
export function makeCode(name: string, random: () => number = Math.random): string {
  const latin = name
    .toLowerCase()
    .split("")
    .map((c) => CYR[c] ?? c)
    .join("")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
  const word = (latin.split(/\s+/)[0] ?? "").slice(0, 6).toUpperCase();
  let tail = "";
  for (let i = 0; i < 3; i++) tail += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return (word.length >= 2 ? word : "SIQ") + tail;
}

/** Partner commission on one payment, rounded to whole so'm. */
export function commissionFor(amount: number, pct: number): number {
  if (!(amount > 0) || !(pct > 0)) return 0;
  return Math.round((amount * Math.min(100, pct)) / 100);
}

/** True while a partner still earns on payments of a company invited at `since`. */
export function withinCommissionWindow(since: string, now = Date.now()): boolean {
  const end = new Date(since);
  end.setMonth(end.getMonth() + PARTNER_COMMISSION_MONTHS);
  return now < end.getTime();
}

export function referralLink(code: string, origin = "https://salesiq.uz"): string {
  return `${origin}/?ref=${encodeURIComponent(code)}`;
}

/** Remembers ?ref=CODE from the current URL (any public page). */
export function captureRefFromUrl(): void {
  if (typeof window === "undefined") return;
  const code = normalizeCode(new URL(window.location.href).searchParams.get("ref"));
  if (!code) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // storage blocked: the link just isn't remembered
  }
}

/** The invitation this browser came with, if still fresh. */
export function storedRef(now = Date.now()): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code?: string; at?: number };
    if (!at || now - at > REF_MEMORY_DAYS * 86_400_000) return null;
    return normalizeCode(code);
  } catch {
    return null;
  }
}

export function clearStoredRef(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // ignore
  }
}
