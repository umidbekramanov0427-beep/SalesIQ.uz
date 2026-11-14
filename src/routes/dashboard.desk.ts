import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadViewer, parseRange } from "@/lib/analytics.server";
import { requireOrgMember } from "@/lib/auth.server";
import { deskTelegramText } from "@/lib/desk";
import { gatherDesk, gatherDeskHistory, monthOfInstant } from "@/lib/desk.server";
import { sendTelegramMessage } from "@/lib/telegram-report.server";

// Bosh sahifa → «Ish stoli».
//   GET  /dashboard/desk?from&to&prevFrom&prevTo&funnel   the page's figures
//        (YYYY-MM-DD, Tashkent days, inclusive; prev = the period compared with)
//   GET  /dashboard/desk?view=history&to&funnel           Tarix: the last 12 months
//   POST /dashboard/desk {from,to,prevFrom,prevTo,funnel,period}
//        «Telegram»: the same figures sent to the caller's own Telegram chat.
// Any company member; each sees only the leads their access rules allow.

function ranges(p: { get: (k: string) => string | null }) {
  const range = parseRange(p.get("from"), p.get("to"));
  const prev = parseRange(p.get("prevFrom"), p.get("prevTo"));
  return range && prev ? { range, prev } : null;
}

export const Route = createFileRoute("/dashboard/desk")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        const funnel = url.searchParams.get("funnel") || null;
        const viewer = await loadViewer(caller.id, caller.organizationId);
        if (url.searchParams.get("view") === "history") {
          const to = parseRange(url.searchParams.get("to"), url.searchParams.get("to"));
          if (!to) return Response.json({ error: "Bad period" }, { status: 400 });
          const months = await gatherDeskHistory(viewer, monthOfInstant(to.from), funnel);
          return Response.json({ months });
        }
        const r = ranges(url.searchParams);
        if (!r) return Response.json({ error: "Bad period" }, { status: 400 });
        return Response.json(await gatherDesk(viewer, r.range, r.prev, funnel));
      },
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : null);
        const r = ranges({ get: str });
        if (!r) return Response.json({ error: "Bad period" }, { status: 400 });
        const [{ data: me }, { data: org }] = await Promise.all([
          supabaseAdmin
            .from("profiles")
            .select("telegram_chat_id")
            .eq("id", caller.id)
            .maybeSingle(),
          supabaseAdmin
            .from("organizations")
            .select("name")
            .eq("id", caller.organizationId)
            .maybeSingle(),
        ]);
        const chat = Number(me?.telegram_chat_id);
        if (!chat) return Response.json({ error: "NO_TELEGRAM" }, { status: 409 });
        const viewer = await loadViewer(caller.id, caller.organizationId);
        const data = await gatherDesk(viewer, r.range, r.prev, str("funnel"));
        const period = (str("period") ?? `${str("from")} – ${str("to")}`).slice(0, 80);
        await sendTelegramMessage(chat, deskTelegramText(data, { org: org?.name ?? "", period }));
        return Response.json({ ok: true });
      },
    },
  },
});
