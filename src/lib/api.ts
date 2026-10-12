import { supabase } from "@/integrations/supabase/client";
import { trail } from "@/lib/session-trail";

// Set once the Python backend (backend-python/) is deployed and its routes
// are trusted for production traffic -- e.g. https://salesos-new.onrender.com.
// Left unset, every apiFetch call stays same-origin against this app's own
// TypeScript backend, exactly as before this existed. AmoCRM routes
// deliberately keep calling the TypeScript backend directly (plain
// same-origin fetch, not through this helper) until the Python AmoCRM sync
// engine has been validated against a live account -- see backend-python/PORT_STATUS.md.
const API_BASE_URL =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.replace(/\/$/, "") ?? "";

/**
 * Shared fetch wrapper for this app's own backend routes. Every protected
 * route (old TypeScript or new Python) authenticates strictly via an
 * `Authorization: Bearer <supabase JWT>` header, never a cookie, so
 * attaching it here covers both backends identically. `path` is prefixed
 * with VITE_API_BASE_URL when set; otherwise this resolves to the same
 * same-origin relative fetch every call site used before this helper
 * existed.
 */
// Important actions done through the app's own routes, named for the
// platform owner's visits report (the timeline and per-company usage).
const TRAILED_ACTIONS: [RegExp, string][] = [
  [/^\/audio-analytics\/analyze$/, "call_analyze"],
  [/^\/admin\/create-employee$/, "user_invite"],
  [/^\/ai-assistant\/chat$/, "ai_question"],
  [/^\/bulk-message\/send$/, "bulk_message"],
  [/^\/reports\/send-telegram$/, "report_telegram"],
  [/^\/daily-report-settings\/generate-now$/, "report_telegram"],
  [/^\/leads\/(merge|duplicates\/funnel-merge)$/, "leads_merge"],
  [/^\/telegram\/link$/, "telegram_link"],
  [
    /^\/integrations\/(telephony|sms|email)\/credentials$|^\/integrations\/(outgoing-webhook|webhook-destinations|external-api-token)$/,
    "integration_connect",
  ],
];

function trailAction(path: string, init: RequestInit | undefined) {
  if ((init?.method ?? "GET").toUpperCase() !== "POST") return;
  const bare = path.split("?")[0]!;
  const hit = TRAILED_ACTIONS.find(([re]) => re.test(bare));
  if (!hit) return;
  const name = bare.split("/")[2];
  trail(
    "action",
    hit[1],
    undefined,
    hit[1] === "integration_connect" && name ? { integration: name } : undefined,
  );
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  // FormData bodies (file uploads) must NOT get an explicit content-type --
  // fetch needs to set its own multipart boundary, and a stale
  // "application/json" here would break the server's form parsing.
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "content-type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (res.ok) trailAction(path, init);
  return res;
}
