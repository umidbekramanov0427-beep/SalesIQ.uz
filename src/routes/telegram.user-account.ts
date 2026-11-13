import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { tgLiveConfigured } from "@/lib/tg-live.server";
import { workAccountError } from "@/lib/telegram-user/work-account";
import {
  connectBlockedReason,
  workAccountStatus,
  workDisconnect,
  workFinishLogin,
  workQrPoll,
  workQrStart,
  workResendCode,
  workStartLogin,
} from "@/lib/telegram-user/work-account.server";

// Sozlamalar → «Telegram akkauntim»: the signed-in person's own work
// Telegram account. GET -> its state; POST { action } connects it by code
// (start / resend / code) or QR (qr-start / qr-poll), or disconnects it.

type Body = {
  action?: unknown;
  phone?: unknown;
  loginId?: unknown;
  code?: unknown;
  password?: unknown;
};

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const Route = createFileRoute("/telegram/user-account")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        return Response.json(await workAccountStatus(caller.id));
      },
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Body;
        const action = str(body.action, 20);
        if (action === "disconnect") {
          await workDisconnect(caller.id);
          return Response.json({ ok: true });
        }
        if (!tgLiveConfigured()) {
          return Response.json(
            { error: "Telegram xizmati serverda sozlanmagan." },
            { status: 503 },
          );
        }
        if (action === "start" || action === "qr-start") {
          const blocked = await connectBlockedReason(caller.organizationId, caller.id);
          if (blocked) return Response.json({ error: blocked }, { status: 403 });
        }
        try {
          if (action === "start") {
            const phone = str(body.phone, 20);
            if (phone.replace(/\D/g, "").length < 7) {
              return Response.json({ error: "Telefon raqam noto'g'ri." }, { status: 400 });
            }
            return Response.json(await workStartLogin(phone));
          }
          if (action === "resend") {
            return Response.json(await workResendCode(str(body.loginId, 64)));
          }
          if (action === "code") {
            const r = await workFinishLogin({
              orgId: caller.organizationId,
              profileId: caller.id,
              loginId: str(body.loginId, 64),
              code: str(body.code, 12),
              password: str(body.password, 256) || undefined,
              phone: str(body.phone, 20) || null,
            });
            return Response.json(r);
          }
          if (action === "qr-start") return Response.json(await workQrStart());
          if (action === "qr-poll") {
            return Response.json(
              await workQrPoll({
                orgId: caller.organizationId,
                profileId: caller.id,
                loginId: str(body.loginId, 64),
              }),
            );
          }
        } catch (err) {
          return Response.json(
            { error: workAccountError(err instanceof Error ? err.message : String(err)) },
            { status: 400 },
          );
        }
        return Response.json({ error: "Bad request" }, { status: 400 });
      },
    },
  },
});
