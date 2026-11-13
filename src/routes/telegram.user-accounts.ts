import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestUserId } from "@/lib/auth.server";
import { tgLiveConfigured } from "@/lib/tg-live.server";
import { WORK_ROLES, type WorkRole } from "@/lib/telegram-user/work-account";
import {
  adminDisconnect,
  saveWorkPolicy,
  teamWorkAccounts,
  workPolicy,
} from "@/lib/telegram-user/work-account.server";

// Integratsiyalar → «Telegram (sotuvchi akkaunti)»: the company's rules for
// work Telegram accounts and everyone's account. Super admins and ROPs see
// the team and can turn an account off; only super admins change the rules.

async function managerOf(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role, organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.organization_id || (data.role !== "super_admin" && data.role !== "rop")) return null;
  return { orgId: data.organization_id, isAdmin: data.role === "super_admin" };
}

export const Route = createFileRoute("/telegram/user-accounts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const m = await managerOf(request);
        if (!m) return Response.json({ error: "Forbidden" }, { status: 403 });
        const [policy, team] = await Promise.all([workPolicy(m.orgId), teamWorkAccounts(m.orgId)]);
        return Response.json({ configured: tgLiveConfigured(), canEdit: m.isAdmin, policy, team });
      },
      POST: async ({ request }) => {
        const m = await managerOf(request);
        if (!m) return Response.json({ error: "Forbidden" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        if (body["action"] === "disconnect") {
          const id = typeof body["profileId"] === "string" ? body["profileId"] : "";
          const ok = await adminDisconnect(m.orgId, id);
          return ok
            ? Response.json({ ok: true })
            : Response.json({ error: "Akkaunt topilmadi" }, { status: 404 });
        }
        if (body["action"] === "policy") {
          if (!m.isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });
          const p = (body["policy"] ?? {}) as Record<string, unknown>;
          const roles = Array.isArray(p["roles"])
            ? (p["roles"] as unknown[]).filter((r): r is WorkRole =>
                (WORK_ROLES as readonly unknown[]).includes(r),
              )
            : [...WORK_ROLES];
          await saveWorkPolicy(m.orgId, {
            enabled: p["enabled"] !== false,
            roles,
            createLeads: p["createLeads"] !== false,
          });
          return Response.json({ ok: true });
        }
        return Response.json({ error: "Unknown action" }, { status: 400 });
      },
    },
  },
});
