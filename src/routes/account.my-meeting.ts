import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { myMeeting } from "@/lib/company-leads.server";

// GET /account/my-meeting -> { meeting: { at, status } | null }: the call the
// company booked with SalesIQ when it signed up (its home page shows it).
export const Route = createFileRoute("/account/my-meeting")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireOrgMember(request);
        if (!me) return Response.json({ meeting: null }, { status: 401 });
        return Response.json({ meeting: await myMeeting(me.organizationId).catch(() => null) });
      },
    },
  },
});
