// Browser Push API subscription management -- separate from use-crm-data.ts
// since this is entirely browser-API-driven (ServiceWorker/Notification/
// PushManager), not a Supabase data hook like everything else in there.
// The subscription itself is saved by /notifications/push (server side), so
// a shared computer's browser always notifies whoever subscribed it last.
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

export type PushSubscriptionStatus =
  "unsupported" | "unsubscribed" | "subscribed" | "blocked" | "loading";

const STATUS_KEY = ["push_subscription_status"];

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function postPush(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await apiFetch("/notifications/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json["error"] === "string" ? json["error"] : "PUSH_FAILED");
  return json;
}

function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  return postPush({
    action: "subscribe",
    endpoint: sub.endpoint,
    p256dh: json.keys?.["p256dh"] ?? "",
    auth: json.keys?.["auth"] ?? "",
  });
}

/**
 * Re-saves this browser's subscription once per signed-in session: the
 * server row may have been pruned or belong to whoever used the browser
 * before. Never asks for permission.
 */
export function usePushResync() {
  const { user } = useAuth();
  const userId = user?.id;
  const hasOrg = !!user?.organizationId;
  useEffect(() => {
    if (!userId || !hasOrg || !pushSupported() || Notification.permission !== "granted") return;
    const key = `salesiq.push.synced.${userId}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      // private mode: just sync
    }
    void currentSubscription()
      .then((sub) => (sub ? saveSubscription(sub) : null))
      .then(() => {
        try {
          sessionStorage.setItem(key, "1");
        } catch {
          // ignore
        }
      })
      .catch(() => undefined);
  }, [userId, hasOrg]);
}

/** Removes this browser from the person's devices (called on sign-out). */
export async function forgetPushDevice(): Promise<void> {
  if (!pushSupported()) return;
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  await postPush({ action: "unsubscribe", endpoint: sub.endpoint }).catch(() => undefined);
}

export function usePushSubscription() {
  const qc = useQueryClient();

  const statusQuery = useQuery({
    queryKey: STATUS_KEY,
    queryFn: async (): Promise<PushSubscriptionStatus> => {
      if (!pushSupported()) return "unsupported";
      if (Notification.permission === "denied") return "blocked";
      const sub = await currentSubscription();
      return sub && Notification.permission === "granted" ? "subscribed" : "unsubscribed";
    },
  });

  const subscribe = useMutation({
    mutationFn: async () => {
      if (!pushSupported()) throw new Error("PUSH_UNSUPPORTED");
      const vapidPublicKey = import.meta.env["VITE_VAPID_PUBLIC_KEY"] as string | undefined;
      if (!vapidPublicKey) throw new Error("PUSH_NOT_CONFIGURED");
      const permission = await Notification.requestPermission();
      if (permission === "denied") throw new Error("PUSH_BLOCKED");
      if (permission !== "granted") throw new Error("PUSH_DISMISSED");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const key = urlBase64ToUint8Array(vapidPublicKey) as BufferSource;
      let sub: PushSubscription;
      try {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      } catch (err) {
        // A subscription made with an older key: replace it.
        const old = await reg.pushManager.getSubscription();
        if (!old) throw err;
        await old.unsubscribe();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      await saveSubscription(sub);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: STATUS_KEY }),
  });

  const unsubscribe = useMutation({
    mutationFn: async () => {
      if (!pushSupported()) return;
      const sub = await currentSubscription();
      if (!sub) return;
      await postPush({ action: "unsubscribe", endpoint: sub.endpoint }).catch(() => undefined);
      await sub.unsubscribe();
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: STATUS_KEY }),
  });

  const test = useMutation({
    mutationFn: async () => {
      const json = await postPush({ action: "test" });
      return Number(json["sent"] ?? 0);
    },
  });

  return { status: statusQuery.data ?? "loading", subscribe, unsubscribe, test };
}
