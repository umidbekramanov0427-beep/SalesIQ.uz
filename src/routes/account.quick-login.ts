import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Sozlamalar → Profil → Xavfsizlik → «Telefonga tez kirish»: a one-time
// sign-in link for this person (shown as a QR code for two minutes), so the
// phone signs in without typing the password. The link works once and
// expires with the auth server's own magic-link lifetime.
export const Route = createFileRoute("/account/quick-login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("email, role")
          .eq("id", userId)
          .maybeSingle();
        if (!profile?.email) return Response.json({ error: "No email." }, { status: 400 });
        // The platform owner signs in with the extra login code only.
        if (profile.role === "platform_owner")
          return Response.json({ error: "Not available for this account." }, { status: 403 });
        const origin = new URL(request.url).origin;
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: profile.email,
          options: { redirectTo: `${origin}/` },
        });
        const url = data?.properties?.action_link;
        if (error || !url)
          return Response.json({ error: "Could not make a link." }, { status: 500 });
        return Response.json({ url });
      },
    },
  },
});
