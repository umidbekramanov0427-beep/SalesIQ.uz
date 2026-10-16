import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushPayload, wantsPush, type PushMessage, type PushPrefColumn } from "./push";

// Sends a browser/phone notification (web push, delivered even when no
// SalesIQ tab is open) to people's subscribed devices. Best-effort: never
// throws, gives up on a device after a few seconds, and prunes devices the
// browser has dropped (404/410). Needs VAPID_SUBJECT / VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY; without them nothing is sent.

const SEND_TIMEOUT_MS = 4_000;

type WebPush = typeof import("web-push");
let webpushReady: Promise<WebPush | null> | null = null;

function loadWebPush(): Promise<WebPush | null> {
  webpushReady ??= (async () => {
    const subject = process.env["VAPID_SUBJECT"];
    const publicKey = process.env["VAPID_PUBLIC_KEY"];
    const privateKey = process.env["VAPID_PRIVATE_KEY"];
    if (!subject || !publicKey || !privateKey) return null;
    const mod = await import("web-push");
    const webpush = ((mod as { default?: WebPush }).default ?? mod) as WebPush;
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return webpush;
  })().catch(() => null);
  return webpushReady;
}

export function pushConfigured(): boolean {
  return !!(
    process.env["VAPID_SUBJECT"] &&
    process.env["VAPID_PUBLIC_KEY"] &&
    process.env["VAPID_PRIVATE_KEY"]
  );
}

/** Keeps only the people who haven't turned this kind of notification off. */
async function filterByPreference(profileIds: string[], msg: PushMessage): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("notification_preferences")
    .select("*")
    .in("profile_id", profileIds);
  if (error || !data) return profileIds;
  const prefs = new Map(
    data.map((r) => [r.profile_id, r as Partial<Record<PushPrefColumn, boolean | null>>]),
  );
  return profileIds.filter((id) => wantsPush(msg.kind, prefs.get(id)));
}

/** Returns how many devices accepted the notification. */
export async function sendPush(
  organizationId: string,
  profileIds: (string | null | undefined)[],
  msg: PushMessage,
): Promise<number> {
  try {
    const ids = [...new Set(profileIds.filter((id): id is string => !!id))];
    if (!ids.length) return 0;
    const webpush = await loadWebPush();
    if (!webpush) return 0;
    const wanted = msg.kind === "test" ? ids : await filterByPreference(ids, msg);
    if (!wanted.length) return 0;
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("organization_id", organizationId)
      .in("profile_id", wanted);
    if (!subs?.length) return 0;

    const payload = pushPayload(msg);
    const stale: string[] = [];
    const results = await Promise.all(
      subs.map((sub) =>
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            {
              TTL: msg.kind === "call" ? 60 : 6 * 3600,
              urgency: msg.kind === "call" || msg.kind === "message" ? "high" : "normal",
              timeout: SEND_TIMEOUT_MS,
            },
          )
          .then(() => true)
          .catch((err: { statusCode?: number }) => {
            if (err?.statusCode === 404 || err?.statusCode === 410) stale.push(sub.id);
            return false;
          }),
      ),
    );
    if (stale.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
    return results.filter(Boolean).length;
  } catch {
    return 0;
  }
}

/** The company's admins and heads of sales: who hears about a lead nobody owns yet. */
export async function orgManagers(organizationId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .in("role", ["super_admin", "rop"]);
  return (data ?? []).map((p) => p.id);
}
