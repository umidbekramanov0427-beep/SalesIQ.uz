import { createFileRoute } from "@tanstack/react-router";
import { loadViewer, parseRange } from "@/lib/analytics.server";
import { requireOrgMember } from "@/lib/auth.server";
import { gatherPhoneCenter } from "@/lib/phone-center.server";

// GET /phone/data?from=YYYY-MM-DD&to=YYYY-MM-DD -> Telefon's figures for the
// period (Tashkent days, inclusive): the connected PBX, the caller's own
// extension, call totals, every operator's calls and AI score, the calls
// and the AI-scored calls. Any company member; each sees only the calls
// their access rules allow.
export const Route = createFileRoute("/phone/data")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const range = parseRange(from, to);
        if (!range) return Response.json({ error: "Bad period" }, { status: 400 });
        const viewer = await loadViewer(caller.id, caller.organizationId);
        return Response.json(await gatherPhoneCenter(viewer, range, { from: from!, to: to! }));
      },
    },
  },
});
