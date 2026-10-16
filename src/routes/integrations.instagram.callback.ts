import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSuperAdminForUser } from "@/lib/auth.server";
import {
  exchangeCode,
  fetchMe,
  readState,
  saveAccount,
  subscribeMessages,
} from "@/lib/instagram/instagram.server";

// GET /integrations/instagram/callback?code&state -> Instagram sends the
// browser back here after the company admin allowed access. Saves the
// account, turns on Direct webhooks and returns to the company's
// /integrations/instagram page with ?ig=connected (or ?ig=error).
export const Route = createFileRoute("/integrations/instagram/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const fallback = (process.env["PUBLIC_APP_URL"] ?? "https://salesiq.uz").replace(/\/$/, "");
        let state = null;
        try {
          state = readState(q.get("state") ?? "");
        } catch {
          state = null;
        }
        const back = (result: string) =>
          Response.redirect(`${state?.ret ?? fallback}/integrations/instagram?ig=${result}`, 302);
        if (!state) return back("expired");
        if (q.get("error") || !q.get("code")) return back("denied");

        // Still an admin of the same company?
        const admin = await requireSuperAdminForUser(state.uid);
        if (!admin || admin.organizationId !== state.org) return back("denied");

        try {
          const { token, expiresAt } = await exchangeCode(q.get("code")!);
          const me = await fetchMe(token);
          await saveAccount({
            organizationId: state.org,
            connectedBy: state.uid,
            me,
            token,
            expiresAt,
          });
          try {
            await subscribeMessages(token);
          } catch (err) {
            await supabaseAdmin
              .from("instagram_accounts")
              .update({
                last_error: err instanceof Error ? err.message.slice(0, 300) : "subscribe",
              })
              .eq("organization_id", state.org);
          }
          return back("connected");
        } catch (err) {
          console.error("[instagram] connect failed", err);
          return back("error");
        }
      },
    },
  },
});
