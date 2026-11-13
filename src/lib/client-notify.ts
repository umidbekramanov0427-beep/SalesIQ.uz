// Bildirishnomalar markazi → «Mijoz xabarlari» (5CRM's notification
// triggers): whether a client's message notifies its owner when the client
// is new or already known, and the keywords («narx», «shikoyat», ...) that
// raise a separate alert -- to the owner, and the company's admins / heads
// of sales when chosen. Both are on by default. Kept in
// org_general_settings.ui_settings.notify; the server side is
// notifyClientMessage (live-notifications.server.ts).

export type ClientNotifyRules = {
  /** The client's first message (a new client). */
  newClient: boolean;
  /** Later messages of a known client. */
  existingClient: boolean;
  /** Words that raise a keyword alert. */
  keywords: string[];
  /** Keyword alerts also go to admins and heads of sales. */
  keywordsToManagers: boolean;
};

export const DEFAULT_CLIENT_NOTIFY: ClientNotifyRules = {
  newClient: true,
  existingClient: true,
  keywords: [],
  keywordsToManagers: true,
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Uzbek apostrophes (ʻ ’ ` ') as one, lower case, single spaces. */
export function normalizeWords(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ʻʼ’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanKeywords(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const k of list) {
    if (typeof k !== "string") continue;
    const w = normalizeWords(k).slice(0, 40);
    if (w.length >= 2 && !out.includes(w)) out.push(w);
    if (out.length >= 30) break;
  }
  return out;
}

export function parseClientNotify(raw: unknown): ClientNotifyRules {
  const o = isObj(raw) ? raw : {};
  return {
    newClient: o["newClient"] !== false,
    existingClient: o["existingClient"] !== false,
    keywords: cleanKeywords(o["keywords"]),
    keywordsToManagers: o["keywordsToManagers"] !== false,
  };
}

/** The first keyword the message has (as a word or the start of one: «narx» finds «narxi»), or null. */
export function matchKeyword(text: string, keywords: string[]): string | null {
  if (!keywords.length || !text) return null;
  const t = ` ${normalizeWords(text).replace(/[^\p{L}\p{N}' ]+/gu, " ")} `;
  for (const k of keywords) {
    if (t.includes(` ${k}`)) return k;
  }
  return null;
}

/** Does this client message notify its owner? */
export function notifiesOwner(rules: ClientNotifyRules, firstMessage: boolean): boolean {
  return firstMessage ? rules.newClient : rules.existingClient;
}
