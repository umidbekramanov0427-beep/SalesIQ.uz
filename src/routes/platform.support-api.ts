import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { cleanSupportText } from "@/lib/support";
import { listSupportThreads, loadSupportThread, sendSupportAnswer } from "@/lib/support.server";

// The platform owner's support inbox (Platforma -> Yordam so'rovlari):
//   GET              every thread of the last 30 days + response stats;
//   GET ?userId=<id> one person's thread;
//   POST {userId, text} answers that person.
export const Route = createFileRoute("/platform/support-api")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const userId = new URL(request.url).searchParams.get("userId");
        try {
          if (userId) return Response.json({ messages: await loadSupportThread(userId) });
          return Response.json(await listSupportThreads(30));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to load support";
          return Response.json({ error: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as {
          userId?: unknown;
          text?: unknown;
        };
        const text = cleanSupportText(body.text);
        if (typeof body.userId !== "string" || !text) {
          return Response.json({ error: "userId and text are required" }, { status: 400 });
        }
        const result = await sendSupportAnswer({ userId: body.userId, text, sentBy: ownerId });
        return result.ok
          ? Response.json({ message: result.message })
          : Response.json({ error: result.error }, { status: result.status });
      },
    },
  },
});
