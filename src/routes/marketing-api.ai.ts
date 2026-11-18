import { createFileRoute } from "@tanstack/react-router";
import { requireMarketingMember } from "@/lib/marketing.server";
import {
  analyze,
  chatList,
  chatMessages,
  chatReply,
  createRecommendation,
  deleteRecommendation,
  forecasts,
  overview,
  recommendations,
  updateRecommendation,
} from "@/lib/marketing-ai/analyst.server";
import {
  AiUnavailable,
  aiSettings,
  saveAiSettings,
  spentUsd,
} from "@/lib/marketing-ai/provider.server";
import { usdRate } from "@/lib/marketing-ai/fx.server";
import type { Scope } from "@/lib/marketing-ai/metrics.server";

// /marketing-api/ai -- Marketing -> AI tahlilchi (marketing people only;
// every query is for the caller's own company).
//   GET  ?from&to&project&campaign&webinar -> figures + previous period +
//        rule alerts + the last AI analysis + the dollar rate.
//   POST {action}:
//     analyze {scope, force}      the AI's findings (cached by the figures)
//     forecast {scope}            next weeks (statistics, with confidence)
//     chat {chatId?, message, scope} | chats | messages {chatId}
//     recs | rec {title, problem, priority, metricKey, scope, assigneeId}
//     recUpdate {id, status?, assigneeId?} | recDelete {id}
//     settings | saveSettings {...}  (owners and marketers)
const EDITORS = new Set(["super_admin", "marketolog", "platform_owner"]);

function scopeOf(raw: Record<string, unknown> | URLSearchParams | undefined): Scope {
  const get = (k: string) =>
    raw instanceof URLSearchParams
      ? raw.get(k)
      : raw
        ? (raw[k] as string | null | undefined)
        : null;
  const now = Date.now();
  const to = Date.parse(String(get("to") ?? "")) || now;
  const from = Date.parse(String(get("from") ?? "")) || to - 30 * 86_400_000;
  const id = (k: string) => {
    const v = get(k);
    return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
  };
  const campaign = get("campaign");
  return {
    from: new Date(Math.min(from, to)).toISOString(),
    to: new Date(to).toISOString(),
    projectId: id("project"),
    webinarId: id("webinar"),
    campaign: typeof campaign === "string" && campaign.trim() ? campaign.trim().slice(0, 80) : null,
  };
}

const fail = (err: unknown) => {
  if (err instanceof AiUnavailable)
    return Response.json({ error: err.message, code: err.code }, { status: 409 });
  const msg = err instanceof Error ? err.message : "Xatolik";
  if (/marketing_ai|schema cache|does not exist/i.test(msg))
    return Response.json({ error: "migration_pending", code: "migration" }, { status: 409 });
  console.error("[marketing-ai]", err);
  return Response.json({ error: msg }, { status: 400 });
};

export const Route = createFileRoute("/marketing-api/ai")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        try {
          const scope = scopeOf(new URL(request.url).searchParams);
          const [o, fx] = await Promise.all([overview(caller.organizationId, scope), usdRate()]);
          return Response.json({ ...o, fx, scope });
        } catch (err) {
          return fail(err);
        }
      },
      POST: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const org = caller.organizationId;
        const scope = scopeOf(b["scope"] as Record<string, unknown> | undefined);
        try {
          switch (String(b["action"] ?? "")) {
            case "analyze":
              return Response.json(await analyze(org, scope, caller.id, b["force"] === true));
            case "forecast":
              return Response.json(await forecasts(org, scope));
            case "chat":
              return Response.json(
                await chatReply(org, caller.id, {
                  chatId: typeof b["chatId"] === "string" ? b["chatId"] : null,
                  message: String(b["message"] ?? ""),
                  scope,
                }),
              );
            case "chats":
              return Response.json({ chats: await chatList(org, caller.id) });
            case "messages":
              return Response.json({
                messages: await chatMessages(org, caller.id, String(b["chatId"] ?? "")),
              });
            case "recs":
              return Response.json({ recs: await recommendations(org) });
            case "rec":
              return Response.json({
                id: await createRecommendation(org, caller.id, {
                  title: String(b["title"] ?? ""),
                  problem: typeof b["problem"] === "string" ? b["problem"] : null,
                  priority: String(b["priority"] ?? "warning"),
                  metricKey: typeof b["metricKey"] === "string" ? b["metricKey"] : null,
                  scope,
                  assigneeId: typeof b["assigneeId"] === "string" ? b["assigneeId"] : null,
                }),
              });
            case "recUpdate":
              await updateRecommendation(org, String(b["id"] ?? ""), {
                ...(typeof b["status"] === "string" ? { status: b["status"] } : {}),
                ...(b["assigneeId"] !== undefined
                  ? { assigneeId: typeof b["assigneeId"] === "string" ? b["assigneeId"] : null }
                  : {}),
              });
              return Response.json({ ok: true });
            case "recDelete":
              await deleteRecommendation(org, String(b["id"] ?? ""));
              return Response.json({ ok: true });
            case "settings": {
              const s = await aiSettings(org);
              const { key: _key, ...pub } = s;
              void _key;
              return Response.json({
                settings: pub,
                usage: s.ready ? await spentUsd(org) : null,
                platformKey: !!process.env["GEMINI_API_KEY"],
                editor: EDITORS.has(caller.role),
              });
            }
            case "saveSettings":
              if (!EDITORS.has(caller.role))
                return Response.json({ error: "Forbidden" }, { status: 403 });
              await saveAiSettings(org, caller.id, b as never);
              return Response.json({ ok: true });
            default:
              return Response.json({ error: "Unknown action" }, { status: 400 });
          }
        } catch (err) {
          return fail(err);
        }
      },
    },
  },
});
