// Which notification rows the open app pops up as a card (see
// components/notifications/LiveNotifications.tsx). Pure, so it is unit-tested.

export type LiveRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

/** Pop-up kinds; the rest only update the bell. */
export const POPUP_KINDS = [
  "ClientMessage",
  "TaskSoon",
  "TaskDue",
  "TaskOverdue",
  "task_assigned",
] as const;
export type PopupKind = (typeof POPUP_KINDS)[number];

export function isPopupKind(type: string): type is PopupKind {
  return (POPUP_KINDS as readonly string[]).includes(type);
}

/** Cards that stay until closed: a task whose time has come is not missed. */
export function staysOpen(type: string): boolean {
  return type === "TaskDue" || type === "TaskOverdue";
}

export function leadIdFromLink(link: string | null | undefined): string | null {
  const m = /^\/crm\/leads\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(link ?? "");
  return m ? m[1]!.toLowerCase() : null;
}

/** Same tag as the server's web push for the event, so a phone shows it once. */
export function systemTag(row: Pick<LiveRow, "id" | "type" | "link">): string {
  const lead = leadIdFromLink(row.link);
  return row.type === "ClientMessage" && lead ? `chat:${lead}` : `notif:${row.id}`;
}

export type PopupDecision = "show" | "mark-read" | "skip";

/**
 * What to do with a row the app just heard about:
 * - "skip": read already, from before the tab opened, already shown in this
 *   version (a merged chat notification comes back with a newer time), or
 *   not a pop-up kind;
 * - "mark-read": a client's message in the chat the person has open -- they
 *   are reading it already;
 * - "show": pop it up.
 */
export function decidePopup(
  row: LiveRow,
  ctx: { since: number; path: string; shown: ReadonlyMap<string, string> },
): PopupDecision {
  if (row.read || !isPopupKind(row.type)) return "skip";
  if (Date.parse(row.created_at) < ctx.since) return "skip";
  if (ctx.shown.get(row.id) === row.created_at) return "skip";
  if (row.type === "ClientMessage" && row.link && ctx.path === row.link) return "mark-read";
  return "show";
}

/**
 * A lead link opens the lead's CRM card (the one Voronkalar opens), not the
 * call-analysis page that /crm/leads/<id> shows on its own.
 */
export function crmLeadUrl(link: string): string {
  const lead = leadIdFromLink(link);
  return lead ? `/crm/leads/${lead}?from=funnels` : link;
}
