// Server-only. Forwards errors to Sentry without the Sentry SDK: one POST of
// a Sentry "envelope" to the project's ingest endpoint. Adding @sentry/*
// would touch bun.lock, which resolves from Lovable's private registry and
// can break the install, so the few fields we need are built here.
// Everything already funnels through two places -- recordServerIssue
// (server 5xx, slow requests) and /errors/log (browser crashes) -- and both
// call captureToSentry. Without SENTRY_DSN this is a no-op.

export type SentryCapture = {
  message: string;
  stack?: string | undefined;
  level: "error" | "warning";
  /** server_error | slow_request | client | ... -- becomes the "source" tag. */
  source: string;
  /** "POST /x/y" for server requests, the page path for browser errors. */
  transaction?: string | undefined;
  userId?: string | null | undefined;
  tags?: Record<string, string | number | undefined> | undefined;
  extra?: Record<string, unknown> | undefined;
  /** Overrides Sentry's grouping, e.g. one issue per slow route. */
  fingerprint?: string[] | undefined;
};

type Dsn = { endpoint: string; publicKey: string; raw: string };

export function parseDsn(raw: string | undefined): Dsn | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    const projectId = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!url.username || !projectId) return null;
    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
      raw: raw.trim(),
    };
  } catch {
    return null;
  }
}

type Frame = {
  function?: string;
  filename: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
};

// "    at fn (file:1:2)", "    at file:1:2" (V8) and "fn@file:1:2" (Firefox, Safari).
const V8_LINE = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
const GECKO_LINE = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;

export function parseStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n")) {
    const m = V8_LINE.exec(line) ?? GECKO_LINE.exec(line);
    if (!m) continue;
    const filename = m[2]!;
    frames.push({
      ...(m[1] ? { function: m[1] } : {}),
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !/node_modules|^node:|^internal\//.test(filename),
    });
  }
  // Sentry lists frames oldest call first; stacks print the newest first.
  return frames.reverse().slice(-50);
}

// "TypeError: x is undefined" -> type TypeError, value "x is undefined".
function splitMessage(message: string): { type: string; value: string } {
  const first = message.split("\n")[0]!;
  const m = /^([A-Z][A-Za-z]*(?:Error|Exception)): ([\s\S]*)$/.exec(first);
  return m ? { type: m[1]!, value: m[2]! } : { type: "Error", value: first };
}

function eventId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function buildEnvelope(dsn: Dsn, capture: SentryCapture, now = new Date()): string {
  const id = eventId();
  const { type, value } = splitMessage(capture.message);
  const frames = parseStack(capture.stack);
  const tags: Record<string, string> = { source: capture.source };
  for (const [k, v] of Object.entries(capture.tags ?? {})) {
    if (v !== undefined) tags[k] = String(v);
  }
  const event = {
    event_id: id,
    timestamp: now.getTime() / 1000,
    platform: "javascript",
    level: capture.level,
    logger: capture.source,
    environment: process.env["NODE_ENV"] ?? "development",
    ...(process.env["APP_VERSION"] ? { release: process.env["APP_VERSION"] } : {}),
    ...(capture.transaction ? { transaction: capture.transaction } : {}),
    ...(capture.userId ? { user: { id: capture.userId } } : {}),
    ...(capture.fingerprint ? { fingerprint: capture.fingerprint } : {}),
    tags,
    extra: capture.extra ?? {},
    exception: {
      values: [{ type, value, ...(frames.length ? { stacktrace: { frames } } : {}) }],
    },
  };
  return [
    JSON.stringify({ event_id: id, sent_at: now.toISOString(), dsn: dsn.raw }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}

/** Sends one event; never throws and gives up after `timeoutMs`. */
export async function captureToSentry(capture: SentryCapture, timeoutMs = 2000): Promise<void> {
  const dsn = parseDsn(process.env["SENTRY_DSN"]);
  if (!dsn) return;
  try {
    await fetch(dsn.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=salesiq/1.0`,
      },
      body: buildEnvelope(dsn, capture),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Monitoring must never break the request it is reporting on.
  }
}
