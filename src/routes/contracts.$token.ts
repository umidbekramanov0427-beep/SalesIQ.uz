import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Public, unauthenticated -- fetched by the /sign/:token page itself (an
// anonymous customer has no Supabase session), same pattern as
// forms.$slug.ts. Looks the contract up by its sign_token only, and
// returns nothing beyond what the signing page needs to render.
export const Route = createFileRoute("/contracts/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { data: contract } = await supabaseAdmin
          .from("lead_contracts")
          .select("title, body, status, signer_name, signed_at")
          .eq("sign_token", params.token)
          .maybeSingle();

        if (!contract) {
          return Response.json({ error: "Contract not found." }, { status: 404 });
        }

        return Response.json({
          title: contract.title,
          body: contract.body,
          status: contract.status,
          signerName: contract.signer_name,
          signedAt: contract.signed_at,
        });
      },
    },
  },
});
