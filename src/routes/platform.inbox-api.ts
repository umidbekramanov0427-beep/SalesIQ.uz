import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { cleanSupportText } from "@/lib/support";
import { sendSupportAnswer } from "@/lib/support.server";
import {
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
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 403 });
        const url = new URL(request.url);
        if (url.searchParams.get("templates"))
          return Response.json({ templates: await loadTemplates() });
        const key = url.searchParams.get("key");
        if (key) {
          if (!UUID.test(key.replace(/^u:/, "")))
            return Response.json({ error: "BAD_KEY" }, { status: 400 });
          return Response.json(await loadCompanyThread(key));
        }
        return Response.json(await listCompanyThreads(90));
      },
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const orgId = typeof b["orgId"] === "string" && UUID.test(b["orgId"]) ? b["orgId"] : null;
        switch (b["action"]) {
          case "reply": {
            const text = cleanSupportText(b["text"]);
            const userId =
              typeof b["userId"] === "string" && UUID.test(b["userId"]) ? b["userId"] : null;
            if (!text || !userId)
              return Response.json({ error: "userId and text are required" }, { status: 400 });
            const r = await sendSupportAnswer({ userId, text, sentBy: ownerId });
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
