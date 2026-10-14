// Sound on the page plays like in Telegram: one thing at a time -- starting
// a player pauses the one already playing, which keeps its place -- and
// when a chat voice message ends, the next one below it starts by itself.

type Pausable = { paused: boolean; pause: () => void };
// Method syntax: a DOM element (taking any Node) fits.
type Positioned = { compareDocumentPosition(other: Positioned): number };
type ChainPlayer = { el: Positioned; play: () => void };

// Node.DOCUMENT_POSITION_FOLLOWING (no DOM global needed in tests).
const FOLLOWING = 4;

let current: Pausable | null = null;
const chain = new Set<ChainPlayer>();

/** Call when `media` starts playing: whatever else was playing pauses. */
export function claimPlayback(media: Pausable): void {
  if (current && current !== media && !current.paused) current.pause();
  current = media;
}

/** Forget `media` if it is the one playing (it was removed from the page). */
export function releasePlayback(media: Pausable): void {
  if (current === media) current = null;
}

/** A chat player that the one above it may start when it ends. */
export function registerChainPlayer(player: ChainPlayer): () => void {
  chain.add(player);
  return () => {
    chain.delete(player);
  };
}

/** The registered player right after `el` in the page, if any. */
export function nextChainPlayer(el: Positioned): ChainPlayer | null {
  let best: ChainPlayer | null = null;
  for (const p of chain) {
    if (p.el === el || !(el.compareDocumentPosition(p.el) & FOLLOWING)) continue;
    // Closer to `el` = `best` comes after this one.
    if (!best || p.el.compareDocumentPosition(best.el) & FOLLOWING) best = p;
  }
  return best;
}

/** Start the chat player after `el` (called when `el`'s sound ends). */
export function playNextAfter(el: Positioned): void {
  nextChainPlayer(el)?.play();
}
