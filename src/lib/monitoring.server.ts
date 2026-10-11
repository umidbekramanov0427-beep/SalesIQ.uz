// Server-only. Records what goes wrong on the server -- 5xx responses and
// slow requests -- into the same error_logs table the client-side handlers
// write to (shown on /platform/errors), and pings the platform owners on
// Telegram the first time a given server error appears. Called from
// src/server.ts, which sees every request; it only does work for the rare
// failing or slow request, never for normal traffic. Each issue also goes
// to Sentry (sentry.server.ts) when SENTRY_DSN is set.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { captureToSentry } from "@/lib/sentry.server";

export type ServerIssue = {
  kind: "server_error" | "slow_request";
  method: string;
  path: string;
  status: number;
  durationMs: number;
  message: string;
  stack?: string | undefined;
};

// The same error is announced at most once per window, per server
// instance and (via the table) across instances.
const ALERT_WINDOW_MS = 15 * 60_000;
const recentAlerts = new Map<string, number>();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
}

export async function recordServerIssue(issue: ServerIssue): Promise<void> {
  const route = `${issue.method} ${issue.path}`;
  const message = issue.message.slice(0, 2000);
  const durationMs = Math.round(issue.durationMs);
  await withTimeout(
    Promise.all([
      (async () => {
        const { error } = await supabaseAdmin.from("error_logs").insert({
          message,
          stack: issue.stack?.slice(0, 8000) ?? null,
          source: issue.kind,
          route,
          context: { status: issue.status, durationMs },
        });
        if (error) return;
        if (issue.kind === "server_error") await alertOwners(route, message, issue.status);
      })().catch(() => undefined),
      captureToSentry({
        message,
        stack: issue.stack,
        level: issue.kind === "server_error" ? "error" : "warning",
        source: issue.kind,
        transaction: route,
        tags: { status: issue.status, method: issue.method },
        extra: { durationMs },
        // A slow route is one issue however long each request took.
        ...(issue.kind === "slow_request" ? { fingerprint: ["slow_request", route] } : {}),
      }),
    ]),
    2500,
  );
}

async function alertOwners(route: string, message: string, status: number): Promise<void> {
  const key = `${route}|${message.slice(0, 120)}`;
  const last = recentAlerts.get(key);
  if (last && Date.now() - last < ALERT_WINDOW_MS) return;
  recentAlerts.set(key, Date.now());

  const since = new Date(Date.now() - ALERT_WINDOW_MS).toISOString();
  const { count } = await supabaseAdmin
    .from("error_logs")
    .select("id", { count: "exact", head: true })
    .eq("source", "server_error")
    .eq("route", route)
    .eq("message", message)
    .gte("created_at", since);
  // This occurrence is already in the table; an earlier one means another
  // instance (or an earlier request) has announced it.
  if ((count ?? 0) > 1) return;

  const { data: owners } = await supabaseAdmin
    .from("profiles")
    .select("telegram_chat_id")
    .eq("role", "platform_owner")
    .not("telegram_chat_id", "is", null);
  if (!owners?.length) return;

  const { sendTelegramMessage } = await import("@/lib/telegram-report.server");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text =
    `⚠️ <b>SalesIQ server xatosi</b>\n<code>${esc(route)}</code> → ${status}\n` +
    `${esc(message.split("\n")[0]!.slice(0, 300))}\n\nBatafsil: Platforma → Xatoliklar`;
  await Promise.all(
    owners.map((o) => sendTelegramMessage(Number(o.telegram_chat_id), text).catch(() => undefined)),
  );
}
