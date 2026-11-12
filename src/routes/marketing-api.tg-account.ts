import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireMarketingMember } from "@/lib/marketing.server";
import { tgFinishLogin, tgLiveConfigured, tgResendCode, tgStartLogin } from "@/lib/tg-live.server";

// Marketing paneli -> Sozlash -> Manbalar -> Telegram akkaunt (efirlar).
//   GET                                   -> is the service set up, the account's status
//   POST {action:"start", phone}          -> Telegram sends a code -> {loginId, via, next, timeout}
//   POST {action:"resend", loginId}       -> sends it again the next way (SMS / call) -> {via, next, timeout}
//   POST {action:"code", loginId, code, password?, phone} -> connected, or {needPassword}
//   POST {action:"disconnect"}            -> forgets the session
// The session itself never reaches the browser.
export const Route = createFileRoute("/marketing-api/tg-account")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const { data } = await supabaseAdmin
          .from("marketing_tg_accounts")
          .select("phone_masked, tg_user, status, last_error, connected_at")
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        return Response.json({
          configured: tgLiveConfigured(),
          account: data
            ? {
                phone: data.phone_masked,
                user: data.tg_user,
                status: data.status,
                lastError: data.last_error,
                connectedAt: data.connected_at,
              }
            : null,
        });
      },
      POST: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as {
          action?: string;
          phone?: string;
          loginId?: string;
          code?: string;
          password?: string;
        };
        try {
          if (body.action === "disconnect") {
            await supabaseAdmin
              .from("marketing_tg_accounts")
              .delete()
              .eq("organization_id", caller.organizationId);
            return Response.json({ ok: true });
          }
          if (!tgLiveConfigured())
            return Response.json({ error: "Efir xizmati serverda sozlanmagan" }, { status: 503 });
          if (body.action === "start") {
            const phone = (body.phone ?? "").replace(/[^\d+]/g, "");
            if (phone.replace(/\D/g, "").length < 9)
              return Response.json({ error: "Telefon raqam noto'g'ri" }, { status: 400 });
            return Response.json(await tgStartLogin(phone));
          }
          if (body.action === "resend" && body.loginId) {
            return Response.json(await tgResendCode(body.loginId));
          }
          if (body.action === "code" && body.loginId) {
            const r = await tgFinishLogin({
              orgId: caller.organizationId,
              userId: caller.id,
              loginId: body.loginId,
              code: (body.code ?? "").trim(),
              password: body.password,
              phone: body.phone ?? "",
            });
            return Response.json(
              r.needPassword ? { needPassword: true } : { ok: true, user: r.user },
            );
          }
          return Response.json({ error: "Bad request" }, { status: 400 });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message.slice(0, 300) : "Xatolik" },
            { status: 400 },
          );
        }
      },
    },
  },
});
