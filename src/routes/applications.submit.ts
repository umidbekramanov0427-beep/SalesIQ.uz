import { createFileRoute } from "@tanstack/react-router";
import { applicationTelegramText, parseApplication } from "@/lib/applications";

// POST /applications/submit -- the website's "Ariza qoldiring" form (public,
// no sign-in). Saves the application for Owner → Arizalar and pings the
// platform owners in Telegram. At most 5 per IP per hour.
const PER_IP_PER_HOUR = 5;

export const Route = createFileRoute("/applications/submit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!b || typeof b !== "object") return Response.json({ error: "BAD" }, { status: 400 });
        // A hidden field people never fill: bots do.
        if (typeof b["website"] === "string" && b["website"]) return Response.json({ ok: true });
        const parsed = parseApplication(b);
        if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { requestIp } = await import("@/lib/request-meta.server");
        const ip = requestIp(request);
        if (ip) {
          const { count } = await supabaseAdmin
            .from("platform_applications")
            .select("id", { count: "exact", head: true })
            .eq("ip", ip)
            .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
          if ((count ?? 0) >= PER_IP_PER_HOUR)
            return Response.json({ error: "TOO_MANY" }, { status: 429 });
        }
        const a = parsed.value;
        const { error } = await supabaseAdmin.from("platform_applications").insert({
          name: a.name,
          phone: a.phone,
          email: a.email,
          company: a.company,
          team_size: a.teamSize,
          message: a.message,
          source: a.source,
          utm: a.utm,
          ip,
        });
        if (error) return Response.json({ error: "SAVE_FAILED" }, { status: 500 });

        const { notifyPlatformOwners } = await import("@/lib/owner-alerts.server");
        await notifyPlatformOwners(applicationTelegramText(a)).catch(() => {});
        return Response.json({ ok: true });
      },
    },
  },
});
