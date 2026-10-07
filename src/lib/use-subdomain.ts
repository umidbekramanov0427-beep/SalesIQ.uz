import { useEffect, useState } from "react";
import { subdomainFromHost } from "@/lib/subdomain";

/** The company subdomain this tab is on, read after mount (null during SSR and on the root domain). */
export function useCurrentSubdomain(): string | null {
  const [sub, setSub] = useState<string | null>(null);
  useEffect(() => {
    setSub(subdomainFromHost(window.location.host));
  }, []);
  return sub;
}

/** The company name for a subdomain (for its login page), or null if none/unknown. */
export function useSubdomainCompany(sub: string | null): { name: string | null; missing: boolean } {
  const [state, setState] = useState<{ name: string | null; missing: boolean }>({
    name: null,
    missing: false,
  });
  useEffect(() => {
    if (!sub) return;
    let cancelled = false;
    fetch(`/org/subdomain?name=${encodeURIComponent(sub)}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as { name?: string };
        if (!cancelled) setState({ name: json.name ?? null, missing: !res.ok });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sub]);
  return state;
}
