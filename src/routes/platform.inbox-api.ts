import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { cleanSupportText } from "@/lib/support";
import { sendSupportAnswer } from "@/lib/support.server";
import { signSupportUpload, supportFileRow } from "@/lib/support-files.server";
import {
  listOwners,
  listCompanyThreads,
  loadCompanyThread,
  loadTemplates,
  markThread,
  saveAsIssue,
  saveTemplates,
} from "@/lib/owner-inbox.server";

// The owner's inbox by company (Owner -> Yordam):
//   GET                 every company conversation of the last 90 days
//   GET ?key=<org|u:id> one conversation + the company's facts
//   GET ?templates=1    quick answers
//   POST {action: "reply", key, userId, text}
//        {action: "read", orgId} | {action: "status", orgId, status}
//        {action: "templates", list} | {action: "issue", orgId, text}
const UUID = /^[0-9a-f-]{36}$/i;

export const Route = createFileRoute("/platform/inbox-api")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const url = new URL(request.url);
        if (url.searchParams.get("templates"))
          return Response.json({ templates: await loadTemplates() });
        // This owner's own recent answers (Tayyor javoblar → So'nggi yuborilganlar).
        if (url.searchParams.get("recent")) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("support_messages")
            .select("text")
            .eq("direction", "out")
            .eq("sent_by", ownerId)
            .neq("text", "")
            .order("created_at", { ascending: false })
            .limit(80);
          return Response.json({ recent: (data ?? []).map((r) => r.text) });
        }
        const key = url.searchParams.get("key");
        if (key) {
          if (!UUID.test(key.replace(/^u:/, "")))
            return Response.json({ error: "BAD_KEY" }, { status: 400 });
          return Response.json(await loadCompanyThread(key));
        }
        const [list, owners] = await Promise.all([listCompanyThreads(90), listOwners()]);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: settings } = await supabaseAdmin
          .from("platform_settings")
          .select("*")
          .maybeSingle();
        const sla = (settings as { support_sla_minutes?: number } | null)?.support_sla_minutes;
        return Response.json({ ...list, owners, slaMinutes: sla ?? null });
      },
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const orgId = typeof b["orgId"] === "string" && UUID.test(b["orgId"]) ? b["orgId"] : null;
        switch (b["action"]) {
          case "sign": {
            if (!orgId) return Response.json({ error: "BAD_ID" }, { status: 400 });
            try {
              return Response.json(
                await signSupportUpload(
                  orgId,
                  typeof b["name"] === "string" ? b["name"] : "file",
                  typeof b["size"] === "number" ? b["size"] : 0,
                ),
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              return Response.json({ error: msg }, { status: msg === "TOO_BIG" ? 413 : 500 });
            }
          }
          case "reply": {
            const file = orgId && b["file"] ? supportFileRow(orgId, b["file"]) : null;
            if (b["file"] && !file) return Response.json({ error: "BAD_FILE" }, { status: 400 });
            const text = cleanSupportText(b["text"], !!file);
            const userId =
              typeof b["userId"] === "string" && UUID.test(b["userId"]) ? b["userId"] : null;
            if (text === null || !userId)
              return Response.json({ error: "userId and text are required" }, { status: 400 });
            const r = await sendSupportAnswer({ userId, text, sentBy: ownerId, file });
            if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
            if (orgId) await markThread(orgId, { read: true, status: "open" });
            return Response.json({ ok: true, message: r.message });
          }
          case "read":
          case "status": {
            if (!orgId) return Response.json({ error: "BAD_ID" }, { status: 400 });
            const r = await markThread(orgId, {
              read: true,
              ...(b["action"] === "status"
                ? { status: b["status"] === "closed" ? ("closed" as const) : ("open" as const) }
                : {}),
            });
            return r.ok
              ? Response.json({ ok: true })
              : Response.json({ error: r.error }, { status: 400 });
          }
          case "assign": {
            if (!orgId) return Response.json({ error: "BAD_ID" }, { status: 400 });
            const to =
              typeof b["assignedTo"] === "string" && UUID.test(b["assignedTo"])
                ? b["assignedTo"]
                : null;
            const r = await markThread(orgId, { assignedTo: to });
            return r.ok
              ? Response.json({ ok: true })
              : Response.json({ error: r.error }, { status: 400 });
          }
          case "sla": {
            const minutes = Math.max(0, Math.min(1440, Math.round(Number(b["minutes"]) || 0)));
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { error } = await supabaseAdmin
              .from("platform_settings")
              .update({ support_sla_minutes: minutes })
              .eq("id", true);
            return error
              ? Response.json(
                  { error: "Bu imkoniyat bazani yangilagandan keyin ishlaydi." },
                  { status: 400 },
                )
              : Response.json({ ok: true });
          }
          case "templates": {
            const list = Array.isArray(b["list"])
              ? b["list"].filter((x): x is string => typeof x === "string")
              : [];
            const r = await saveTemplates(list);
            return r.ok
              ? Response.json({ ok: true })
              : Response.json({ error: r.error }, { status: 400 });
          }
          case "issue": {
            const text = typeof b["text"] === "string" ? b["text"].trim() : "";
            if (!orgId || !text) return Response.json({ error: "BAD_ID" }, { status: 400 });
            const r = await saveAsIssue(orgId, text, ownerId);
            return r.ok
              ? Response.json({ ok: true })
              : Response.json({ error: r.error }, { status: 400 });
          }
          default:
            return Response.json({ error: "Unknown action" }, { status: 400 });
        }
      },
    },
  },
});
