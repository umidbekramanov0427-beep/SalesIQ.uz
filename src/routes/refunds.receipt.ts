import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { callerRole, canSettleRefunds, receiptUrl, settleRefund } from "@/lib/refunds.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// POST /refunds/receipt (form: id, file) -> the transfer's receipt: the
// refund becomes "qaytarildi" and the bot sends the receipt to the client.
// Admins and heads of sales. GET ?id= -> a 10-minute link to the receipt for
// whoever may see that refund.
export const Route = createFileRoute("/refunds/receipt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const role = await callerRole(caller.id, caller.organizationId);
        if (!canSettleRefunds(role)) {
          return Response.json({ error: "Chekni admin yoki ROP yuklaydi." }, { status: 403 });
        }
        const form = await request.formData().catch(() => null);
        const id = form?.get("id");
        const file = form?.get("file");
        if (typeof id !== "string" || !(file instanceof File)) {
          return Response.json({ error: "id va file kerak." }, { status: 400 });
        }
        try {
          const result = await settleRefund(caller.organizationId, id, caller.id, file);
          return Response.json(result);
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Chekni yuklab bo'lmadi." },
            { status: 400 },
          );
        }
      },
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const id = new URL(request.url).searchParams.get("id") ?? "";
        const role = await callerRole(caller.id, caller.organizationId);
        if (!canSettleRefunds(role)) {
          const { data } = await supabaseAdmin
            .from("lead_refunds")
            .select("created_by")
            .eq("id", id)
            .maybeSingle();
          if (data?.created_by !== caller.id) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }
        }
        const url = await receiptUrl(caller.organizationId, id);
        return url
          ? Response.json({ url })
          : Response.json({ error: "Chek topilmadi." }, { status: 404 });
      },
    },
  },
});
