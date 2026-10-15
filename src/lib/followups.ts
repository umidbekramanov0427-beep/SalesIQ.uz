// Automatic follow-up messages: the text with the client's name filled in,
// and whether "now" is inside the company's working hours (Tashkent).

/** Fills {ism} / {name} with the client's first name ("" when unknown). */
export function renderFollowup(template: string, leadName: string | null | undefined): string {
  const first = (leadName ?? "").trim().split(/\s+/)[0] ?? "";
  // A name that is really a phone number or "Lead #12" isn't used.
  const name = /\p{L}/u.test(first) && !/^lid$|^lead$/i.test(first) ? first : "";
  return template
    .replace(/\{(ism|name)\}/gi, name)
    .replace(/\s+([,!?.])/g, "$1")
    .replace(/,\s*!/g, "!")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Tashkent hour (0-23) of a moment. */
export const tashkentHour = (now: number) => new Date(now + 5 * 3_600_000).getUTCHours();

/** Inside [start, end) Tashkent hours; end 24 means midnight. */
export function inWorkingHours(now: number, start: number, end: number): boolean {
  const h = tashkentHour(now);
  return start <= end ? h >= start && h < end : h >= start || h < end;
}

/** The message for attempt n (1-based): the second text from attempt 2 when set. */
export function followupText(
  settings: { message: string; second_message: string | null },
  attempt: number,
): string {
  return attempt >= 2 && settings.second_message?.trim()
    ? settings.second_message
    : settings.message;
}
