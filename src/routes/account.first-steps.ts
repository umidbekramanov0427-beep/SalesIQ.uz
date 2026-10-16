import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { orgPhase } from "@/lib/org-access";
import { loadOrgAccess } from "@/lib/org-access.server";
import { showFirstSteps, type FirstStepsState } from "@/lib/first-steps";

// GET /account/first-steps -> { show, steps }: the company owner's
// "Birinchi qadamlar" checklist (src/lib/first-steps.ts). Only super
// admins get one; for everyone else show is false.
export const Route = createFileRoute("/account/first-steps")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const orgId = caller.organizationId;
        const { data: me } = await supabaseAdmin
          .from("profiles")
          .select("role, telegram_chat_id")
          .eq("id", caller.id)
          .maybeSingle();
        if (me?.role !== "super_admin") return Response.json({ show: false });

        const one = (table: string) =>
          supabaseAdmin
            .from(table as "amocrm_connection")
            .select("organization_id", { count: "exact", head: true })
            .eq("organization_id", orgId);
        const [access, org, people, leads, business, ...integrations] = await Promise.all([
          loadOrgAccess(orgId),
          supabaseAdmin.from("organizations").select("created_at").eq("id", orgId).maybeSingle(),
          supabaseAdmin
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId),
          supabaseAdmin
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId),
          supabaseAdmin
            .from("business_profile")
            .select("description, products_services")
            .eq("organization_id", orgId)
            .maybeSingle(),
          one("amocrm_connection"),
          one("bitrix24_connection"),
          one("org_telephony_credentials"),
          one("instagram_accounts"),
        ]);
        const products = business.data?.products_services;
        const steps: FirstStepsState = {
          bot: !!me.telegram_chat_id,
          team: (people.count ?? 0) >= 2,
          lead: (leads.count ?? 0) > 0,
          integration: integrations.some((r) => (r.count ?? 0) > 0),
          business:
            !!business.data?.description?.trim() ||
            (Array.isArray(products) && products.length > 0),
        };
        const show = showFirstSteps({
          phase: access ? orgPhase(access) : "active",
          createdAt: org.data?.created_at ?? null,
          state: steps,
        });
        return Response.json({ show, steps });
      },
    },
  },
});
