import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { getBillingStatus } from "@/lib/subscription-billing/billing-data.server";

export const Route = createFileRoute("/subscription-payments/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const status = await getBillingStatus();
        return Response.json(status);
      },
    },
  },
});
