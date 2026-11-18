// Live support threads (support_messages): one per person. 'in' is the
// person's question, 'out' the support team's answer. Shared by the
// platform owner's "Yordam so'rovlari" page and the server.

export type SupportMessage = {
  id: string;
  direction: "in" | "out";
  text: string;
  created_at: string;
  /** A photo, document, voice note or video sent with the message. */
  file_path?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  file_kind?: string | null;
};

/** Longest support message, same as the table's check. */
export const SUPPORT_TEXT_MAX = 4000;
/** Questions one person may send per hour. */
export const SUPPORT_PER_HOUR = 30;

/**
 * How fast the team answers: for every run of questions, the time from the
 * first unanswered question to the next answer. `waitingSince` is when the
 * current unanswered run began (null when the last word was an answer).
 */
export function supportResponseTimes(messages: SupportMessage[]): {
  responsesMs: number[];
  waitingSince: string | null;
} {
  const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const responsesMs: number[] = [];
  let waitingSince: string | null = null;
  for (const m of sorted) {
    if (m.direction === "in") {
      waitingSince ??= m.created_at;
    } else if (waitingSince) {
      responsesMs.push(Date.parse(m.created_at) - Date.parse(waitingSince));
      waitingSince = null;
    }
  }
  return { responsesMs, waitingSince };
}

export function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** "3 daq", "1 soat 20 daq", "2 kun" -- a response time for the owner's page. */
export function responseLabel(ms: number, units: { min: string; hour: string; day: string }) {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} ${units.min}`;
  const hours = Math.floor(min / 60);
  if (hours < 48) {
    const rest = min % 60;
    return rest ? `${hours} ${units.hour} ${rest} ${units.min}` : `${hours} ${units.hour}`;
  }
  return `${Math.round(hours / 24)} ${units.day}`;
}

/** Trims a message and rejects empty or over-long ones. */
export function cleanSupportText(raw: unknown, allowEmpty = false): string | null {
  if (typeof raw !== "string") return allowEmpty ? "" : null;
  const text = raw.trim();
  if (text.length > SUPPORT_TEXT_MAX) return null;
  return text.length > 0 || allowEmpty ? text : null;
}

/**
 * Adds a message to a thread kept oldest first, once: the same message can
 * arrive from the send response, the live (Realtime) push and a refetch.
 * `replaceId` drops the on-screen placeholder shown while it was sending.
 */
export function mergeSupportMessage<T extends SupportMessage>(
  list: T[] | null | undefined,
  msg: T,
  replaceId?: string,
): T[] {
  const rest = (list ?? []).filter((m) => m.id !== replaceId);
  if (rest.some((m) => m.id === msg.id)) return rest;
  const next = [...rest, msg];
  // Placeholders (still sending) stay last.
  return next.sort((a, b) =>
    isPending(a) !== isPending(b)
      ? isPending(a)
        ? 1
        : -1
      : a.created_at.localeCompare(b.created_at),
  );
}

/** A message shown while it is still being sent. */
export const isPending = (m: SupportMessage) => m.id.startsWith("pending-");
