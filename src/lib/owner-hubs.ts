// The owner panel's menu: a few sections, each holding its related pages as
// tabs across the top of the page (Kompaniyalar: companies, accounts,
// integrations; Nazorat: visits, actions, errors ...). The pages keep their
// own addresses; only the menu and the tab row are built from this.
import { Gauge, Megaphone, type LucideIcon } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import type { CardTone } from "@/lib/tones";

export type OwnerHub = {
  id: string;
  /** Where the menu item leads: its first tab. */
  to: string;
  /** i18n key of the menu item's name. */
  labelKey: string;
  /** A short name for the rail, when the full one is long. */
  railKey?: string;
  icon: LucideIcon;
  tone: CardTone;
  tabs: string[];
};

const item = (to: string) => NAV_ITEMS.find((i) => i.to === to);
const hub = (id: string, tabs: string[], extra?: Partial<OwnerHub>): OwnerHub => {
  const first = item(tabs[0]!);
  return {
    id,
    to: tabs[0]!,
    labelKey: `nav.${tabs[0]}`,
    icon: first?.icon ?? Gauge,
    tone: first?.tone ?? "primary",
    tabs,
    ...extra,
  };
};

/** The rail's sections, top group then bottom group; Sozlamalar sits apart at the bottom. */
export const OWNER_HUBS: OwnerHub[][] = [
  [
    hub("companies", ["/platform/companies", "/platform/users", "/platform/integrations"]),
    hub("applications", ["/platform/applications"]),
    hub("support", ["/platform/support"]),
    hub("revenue", ["/platform/revenue", "/platform/notifications", "/platform/partners"]),
  ],
  [
    hub("control", ["/platform/sessions", "/platform/actions", "/platform/errors"], {
      labelKey: "owner.group.control",
      icon: Gauge,
      tone: "violet",
    }),
    hub("comms", ["/platform/announcements", "/platform/bot"], {
      labelKey: "owner.group.comms",
      icon: Megaphone,
      tone: "sky",
    }),
  ],
];
export const OWNER_SETTINGS_HUB = hub("settings", ["/platform/settings"]);

const ALL_HUBS = [...OWNER_HUBS.flat(), OWNER_SETTINGS_HUB];

/** Pages that belong to a tab without being one (a company's card, a visit). */
const ALIASES: [prefix: string, tab: string][] = [
  ["/platform/organizations", "/platform/companies"],
  ["/platform/usage", "/platform/companies"],
  ["/platform/visit", "/platform/sessions"],
];

/** The section and tab a path belongs to, or null (a page outside the menu). */
export function ownerHubOf(pathname: string): { hub: OwnerHub; tab: string } | null {
  const under = (p: string, base: string) => p === base || p.startsWith(base + "/");
  const alias = ALIASES.find(([prefix]) => under(pathname, prefix));
  const path = alias ? alias[1] : pathname;
  for (const h of ALL_HUBS) {
    const tab = h.tabs.find((t) => under(path, t));
    if (tab) return { hub: h, tab };
  }
  return null;
}
