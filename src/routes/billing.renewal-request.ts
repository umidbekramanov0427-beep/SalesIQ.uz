import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";

// Billing → "Uzaytirish so'rovini yuborish": the company asks the SalesIQ
// team to extend its subscription. Saved as a pending subscription_requests
// row (owner panel → So'rovlar) and announced to every platform owner on
// Telegram with who asked, the plan and when it ends. One pending request
// per company: asking again only repeats the Telegram reminder.
export const Route = createFileRoute("/billing/renewal-request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const member = await requireOrgMember(request);
        if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { note?: unknown };
        const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [{ data: org }, { data: who }, { data: pending }] = await Promise.all([
          supabaseAdmin
            .from("organizations")
            .select("name, plan, trial_ends_at, subdomain")
            .eq("id", member.organizationId)
            .maybeSingle(),
          supabaseAdmin
            .from("profiles")
            .select("full_name, email, phone, role")
            .eq("id", member.id)
            .maybeSingle(),
          supabaseAdmin
            .from("subscription_requests")
            .select("id")
            .eq("organization_id", member.organizationId)
            .eq("status", "pending")
            .limit(1)
            .maybeSingle(),
        ]);

        if (!pending) {
          const { error } = await supabaseAdmin.from("subscription_requests").insert({
            organization_id: member.organizationId,
            requested_by: member.id,
            note,
          });
          if (error) return Response.json({ error: error.message }, { status: 500 });
        }

        const esc = (s: string) =>
          s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const ends = org?.trial_ends_at
          ? new Date(org.trial_ends_at).toLocaleDateString("ru-RU", { timeZone: "Asia/Tashkent" })
          : "—";
        const base = (process.env["PUBLIC_APP_URL"] || "https://salesiq.uz").replace(/\/$/, "");
        const lines = [
          pending
            ? "🔁 <b>Obunani uzaytirish — qayta eslatma</b>"
            : "🔔 <b>Obunani uzaytirish so'rovi</b>",
          `Kompaniya: <b>${esc(org?.name ?? "—")}</b>`,
          `Kim: ${esc(who?.full_name || who?.email || "—")}${who?.phone ? `, ${esc(who.phone)}` : ""}`,
          `Tarif: ${esc(org?.plan ?? "—")} · tugash: ${esc(ends)}`,
          note ? `Izoh: ${esc(note)}` : null,
          `<a href="${base}/platform/notifications">Owner panelda ochish</a>`,
        ].filter(Boolean);
        try {
          const { notifyPlatformOwners } = await import("@/lib/owner-alerts.server");
          await notifyPlatformOwners(lines.join("\n"));
        } catch {
          // The request is saved either way; the owner panel shows it.
        }
        return Response.json({ ok: true, repeated: !!pending });
      },
    },
  },
});
