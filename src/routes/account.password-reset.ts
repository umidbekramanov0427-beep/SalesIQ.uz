import { createFileRoute } from "@tanstack/react-router";
import { requestIp } from "@/lib/request-meta.server";
import { sendResetCode, verifyResetCode } from "@/lib/password-reset.server";

// Login page -> "Parolni unutdingizmi?": a code through Telegram
// (password-reset.server.ts). Public by necessity -- nobody is signed in --
// so it is capped per address and per account and never says whether an
// account exists.
//   { action: "send", login }                      -> { ok } | { error } | { fallback: "email" }
//   { action: "verify", login, code, password }    -> { ok, email } | { error, triesLeft? }

export const Route = createFileRoute("/account/password-reset")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
        const login = str(body["login"], 200);
        if (body["action"] === "send") {
          return Response.json(await sendResetCode(login, requestIp(request)));
        }
        if (body["action"] === "verify") {
          return Response.json(
            await verifyResetCode({
              login,
              code: str(body["code"], 20),
              password: str(body["password"], 200),
            }),
          );
        }
        return Response.json({ ok: false, error: "invalid" }, { status: 400 });
      },
    },
  },
});
