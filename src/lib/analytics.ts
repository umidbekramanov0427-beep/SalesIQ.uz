// Product analytics (Amplitude) without the Amplitude SDK: a few lines that
// batch events and POST them to Amplitude's HTTP API. No package (bun.lock
// risk), no third-party script on the page, nothing on the critical path --
// events are queued in memory and sent every few seconds, or when the tab is
// hidden. Off entirely unless VITE_AMPLITUDE_API_KEY is set at build time.
//
// Privacy: only the profile id, role, organization id and plan identify a
// user. Names, emails, phones, leads and calls never leave the platform.

const API_KEY = (import.meta.env["VITE_AMPLITUDE_API_KEY"] as string | undefined)?.trim() ?? "";
const ENDPOINT = "https://api2.amplitude.com/2/httpapi";
const DEVICE_KEY = "siq-amp-device";
const SESSION_KEY = "siq-amp-session";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const FLUSH_DELAY_MS = 5000;
const MAX_BATCH = 20;

type AmpEvent = {
  event_type: string;
  user_id?: string;
  device_id: string;
  session_id: number;
  time: number;
  insert_id: string;
  platform: string;
  language: string;
  event_properties?: Record<string, unknown>;
  user_properties?: Record<string, unknown>;
};

export type AnalyticsUser = {
  id: string;
  role: string;
  organizationId: string | null;
  plan: string | null;
  isIntern: boolean;
};

const enabled = typeof window !== "undefined" && API_KEY !== "";
if (typeof window !== "undefined" && !API_KEY) {
  console.warn("Amplitude API key missing — analytics disabled");
}
let queue: AmpEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let user: AnalyticsUser | null = null;
let userPropsSent = false;
let listening = false;

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

// Amplitude's session id is the start time (ms) of the session; a new one
// starts after 30 minutes without events.
function sessionId(now: number): number {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const saved = raw ? (JSON.parse(raw) as { id: number; last: number }) : null;
    const id = saved && now - saved.last < SESSION_TIMEOUT_MS ? saved.id : now;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id, last: now }));
    return id;
  } catch {
    return now;
  }
}

function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const events = queue;
  queue = [];
  // keepalive lets the request finish when the tab is closing.
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: API_KEY, events }),
    keepalive: true,
  }).catch(() => {
    // Analytics must never surface an error to the person using the app.
  });
}

function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

export function track(eventType: string, properties?: Record<string, unknown>) {
  if (!enabled) return;
  listen();
  const now = Date.now();
  const event: AmpEvent = {
    event_type: eventType,
    device_id: deviceId(),
    session_id: sessionId(now),
    time: now,
    insert_id: randomId(),
    platform: "Web",
    language: navigator.language,
    event_properties: {
      layout: document.documentElement.classList.contains("phone") ? "phone" : "desktop",
      ...properties,
    },
  };
  if (user) {
    event.user_id = user.id;
    if (!userPropsSent) {
      event.user_properties = {
        role: user.role,
        organization_id: user.organizationId,
        plan: user.plan,
        is_intern: user.isIntern,
      };
      userPropsSent = true;
    }
  }
  queue.push(event);
  if (queue.length >= MAX_BATCH) flush();
  else if (!timer) timer = setTimeout(flush, FLUSH_DELAY_MS);
}

// For events fired from a component's mount: the signed-in shell can mount
// a page twice while auth settles, which must still count as one view.
const lastFired = new Map<string, number>();
export function trackOnce(eventType: string, properties?: Record<string, unknown>) {
  const now = Date.now();
  if (now - (lastFired.get(eventType) ?? 0) < 3000) return;
  lastFired.set(eventType, now);
  track(eventType, properties);
}

export function identify(next: AnalyticsUser | null) {
  if (!enabled) return;
  if (next?.id === user?.id && next?.plan === user?.plan && next?.role === user?.role) return;
  user = next;
  userPropsSent = false;
}

// Ids in a path ("/crm/leads/3f2a…") become ":id" so every lead card counts
// as one page.
export function pageName(pathname: string): string {
  return (
    pathname
      .split("/")
      .map((part) => (/^[0-9a-f-]{16,}$/i.test(part) || /^\d+$/.test(part) ? ":id" : part))
      .join("/") || "/"
  );
}

export function trackPage(pathname: string) {
  track("Page Viewed", { page: pageName(pathname) });
}
