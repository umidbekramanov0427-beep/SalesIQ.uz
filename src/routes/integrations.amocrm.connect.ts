import { createFileRoute } from "@tanstack/react-router";
import {
  buildAuthorizeUrl,
  debugAmoAppCredentials,
  debugAmoCallNotes,
  setAmoAppCredentialsDirect,
} from "@/lib/amocrm/client.server";
import { getUserIdFromToken, isPlatformOwner, requireSuperAdminForUser } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { makeAmoOAuthState } from "@/lib/amocrm/oauth-state.server";
import { featureLockReason, phaseLockMessage } from "@/lib/org-access";
import { loadOrgAccess } from "@/lib/org-access.server";

// A plain browser navigation (the "Connect" link) can't carry an
// Authorization header, so the caller's access token is passed as a query
// param instead and resolved here. The organization it resolves to is
// encoded into the OAuth `state` param, which AmoCRM echoes back verbatim
// to the callback — that's how the callback knows which company is
// connecting.
export const Route = createFileRoute("/integrations/amocrm/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        const userId = token ? await getUserIdFromToken(token) : null;
        const admin = userId ? await requireSuperAdminForUser(userId) : null;

        // A super_admin (or an owner-with-org platform_owner) connects their
        // own org, resolved above. A "pure" platform_owner belongs to no
        // company (organization_id is null), so requireSuperAdminForUser
        // never resolves one for them -- they instead pass the target
        // company explicitly via ?org=, which is trusted only once their
        // own platform_owner role is confirmed.
        const orgParam = url.searchParams.get("org");
        const ownerTargetsOrg =
          !admin && userId && orgParam && (await isPlatformOwner(userId)) ? orgParam : null;
        const organizationId = admin?.organizationId ?? ownerTargetsOrg;
        if (!organizationId) return new Response("Unauthorized", { status: 401 });

        // A pure platform_owner (no organizationId of their own) bypasses
        // this check -- they're setting up a company's integration on that
        // company's behalf, not gated by their own nonexistent org's plan.
        if (admin) {
          const access = await loadOrgAccess(organizationId);
          const lockReason = access ? featureLockReason(access, "integrations") : "plan";
          if (lockReason) {
            return new Response(
              lockReason === "plan"
                ? "AmoCRM integratsiyasi sizning tarifingizga kirmaydi. Analyst IQ yoki Master IQ'ga o'ting."
                : phaseLockMessage(lockReason),
              { status: 403 },
            );
          }
        }

        if (url.searchParams.get("debug") === "1") {
          try {
            const setClientId = url.searchParams.get("setClientId");
            const setClientSecret = url.searchParams.get("setClientSecret");
            if (setClientId && setClientSecret) {
              // Writes with the service role, bypassing RLS and the browser's
              // JS bundle entirely -- isolates whether the save itself works
              // from whether the client is running stale code.
              await setAmoAppCredentialsDirect(organizationId, setClientId, setClientSecret);
            }
            const info =
              url.searchParams.get("calls") === "1"
                ? await debugAmoCallNotes(organizationId)
                : await debugAmoAppCredentials(organizationId);
            return new Response(JSON.stringify(info, null, 2), {
              headers: { "content-type": "application/json; charset=utf-8" },
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            return new Response(JSON.stringify({ error: message }, null, 2), {
              status: 500,
              headers: { "content-type": "application/json; charset=utf-8" },
            });
          }
        }

        const state = makeAmoOAuthState(organizationId);
        try {
          const authorizeUrl = await buildAuthorizeUrl(state, organizationId);
          return new Response(null, {
            status: 302,
            headers: { location: authorizeUrl },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "AmoCRM is not configured.";
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
