import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deviceLabel, header, requestIp } from "@/lib/request-meta.server";

// A sign-in attempt that failed (wrong password, unknown email) for the
// platform owner's visits report: which email was tried, from what device
// and where. Public by necessity (nobody is signed in yet), so it is
// capped per IP and stores nothing it doesn't need.

const PER_IP_PER_HOUR = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Route = createFileRoute("/account/login-failed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          email?: unknown;
          deviceId?: unknown;
        };
        const email =
          typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
        if (!EMAIL_RE.test(email)) return Response.json({ ok: true });
        const ip = requestIp(request);

        if (ip) {
          const { count } = await supabaseAdmin
            .from("user_login_events")
            .select("id", { count: "exact", head: true })
            .eq("kind", "failed_login")
            .eq("ip", ip)
            .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
          if ((count ?? 0) >= PER_IP_PER_HOUR) return Response.json({ ok: true });
        }

        // The company the email belongs to, when it is a real account, so
        // the report can file the attempt under it.
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("organization_id")
          .eq("email", email)
          .maybeSingle();

        const ua = request.headers.get("user-agent") ?? "";
        await supabaseAdmin.from("user_login_events").insert({
          kind: "failed_login",
          user_id: null,
          organization_id: profile?.organization_id ?? null,
          email_attempted: email,
          device_id:
            typeof body.deviceId === "string" && body.deviceId.length <= 100
              ? body.deviceId
              : "unknown",
          device_label: deviceLabel(ua),
          user_agent: ua.slice(0, 500),
          ip,
          city: header(request, "x-vercel-ip-city"),
          country: header(request, "x-vercel-ip-country"),
          region: header(request, "x-vercel-ip-country-region"),
        });
        return Response.json({ ok: true });
      },
    },
  },
});
