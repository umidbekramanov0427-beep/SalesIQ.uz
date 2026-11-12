import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isOnline } from "@/lib/visits.server";
import { presenceOf } from "@/lib/presence";

// Jamoa holati: everyone in the caller's company and what they are doing
// now. Online = a tab sent its once-a-minute heartbeat in the last ~2.5 min
// (user_login_events.last_seen_at); active vs idle and the page from their
// newest session events; ringing / on a call from the phone system
// (pbx_calls); started work from Davomat (work_sessions). The platform owner
// is never listed. Service role -- always this company only.
export const Route = createFileRoute("/account/online")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireOrgMember(request);
        if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const org = me.organizationId;
        const now = Date.now();
        const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
        const dayStart = new Date(now + 5 * 3_600_000);
        dayStart.setUTCHours(0, 0, 0, 0);
        const todayIso = new Date(dayStart.getTime() - 5 * 3_600_000).toISOString();

        const [{ data: people }, { data: sessions }, { data: calls }, { data: work }] =
          await Promise.all([
            supabaseAdmin
              .from("profiles")
              .select("id, full_name, email, role, avatar_url")
              .eq("organization_id", org),
            supabaseAdmin
              .from("user_login_events")
              .select("id, user_id, created_at, last_seen_at, revoked_at")
              .eq("organization_id", org)
              .eq("kind", "session")
              .gte("last_seen_at", weekAgo)
              .order("last_seen_at", { ascending: false })
              .limit(600),
            supabaseAdmin
              .from("pbx_calls")
              .select(
                "initiated_by, status, updated_at, created_at, from_number, to_number, direction",
              )
              .eq("organization_id", org)
              .in("status", ["ringing", "answered"])
              .gte("updated_at", new Date(now - 60 * 60_000).toISOString())
              .not("initiated_by", "is", null)
              .order("updated_at", { ascending: false })
              .limit(100),
            supabaseAdmin
              .from("work_sessions")
              .select("profile_id, clock_in")
              .eq("organization_id", org)
              .is("clock_out", null)
              .gte("clock_in", todayIso),
          ]);

        type S = {
          id: string;
          created_at: string;
          last_seen_at: string | null;
          revoked_at: string | null;
        };
        const byUser = new Map<string, S[]>();
        for (const s of sessions ?? []) {
          if (!s.user_id) continue;
          byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
        }
        const onlineIds = [...byUser.values()]
          .flat()
          .filter(isOnline)
          .map((s) => s.id);
        const { data: events } = onlineIds.length
          ? await supabaseAdmin
              .from("user_session_events")
              .select("session_id, kind, path, created_at")
              .in("session_id", onlineIds)
              .order("created_at", { ascending: false })
              .limit(1000)
          : {
              data: [] as {
                session_id: string;
                kind: string;
                path: string | null;
                created_at: string;
              }[],
            };
        const lastEvent = new Map<string, string>();
        const lastPage = new Map<string, string>();
        for (const e of events ?? []) {
          if (!lastEvent.has(e.session_id)) lastEvent.set(e.session_id, e.created_at);
          if (e.kind === "page" && e.path && !lastPage.has(e.session_id))
            lastPage.set(e.session_id, e.path);
        }
        const callOf = new Map<string, { status: string; since: string; number: string | null }>();
        for (const c of calls ?? []) {
          if (!c.initiated_by || callOf.has(c.initiated_by)) continue;
          callOf.set(c.initiated_by, {
            status: c.status,
            since: c.created_at,
            number: (c.direction === "inbound" ? c.from_number : c.to_number) ?? null,
          });
        }
        const clockIn = new Map((work ?? []).map((w) => [w.profile_id, w.clock_in]));

        const list = (people ?? [])
          .filter((p) => p.role !== "platform_owner")
          .map((p) => {
            const mine = byUser.get(p.id) ?? [];
            const live = mine.filter(isOnline);
            // The tab used most recently decides the page and activity.
            const newest = live
              .map((s) => ({ s, at: lastEvent.get(s.id) ?? s.created_at }))
              .sort((a, b) => b.at.localeCompare(a.at))[0];
            const call = callOf.get(p.id) ?? null;
            const lastEventAt = newest ? (lastEvent.get(newest.s.id) ?? null) : null;
            const path = newest ? (lastPage.get(newest.s.id) ?? null) : null;
            const since = live.length ? live.map((s) => s.created_at).sort()[0]! : null;
            const lastSeen =
              mine
                .map((s) => s.last_seen_at ?? s.created_at)
                .sort()
                .reverse()[0] ?? null;
            return {
              id: p.id,
              name: p.full_name || p.email || "—",
              role: p.role,
              avatarUrl: p.avatar_url,
              me: p.id === me.id,
              online: live.length > 0,
              presence: presenceOf({
                online: live.length > 0,
                call: call ? (call.status === "answered" ? "answered" : "ringing") : null,
                lastEventAt,
                since,
                path,
                now,
              }),
              path,
              since: since ?? lastSeen ?? new Date(now).toISOString(),
              lastActive: lastEventAt ?? lastSeen,
              lastSeen,
              call: call ? { since: call.since, number: call.number } : null,
              clockIn: clockIn.get(p.id) ?? null,
            };
          });
        return Response.json({ people: list }, { status: 200 });
      },
    },
  },
});
