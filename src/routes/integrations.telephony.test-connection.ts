import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { testTelephonyConnection } from "@/lib/telephony/telephony-data.server";

export const Route = createFileRoute("/integrations/telephony/test-connection")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Only admins can do this." }, { status: 403 });
          const result = await testTelephonyConnection(admin.organizationId);
          return Response.json(result, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Connection test failed.";
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
