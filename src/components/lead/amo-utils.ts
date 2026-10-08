// Shared by the amoCRM-style lead card and its composer.

// Feed ground vs. entry cards: the cards must read as separate sheets on
// the feed, in both themes.
export const FEED_BG = "bg-[#e7ebf1] dark:bg-[#0c0f13]";
export const CARD =
  "border border-[#d6dce6] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06)] dark:border-[#2a313b] dark:bg-[#1a1f27] dark:shadow-none";

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function hhmm(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dayWord(d: Date, t: (k: string) => string) {
  const now = new Date();
  const y = new Date();
  y.setDate(now.getDate() - 1);
  const tm = new Date();
  tm.setDate(now.getDate() + 1);
  if (sameDay(d, now)) return t("amo.today");
  if (sameDay(d, y)) return t("amo.yesterday");
  if (sameDay(d, tm)) return t("amo.tomorrow");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function stamp(iso: string, t: (k: string) => string) {
  const d = new Date(iso);
  return `${dayWord(d, t)} ${hhmm(d)}`;
}

export function mmss(sec: number) {
  return `${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}`;
}
