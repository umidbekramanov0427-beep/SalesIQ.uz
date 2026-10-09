import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Records a sign-in for the profile window's "Devices and sign-ins": the
// browser posts once per session with its device id; the IP, city and
// country come from the request itself (the hosting edge's headers), the
// browser and OS from its user agent.

function deviceLabel(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /YaBrowser/.test(ua)
        ? "Yandex"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows NT 10/.test(ua)
          ? "Windows 10/11"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  return os ? `${browser}, ${os}` : browser;
}

function header(request: Request, name: string): string | null {
  const v = request.headers.get(name);
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

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
          const ip =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            request.headers.get("x-real-ip") ||
            null;

          const { error } = await supabaseAdmin.from("user_login_events").insert({
            user_id: userId,
            organization_id: profile?.organization_id ?? null,
            device_id: deviceId,
            device_label: deviceLabel(ua),
            user_agent: ua.slice(0, 500),
            ip,
            city: header(request, "x-vercel-ip-city"),
            country: header(request, "x-vercel-ip-country"),
          });
          if (error) throw error;
          return Response.json({ ok: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
