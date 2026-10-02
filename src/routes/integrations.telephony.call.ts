import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { startPbxCall } from "@/lib/telephony/telephony-data.server";
import { featureLockReason, phaseLockMessage } from "@/lib/org-access";
import { loadOrgAccess } from "@/lib/org-access.server";

type Body = { toNumber?: unknown; leadId?: unknown; contactId?: unknown };

export const Route = createFileRoute("/integrations/telephony/call")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const member = await requireOrgMember(request);
          if (!member) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const access = await loadOrgAccess(member.organizationId);
          const lockReason = access ? featureLockReason(access, "telephony") : "plan";
          if (lockReason) {
            return Response.json(
              {
                error:
                  lockReason === "plan"
                    ? "Telefoniya sizning tarifingizga kirmaydi. Master IQ'ga o'ting."
                    : phaseLockMessage(lockReason),
              },
              { status: 403 },
            );
          }
          const body = (await request.json().catch(() => ({}))) as Body;
          const toNumber = typeof body.toNumber === "string" ? body.toNumber : "";
          if (!toNumber) return Response.json({ error: "Telefon raqami shart." }, { status: 400 });
          const result = await startPbxCall(
            member.organizationId,
            member.id,
            toNumber,
            typeof body.leadId === "string" ? body.leadId : null,
            typeof body.contactId === "string" ? body.contactId : null,
          );
          return Response.json(result, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Qo'ng'iroq qilib bo'lmadi.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
