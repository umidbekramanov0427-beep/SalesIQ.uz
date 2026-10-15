import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { cleanSupportText } from "@/lib/support";
import { sendSupportQuestion } from "@/lib/support.server";

// A signed-in person's question to the SalesIQ team (the assistant's
// "Operator" tab). Saved to their thread and sent to the platform owners.
export const Route = createFileRoute("/support/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const member = await requireOrgMember(request);
        if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { text?: unknown; page?: unknown };
        const text = cleanSupportText(body.text);
        if (!text) return Response.json({ error: "EMPTY" }, { status: 400 });
        const page = typeof body.page === "string" ? body.page.slice(0, 200) : null;
        const result = await sendSupportQuestion({
          userId: member.id,
          organizationId: member.organizationId,
          text,
          page,
        });
        return result.ok
          ? Response.json({ message: result.message })
          : Response.json({ error: result.error }, { status: result.status });
      },
    },
  },
});
