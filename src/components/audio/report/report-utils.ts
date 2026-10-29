import type { Lang } from "@/lib/i18n";

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 1:05:09 for long talk times, 4:07 for a single call. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const rest = formatClock(seconds % 3600);
  return h ? `${h}:${rest.padStart(5, "0")}` : rest;
}

const UZ_MONTHS = [
  "yan",
  "fev",
  "mar",
  "apr",
  "may",
  "iyun",
  "iyul",
  "avg",
  "sen",
  "okt",
  "noy",
  "dek",
];

/** "Bugun 11:20", "Kecha 17:40" or "27-okt 18:05". */
export function formatWhen(
  iso: string,
  lang: Lang,
  words: { today: string; yesterday: string },
): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  const day = d.toDateString();
  if (day === new Date().toDateString()) return `${words.today} ${time}`;
  if (day === new Date(Date.now() - 86_400_000).toDateString()) {
    return `${words.yesterday} ${time}`;
  }
  // The browser's own "uz" dates come out as "M10 27"; Uzbek is spelt here.
  const date =
    lang === "uz"
      ? `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}`
      : d.toLocaleDateString(lang, { day: "numeric", month: "short" });
  return `${date} ${time}`;
}
