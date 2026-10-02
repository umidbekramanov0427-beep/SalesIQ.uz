import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PLAN_LABELS, normalizePlan } from "@/lib/plan-gating";
import {
  orgPhase,
  orgSeatLimit,
  SUBSCRIPTION_EXPIRED_MESSAGE,
  TRIAL_SEAT_LIMIT,
} from "@/lib/org-access";
import { loadOrgAccess } from "@/lib/org-access.server";

type Body = {
  email?: string;
  password?: string;
  full_name?: string;
};

export const Route = createFileRoute("/admin/create-employee")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const email = body.email?.trim();
        const password = body.password;
        const fullName = body.full_name?.trim() ?? "";

        if (!email || !password) {
          return Response.json({ error: "Email and password are required." }, { status: 400 });
        }

        const org = await loadOrgAccess(admin.organizationId);
        if (org && orgPhase(org) === "expired") {
          return Response.json({ error: SUBSCRIPTION_EXPIRED_MESSAGE }, { status: 403 });
        }
        const limit = org ? orgSeatLimit(org, org.extra_seats) : null;
        if (limit !== null) {
          const { count: used } = await supabaseAdmin
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", admin.organizationId);
          if ((used ?? 0) >= limit) {
            return Response.json(
              {
                error:
                  org && orgPhase(org) === "trial"
                    ? `Bepul sinov davrida ${TRIAL_SEAT_LIMIT} tagacha foydalanuvchi qo'shish mumkin. Ko'proq xodim qo'shish uchun obunani faollashtiring.`
                    : `Sizda faqat ${limit} ta foydalanuvchiga mos tarif (${PLAN_LABELS[normalizePlan(org?.plan)]}) tanlangan. Foydalanuvchilar sonini oshirmoqchi bo'lsangiz, adminga (platforma egasiga) murojaat qiling.`,
              },
              { status: 403 },
            );
          }
        }

        const { data: policy } = await supabaseAdmin
          .from("security_settings")
          .select("min_password_length, require_number, require_uppercase, require_symbol")
          .eq("organization_id", admin.organizationId)
          .maybeSingle();
        const minLength = policy?.min_password_length ?? 8;
        if (
          password.length < minLength ||
          (policy?.require_number && !/[0-9]/.test(password)) ||
          (policy?.require_uppercase && !/[A-Z]/.test(password)) ||
          (policy?.require_symbol && !/[^A-Za-z0-9]/.test(password))
        ) {
          const reqs = [`${minLength}+ belgi`];
          if (policy?.require_number) reqs.push("kamida bitta raqam");
          if (policy?.require_uppercase) reqs.push("kamida bitta bosh harf");
          if (policy?.require_symbol) reqs.push("kamida bitta maxsus belgi");
          return Response.json({ error: `Parol talablari: ${reqs.join(", ")}.` }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, organization_id: admin.organizationId },
        });
        if (error || !data.user) {
          return Response.json(
            { error: error?.message ?? "Could not create the account." },
            { status: 400 },
          );
        }

        return Response.json({ id: data.user.id }, { status: 200 });
      },
    },
  },
});
