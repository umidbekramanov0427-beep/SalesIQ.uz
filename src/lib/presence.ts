// Jamoa holati: what each colleague is doing right now, from what the app
// already knows -- an open tab's heartbeat (online), the newest page or
// action (active vs idle), the page they are on (a lead card or the inbox
// means they are with a client) and the phone system (ringing / on a call).

export type Presence = "call" | "ringing" | "client" | "active" | "idle" | "offline";

/** Order on screen: the busiest first, offline last. */
export const PRESENCE_ORDER: Presence[] = [
  "call",
  "ringing",
  "client",
  "active",
  "idle",
  "offline",
];

/** No page or action for this long while the tab is open = idle. */
export const IDLE_MS = 5 * 60_000;

const CLIENT_PATHS = [/^\/crm\/leads\//, /^\/inbox/, /^\/leads\//];

export function presenceOf(input: {
  online: boolean;
  call: "answered" | "ringing" | null;
  lastEventAt: string | null;
  since: string | null;
  path: string | null;
  now: number;
}): Presence {
  if (input.call === "answered") return "call";
  if (input.call === "ringing") return "ringing";
  if (!input.online) return "offline";
  const last = input.lastEventAt ?? input.since;
  const idle = !last || input.now - new Date(last).getTime() > IDLE_MS;
  if (idle) return "idle";
  if (input.path && CLIENT_PATHS.some((re) => re.test(input.path!))) return "client";
  return "active";
}
