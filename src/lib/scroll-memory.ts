import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useRouterState } from "@tanstack/react-router";

// The app scrolls inside <main>, not the window, so the router's own
// scroll restoration never sees it: <main> kept the previous page's offset
// (a card opened from the middle of the Admin panel showed its bottom
// half), and going back always landed at the top of the list again.
//
// Each history entry has its own key. Scrolling saves the offset under the
// current entry; when a new page opens its entry has nothing saved, so it
// starts at the top, and when the user comes back (browser back, "Orqaga")
// the saved offset is put back -- retried for a moment, because the page's
// cards and data arrive a little after the route itself.
//
// Only a change of page counts (or of a search key that swaps the whole
// view, like ?section= or ?tab=); filters and dates in the URL leave the
// scroll alone.

const VIEW_KEYS = ["section", "tab", "provider", "view"] as const;
const STORE = "salesiq.scroll";
const RESTORE_FOR_MS = 2000;

function load(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

const saved: Record<string, number> = typeof window === "undefined" ? {} : load();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function remember(key: string, top: number) {
  saved[key] = top;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      // Keep the store small: the 200 most recent entries are plenty.
      const keys = Object.keys(saved);
      for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete saved[k];
      sessionStorage.setItem(STORE, JSON.stringify(saved));
    } catch {
      // Storage full or blocked -- the in-memory copy still works.
    }
  }, 300);
}

function viewSignature(pathname: string, search: Record<string, unknown>): string {
  return [pathname, ...VIEW_KEYS.map((k) => String(search[k] ?? ""))].join("|");
}

export function useMainScrollMemory(ref: RefObject<HTMLElement | null>) {
  const entryKey = useRouterState({
    select: (s) => {
      const st = s.location.state as { __TSR_key?: string; key?: string } | undefined;
      return st?.__TSR_key ?? st?.key ?? s.location.href;
    },
  });
  const signature = useRouterState({
    select: (s) =>
      viewSignature(s.location.pathname, (s.location.search ?? {}) as Record<string, unknown>),
  });
  const keyRef = useRef(entryKey);
  keyRef.current = entryKey;

  // Save the offset under whichever entry is showing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => remember(keyRef.current, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);

  // A new view: top, or the offset it had when the user left it.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = saved[keyRef.current] ?? 0;
    el.scrollTop = target;
    if (target === 0) return;

    let cancelled = false;
    const stop = () => {
      cancelled = true;
    };
    // The user scrolling by hand wins over the restore.
    el.addEventListener("wheel", stop, { passive: true, once: true });
    el.addEventListener("touchstart", stop, { passive: true, once: true });
    const started = performance.now();
    let frame = 0;
    const tick = () => {
      if (cancelled) return;
      if (Math.abs(el.scrollTop - target) > 2) el.scrollTop = target;
      if (performance.now() - started < RESTORE_FOR_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchstart", stop);
    };
    // Runs per view, not per filter change -- see the note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
