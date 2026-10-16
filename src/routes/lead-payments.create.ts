import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { safeReturnOrigin } from "@/lib/instagram/events";
import { clickReady, loadMerchant, paymeReady } from "@/lib/lead-payments/merchant.server";
import { parseAmount } from "@/lib/lead-payments/paid-stage";
import { clampDay, firstRunOn, tashkentToday } from "@/lib/lead-payments/recurring";

// POST /lead-payments/create { leadId, amount, description?, monthlyDay? }
// -> { id, url, scheduleId? }: a payment link for the lead's client, paid
// into the company's own Payme / Click cashbox. The link opens /pay/<id> on
// the company's address. With monthlyDay (1..28) the same link is also
// made and sent automatically on that day every month from next month on
// (lead_payment_schedules, src/lib/lead-payments/recurring.server.ts).
export const Route = createFileRoute("/lead-payments/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const leadId = typeof body["leadId"] === "string" ? body["leadId"] : "";
        const amount = parseAmount(body["amount"]);
        const description =
          typeof body["description"] === "string" ? body["description"].trim().slice(0, 200) : "";
        const monthlyDay = body["monthlyDay"] == null ? null : clampDay(body["monthlyDay"]);
        if (body["monthlyDay"] != null && monthlyDay === null) {
          return Response.json({ error: "Oyning 1–28 kunini tanlang." }, { status: 400 });
        }
        if (!leadId || amount === null) {
          return Response.json(
            { error: "Summani 1 000 dan 100 000 000 so'mgacha kiriting." },
            { status: 400 },
          );
        }
        const merchant = await loadMerchant(caller.organizationId);
        if (!paymeReady(merchant) && !clickReady(merchant)) {
          return Response.json(
            { error: "Kompaniya kassasi ulanmagan — Admin → Mijozlardan to'lov." },
            { status: 400 },
          );
        }
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("id", leadId)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        if (!lead) return Response.json({ error: "Lid topilmadi." }, { status: 404 });

        const { data, error } = await supabaseAdmin
          .from("lead_payment_links")
          .insert({
            organization_id: caller.organizationId,
            lead_id: leadId,
            amount,
            description: description || null,
            created_by: caller.id,
          })
          .select("id")
          .single();
        if (error) return Response.json({ error: error.message }, { status: 500 });

        let scheduleId: string | null = null;
        if (monthlyDay !== null) {
          const { data: schedule, error: scheduleErr } = await supabaseAdmin
            .from("lead_payment_schedules")
            .insert({
              organization_id: caller.organizationId,
              lead_id: leadId,
              amount,
              description: description || null,
              day_of_month: monthlyDay,
              next_run_on: firstRunOn(monthlyDay, tashkentToday(Date.now()), true),
              created_by: caller.id,
              last_link_id: data.id,
            })
            .select("id")
            .single();
          if (scheduleErr) {
            return Response.json(
              {
                error: /relation|schema cache/i.test(scheduleErr.message)
                  ? "Oylik to'lovlar hali yoqilmagan (baza yangilanishi kerak)."
                  : scheduleErr.message,
              },
              { status: 500 },
            );
          }
          scheduleId = schedule.id;
          await supabaseAdmin
            .from("lead_payment_links")
            .update({ schedule_id: scheduleId })
            .eq("id", data.id);
        }

        const root = (process.env["PUBLIC_APP_URL"] ?? "https://salesiq.uz")
          .replace(/^https?:\/\//, "")
          .replace(/\/.*$/, "");
        const origin = safeReturnOrigin(request.headers.get("origin"), root);
        return Response.json({ id: data.id, url: `${origin}/pay/${data.id}`, scheduleId });
      },
    },
  },
});
