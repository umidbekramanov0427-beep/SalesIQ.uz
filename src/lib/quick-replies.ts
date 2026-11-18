// Quick replies, like the Windows clipboard history: answers the person
// sent lately come up on their own, and the ones worth keeping are pinned
// (saved in the cloud, so they stay). Pure, so it is unit-tested.

/** The last distinct answers, newest first, without the ones already pinned. */
export function recentReplies(sent: string[], pinned: string[], max = 15): string[] {
  const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const seen = new Set(pinned.map(key));
  const out: string[] = [];
  for (const raw of sent) {
    const text = raw.trim();
    if (text.length < 2) continue;
    const k = key(text);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}
