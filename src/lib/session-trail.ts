import { supabase } from "@/integrations/supabase/client";

// What happens inside one sign-in session, for the platform owner's visits
// report (/platform/sessions): pages opened, actions that failed, pages or
// features the user wasn't allowed to open. Events wait in memory and go
// to /account/session-events in one request every 10 s, or when the tab is
// hidden -- nothing on the critical path. Before the session id is known
// (the sign-in record is still being written) events are held back.

type TrailEvent = {
  kind: "page" | "action" | "failed" | "blocked";
  label: string;
  path: string | null;
  at: number;
  meta?: Record<string, string>;
};

const FLUSH_MS = 10_000;
const MAX_QUEUE = 100;

let sessionId: string | null = null;
let token: string | null = null;
let queue: TrailEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

async function refreshToken() {
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  } catch {
    // Keep the last token.
  }
}

function send(keepalive: boolean) {
  if (!sessionId || !token || queue.length === 0) return;
  const events = queue;
  queue = [];
  void fetch("/account/session-events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionId, events }),
    keepalive,
  }).catch(() => {
    // The report is best-effort; never bother the person using the app.
  });
}

function schedule() {
  if (timer || !sessionId) return;
  timer = setTimeout(() => {
    timer = null;
    void refreshToken().then(() => send(false));
  }, FLUSH_MS);
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const flushNow = () => send(true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
  window.addEventListener("pagehide", flushNow);
}

/** The sign-in session the following events belong to (from /account/login-event). */
export function startTrail(id: string) {
  if (typeof window === "undefined") return;
  sessionId = id;
  listen();
  void refreshToken().then(() => {
    if (queue.length) schedule();
  });
}

export function stopTrail() {
  send(true);
  sessionId = null;
  queue = [];
}

export function trail(
  kind: TrailEvent["kind"],
  label: string,
  path: string | null = typeof window !== "undefined" ? window.location.pathname : null,
  meta?: Record<string, string>,
) {
  if (typeof window === "undefined") return;
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push({ kind, label: label.slice(0, 300), path, at: Date.now(), ...(meta ? { meta } : {}) });
  schedule();
}
