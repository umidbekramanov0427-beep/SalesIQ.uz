// Search inside one chat: which messages hold the words (newest last, as
// the chat reads) and the pieces of a message's text to mark. Pure, so it
// is unit-tested; ChatSearchBar and Highlight use it.

const norm = (s: string) => s.toLocaleLowerCase();

/** Ids of the messages whose text contains `query` (any case), in chat order. */
export function chatMatches(
  messages: { id: string; text: string | null }[],
  query: string,
): string[] {
  const q = norm(query.trim());
  if (!q) return [];
  return messages.filter((m) => m.text && norm(m.text).includes(q)).map((m) => m.id);
}

/** `text` cut into plain and matching pieces, in order. */
export function splitMatches(text: string, query: string): { text: string; hit: boolean }[] {
  const q = norm(query.trim());
  if (!q) return [{ text, hit: false }];
  const lower = norm(text);
  const out: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) {
    if (i > at) out.push({ text: text.slice(at, i), hit: false });
    out.push({ text: text.slice(i, i + q.length), hit: true });
    at = i + q.length;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out;
}
