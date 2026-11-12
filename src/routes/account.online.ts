import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isOnline, ONLINE_MS } from "@/lib/visits.server";

// Who in the caller's company is in the app right now: each browser tab
// sends a heartbeat every minute (user_login_events.last_seen_at), so a
// person is online while one of their tabs beat in the last ~2.5 minutes.
// The page each one is on comes from their newest page event. The
// platform owner is never listed. Service role -- always this company only.
export const Route = createFileRoute("/account/online")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireOrgMember(request);
        if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data, error } = await supabaseAdmin
          .from("user_login_events")
          .select("id, user_id, created_at, last_seen_at, revoked_at")
          .eq("organization_id", me.organizationId)
          .eq("kind", "session")
          .gte("last_seen_at", new Date(Date.now() - ONLINE_MS).toISOString())
          .order("last_seen_at", { ascending: false })
          .limit(300);
        if (error) return Response.json({ people: [] }, { status: 200 });
        const sessions = (data ?? []).filter(isOnline);
        const byUser = new Map<string, { since: string; sessionIds: string[] }>();
        for (const s of sessions) {
          if (!s.user_id) continue;
          const cur = byUser.get(s.user_id);
          if (!cur) byUser.set(s.user_id, { since: s.created_at, sessionIds: [s.id] });
          else {
            cur.sessionIds.push(s.id);
            if (s.created_at < cur.since) cur.since = s.created_at;
          }
        }
        const ids = [...byUser.keys()];
        if (!ids.length) return Response.json({ people: [] }, { status: 200 });
        const sessionIds = [...byUser.values()].flatMap((v) => v.sessionIds);
        const [{ data: people }, { data: pages }] = await Promise.all([
          supabaseAdmin
            .from("profiles")
            .select("id, full_name, email, role, avatar_url")
            .eq("organization_id", me.organizationId)
            .in("id", ids),
          supabaseAdmin
            .from("user_session_events")
            .select("session_id, path, created_at")
            .in("session_id", sessionIds)
            .eq("kind", "page")
            .order("created_at", { ascending: false })
            .limit(500),
        ]);
        const pageOfSession = new Map<string, string>();
        for (const p of pages ?? []) {
          if (p.path && !pageOfSession.has(p.session_id)) pageOfSession.set(p.session_id, p.path);
        }
        const list = (people ?? [])
          .filter((p) => p.role !== "platform_owner")
          .map((p) => {
            const u = byUser.get(p.id)!;
            const path = u.sessionIds.map((id) => pageOfSession.get(id)).find(Boolean) ?? null;
            return {
              id: p.id,
              name: p.full_name || p.email || "—",
              role: p.role,
              avatarUrl: p.avatar_url,
              since: u.since,
              path,
              me: p.id === me.id,
            };
          })
          .sort((a, b) => Number(b.me) - Number(a.me) || a.name.localeCompare(b.name));
        return Response.json({ people: list }, { status: 200 });
      },
    },
  },
});
