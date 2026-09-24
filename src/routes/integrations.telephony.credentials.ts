import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import {
  disconnectTelephony,
  getTelephonyCredentialsStatus,
  saveTelephonyCredentials,
  type TelephonyProvider,
} from "@/lib/telephony/telephony-data.server";

type Body = {
  provider?: unknown;
  apiKey?: unknown;
  apiSecret?: unknown;
  pbxDomain?: unknown;
  callerId?: unknown;
  smsSenderName?: unknown;
};

export const Route = createFileRoute("/integrations/telephony/credentials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const status = await getTelephonyCredentialsStatus(admin.organizationId);
          return Response.json(status, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not load status.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const body = (await request.json().catch(() => ({}))) as Body;
          const provider: TelephonyProvider =
            body.provider === "sipuni"
              ? "sipuni"
              : body.provider === "moizvonki"
                ? "moizvonki"
                : "onlinepbx";
          const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
          const apiSecret = typeof body.apiSecret === "string" ? body.apiSecret : "";
          const pbxDomain = typeof body.pbxDomain === "string" ? body.pbxDomain : "";
          const needsDomain = provider === "onlinepbx" || provider === "moizvonki";
          if (!apiKey || !apiSecret || (needsDomain && !pbxDomain)) {
            return Response.json(
              {
                error: needsDomain
                  ? "API key, secret va domen shart."
                  : "Foydalanuvchi ID va maxfiy kalit shart.",
              },
              { status: 400 },
            );
          }
          await saveTelephonyCredentials(admin.organizationId, admin.id, {
            provider,
            apiKey,
            apiSecret,
            pbxDomain,
            callerId: typeof body.callerId === "string" ? body.callerId : "",
            smsSenderName: typeof body.smsSenderName === "string" ? body.smsSenderName : "",
          });
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not save.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          await disconnectTelephony(admin.organizationId);
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not disconnect.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
