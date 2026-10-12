import { supabase } from "@/integrations/supabase/client";
import { companyOrigin, ROOT_DOMAIN } from "@/lib/subdomain";

// A company with its own address (<sub>.salesiq.uz) works only there.
// Someone of that company signed in on salesiq.uz is moved to it, signed
// in: the browser keeps a separate session per address, so the current
// session goes along in the URL fragment (never sent to any server, the
// same way Supabase's own sign-in links carry it), /auth/handoff on the
// company address picks it up, and the root domain forgets it.

const HANDOFF_PATH = "/auth/handoff";

/** True on salesiq.uz / www.salesiq.uz itself (not a company address, preview or localhost). */
export function onRootDomain(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`;
}

/** Whether the company address answers (attached, DNS and certificate in place). */
export async function companyOriginLive(sub: string): Promise<boolean> {
  try {
    await fetch(`${companyOrigin(sub)}/favicon.png`, {
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return true;
  } catch {
    return false;
  }
}

export async function moveSessionToCompany(sub: string): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return false;
  const next = `${window.location.pathname}${window.location.search}`;
  const fragment = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    next,
  });
  // Forget the session here only (not a global sign-out: the company
  // address is about to use the same refresh token).
  await supabase.auth.signOut({ scope: "local" });
  window.location.replace(`${companyOrigin(sub)}${HANDOFF_PATH}#${fragment.toString()}`);
  return true;
}

/** On /auth/handoff: signs this address in from the fragment and returns where to go next. */
export async function consumeHandoff(): Promise<string> {
  const params = new URLSearchParams(window.location.hash.slice(1));
  // Out of the address bar and history right away.
  window.history.replaceState(null, "", window.location.pathname);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return "/login";
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  return error ? "/login" : safeHandoffNext(params.get("next"));
}

/** Only a path on this same address (never another site, never the handoff page again). */
export function safeHandoffNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next === HANDOFF_PATH || next.startsWith(`${HANDOFF_PATH}?`) ? "/" : next;
}
