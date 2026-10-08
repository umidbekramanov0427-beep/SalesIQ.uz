// Shared by the amoCRM-style lead card and its composer.

// Colours come from the .amo-skin tokens (styles.css): the feed ground,
// raised boxes (chats, notes, calls) and quiet boxes (open tasks, the
// composer) that sit flush with the feed, like amoCRM's.
export const FEED_BG = "bg-[var(--amo-feed)]";
export const CARD = "border border-[var(--amo-box-line)] bg-[var(--amo-box)]";
export const QUIET = "border border-[var(--amo-quiet-line)] bg-[var(--amo-quiet)]";

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
