import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { tgLiveConfigured } from "@/lib/tg-live.server";
import { workErrorText } from "@/lib/telegram-user/work-account";
import {
  loadGroupHistory,
  pickWorkGroups,
  sendGroupMessage,
  workGroupChoices,
} from "@/lib/telegram-user/work-account.server";

// Ish guruhlari. GET -> the caller's Telegram groups, each marked whether it
// comes into the CRM. POST { action: "pick", groups } saves the choice;
// POST { action: "send", groupId, text } writes to a group from Inbox;
// POST { action: "history", groupId, older? } brings the group's chat in as
// Telegram shows it (the latest messages, or the ones before the oldest).
export const Route = createFileRoute("/telegram/user-groups")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (!tgLiveConfigured()) {
          return Response.json(
            { error: "Telegram xizmati serverda sozlanmagan." },
            { status: 503 },
          );
        }
        try {
          return Response.json({
            groups: await workGroupChoices(caller.organizationId, caller.id),
          });
        } catch (e) {
          return Response.json({ error: workErrorText(e) }, { status: 400 });
        }
      },
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          if (body["action"] === "pick") {
            const groups = (Array.isArray(body["groups"]) ? body["groups"] : [])
              .map((g) => g as { id?: unknown; title?: unknown })
              .filter((g) => typeof g.id === "number")
              .map((g) => ({
                id: g.id as number,
                title: typeof g.title === "string" ? g.title : "",
              }));
            await pickWorkGroups(caller.organizationId, caller.id, groups);
            return Response.json({ ok: true });
          }
          if (body["action"] === "send") {
            const groupId = typeof body["groupId"] === "string" ? body["groupId"] : "";
            const text = typeof body["text"] === "string" ? body["text"].trim().slice(0, 4096) : "";
            if (!groupId || !text) {
              return Response.json({ error: "groupId and text are required" }, { status: 400 });
            }
            await sendGroupMessage({
              orgId: caller.organizationId,
              groupId,
              senderId: caller.id,
              text,
            });
            return Response.json({ ok: true });
          }
          if (body["action"] === "history") {
            const groupId = typeof body["groupId"] === "string" ? body["groupId"] : "";
            if (!groupId) return Response.json({ error: "groupId is required" }, { status: 400 });
            if (!tgLiveConfigured()) {
              return Response.json(
                { error: "Telegram xizmati serverda sozlanmagan." },
                { status: 503 },
              );
            }
            return Response.json(
              await loadGroupHistory({
                orgId: caller.organizationId,
                groupId,
                callerId: caller.id,
                older: body["older"] === true,
              }),
            );
          }
          return Response.json({ error: "Unknown action" }, { status: 400 });
        } catch (e) {
          const msg = workErrorText(e);
          return Response.json({ error: msg }, { status: /bloklanmasligi/.test(msg) ? 429 : 400 });
        }
      },
    },
  },
});
