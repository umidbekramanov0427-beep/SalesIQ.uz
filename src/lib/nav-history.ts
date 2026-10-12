// Which page the user came from, so "Orqaga" can name it and take them
// back to it. Browsers don't expose the History API's entries (privacy),
// but every entry the router creates carries its position
// (history.state.__TSR_index), so AppShell records "position -> page" on
// each navigation. Going back then means the entry one position down --
// a real history.back(), which also brings back that page's filters and
// scroll offset -- and a replace (a filter change) just overwrites its own
// position instead of looking like a new page.

type Entry = { pathname: string };

const entries = new Map<number, Entry>();
let current = -1;

export function recordVisit(index: number, pathname: string): void {
  // A fresh push drops whatever was "forward" of it.
  if (index > current) for (const k of entries.keys()) if (k > index) entries.delete(k);
  entries.set(index, { pathname });
  current = index;
  if (entries.size > 60) entries.delete(Math.min(...entries.keys()));
}

/** The page one step back in this tab's history, when this session saw it. */
export function getPreviousPath(): string | undefined {
  return entries.get(current - 1)?.pathname;
}
