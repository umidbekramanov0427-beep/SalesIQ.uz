// The Inbox's filters, like amoCRM's imBox: ready presets (open, needs an
// answer, unread, read but not answered, mine, favourites) and a full
// filter -- number or name, last-message date, funnels with their stages,
// channel, read state, answer state, owner, who wrote last, open/closed.
// Pure, so it is unit-tested; the Inbox page (routes/inbox.tsx) uses it.

export type InboxChat = {
  leadId: string;
  leadNumber: number | null;
  name: string;
  handle: string | null;
  ownerId: string | null;
  funnel: string;
  stageId: string | null;
  channel: "telegram" | "instagram";
  last: { direction: string; text: string; at: string } | null;
  since: string;
};

/** "unread": the client wrote after this person last opened the chat. */
export type ReadState = "unread" | "read" | "answered" | "empty";

export function readState(
  chat: Pick<InboxChat, "last">,
  readAt: string | null | undefined,
): ReadState {
  if (!chat.last) return "empty";
  if (chat.last.direction !== "in") return "answered";
  return readAt && readAt >= chat.last.at ? "read" : "unread";
}

export type InboxFilter = {
  text: string;
  from: string | null;
  to: string | null;
  /** Funnel names; a funnel picked with no stage means all its stages. */
  funnels: string[];
  stageIds: string[];
  channels: ("telegram" | "instagram")[];
  read: "" | "unread" | "read" | "answered";
  answer: "" | "needs" | "none";
  ownerIds: string[];
  lastAuthor: "" | "client" | "team";
  status: "" | "open" | "closed";
  favorites: boolean;
};

export const EMPTY_INBOX_FILTER: InboxFilter = {
  text: "",
  from: null,
  to: null,
  funnels: [],
  stageIds: [],
  channels: [],
  read: "",
  answer: "",
  ownerIds: [],
  lastAuthor: "",
  status: "",
  favorites: false,
};

export const INBOX_PRESETS = [
  "all",
  "open",
  "needsAnswer",
  "unread",
  "readUnanswered",
  "mine",
  "favorites",
] as const;
export type InboxPreset = (typeof INBOX_PRESETS)[number];

/** The filter a preset stands for (meId: the person looking). */
export function presetFilter(preset: InboxPreset, meId: string | null): InboxFilter {
  switch (preset) {
    case "open":
      return { ...EMPTY_INBOX_FILTER, status: "open" };
    case "needsAnswer":
      return { ...EMPTY_INBOX_FILTER, answer: "needs" };
    case "unread":
      return { ...EMPTY_INBOX_FILTER, read: "unread" };
    case "readUnanswered":
      return { ...EMPTY_INBOX_FILTER, read: "read" };
    case "mine":
      return { ...EMPTY_INBOX_FILTER, ownerIds: meId ? [meId] : [] };
    case "favorites":
      return { ...EMPTY_INBOX_FILTER, favorites: true };
    default:
      return EMPTY_INBOX_FILTER;
  }
}

/** How many fields of the filter are set (the button's badge). */
export function activeCount(f: InboxFilter): number {
  return [
    f.text.trim() !== "",
    !!(f.from || f.to),
    f.funnels.length > 0 || f.stageIds.length > 0,
    f.channels.length > 0,
    f.read !== "",
    f.answer !== "",
    f.ownerIds.length > 0,
    f.lastAuthor !== "",
    f.status !== "",
    f.favorites,
  ].filter(Boolean).length;
}

export function matchesInbox(
  chat: InboxChat,
  f: InboxFilter,
  ctx: {
    readAt: string | null | undefined;
    favorite: boolean;
    /** Stage id -> its funnel and whether it is a closed (won/lost) stage. */
    stage: (id: string) => { funnel: string; closed: boolean } | undefined;
  },
): boolean {
  const q = f.text.trim().toLowerCase().replace(/^#/, "");
  if (q) {
    const hay =
      `${chat.leadNumber ?? ""} ${chat.name} ${chat.handle ?? ""} ${chat.last?.text ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const at = chat.last?.at ?? chat.since;
  if (f.from && at < f.from) return false;
  if (f.to && at > f.to) return false;

  if (f.funnels.length > 0 || f.stageIds.length > 0) {
    const st = chat.stageId ? ctx.stage(chat.stageId) : undefined;
    const funnel = st?.funnel ?? chat.funnel;
    // A funnel with some of its stages picked narrows to those stages.
    const funnelHasPicks = f.stageIds.some((id) => ctx.stage(id)?.funnel === funnel);
    const okStage = !!chat.stageId && f.stageIds.includes(chat.stageId);
    const okFunnel = f.funnels.includes(funnel) && !funnelHasPicks;
    if (!okStage && !okFunnel) return false;
  }
  if (f.channels.length > 0 && !f.channels.includes(chat.channel)) return false;

  const state = readState(chat, ctx.readAt);
  if (f.read && state !== f.read) return false;
  if (f.answer === "needs" && chat.last?.direction !== "in") return false;
  if (f.answer === "none" && chat.last?.direction === "in") return false;
  if (f.ownerIds.length > 0 && !(chat.ownerId && f.ownerIds.includes(chat.ownerId))) return false;
  if (f.lastAuthor === "client" && chat.last?.direction !== "in") return false;
  if (f.lastAuthor === "team" && chat.last?.direction !== "out") return false;
  if (f.status) {
    const closed = chat.stageId ? !!ctx.stage(chat.stageId)?.closed : false;
    if (f.status === "open" ? closed : !closed) return false;
  }
  if (f.favorites && !ctx.favorite) return false;
  return true;
}
