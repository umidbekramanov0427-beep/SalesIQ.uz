import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isPaymentMethod } from "@/lib/lead-payments/ledger";
import { addLeadPayment, isLedgerMissing, recalcLedger } from "@/lib/lead-payments/ledger.server";

// POST /lead-payments/ledger -- the lead card's payments ledger:
//   { action: "add", leadId, amount, method, paidAt?, note? }
//   { action: "delete", id }              (head of sales, admin or who added it)
//   { action: "next", leadId, date|null } (next payment date, YYYY-MM-DD)
// Adding or removing re-adds the sum and moves the lead's stage to match.

const MISSING = "To'lovlar daftari hali yoqilmagan (bazaga yangilanish kerak).";

export const Route = createFileRoute("/lead-payments/ledger")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const org = caller.organizationId;

        const leadOf = async (leadId: unknown) => {
          if (typeof leadId !== "string" || !/^[0-9a-f-]{36}$/i.test(leadId)) return null;
          const { data } = await supabaseAdmin
            .from("leads")
            .select("id")
            .eq("id", leadId)
            .eq("organization_id", org)
            .maybeSingle();
          return data?.id ?? null;
        };

        if (body["action"] === "add") {
          const leadId = await leadOf(body["leadId"]);
          if (!leadId) return Response.json({ error: "Lid topilmadi" }, { status: 404 });
          const amount = Math.round(Number(String(body["amount"] ?? "").replace(/[\s,]/g, "")));
          if (!Number.isFinite(amount) || amount < 1 || amount > 10_000_000_000)
            return Response.json({ error: "Summani to'g'ri kiriting" }, { status: 400 });
          const method = isPaymentMethod(body["method"]) ? body["method"] : "cash";
          let paidAt: string | null = null;
          if (typeof body["paidAt"] === "string" && body["paidAt"]) {
            const d = new Date(body["paidAt"]);
            if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86_400_000)
              return Response.json({ error: "Sana noto'g'ri" }, { status: 400 });
            paidAt = d.toISOString();
          }
          const res = await addLeadPayment({
            organizationId: org,
            leadId,
            amount,
            method,
            paidAt,
            note: typeof body["note"] === "string" ? body["note"].slice(0, 300) : null,
            createdBy: caller.id,
          });
          if ("error" in res)
            return Response.json(
              { error: res.missing ? MISSING : res.error },
              { status: res.missing ? 409 : 500 },
            );
          return Response.json({ ok: true, id: res.id });
        }

        if (body["action"] === "delete") {
          const id = typeof body["id"] === "string" ? body["id"] : "";
          const { data: row, error } = await supabaseAdmin
            .from("lead_payments")
            .select("id, lead_id, created_by, link_id")
            .eq("id", id)
            .eq("organization_id", org)
            .maybeSingle();
          if (error)
            return Response.json(
              { error: isLedgerMissing(error) ? MISSING : error.message },
              { status: 500 },
            );
          if (!row) return Response.json({ error: "To'lov topilmadi" }, { status: 404 });
          if (row.link_id)
            return Response.json(
              { error: "Payme/Click orqali kelgan to'lovni o'chirib bo'lmaydi" },
              { status: 400 },
            );
          const { data: me } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", caller.id)
            .maybeSingle();
          const boss = ["super_admin", "rop", "platform_owner"].includes(me?.role ?? "");
          if (!boss && row.created_by !== caller.id)
            return Response.json({ error: "Faqat rahbar o'chira oladi" }, { status: 403 });
          await supabaseAdmin
            .from("lead_payments")
            .delete()
            .eq("id", row.id)
            .eq("organization_id", org);
          await recalcLedger(org, row.lead_id);
          return Response.json({ ok: true });
        }

        if (body["action"] === "next") {
          const leadId = await leadOf(body["leadId"]);
          if (!leadId) return Response.json({ error: "Lid topilmadi" }, { status: 404 });
          const date =
            typeof body["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body["date"])
              ? body["date"]
              : null;
          const { error } = await supabaseAdmin
            .from("leads")
            .update({ next_payment_date: date })
            .eq("id", leadId)
            .eq("organization_id", org);
          if (error)
            return Response.json(
              {
                error:
                  isLedgerMissing(error) || /next_payment_date/.test(error.message)
                    ? MISSING
                    : error.message,
              },
              { status: 500 },
            );
          return Response.json({ ok: true });
        }

        return Response.json({ error: "Unknown action" }, { status: 400 });
      },
    },
  },
});
