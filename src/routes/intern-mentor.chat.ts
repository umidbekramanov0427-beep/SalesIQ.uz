import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { loadIntern, replyToIntern } from "@/lib/intern-mentor.server";

// The intern's message from the platform chat -> the mentor's answer. Both
// are stored in intern_mentor_messages; the browser re-reads that list.
export const Route = createFileRoute("/intern-mentor/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { text?: unknown };
        const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
        if (!text) return Response.json({ error: "Empty message" }, { status: 400 });
        const intern = await loadIntern(userId);
        if (!intern?.is_intern) {
          return Response.json({ error: "Only interns have an AI mentor" }, { status: 403 });
        }
        const result = await replyToIntern(intern, { channel: "platform", text });
        if ("error" in result) return Response.json(result, { status: 400 });
        return Response.json(result);
      },
    },
  },
});
