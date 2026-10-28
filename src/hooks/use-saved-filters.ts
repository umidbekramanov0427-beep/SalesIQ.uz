import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { decodeFilters, encodeFilters, savedFiltersKey } from "@/lib/saved-filters";

/**
 * "Saqlash" for a page's filters. The page keeps its own filter state;
 * this reads the saved one once (after sign-in is known) and hands it to
 * `apply`, and tells the page whether the current filters differ from what
 * is saved (or, with nothing saved, from the defaults) -- that is when the
 * Saqlash button shows. Per person and per browser.
 */
export function useSavedFilters<T>(
  page: string,
  current: T,
  defaults: T,
  apply: (value: T) => void,
) {
  const { user } = useAuth();
  const key = user?.id ? savedFiltersKey(user.id, page) : null;
  const [savedRaw, setSavedRaw] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (!key || loadedFor.current === key) return;
    loadedFor.current = key;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      raw = null;
    }
    const value = decodeFilters<T>(raw);
    setSavedRaw(value ? raw : null);
    if (value) applyRef.current(value);
  }, [key]);

  const currentRaw = encodeFilters(current);
  const baseline = savedRaw ?? encodeFilters(defaults);

  const save = useCallback(() => {
    if (!key) return;
    try {
      window.localStorage.setItem(key, currentRaw);
    } catch {
      // Private window / storage blocked: the filters still apply now.
    }
    setSavedRaw(currentRaw);
  }, [key, currentRaw]);

  const forget = useCallback(() => {
    if (key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // see save()
      }
    }
    setSavedRaw(null);
    applyRef.current(defaults);
  }, [key, defaults]);

  return { changed: currentRaw !== baseline, saved: savedRaw !== null, save, forget };
}
