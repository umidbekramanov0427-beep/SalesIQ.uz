import { createFileRoute } from "@tanstack/react-router";
import { requireMarketingMember } from "@/lib/marketing.server";
import { saveMarketingRules } from "@/lib/marketing-rules.server";

// POST /marketing-api/settings {rules} -> saves Marketing -> Sozlash ->
// Kuzatuv (org_general_settings.marketing_rules): the live-stream picture
// interval and how often channels are re-read. The company's owners and
// marketers only.
const EDITORS = new Set(["super_admin", "marketolog", "platform_owner"]);

export const Route = createFileRoute("/marketing-api/settings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller || !EDITORS.has(caller.role)) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        const body = (await request.json().catch(() => ({}))) as { rules?: unknown };
        try {
          return Response.json({
            rules: await saveMarketingRules(caller.organizationId, caller.id, body.rules),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Xatolik";
          return Response.json(
            { error: /marketing_rules/.test(msg) ? "migration_pending" : msg },
            { status: 400 },
          );
        }
      },
    },
  },
});
