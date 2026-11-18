// The AI assistant as the platform's guide: the list of pages it may link
// to (built from the search catalog, so a new settings page is known to it
// without editing the prompt), and what it says when it can't solve
// something -- the company admin gets the live Operator tab, everyone else
// the SalesIQ support contact (or their own admin). Pure, unit-tested.
import { SEARCH_CATALOG } from "@/lib/search-catalog";

/** "- [Telefoniya](/admin/telephony) — telephony sip onlinepbx" lines. */
export function pageIndex(dict: Record<string, string>): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const c of SEARCH_CATALOG) {
    const path = c.section ? `${c.to}?section=${c.section}` : c.to;
    if (seen.has(path)) continue;
    seen.add(path);
    const label = dict[c.labelKey] ?? c.labelKey;
    const words = c.keywords.split(/\s+/).slice(0, 8).join(" ");
    lines.push(`- [${label}](${path}) — ${words}`);
  }
  return lines.join("\n");
}

export type SupportContact = { telegram: string | null; phone: string | null };

/** A Telegram username or link -> https://t.me/<name>. */
export function telegramLink(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//.test(v)) return v;
  const name = v.replace(/^@/, "").replace(/^t\.me\//, "");
  return /^[A-Za-z0-9_]{4,64}$/.test(name) ? `https://t.me/${name}` : null;
}

/** The prompt's rules for guiding and for handing off to support. */
export function guideRules(role: string | null, contact: SupportContact): string {
  const tg = telegramLink(contact.telegram);
  const admin = role === "super_admin";
  const handoff = admin
    ? "end your answer with this exact link on its own line: [Operatorga yozish](#operator) -- it opens the live chat with the SalesIQ team inside this window."
    : tg
      ? `end your answer by sending them to SalesIQ support on Telegram with this exact link on its own line: [SalesIQ supportga yozish](${tg})${contact.phone ? ` (phone ${contact.phone})` : ""}, and say their company admin can also help.`
      : "tell them to ask their company admin (super admin), who can reach the SalesIQ team.";
  return [
    "You are also the platform's guide. People ask where something is, how to set something up, or why something doesn't work. For these:",
    "- Answer in short numbered steps that name the exact buttons, and ALWAYS put a clickable link to the page in markdown form [Page name](/path) -- the chat turns it into a button that takes them there. Use only paths from the lists in this prompt.",
    "- When they are setting the platform up, point to the next useful step (team, funnel, Telegram bot, telephony, integrations) with its link, and to the guide [Qo'llanma](/help/<slug>) when a longer explanation helps.",
    "- If the question is about something broken (an error, data not arriving, a payment, access or the account), or you cannot find the answer in the guides, or they ask for a human, say briefly what you understood and " +
      handoff,
    "- Never promise the SalesIQ team will do something by a certain time.",
  ].join("\n");
}
