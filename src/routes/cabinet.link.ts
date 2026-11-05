import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { createCabinetLink, revokeCabinetLink } from "@/lib/client-cabinet.server";

// POST /cabinet/link { leadId, renew?, revoke? } -> the lead's private
// client-cabinet link (made on first use), a fresh one (renew: the old
// link stops working) or none (revoke). Any member of the lead's company.
export const Route = createFileRoute("/cabinet/link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const me = await requireOrgMember(request);
        if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as {
          leadId?: unknown;
          renew?: unknown;
          revoke?: unknown;
        };
        const leadId = typeof body.leadId === "string" ? body.leadId : "";
        if (!leadId) return Response.json({ error: "leadId is required" }, { status: 400 });
        try {
          if (body.revoke === true) {
            await revokeCabinetLink(me.organizationId, leadId);
            return Response.json({ ok: true });
          }
          const link = await createCabinetLink(
            me.organizationId,
            leadId,
            me.id,
            body.renew === true,
          );
          const origin = new URL(request.url).origin;
          return Response.json({ ...link, url: `${origin}/cabinet/${link.token}` });
        } catch (err) {
          const message = err instanceof Error ? err.message : "failed";
          const status =
            message === "NOT_FOUND" ? 404 : message === "MIGRATION_PENDING" ? 409 : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
