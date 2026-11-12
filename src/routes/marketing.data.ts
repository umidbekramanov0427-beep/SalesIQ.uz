import { createFileRoute } from "@tanstack/react-router";
import { parseRange } from "@/lib/analytics-reports";
import { gatherMarketing, requireMarketingMember } from "@/lib/marketing.server";

// GET /marketing/data?from=YYYY-MM-DD&to=YYYY-MM-DD -> the marketing
// panel's figures for the period (src/lib/marketing.server.ts): ad spend,
// leads, sales and AI lead quality by source and campaign, company-wide.
export const Route = createFileRoute("/marketing/data")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const url = new URL(request.url);
        const range = parseRange(url.searchParams.get("from"), url.searchParams.get("to"));
        if (!range) return Response.json({ error: "Bad period" }, { status: 400 });
        return Response.json(await gatherMarketing(caller.organizationId, range));
      },
    },
  },
});
