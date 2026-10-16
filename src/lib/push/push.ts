// Web push: which event each notification is, and who gets it. Pure, so
// the server sender (push.server.ts) and the settings page share one list.

export type PushKind = "new_lead" | "message" | "call" | "task" | "support" | "payment" | "test";

/** notification_preferences column that turns each kind off (none = always sent). */
export const PUSH_PREF_COLUMN: Partial<Record<PushKind, PushPrefColumn>> = {
  new_lead: "push_new_lead",
  message: "push_messages",
  call: "push_calls",
  task: "task_assigned",
};

export type PushPrefColumn = "push_new_lead" | "push_messages" | "push_calls" | "task_assigned";

export type PushMessage = {
  kind: PushKind;
  title: string;
  body: string;
  /** Opened when the notification is clicked. */
  url: string;
  /** Same tag = the newer notification replaces the older one. */
  tag?: string;
  /** Stays on screen until clicked or closed (incoming calls). */
  requireInteraction?: boolean;
};

/** Kept short: phones cut long notification text anyway. */
export function clip(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** The people who want this kind: a missing preference row or column means yes. */
export function wantsPush(
  kind: PushKind,
  prefs: Partial<Record<PushPrefColumn, boolean | null>> | null | undefined,
): boolean {
  const column = PUSH_PREF_COLUMN[kind];
  if (!column || !prefs) return true;
  return prefs[column] !== false;
}

/** The JSON the service worker (public/sw.js) reads from a push. */
export function pushPayload(msg: PushMessage): string {
  return JSON.stringify({
    title: clip(msg.title, 80),
    body: clip(msg.body),
    url: /^\/(?!\/)/.test(msg.url) ? msg.url : "/",
    tag: msg.tag ?? msg.kind,
    kind: msg.kind,
    requireInteraction: !!msg.requireInteraction,
  });
}
