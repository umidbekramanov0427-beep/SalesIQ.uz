// The platform owner's inbox (Owner -> Yordam): support conversations
// grouped by company, with filters that fit companies rather than clients --
// waiting for an answer, unread, plan, trial / paid / expired, lead stage.
// Pure, so it is unit-tested; the data comes from owner-inbox.server.ts.

export type InboxPhase = "trial" | "paid" | "expired" | "frozen" | "none";

export type CompanyThread = {
  /** organization id, or "u:<user id>" for a person without a company. */
  key: string;
  orgId: string | null;
  name: string;
  plan: string | null;
  phase: InboxPhase;
  /** The company's lead stage (Owner -> Arizalar), when it has a lead. */
  stage: string | null;
  leadId: string | null;
  status: "open" | "closed";
  unread: number;
  waitingSince: string | null;
  lastAt: string;
  lastText: string;
  lastAuthor: string | null;
  lastDirection: "in" | "out";
  count: number;
  people: { id: string; name: string; role: string | null }[];
  /** Who wrote last -- the default "to" of an answer. */
  lastAskerId: string | null;
  /** The platform owner who answers this company (support_threads). */
  assignedTo?: string | null;
};

export type InboxMessage = {
  id: string;
  direction: "in" | "out";
  text: string;
  page: string | null;
  created_at: string;
  userId: string;
  author: string;
  role: string | null;
  /** A photo, document, voice note or video sent with it (/support/file?id=). */
  file?: { name: string; type: string; size: number; kind: string } | null;
};

export type OwnerInboxFilter = {
  text: string;
  state: "all" | "waiting" | "open" | "closed";
  unread: boolean;
  plans: string[];
  phases: InboxPhase[];
  stages: string[];
};

export const EMPTY_OWNER_FILTER: OwnerInboxFilter = {
  text: "",
  state: "all",
  unread: false,
  plans: [],
  phases: [],
  stages: [],
};

export const OWNER_INBOX_PRESETS = [
  "waiting",
  "unread",
  "trial",
  "paid",
  "expired",
  "closed",
] as const;
export type OwnerInboxPreset = (typeof OWNER_INBOX_PRESETS)[number];

export function presetFilter(p: OwnerInboxPreset): OwnerInboxFilter {
  const f = { ...EMPTY_OWNER_FILTER };
  if (p === "waiting") return { ...f, state: "waiting" };
  if (p === "unread") return { ...f, unread: true };
  if (p === "closed") return { ...f, state: "closed" };
  return { ...f, phases: [p] };
}

export function activeFilterCount(f: OwnerInboxFilter): number {
  return (
    (f.state !== "all" ? 1 : 0) +
    (f.unread ? 1 : 0) +
    (f.plans.length ? 1 : 0) +
    (f.phases.length ? 1 : 0) +
    (f.stages.length ? 1 : 0)
  );
}

export function matchesOwnerInbox(t: CompanyThread, f: OwnerInboxFilter): boolean {
  if (f.state === "waiting" && !t.waitingSince) return false;
  if (f.state === "open" && t.status !== "open") return false;
  if (f.state === "closed" && t.status !== "closed") return false;
  if (f.unread && t.unread === 0) return false;
  if (f.plans.length && !f.plans.includes(t.plan ?? "")) return false;
  if (f.phases.length && !f.phases.includes(t.phase)) return false;
  if (f.stages.length && !f.stages.includes(t.stage ?? "")) return false;
  const needle = f.text.trim().toLowerCase();
  if (
    needle &&
    ![t.name, t.lastText, ...t.people.map((p) => p.name)].some((v) =>
      v.toLowerCase().includes(needle),
    )
  )
    return false;
  return true;
}

/** Waiting ones first (longest wait on top), then the newest. */
export function sortThreads(list: CompanyThread[]): CompanyThread[] {
  return [...list].sort((a, b) => {
    if (!!a.waitingSince !== !!b.waitingSince) return a.waitingSince ? -1 : 1;
    if (a.waitingSince && b.waitingSince) return a.waitingSince.localeCompare(b.waitingSince);
    return b.lastAt.localeCompare(a.lastAt);
  });
}

/**
 * Messages the owner hasn't seen: the company's questions after both the
 * owner's last reading and the last answer.
 */
export function unreadCount(
  msgs: { direction: "in" | "out"; created_at: string }[],
  readAt: string | null,
): number {
  let lastOut = "";
  for (const m of msgs) if (m.direction === "out" && m.created_at > lastOut) lastOut = m.created_at;
  const from = [readAt ?? "", lastOut].sort().at(-1) ?? "";
  return msgs.filter((m) => m.direction === "in" && m.created_at > from).length;
}

/** A closed conversation opens again when the company writes after it was closed. */
export function threadStatus(
  saved: "open" | "closed" | null,
  closedAt: string | null,
  lastInAt: string | null,
): "open" | "closed" {
  if (saved !== "closed") return "open";
  if (lastInAt && closedAt && lastInAt > closedAt) return "open";
  return "closed";
}

/**
 * Whether a waiting conversation should raise the "no answer yet" alert now:
 * waiting longer than `slaMinutes`, and not alerted for this wait already.
 */
export function slaDue(
  waitingSince: string | null,
  alertedAt: string | null,
  slaMinutes: number,
  now: Date,
): boolean {
  if (!waitingSince || slaMinutes <= 0) return false;
  if (now.getTime() - new Date(waitingSince).getTime() < slaMinutes * 60_000) return false;
  return !alertedAt || alertedAt < waitingSince;
}
