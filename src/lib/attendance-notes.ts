// Davomat in the staff Telegram bot, the pure part: the buttons under the
// chat, the morning date line, comments a person leaves about their day
// ("tirbandlik, 20 daqiqa kechikaman") and the "📊 Davomatim" summary.
// The server side is attendance.server.ts; comments are kept in
// public.attendance_notes and shown in Nazorat -> Davomat.

/** The reply-keyboard buttons (the first row asks for the location). */
export const BTN_IN = "✅ Keldim";
export const BTN_OUT = "🏁 Ketdim";
export const BTN_NOTE = "📝 Izoh yozish";
export const BTN_MINE = "📊 Davomatim";
/** Whether attendance is kept for a person: a company's people, never the platform owner. */
export function attendanceApplies(p: { organization_id: string | null; role?: string | null }) {
  return !!p.organization_id && p.role !== "platform_owner";
}

/** Older keyboards people may still have under their chat. */
export const OLD_BTN_IN = "📍 Ishga keldim";
export const OLD_BTN_OUT = "🏁 Ishdan ketdim";

export const IN_TEXTS = [BTN_IN, OLD_BTN_IN];
export const OUT_TEXTS = [BTN_OUT, OLD_BTN_OUT];

/** The inline button under a late reminder, and what it sends back. */
export const NOTE_CALLBACK = "attnote:late";
export const NOTE_CALLBACK_RE = /^attnote:(late|absent|leave|other)$/;

