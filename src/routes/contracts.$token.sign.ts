import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Body = { signerName?: unknown };

// Public, unauthenticated -- the customer's typed name is the only input.
// This is a "simple" electronic signature (typed name + IP + timestamp),
// not a qualified/PKI-backed digital signature.
export const Route = createFileRoute("/contracts/$token/sign")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const body = (await request.json().catch(() => ({}))) as Body;
        const signerName = typeof body.signerName === "string" ? body.signerName.trim() : "";
        if (!signerName) {
          return Response.json({ error: "Ism-familiyangizni kiriting." }, { status: 400 });
        }

        const { data: contract } = await supabaseAdmin
          .from("lead_contracts")
          .select("id, status")
          .eq("sign_token", params.token)
          .maybeSingle();
        if (!contract) {
          return Response.json({ error: "Contract not found." }, { status: 404 });
        }
        if (contract.status === "signed") {
          return Response.json({ error: "Bu hujjat allaqachon imzolangan." }, { status: 409 });
        }

        const forwardedFor = request.headers.get("x-forwarded-for");
        const signerIp = forwardedFor?.split(",")[0]?.trim() || null;

        const { error } = await supabaseAdmin
          .from("lead_contracts")
          .update({
            status: "signed",
            signer_name: signerName,
            signer_ip: signerIp,
            signed_at: new Date().toISOString(),
          })
          .eq("id", contract.id);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ ok: true });
      },
    },
  },
});
