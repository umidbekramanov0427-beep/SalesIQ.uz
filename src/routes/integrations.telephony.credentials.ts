import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import {
  disconnectTelephony,
  getAllTelephonyStatuses,
  saveExtensionLinks,
  saveTelephonyCredentials,
} from "@/lib/telephony/telephony-data.server";
import { getTelephonyProviderMeta, isTelephonyProvider } from "@/lib/telephony/provider-meta";

type Body = {
  provider?: unknown;
  apiKey?: unknown;
  apiSecret?: unknown;
  pbxDomain?: unknown;
  callerId?: unknown;
  smsSenderName?: unknown;
  extensionLinks?: unknown;
};

function parseExtensionLinks(raw: unknown): { code: string; profileId: string }[] | null {
  if (!Array.isArray(raw)) return null;
  const links: { code: string; profileId: string }[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const code = (entry as Record<string, unknown>)["code"];
    const profileId = (entry as Record<string, unknown>)["profileId"];
    if (typeof code !== "string" || typeof profileId !== "string") return null;
    links.push({ code: code.trim(), profileId });
  }
  return links;
}

export const Route = createFileRoute("/integrations/telephony/credentials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const statuses = await getAllTelephonyStatuses(admin.organizationId);
          return Response.json(statuses, { status: 200 });
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
          if (!isTelephonyProvider(body.provider)) {
            return Response.json({ error: "Noma'lum provayder." }, { status: 400 });
          }
          const provider = body.provider;

          if (body.extensionLinks !== undefined) {
            const links = parseExtensionLinks(body.extensionLinks);
            if (!links)
              return Response.json({ error: "Noto'g'ri bog'lanish ro'yxati." }, { status: 400 });
            await saveExtensionLinks(admin.organizationId, provider, links);
            return Response.json({ ok: true }, { status: 200 });
          }

          const raw = {
            apiKey: typeof body.apiKey === "string" ? body.apiKey.trim() : "",
            apiSecret: typeof body.apiSecret === "string" ? body.apiSecret.trim() : "",
            pbxDomain: typeof body.pbxDomain === "string" ? body.pbxDomain.trim() : "",
            callerId: typeof body.callerId === "string" ? body.callerId.trim() : "",
            smsSenderName: typeof body.smsSenderName === "string" ? body.smsSenderName.trim() : "",
          };
          const meta = getTelephonyProviderMeta(provider);
          const missing = meta.fields.filter((f) => f.required && !raw[f.key]);
          if (missing.length > 0) {
            return Response.json(
              { error: "Barcha majburiy maydonlarni to'ldiring." },
              { status: 400 },
            );
          }
          await saveTelephonyCredentials(admin.organizationId, admin.id, { provider, ...raw });
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
          const provider = new URL(request.url).searchParams.get("provider");
          if (!isTelephonyProvider(provider)) {
            return Response.json({ error: "Noma'lum provayder." }, { status: 400 });
          }
          await disconnectTelephony(admin.organizationId, provider);
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not disconnect.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
