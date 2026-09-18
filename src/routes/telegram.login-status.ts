import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Polled by the login page every ~1.5s while it waits for the visitor to
// confirm in Telegram. Public/unauthenticated by design, same reasoning
// as telegram.login-start -- the opaque token itself is the only secret,
// and it's single-use: once a "confirmed" row hands back its tokenHash,
// the row is deleted immediately so no later poll (or anyone else who
// somehow observed this token) can ever read that sign-in credential again.
export const Route = createFileRoute("/telegram/login-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (!token) return Response.json({ error: "token is required" }, { status: 400 });

        const { data: row } = await supabaseAdmin
          .from("telegram_login_requests")
          .select("status, token_hash, email, expires_at")
          .eq("token", token)
          .maybeSingle();

        if (!row || new Date(row.expires_at) < new Date()) {
          return Response.json({ status: "expired" });
        }

        if (row.status === "confirmed" && row.token_hash && row.email) {
          await supabaseAdmin.from("telegram_login_requests").delete().eq("token", token);
          return Response.json({
            status: "confirmed",
            tokenHash: row.token_hash,
            email: row.email,
          });
        }

        return Response.json({ status: row.status });
      },
    },
  },
});
