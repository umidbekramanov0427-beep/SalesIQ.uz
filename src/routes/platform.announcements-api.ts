import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { ANNOUNCEMENT_KINDS, AUDIENCES, announcementTelegramText } from "@/lib/announcements";

// Owner → E'lonlar API (platform owners only).
//   GET               every announcement, newest first, with how many closed it
//   POST {..}         create one; telegram: true also sends it to the
//                     matching companies' owners (super admins with Telegram)
//   PATCH {id, active} switch one on/off
//   DELETE ?id=       remove one
const KIND_LABEL: Record<string, string> = {
  update: "Yangilanish",
  payment: "To'lov",
  news: "Yangilik",
  reminder: "Eslatma",
  warning: "Ogohlantirish",
};

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export const Route = createFileRoute("/platform/announcements-api")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [{ data, error }, { data: dismissals }, { data: orgs }] = await Promise.all([
          supabaseAdmin
            .from("platform_announcements")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(200),
          supabaseAdmin.from("platform_announcement_dismissals").select("announcement_id"),
          supabaseAdmin.from("organizations").select("id, name").order("name"),
        ]);
        const companies = (orgs ?? []).map((o) => ({ id: o.id, name: o.name }));
        if (error) return Response.json({ ready: false, items: [], companies });
        const closed = new Map<string, number>();
        for (const d of dismissals ?? [])
          closed.set(d.announcement_id, (closed.get(d.announcement_id) ?? 0) + 1);
        return Response.json({
          ready: true,
          companies,
          items: (data ?? []).map((a) => ({ ...a, dismissed: closed.get(a.id) ?? 0 })),
        });
      },

      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const title = str(b["title"], 160);
        if (!title) return Response.json({ error: "TITLE_REQUIRED" }, { status: 400 });
        const kind = (ANNOUNCEMENT_KINDS as readonly string[]).includes(b["kind"] as string)
          ? (b["kind"] as string)
          : "news";
        const audience = (AUDIENCES as readonly string[]).includes(b["audience"] as string)
          ? (b["audience"] as string)
          : "all";
        const orgIds = Array.isArray(b["orgIds"])
          ? (b["orgIds"] as unknown[]).filter(
              (x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x),
            )
          : [];
        if (audience === "orgs" && orgIds.length === 0)
          return Response.json({ error: "PICK_COMPANIES" }, { status: 400 });
        const linkUrl = str(b["linkUrl"], 500);
        const endsAt =
          typeof b["endsAt"] === "string" && b["endsAt"] ? (b["endsAt"] as string) : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: created, error } = await supabaseAdmin
          .from("platform_announcements")
          .insert({
            title,
            body: str(b["body"], 2000),
            kind,
            audience,
            org_ids: audience === "orgs" ? orgIds : [],
            link_url: /^https?:\/\//.test(linkUrl) ? linkUrl : null,
            link_label: str(b["linkLabel"], 60) || null,
            dismissible: b["dismissible"] !== false,
            ends_at: endsAt,
            created_by: ownerId,
          })
          .select("*")
          .single();
        if (error || !created)
          return Response.json({ error: error?.message ?? "SAVE_FAILED" }, { status: 500 });

        let sent = 0;
        if (b["telegram"] === true) {
          // The matching companies' owners with a linked Telegram.
          const { orgPhase } = await import("@/lib/org-access");
          const { data: orgs } = await supabaseAdmin
            .from("organizations")
            .select("id, plan, active, trial_ends_at, is_trial");
          const target = (orgs ?? [])
            .filter((o) =>
              audience === "all"
                ? true
                : audience === "orgs"
                  ? orgIds.includes(o.id)
                  : orgPhase(o) === audience,
            )
            .map((o) => o.id);
          if (target.length) {
            const { data: owners } = await supabaseAdmin
              .from("profiles")
              .select("telegram_chat_id")
              .in("organization_id", target)
              .eq("role", "super_admin")
              .not("telegram_chat_id", "is", null);
            const { sendTelegramMessage } = await import("@/lib/telegram-report.server");
            const text = announcementTelegramText(created, KIND_LABEL[kind] ?? "E'lon");
            for (const o of owners ?? []) {
              try {
                await sendTelegramMessage(Number(o.telegram_chat_id), text);
                sent++;
              } catch {
                // This person blocked the bot: the others still get it.
              }
            }
          }
          await supabaseAdmin
            .from("platform_announcements")
            .update({ telegram_sent_at: new Date().toISOString(), telegram_sent_count: sent })
            .eq("id", created.id);
        }
        return Response.json({ ok: true, id: created.id, telegramSent: sent });
      },

      PATCH: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const b = (await request.json().catch(() => ({}))) as { id?: unknown; active?: unknown };
        if (typeof b.id !== "string" || typeof b.active !== "boolean")
          return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("platform_announcements")
          .update({ active: b.active })
          .eq("id", b.id);
        return error
          ? Response.json({ error: error.message }, { status: 500 })
          : Response.json({ ok: true });
      },

      DELETE: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const id = new URL(request.url).searchParams.get("id") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(id))
          return Response.json({ error: "BAD_ID" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("platform_announcements").delete().eq("id", id);
        return error
          ? Response.json({ error: error.message }, { status: 500 })
          : Response.json({ ok: true });
      },
    },
  },
});
