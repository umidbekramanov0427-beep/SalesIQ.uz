import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deviceLabel, header, requestIp } from "@/lib/request-meta.server";

// Records a sign-in for the profile window's "Devices and sign-ins": the
// browser posts once per session with its device id; the IP, city and
// country come from the request itself (the hosting edge's headers), the
// browser and OS from its user agent.

export const Route = createFileRoute("/account/login-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const userId = await getRequestUserId(request);
          if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
          const body = (await request.json().catch(() => ({}))) as { deviceId?: unknown };
          const deviceId =
            typeof body.deviceId === "string" && body.deviceId.length <= 100
              ? body.deviceId
              : "unknown";

          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("organization_id")
            .eq("id", userId)
            .maybeSingle();

          const ua = request.headers.get("user-agent") ?? "";
          const ip = requestIp(request);

          // A first-ever session means the account was just created (sign-up
          // or an invitation); the visits report shows it as such.
          const { count: earlier } = await supabaseAdmin
            .from("user_login_events")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId);

          const now = new Date().toISOString();
          const { data: row, error } = await supabaseAdmin
            .from("user_login_events")
            .insert({
              user_id: userId,
              organization_id: profile?.organization_id ?? null,
              device_id: deviceId,
              device_label: deviceLabel(ua),
              user_agent: ua.slice(0, 500),
              ip,
              city: header(request, "x-vercel-ip-city"),
              country: header(request, "x-vercel-ip-country"),
              region: header(request, "x-vercel-ip-country-region"),
              last_seen_at: now,
            })
            .select("id")
            .single();
          if (error) throw error;
          if (earlier === 0) {
            await supabaseAdmin.from("user_session_events").insert({
              session_id: row.id,
              user_id: userId,
              organization_id: profile?.organization_id ?? null,
              kind: "action",
              label: "first_sign_in",
            });
          }
          return Response.json({ ok: true, sessionId: row.id });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
