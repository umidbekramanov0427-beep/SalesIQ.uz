import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushConfigured, sendPush } from "@/lib/push/push.server";

// This device's web push subscription. Saved server-side so a shared
// computer's browser always belongs to whoever subscribed it last (the
// endpoint is unique; the browser can't take over another person's row),
// and "test" sends a sample notification to all of the person's devices.

type Body = {
  action?: "subscribe" | "unsubscribe" | "register_device" | "unregister_device" | "test";
  /** The SalesIQ phone app's Firebase token (register_device / unregister_device). */
  token?: string;
  platform?: string;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
};

const validEndpoint = (v: unknown): v is string =>
  typeof v === "string" && v.length < 1200 && /^https:\/\/[^\s]+$/.test(v);
const validToken = (v: unknown): v is string =>
  typeof v === "string" && v.length > 20 && v.length < 4096 && /^[A-Za-z0-9_\-:.]+$/.test(v);

const validKey = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 8 && v.length <= max && /^[A-Za-z0-9_\-=+/]+$/.test(v);

export const Route = createFileRoute("/notifications/push")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
        const { count } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", userId);
        return Response.json({ configured: pushConfigured(), devices: count ?? 0 });
      },
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
        const { data: me } = await supabaseAdmin
          .from("profiles")
          .select("id, organization_id")
          .eq("id", userId)
          .maybeSingle();
        if (!me?.organization_id) {
          return Response.json({ error: "NO_COMPANY" }, { status: 400 });
        }
        const body = (await request.json().catch(() => ({}))) as Body;

        if (body.action === "subscribe") {
          if (
            !validEndpoint(body.endpoint) ||
            !validKey(body.p256dh, 200) ||
            !validKey(body.auth, 64)
          ) {
            return Response.json({ error: "Bad subscription." }, { status: 400 });
          }
          const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
            {
              endpoint: body.endpoint,
              profile_id: me.id,
              organization_id: me.organization_id,
              p256dh: body.p256dh,
              auth: body.auth,
            },
            { onConflict: "endpoint" },
          );
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ ok: true });
        }

        if (body.action === "unsubscribe") {
          if (!validEndpoint(body.endpoint)) return Response.json({ ok: true });
          await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", body.endpoint)
            .eq("profile_id", me.id);
          return Response.json({ ok: true });
        }

        if (body.action === "register_device") {
          if (!validToken(body.token))
            return Response.json({ error: "Bad token." }, { status: 400 });
          const { error } = await supabaseAdmin.from("push_devices").upsert(
            {
              token: body.token,
              profile_id: me.id,
              organization_id: me.organization_id,
              platform: body.platform === "ios" ? "ios" : "android",
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "token" },
          );
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ ok: true });
        }

        if (body.action === "unregister_device") {
          if (!validToken(body.token)) return Response.json({ ok: true });
          await supabaseAdmin
            .from("push_devices")
            .delete()
            .eq("token", body.token)
            .eq("profile_id", me.id);
          return Response.json({ ok: true });
        }

        if (body.action === "test") {
          if (!pushConfigured()) {
            return Response.json({ error: "PUSH_NOT_CONFIGURED" }, { status: 503 });
          }
          const sent = await sendPush(me.organization_id, [me.id], {
            kind: "test",
            title: "🔔 SalesIQ bildirishnomasi",
            body: "Hammasi ishlayapti: yangi lid, mijoz xabari va qo'ng'iroqlar shu yerga keladi.",
            url: "/settings",
            tag: "test",
          });
          return Response.json({ sent });
        }

        return Response.json({ error: "Unknown action." }, { status: 400 });
      },
    },
  },
});