export const NOTE_KINDS = ["late", "absent", "leave", "other"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

/** How long the bot waits for the comment after "📝 Izoh yozish". */
export const NOTE_WAIT_MIN = 15;
export const NOTE_MAX = 1000;

/**
 * The keyboard under the chat: check in (or out), then comment and summary.
 * Without `checkIn` (Telegram check-in turned off) only the second row.
 */
export function attendanceKeyboard(open: boolean, checkIn = true) {
  const rest = [{ text: BTN_NOTE }, { text: BTN_MINE }];
  return {
    keyboard: checkIn
      ? [[{ text: open ? BTN_OUT : BTN_IN, request_location: true }], rest]
      : [rest],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/** The button under a late reminder: "write the reason". */
export function lateNoteButton() {
  return { inline_keyboard: [[{ text: "📝 Sababini yozish", callback_data: NOTE_CALLBACK }]] };
}

const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const MONTHS = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

/** "13-noyabr" from "2026-11-13". */
export function dayLabel(date: string): string {
  const [, mm, dd] = date.split("-");
  return `${Number(dd)}-${MONTHS[Number(mm) - 1] ?? ""}`;
}

/** The morning line: "📅 Juma, 13-noyabr" (weekday as localClock gives it: 1 = Monday, 7 = Sunday). */
export function dateLine(date: string, weekday: number): string {
  return `📅 <b>${WEEKDAYS[weekday % 7] ?? ""}, ${dayLabel(date)}</b>`;
}

/** A browser date as dateLine wants it: local "YYYY-MM-DD" and weekday 1..7 (Monday = 1). */
export function localDateLabelParts(d: Date): { date: string; weekday: number } {
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    weekday: d.getDay() || 7,
  };
}

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A reminder template as Telegram HTML: the company's text is escaped (only
 * <b> and <i> survive), the numbers in {left} / {late} are set in bold, and
 * the name is escaped.
 */
export function renderReminder(tpl: string, vars: Record<string, string>): string {
  const safe = esc(tpl).replace(/&lt;(\/?)(b|i)&gt;/g, "<$1$2>");
  return safe.replace(/\{(\w+)\}/g, (all, k: string) => {
    const v = vars[k];
    if (v == null) return all;
    const e = esc(v);
    return k === "left" || k === "late" ? e.replace(/\d+/g, "<b>$&</b>") : e;
  });
}

/** Telegram HTML as plain text with **bold** marks (the settings preview). */
export function htmlToPreview(html: string): string {
  return html
    .replace(/<\/?b>/g, "**")
    .replace(/<\/?i>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * What a comment is about when the person didn't say: lateness when their
 * shift has started and they came late or haven't come yet, else "other".
 */
export function noteKind(s: {
  workday: boolean;
  shiftStarted: boolean;
  checkedIn: boolean;
  lateMin: number;
}): NoteKind {
  if (!s.workday) return "other";
  if (s.checkedIn) return s.lateMin > 0 ? "late" : "other";
  return s.shiftStarted ? "late" : "other";
}

/** A comment as typed, cleaned: trimmed, at most NOTE_MAX characters; null when empty. */
export function cleanNote(text: string | null | undefined): string | null {
  const t = (text ?? "").replace(/\s+\n/g, "\n").trim();
  if (!t) return null;
  return t.slice(0, NOTE_MAX);
}

/** Whether a waiting "write your comment" is still fresh. */
export function noteWaitFresh(createdAt: string, now: Date): boolean {
  const at = Date.parse(createdAt);
  return Number.isFinite(at) && now.getTime() - at < NOTE_WAIT_MIN * 60_000;
}

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  late: "Kechikish",
  absent: "Kelmaslik",
  leave: "Erta ketish",
  other: "Izoh",
};

/* ---- 📊 Davomatim ------------------------------------------------------- */

export type MonthDay = {
  /** Local date "YYYY-MM-DD". */
  date: string;
  /** "HH:MM" local, null when they didn't come. */
  clockIn: string | null;
  lateMin: number;
  workedMin: number;
  /** A workday under their shift. */
  workday: boolean;
};

export type MonthSummary = {
  workdays: number;
  came: number;
  lateDays: number;
  lateMin: number;
  workedMin: number;
};

/** The month so far: workdays, days come, late days and minutes, time worked. */
export function monthSummary(days: MonthDay[]): MonthSummary {
  const s: MonthSummary = { workdays: 0, came: 0, lateDays: 0, lateMin: 0, workedMin: 0 };
  for (const d of days) {
    if (d.workday) s.workdays++;
    if (d.clockIn) s.came++;
    if (d.lateMin > 0) {
      s.lateDays++;
      s.lateMin += d.lateMin;
    }
    s.workedMin += d.workedMin;
  }
  return s;
}

const hrs = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} soat${r ? ` ${r} daq` : ""}` : `${r} daq`;
};

/** The "📊 Davomatim" reply (Telegram HTML). */
export function davomatimText(p: {
  name: string | null;
  today: MonthDay | null;
  /** Today's shift start/end, "HH:MM". */
  shift: { start: string; end: string } | null;
  open: boolean;
  month: MonthSummary;
  monthName: string;
  notes: { date: string; kind: NoteKind; body: string }[];
}): string {
  const first = p.name?.split(" ")[0];
  const lines = [`📊 <b>Davomatim${first ? ` — ${esc(first)}` : ""}</b>`, ""];
  const t = p.today;
  lines.push("<b>Bugun</b>");
  if (p.shift) lines.push(`🕘 Ish vaqti: ${p.shift.start}–${p.shift.end}`);
  if (t?.clockIn) {
    lines.push(
      t.lateMin > 0
        ? `⏰ Keldingiz: <b>${t.clockIn}</b> (${t.lateMin} daqiqa kechikish)`
        : `✅ Keldingiz: <b>${t.clockIn}</b>`,
    );
    lines.push(`⏱ Ishlagan vaqt: ${hrs(t.workedMin)}${p.open ? " (hali ishdasiz)" : ""}`);
  } else if (t && !t.workday) {
    lines.push("🌴 Bugun dam olish kuningiz");
  } else {
    lines.push("❕ Bugun hali belgilanmagan");
  }
  const m = p.month;
  lines.push(
    "",
    `<b>${esc(p.monthName)}</b>`,
    `✅ Kelgan kunlar: <b>${m.came}</b>${m.workdays ? ` / ${m.workdays}` : ""}`,
    `⏰ Kechikkan kunlar: <b>${m.lateDays}</b>${m.lateMin ? ` (jami ${hrs(m.lateMin)})` : ""}`,
    `⏱ Jami ishlagan: ${hrs(m.workedMin)}`,
  );
  if (p.notes.length) {
    lines.push("", "<b>Izohlaringiz</b>");
    for (const n of p.notes.slice(0, 3)) {
      const body = n.body.length > 80 ? `${n.body.slice(0, 79)}…` : n.body;
      lines.push(`• ${dayLabel(n.date)} — ${esc(body)}`);
    }
  }
  return lines.join("\n");
}
