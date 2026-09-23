import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { setRecordingTrimBeforeAnswer } from "@/lib/amocrm/client.server";

type Body = { enabled?: unknown };

export const Route = createFileRoute("/integrations/amocrm/recording-trim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) {
            return Response.json({ error: "Only admins can do this." }, { status: 403 });
          }
          const body = (await request.json().catch(() => ({}))) as Body;
          await setRecordingTrimBeforeAnswer(admin.organizationId, body.enabled === true);
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not save.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
