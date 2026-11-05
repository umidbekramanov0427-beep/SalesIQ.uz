import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Sozlamalar → Xavfsizlik → Kirishlar tarixi: the company's own sign-ins
// (and failed password attempts on its people's emails) for the last 30
// days, newest first. user_login_events has no browser policy, so this is
// the only way in -- service role, always filtered to the caller's company.
export const Route = createFileRoute("/admin/login-events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });

        const { data: people } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, role")
          .eq("organization_id", admin.organizationId);
        const byId = new Map((people ?? []).map((p) => [p.id, p]));
        const emails = (people ?? []).map((p) => p.email).filter((e): e is string => !!e);
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const cols =
          "id, user_id, kind, email_attempted, device_label, user_agent, ip, city, country, created_at, last_seen_at, revoked_at";

        const [own, failed] = await Promise.all([
          supabaseAdmin
            .from("user_login_events")
            .select(cols)
            .eq("organization_id", admin.organizationId)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(300),
          // Failed attempts carry no company: matched by the email typed.
          emails.length
            ? supabaseAdmin
                .from("user_login_events")
                .select(cols)
                .eq("kind", "failed_login")
                .in("email_attempted", emails)
                .gte("created_at", since)
                .order("created_at", { ascending: false })
                .limit(100)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (own.error) return Response.json({ error: own.error.message }, { status: 400 });

        const seen = new Set<string>();
        const events = [...(own.data ?? []), ...(failed.data ?? [])]
          .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((e) => {
            const p = e.user_id
              ? byId.get(e.user_id)
              : (people ?? []).find((x) => x.email === e.email_attempted);
            return {
              id: e.id,
              kind: e.kind,
              name: p?.full_name || p?.email || e.email_attempted || "—",
              role: p?.role ?? null,
              device: e.device_label,
              userAgent: e.user_agent,
              ip: e.ip,
              city: e.city,
              country: e.country,
              at: e.created_at,
              lastSeen: e.last_seen_at,
              closed: !!e.revoked_at,
            };
          });
        return Response.json({ events }, { status: 200 });
      },
    },
  },
});
