import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushPayload, wantsPush, type PushMessage, type PushPrefColumn } from "./push";

// Sends a browser/phone notification (web push, delivered even when no
// SalesIQ tab is open) to people's subscribed devices. Best-effort: never
// throws, gives up on a device after a few seconds, and prunes devices the
// browser has dropped (404/410). Keys: VAPID_* on the server, or a pair the
// platform makes for itself and keeps in platform_private (vapidKeys).

const SEND_TIMEOUT_MS = 4_000;

type WebPush = typeof import("web-push");
type Keys = { subject: string; publicKey: string; privateKey: string };

async function importWebPush(): Promise<WebPush> {
  const mod = await import("web-push");
  return ((mod as { default?: WebPush }).default ?? mod) as WebPush;
}

let keys: Keys | null = null;
let keysTry: Promise<Keys | null> | null = null;
let keysAt = 0;

/**
 * The VAPID keys: VAPID_* on the server when set, else the platform's own
 * pair, made once and kept in platform_private (the private key sealed) --
 * so notifications work without anyone setting keys up by hand. A miss
 * (database not updated yet, migration 20270114) is asked again a minute later.
 */
export async function vapidKeys(): Promise<Keys | null> {
  if (keys) return keys;
  if (!keysTry || Date.now() - keysAt > 60_000) {
    keysAt = Date.now();
    keysTry = loadKeys().catch(() => null);
  }
  keys = await keysTry;
  return keys;
}

async function loadKeys(): Promise<Keys | null> {
  const subject = process.env["VAPID_SUBJECT"] || "https://salesiq.uz";
  const envPublic = process.env["VAPID_PUBLIC_KEY"];
  const envPrivate = process.env["VAPID_PRIVATE_KEY"];
  if (envPublic && envPrivate) return { subject, publicKey: envPublic, privateKey: envPrivate };

  const read = async () => {
    const { data, error } = await supabaseAdmin
      .from("platform_private")
      .select("vapid_public_key, vapid_private_key_sealed")
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;
    return data as {
      vapid_public_key: string | null;
      vapid_private_key_sealed: string | null;
    } | null;
  };
  const { openSecret, sealSecret } = await import("@/lib/secret-box.server");
  let row = await read();
  if (!row?.vapid_public_key || !row.vapid_private_key_sealed) {
    // First use: make the platform's pair. Only one writer wins.
    const pair = (await importWebPush()).generateVAPIDKeys();
    await supabaseAdmin
      .from("platform_private")
      .update({
        vapid_public_key: pair.publicKey,
        vapid_private_key_sealed: sealSecret(pair.privateKey),
      })
      .eq("id", true)
      .is("vapid_public_key", null);
    row = await read();
  }
  if (!row?.vapid_public_key || !row.vapid_private_key_sealed) return null;
  const privateKey = openSecret(row.vapid_private_key_sealed);
  return privateKey ? { subject, publicKey: row.vapid_public_key, privateKey } : null;
}

let webpushReady: Promise<WebPush | null> | null = null;

async function loadWebPush(): Promise<WebPush | null> {
  const keys = await vapidKeys();
  if (!keys) return null;
  webpushReady ??= (async () => {
    const webpush = await importWebPush();
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    return webpush;
  })().catch(() => null);
  return webpushReady;
}

/** Whether notifications can be sent (keys on the server or made by it). */
export async function pushConfigured(): Promise<boolean> {
  return !!(await vapidKeys());
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
