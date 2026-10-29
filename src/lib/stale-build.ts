// Recovering a tab that outlived a deploy: its page chunks were renamed by
// the new build, so opening another section fails to load ("Failed to fetch
// dynamically imported module"). The fix is a full page load of the place
// the person was going to -- not a reload of the page they are leaving,
// which left them stuck on it (Bosh sahifa "doesn't open anything"). Pure,
// so it is unit-tested; error-log.ts does the reload.

/** Where a stale-build reload should go: the navigation in progress, else here. */
export function staleReloadTarget(pendingHref: string | null, currentHref: string): string {
  return pendingHref && pendingHref.startsWith("/") ? pendingHref : currentHref;
}

export type LastReload = { target: string; at: number } | null;

/** Reload unless this very target was already reloaded moments ago (a broken deploy). */
export function shouldReloadFor(target: string, last: LastReload, now: number): boolean {
  return !last || last.target !== target || now - last.at > 20_000;
}

export function parseLastReload(raw: string | null): LastReload {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { target?: unknown; at?: unknown };
    return typeof v.target === "string" && typeof v.at === "number"
      ? { target: v.target, at: v.at }
      : null;
  } catch {
    return null;
  }
}
