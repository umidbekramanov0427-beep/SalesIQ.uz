import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ipAllowed, parseIpRules } from "@/lib/ip-allowlist";
import { authSessionId, requestIp } from "@/lib/request-meta.server";

// IP oq ro'yxati: asked by the app at every sign-in and page load. Answers
// whether this person may be signed in from the address the request came
// from (src/lib/ip-allowlist.ts) and the address itself (the settings page
// offers it as "my IP"). A session from an address not on the company's
// list is closed here on the server -- the app then signs out and says why
// -- so skipping the check in the browser doesn't keep a session alive.
export const Route = createFileRoute("/account/ip-check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
        const ip = requestIp(request);
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("organization_id, role")
          .eq("id", userId)
          .maybeSingle();
        if (!profile?.organization_id) return Response.json({ allowed: true, ip });

        const { data: settings, error } = await supabaseAdmin
          .from("security_settings")
          .select("*")
          .eq("organization_id", profile.organization_id)
          .maybeSingle();
        // Until the migration has run (or on a read error) nobody is locked out.
        if (error) return Response.json({ allowed: true, ip });
        const rules = parseIpRules(settings);
        if (ipAllowed(rules, ip, profile.role)) return Response.json({ allowed: true, ip });

        // Only this session: the same person may be signed in at the office.
        const session = authSessionId(request);
        if (session) {
          const { error: revokeError } = await supabaseAdmin.rpc("platform_revoke_auth_sessions", {
            p_user: userId,
            p_auth_session: session,
          });
          if (revokeError) {
            console.error("[ip-check] could not close the session", revokeError.message);
          }
        }
        return Response.json({ allowed: false, ip });
      },
    },
  },
});
