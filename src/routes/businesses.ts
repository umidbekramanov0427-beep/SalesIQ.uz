import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { normalizePlan } from "@/lib/plan-gating";
import { SELF_SIGNUP_TRIAL_DAYS } from "@/lib/org-access";
import { MAX_BUSINESSES, type BusinessItem, type BusinessesState } from "@/lib/businesses";

// Bizneslar (the logo bar → «Biznes»): one sign-in, several businesses.
// Each business is its own company (funnels, leads, team, plan); a person
// may open the ones listed for them in business_memberships, and switching
// moves their profile's organization_id / role there, so every RLS rule
// works as before.
//
//   GET  /businesses                        -> BusinessesState
//   POST /businesses {action: "create", name}  a new business (company admins)
//   POST /businesses {action: "switch", orgId} open another of my businesses

type Role = Database["public"]["Enums"]["app_role"];
type Membership = { organization_id: string; role: Role; created_at: string };

const memberships = () => supabaseAdmin.from("business_memberships");

function missingTable(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === "42P01" || /business_memberships/.test(err.message ?? ""));
}

async function me(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("organization_id, role")
    .eq("id", userId)
    .maybeSingle();
  return data as { organization_id: string; role: Role } | null;
}

/** Keeps the current company on the person's list, so they can come back to it. */
async function rememberCurrent(userId: string, orgId: string, role: Role) {
  if (role === "platform_owner") return null;
  const { error } = await memberships().upsert(
    { profile_id: userId, organization_id: orgId, role },
    { onConflict: "profile_id,organization_id" },
  );
  return error;
}

async function listState(userId: string, orgId: string, role: Role): Promise<BusinessesState> {
  const base: BusinessesState = {
    ready: true,
    currentId: orgId,
    canAdd: role === "super_admin",
    max: MAX_BUSINESSES,
    items: [],
  };
  const remembered = await rememberCurrent(userId, orgId, role);
  if (missingTable(remembered)) base.ready = false;
  const { data: rows, error } = await memberships()
    .select("organization_id, role, created_at")
    .eq("profile_id", userId)
    .order("created_at", { ascending: true });
  const list = (error ? [] : (rows as Membership[])) ?? [];
  if (error && missingTable(error)) base.ready = false;
  const ids = Array.from(new Set([orgId, ...list.map((r) => r.organization_id)]));
  const [{ data: orgs }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("organizations").select("id, name, subdomain, plan").in("id", ids),
    supabaseAdmin
      .from("org_general_settings")
      .select("organization_id, company_logo_url")
      .in("organization_id", ids),
  ]);
  const logoOf = new Map(
    (settings ?? []).map((s) => [s.organization_id, s.company_logo_url ?? null] as const),
  );
  const roleOf = new Map(list.map((r) => [r.organization_id, r.role] as const));
  roleOf.set(orgId, role);
  base.items = ids
    .map((id): BusinessItem | null => {
      const o = (orgs ?? []).find((x) => x.id === id);
      if (!o) return null;
      return {
        id,
        name: o.name,
        subdomain: o.subdomain ?? null,
        plan: o.plan ?? null,
        logo: logoOf.get(id) ?? null,
        role: roleOf.get(id) ?? "sotuv_menejeri",
      };
    })
    .filter((x): x is BusinessItem => x !== null);
  return base;
}

async function moveTo(userId: string, orgId: string, role: Role) {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ organization_id: orgId, role })
    .eq("id", userId);
  return error;
}

export const Route = createFileRoute("/businesses")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const profile = await me(caller.id);
        if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
        return Response.json(await listState(caller.id, profile.organization_id, profile.role));
      },

      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const profile = await me(caller.id);
        if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (profile.role === "platform_owner") {
          return Response.json({ error: "Not for the platform owner" }, { status: 403 });
        }
        const body = (await request.json().catch(() => ({}))) as {
          action?: string;
          name?: string;
          orgId?: string;
        };

        const kept = await rememberCurrent(caller.id, profile.organization_id, profile.role);
        if (kept) {
          return Response.json(
            {
              error: missingTable(kept)
                ? "Bizneslar hali yoqilmagan (migratsiya 20270122000000)."
                : kept.message,
            },
            { status: 409 },
          );
        }

        if (body.action === "create") {
          if (profile.role !== "super_admin") {
            return Response.json(
              { error: "Only the company admin adds a business" },
              { status: 403 },
            );
          }
          const name = (body.name ?? "").trim().slice(0, 120);
          if (name.length < 2) {
            return Response.json({ error: "Biznes nomini yozing" }, { status: 400 });
          }
          const { count } = await memberships()
            .select("organization_id", { count: "exact", head: true })
            .eq("profile_id", caller.id);
          if ((count ?? 0) >= MAX_BUSINESSES) {
            return Response.json(
              { error: `Ko'pi bilan ${MAX_BUSINESSES} ta biznes` },
              { status: 400 },
            );
          }
          const { data: current } = await supabaseAdmin
            .from("organizations")
            .select("plan")
            .eq("id", profile.organization_id)
            .maybeSingle();
          const trialEndsAt = new Date(
            Date.now() + SELF_SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString();
          const { data: org, error: orgError } = await supabaseAdmin
            .from("organizations")
            .insert({
              name,
              plan: normalizePlan(current?.plan ?? undefined),
              trial_ends_at: trialEndsAt,
              active: true,
            })
            .select("id, subdomain")
            .single();
          if (orgError || !org) {
            return Response.json(
              { error: orgError?.message ?? "Could not create the business" },
              { status: 400 },
            );
          }
          const { error: linkError } = await memberships().insert({
            profile_id: caller.id,
            organization_id: org.id,
            role: "super_admin",
          });
          if (linkError) {
            await supabaseAdmin.from("organizations").delete().eq("id", org.id);
            return Response.json({ error: linkError.message }, { status: 400 });
          }
          const moved = await moveTo(caller.id, org.id, "super_admin");
          if (moved) return Response.json({ error: moved.message }, { status: 400 });
          return Response.json({ ok: true, orgId: org.id, subdomain: org.subdomain ?? null });
        }

        if (body.action === "switch") {
          const orgId = body.orgId ?? "";
          if (orgId === profile.organization_id) {
            return Response.json({ ok: true, orgId, subdomain: null });
          }
          const { data: link } = await memberships()
            .select("organization_id, role, created_at")
            .eq("profile_id", caller.id)
            .eq("organization_id", orgId)
            .maybeSingle();
          const membership = link as Membership | null;
          if (!membership) return Response.json({ error: "Not your business" }, { status: 403 });
          const { data: org } = await supabaseAdmin
            .from("organizations")
            .select("id, subdomain")
            .eq("id", orgId)
            .maybeSingle();
          if (!org) return Response.json({ error: "Business not found" }, { status: 404 });
          const moved = await moveTo(caller.id, orgId, membership.role);
          if (moved) return Response.json({ error: moved.message }, { status: 400 });
          return Response.json({ ok: true, orgId, subdomain: org.subdomain ?? null });
        }

        return Response.json({ error: "Unknown action" }, { status: 400 });
      },
    },
  },
});
