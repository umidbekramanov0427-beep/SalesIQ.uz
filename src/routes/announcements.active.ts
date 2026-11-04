import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { visibleAnnouncements } from "@/lib/announcements";

// GET  /announcements/active -- the owner's banners this person should see
//      now (their company's audience, not closed by them).
// POST /announcements/active {id} -- close one (dismissible ones only).
export const Route = createFileRoute("/announcements/active")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const member = await requireOrgMember(request);
        if (!member) return Response.json({ items: [] }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { orgPhase } = await import("@/lib/org-access");
        const [{ data: rows, error }, { data: org }, { data: closed }] = await Promise.all([
          supabaseAdmin
            .from("platform_announcements")
            .select(
              "id, title, body, kind, audience, org_ids, link_url, link_label, dismissible, starts_at, ends_at, active",
            )
            .eq("active", true)
            .order("starts_at", { ascending: false })
            .limit(50),
          supabaseAdmin
            .from("organizations")
            .select("id, plan, active, trial_ends_at, is_trial")
            .eq("id", member.organizationId)
            .maybeSingle(),
          supabaseAdmin
            .from("platform_announcement_dismissals")
            .select("announcement_id")
            .eq("user_id", member.id),
        ]);
        // Before the migration (or on any error) there is simply nothing to show.
        if (error || !org) return Response.json({ items: [] });
        const items = visibleAnnouncements(
          rows ?? [],
          { id: org.id, phase: orgPhase(org) },
          new Set((closed ?? []).map((d) => d.announcement_id)),
        ).slice(0, 3);
        return Response.json(
          {
            items: items.map((a) => ({
              id: a.id,
              title: a.title,
              body: a.body,
              kind: a.kind,
              linkUrl: a.link_url,
              linkLabel: a.link_label,
              dismissible: a.dismissible,
            })),
          },
          { headers: { "cache-control": "no-store" } },
        );
      },

      POST: async ({ request }) => {
        const member = await requireOrgMember(request);
        if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const b = (await request.json().catch(() => ({}))) as { id?: unknown };
        if (typeof b.id !== "string" || !/^[0-9a-f-]{36}$/i.test(b.id))
          return Response.json({ error: "BAD_ID" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: a } = await supabaseAdmin
          .from("platform_announcements")
          .select("dismissible")
          .eq("id", b.id)
          .maybeSingle();
        if (!a?.dismissible) return Response.json({ error: "NOT_DISMISSIBLE" }, { status: 400 });
        await supabaseAdmin
          .from("platform_announcement_dismissals")
          .upsert({ announcement_id: b.id, user_id: member.id });
        return Response.json({ ok: true });
      },
    },
  },
});
