import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// The browser's batch of what happened in one sign-in session (pages
// opened, actions that failed, things it wasn't allowed to open) for the
// platform owner's visits report. Also marks the session as still active.

const KINDS = new Set(["page", "action", "failed", "blocked"]);
const MAX_EVENTS = 50;

type IncomingEvent = {
  kind?: unknown;
  label?: unknown;
  path?: unknown;
  at?: unknown;
  meta?: unknown;
};

const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export const Route = createFileRoute("/account/session-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as {
          sessionId?: unknown;
          events?: unknown;
        };
        const sessionId = text(body.sessionId, 64);
        if (!sessionId) return Response.json({ error: "sessionId is required." }, { status: 400 });

        const { data: session } = await supabaseAdmin
          .from("user_login_events")
          .select("id, user_id, organization_id")
          .eq("id", sessionId)
          .maybeSingle();
        // Only the session's own user may write into it.
        if (!session || session.user_id !== userId) {
          return Response.json({ error: "Unknown session." }, { status: 404 });
        }

        const now = Date.now();
        const rows = (Array.isArray(body.events) ? (body.events as IncomingEvent[]) : [])
          .slice(0, MAX_EVENTS)
          .filter((e) => typeof e.kind === "string" && KINDS.has(e.kind) && text(e.label, 300))
          .map((e) => {
            const at = typeof e.at === "number" && Math.abs(now - e.at) < 86_400_000 ? e.at : now;
            return {
              session_id: session.id,
              user_id: userId,
              organization_id: session.organization_id,
              kind: e.kind as string,
              label: text(e.label, 300)!,
              path: text(e.path, 300),
              meta:
                e.meta && typeof e.meta === "object" && JSON.stringify(e.meta).length < 2000
                  ? (e.meta as Record<string, string>)
                  : {},
              created_at: new Date(at).toISOString(),
            };
          });

        const [insert] = await Promise.all([
          rows.length
            ? supabaseAdmin.from("user_session_events").insert(rows)
            : Promise.resolve({ error: null }),
          supabaseAdmin
            .from("user_login_events")
            .update({ last_seen_at: new Date(now).toISOString() })
            .eq("id", session.id),
        ]);
        if (insert.error) return Response.json({ error: insert.error.message }, { status: 500 });
        return Response.json({ ok: true, saved: rows.length });
      },
    },
  },
});
