import { supabase } from "@/integrations/supabase/client";
import {
  companyOrigin,
  panelFromHost,
  ROOT_DOMAIN,
  MARKETING_LABEL,
  type Panel,
} from "@/lib/subdomain";

// A company with its own address (<sub>.salesiq.uz) works only there.
// Someone of that company signed in on salesiq.uz is moved to it, signed
// in: the browser keeps a separate session per address, so the current
// session goes along in the URL fragment (never sent to any server, the
// same way Supabase's own sign-in links carry it), /auth/handoff on the
// company address picks it up, and the root domain forgets it.

const HANDOFF_PATH = "/auth/handoff";

/**
 * True on salesiq.uz / www.salesiq.uz / marketing.salesiq.uz itself (not a
 * company address, preview or localhost).
 */
export function onRootDomain(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host === ROOT_DOMAIN ||
    host === `www.${ROOT_DOMAIN}` ||
    host === `${MARKETING_LABEL}.${ROOT_DOMAIN}`
  );
}

/** The panel this tab is on (CRM or marketing). */
export function currentPanel(): Panel {
  return typeof window === "undefined" ? "crm" : panelFromHost(window.location.host);
}

/** Whether the company address answers (attached, DNS and certificate in place). */
export async function companyOriginLive(sub: string): Promise<boolean> {
  try {
    await fetch(`${companyOrigin(sub, currentPanel())}/favicon.png`, {
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return true;
  } catch {
    return false;
  }
}

/** Whether the other panel's address answers yet (DNS and certificate in place). */
export async function panelOriginLive(sub: string | null, panel: Panel): Promise<boolean> {
  try {
    await fetch(`${companyOrigin(sub, panel)}/favicon.png`, {
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
  return moveSession(sub, currentPanel(), `${window.location.pathname}${window.location.search}`);
}

/**
 * CRM <-> marketing panel: the same session moves to the other panel's
 * address (the company's own one when it has a subdomain) and opens `next`.
 */
export async function moveSessionToPanel(
  panel: Panel,
  sub: string | null,
  next: string,
): Promise<boolean> {
  return moveSession(sub, panel, next);
}

async function moveSession(sub: string | null, panel: Panel, next: string): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return false;
  const fragment = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    next,
  });
  // Forget the session here only (not a global sign-out: the company
  // address is about to use the same refresh token).
  await supabase.auth.signOut({ scope: "local" });
  window.location.replace(`${companyOrigin(sub, panel)}${HANDOFF_PATH}#${fragment.toString()}`);
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
