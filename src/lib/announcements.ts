import type { OrgPhase } from "@/lib/org-access";

// Owner → E'lonlar: which announcements a company sees. Pure, so it is
// unit-tested; the server (announcements.active.ts) feeds it the rows and
// the company's phase.

export const ANNOUNCEMENT_KINDS = ["update", "payment", "news", "reminder", "warning"] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

export const AUDIENCES = ["all", "trial", "paid", "expired", "orgs"] as const;
export type Audience = (typeof AUDIENCES)[number];

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  kind: string;
  audience: string;
  org_ids: string[] | null;
  link_url: string | null;
  link_label: string | null;
  dismissible: boolean;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
};

/** Whether this announcement is meant for this company right now. */
export function announcementApplies(
  a: AnnouncementRow,
  org: { id: string; phase: OrgPhase },
  now: Date = new Date(),
): boolean {
  if (!a.active) return false;
  const t = now.getTime();
  if (new Date(a.starts_at).getTime() > t) return false;
  if (a.ends_at && new Date(a.ends_at).getTime() <= t) return false;
  switch (a.audience) {
    case "all":
      return true;
    case "trial":
    case "paid":
    case "expired":
      return org.phase === a.audience;
    case "orgs":
      return (a.org_ids ?? []).includes(org.id);
    default:
      return false;
  }
}

/** The banners a person sees: applicable, not dismissed, warnings first, newest first. */
export function visibleAnnouncements(
  rows: AnnouncementRow[],
  org: { id: string; phase: OrgPhase },
  dismissed: Set<string>,
  now: Date = new Date(),
): AnnouncementRow[] {
  const rank: Record<string, number> = { warning: 0, payment: 1, reminder: 2, update: 3, news: 4 };
  return rows
    .filter((a) => announcementApplies(a, org, now) && !(a.dismissible && dismissed.has(a.id)))
    .sort(
      (a, b) =>
        (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) ||
        new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
    );
}

/** The Telegram text of an announcement (HTML). */
export function announcementTelegramText(
  a: Pick<AnnouncementRow, "title" | "body" | "link_url" | "link_label">,
  kindLabel: string,
): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const parts = [`📣 <b>${esc(kindLabel)}: ${esc(a.title)}</b>`];
  if (a.body.trim()) parts.push(esc(a.body.trim()));
  if (a.link_url) parts.push(`<a href="${esc(a.link_url)}">${esc(a.link_label || a.link_url)}</a>`);
  return parts.join("\n\n");
}
