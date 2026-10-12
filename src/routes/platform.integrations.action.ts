import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  disconnectAmoCrm,
  logAmoSyncRun,
  syncLeadsFromAmo,
  testAmoConnection,
} from "@/lib/amocrm/client.server";
import {
  disconnectBitrix24,
  logBitrix24SyncRun,
  saveConnection as saveBitrix24Connection,
  syncDealsFromBitrix24,
  testConnection as testBitrix24Url,
} from "@/lib/bitrix24/client.server";
import {
  disconnectTelephony,
  saveTelephonyCredentials,
  testTelephonyConnection,
} from "@/lib/telephony/telephony-data.server";
import type { TelephonyProvider } from "@/lib/telephony/provider-meta";
import { disconnectSms, saveSmsCredentials } from "@/lib/sms/sms-data.server";
import { testEskizConnection } from "@/lib/sms/eskiz.server";
import {
  deleteOutgoingWebhook,
  toggleOutgoingWebhook,
} from "@/lib/webhooks/outgoing-webhooks.server";
import {
  forgetIntegrationPause,
  INTEGRATION_KINDS,
  type IntegrationKind,
} from "@/lib/integration-pauses.server";

// One endpoint for every management action on a company's integration from
// the platform owner's Integrations page: pause/resume, test, sync now,
// edit settings, disconnect. Always names the company explicitly (the
// owner has no company of their own).

type Body = {
  organizationId?: string;
  kind?: string;
  action?: "pause" | "resume" | "test" | "sync" | "edit" | "disconnect" | "toggle" | "delete";
  provider?: string;
  webhookId?: string;
  enabled?: boolean;
  reason?: string;
  fields?: Record<string, string | undefined>;
};

// Long syncs answer "still running" instead of holding the request past
// the serverless limit; the sync itself keeps its own lock and log.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))]);
}

async function run(ownerId: string, orgId: string, kind: IntegrationKind, body: Body) {
  const f = body.fields ?? {};
  switch (body.action) {
    case "pause": {
      const { error } = await supabaseAdmin.from("integration_pauses").upsert(
        {
          organization_id: orgId,
          kind,
          paused_by: ownerId,
          reason: body.reason?.trim() || null,
          paused_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,kind" },
      );
      if (error) throw error;
      forgetIntegrationPause(orgId, kind);
      return { ok: true };
    }
    case "resume": {
      const { error } = await supabaseAdmin
        .from("integration_pauses")
        .delete()
        .eq("organization_id", orgId)
        .eq("kind", kind);
      if (error) throw error;
      forgetIntegrationPause(orgId, kind);
      return { ok: true };
    }
    case "test": {
      if (kind === "amocrm") return await testAmoConnection(orgId);
      if (kind === "sms") return await testEskizConnection(orgId);
      if (kind === "telephony") {
        return await testTelephonyConnection(orgId, body.provider as TelephonyProvider);
      }
      if (kind === "bitrix24") {
        const { data } = await supabaseAdmin
          .from("bitrix24_connection")
          .select("webhook_url")
          .eq("organization_id", orgId)
          .maybeSingle();
        if (!data) throw new Error("Bitrix24 ulanmagan.");
        const res = await testBitrix24Url(data.webhook_url);
        if (!res.ok) throw new Error(res.error ?? "Bitrix24 javob bermadi.");
        return { ok: true };
      }
      break;
    }
    case "sync": {
      const startedAt = new Date().toISOString();
      if (kind === "amocrm") {
        const result = await withTimeout(syncLeadsFromAmo(orgId), 100_000);
        if (result === "timeout") return { ok: true, running: true };
        await logAmoSyncRun(orgId, "manual", startedAt, result).catch(() => undefined);
        return { ok: true, ...result };
      }
      if (kind === "bitrix24") {
        const result = await withTimeout(syncDealsFromBitrix24(orgId), 100_000);
        if (result === "timeout") return { ok: true, running: true };
        await logBitrix24SyncRun(orgId, "manual", startedAt, result).catch(() => undefined);
        return { ok: true, ...result };
      }
      break;
    }
    case "edit": {
      if (kind === "bitrix24") {
        if (!f["webhookUrl"]?.trim()) throw new Error("Webhook URL kiriting.");
        await saveBitrix24Connection(orgId, f["webhookUrl"], ownerId);
        return { ok: true };
      }
      if (kind === "telephony") {
        const provider = body.provider as TelephonyProvider;
        const { data: cur } = await supabaseAdmin
          .from("org_telephony_credentials")
          .select("api_key, api_secret, pbx_domain, caller_id, sms_sender_name")
          .eq("organization_id", orgId)
          .eq("provider", provider)
          .maybeSingle();
        // Blank fields keep what is saved, so a secret never has to be
        // shown to be kept.
        await saveTelephonyCredentials(orgId, ownerId, {
          provider,
          apiKey: f["apiKey"]?.trim() || cur?.api_key || "",
          apiSecret: f["apiSecret"]?.trim() || cur?.api_secret || "",
          pbxDomain: f["pbxDomain"]?.trim() ?? cur?.pbx_domain ?? "",
          callerId: f["callerId"]?.trim() ?? cur?.caller_id ?? "",
          smsSenderName: cur?.sms_sender_name ?? "",
        });
        return { ok: true };
      }
      if (kind === "sms") {
        const { data: cur } = await supabaseAdmin
          .from("org_sms_credentials")
          .select("email, password, sender_name")
          .eq("organization_id", orgId)
          .maybeSingle();
        await saveSmsCredentials(orgId, ownerId, {
          email: f["email"]?.trim() || cur?.email || "",
          password: f["password"]?.trim() || cur?.password || "",
          senderName: f["senderName"]?.trim() ?? cur?.sender_name ?? "",
        });
        return { ok: true };
      }
      break;
    }
    case "toggle": {
      if (kind === "webhooks" && body.webhookId) {
        await toggleOutgoingWebhook(orgId, body.webhookId, body.enabled === true);
        return { ok: true };
      }
      break;
    }
    case "delete": {
      if (kind === "webhooks" && body.webhookId) {
        await deleteOutgoingWebhook(orgId, body.webhookId);
        return { ok: true };
      }
      break;
    }
    case "disconnect": {
      if (kind === "amocrm") await disconnectAmoCrm(orgId);
      else if (kind === "bitrix24") await disconnectBitrix24(orgId);
      else if (kind === "telephony")
        await disconnectTelephony(orgId, body.provider as TelephonyProvider);
      else if (kind === "sms") await disconnectSms(orgId);
      else break;
      return { ok: true };
    }
  }
  throw new Error("Bu amal shu integratsiya uchun mavjud emas.");
}

export const Route = createFileRoute("/platform/integrations/action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as Body;
        const orgId = body.organizationId?.trim();
        const kind = body.kind as IntegrationKind;
        if (!orgId || !INTEGRATION_KINDS.includes(kind) || !body.action) {
          return Response.json(
            { error: "organizationId, kind and action are required." },
            { status: 400 },
          );
        }
        try {
          return Response.json(await run(ownerId, orgId, kind, body));
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : typeof err === "object" && err && "message" in err
                ? String((err as { message: unknown }).message)
                : "Amalni bajarib bo'lmadi.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
