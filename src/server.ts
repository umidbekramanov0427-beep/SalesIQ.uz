// Deploy marker: bump this on every server-side fix so a stale build is
// easy to rule out from the response headers alone (see x-app-build below).
const APP_BUILD_MARKER = "amocrm-per-org-credentials-2";

import "./lib/error-capture";

import { consumeLastCapturedError, peekLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// A request slower than this is logged as slow. Background callers
// (pg_cron, the AI worker) run long on purpose; only requests made for a
// person count.
const SLOW_REQUEST_MS = 10_000;
function isBackgroundCall(request: Request): boolean {
  return request.headers.has("x-cron-secret") || request.headers.has("x-worker-secret");
}

async function monitor(
  request: Request,
  startedAt: number,
  status: number,
  detail: { message: string; stack?: string | undefined } | null,
): Promise<void> {
  const durationMs = Date.now() - startedAt;
  const url = new URL(request.url);
  // Never the error logger itself (a failing logger must not log itself in a loop).
  if (url.pathname === "/errors/log") return;
  const slow = durationMs > SLOW_REQUEST_MS && !isBackgroundCall(request);
  if (status < 500 && !slow) return;
  const { recordServerIssue } = await import("./lib/monitoring.server");
  await recordServerIssue({
    kind: status >= 500 ? "server_error" : "slow_request",
    method: request.method,
    // Path only: query strings can carry secrets (?secret=, ?token=).
    path: url.pathname,
    status,
    durationMs,
    message:
      detail?.message ??
      (status >= 500 ? `HTTP ${status}` : `Sekin so'rov: ${(durationMs / 1000).toFixed(1)} s`),
    stack: detail?.stack,
  }).catch(() => undefined);
}

async function describeFailure(
  response: Response,
): Promise<{ message: string; stack?: string | undefined } | null> {
  if (response.status < 500) return null;
  const captured = peekLastCapturedError();
  if (captured instanceof Error) return { message: captured.message, stack: captured.stack };
  const body = await response
    .clone()
    .text()
    .catch(() => "");
  const fromJson = (() => {
    try {
      const j = JSON.parse(body) as { error?: unknown; message?: unknown };
      const m = j.error ?? j.message;
      return typeof m === "string" ? m : null;
    } catch {
      return null;
    }
  })();
  return { message: fromJson ?? `HTTP ${response.status}` };
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const startedAt = Date.now();
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const failure = await describeFailure(response);
      await monitor(request, startedAt, response.status, failure);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const headers = new Headers(normalized.headers);
      headers.set("x-app-build", APP_BUILD_MARKER);
      return new Response(normalized.body, {
        status: normalized.status,
        statusText: normalized.statusText,
        headers,
      });
    } catch (error) {
      console.error(error);
      await monitor(request, startedAt, 500, {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
