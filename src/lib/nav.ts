import type { CardTone } from "./tones";
import {
  Settings2,
  Gauge,
  ChartNoAxesCombined,
  AudioWaveform,
  MessageCircleMore,
  SquareKanban,
  LayoutDashboard,
  House,
  Funnel,
  AudioLines,
  Settings,
  ShieldCheck,
  Clock,
  Users,
  Plug,
  Bot,
  MonitorSmartphone,
  GraduationCap,
  Receipt,
  Sparkles,
  type LucideIcon,
  Wallet,
  Handshake,
  MessagesSquare,
  Building2,
  Inbox,
  History,
  Bug,
  LifeBuoy,
  BellRing,
  Megaphone,
  SlidersHorizontal,
  PhoneCall,
} from "lucide-react";
import type { Feature } from "@/lib/plan-gating";
import type { SessionUser } from "@/lib/auth";

// Who a company member is, for deciding what they see. An intern
// (amaliyotchi) is stored as a sotuv_menejeri with is_intern = true, but
// gets a shorter menu than a regular rep: learning first, own data only.
export type AppRole = "intern" | "sotuv_menejeri" | "rop" | "super_admin";

export function appRoleOf(user: Pick<SessionUser, "role" | "isIntern"> | null): AppRole | null {
  if (!user) return null;
  if (user.role === "super_admin" || user.role === "platform_owner") return "super_admin";
  if (user.role === "rop") return "rop";
  return user.isIntern ? "intern" : "sotuv_menejeri";
}

// The page an intern lands on, and where anyone is sent from a page their
// role doesn't open.
export function homePathFor(role: AppRole | null): string {
  return role === "intern" ? "/content-library" : "/";
}

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  // Company roles that see this item. Omitted = every role. Also enforced
  // on the page itself (AppShell redirects a hidden page to home), so a
  // hidden item can't simply be opened by typing its URL.
  roles?: AppRole[];
  // Only when the company's CRM module is on (platform owner's switch).
  // Analytics-only companies don't get the page at all -- nor its data.
  crmOnly?: boolean;
  // Only the platform operator (role: platform_owner) sees this item —
  // they belong to no single company, so every other nav item (which
  // shows a company's own CRM data) is hidden from them instead.
  platformOwnerOnly?: boolean;
  badge?: string;
  group?: "general" | "analysis" | "control";
  // The item stays visible and clickable regardless of plan (the target
  // page itself shows the real upsell via <PlanGate>) — this only tells
  // AppSidebar to render a small lock badge as an early hint.
  minFeature?: Feature;
  // Icon color in the sidebar (and anywhere else the item's icon shows).
  tone: CardTone;
  // An extra module (MODULE_NAV_ITEMS): in the sidebar only when the
  // company pins it (see sidebar-config.ts); otherwise reached from the
  // Admin panel or another page.
  optional?: boolean;
  // Platform owner menu: which group of OwnerSidebar the item sits in.
  ownerGroup?: "business" | "control" | "comms" | "system";
};

// Sidebar is intentionally a short, fixed list — everything else (Leads,
// Contacts, Companies, Deals, Inbox, CRM Stages, Integrations) is reached
// from within these pages rather than getting its own nav slot.
const REP_UP: AppRole[] = ["sotuv_menejeri", "rop", "super_admin"];
const MANAGERS: AppRole[] = ["rop", "super_admin"];

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Home",
    to: "/",
    tone: "primary",
    icon: LayoutDashboard,
    group: "general",
    roles: REP_UP,
  },
  {
    label: "Funnels",
    to: "/funnels",
    tone: "violet",
    icon: SquareKanban,
    group: "general",
    crmOnly: true,
  },
  {
    label: "Inbox",
    to: "/inbox",
    tone: "sky",
    icon: MessageCircleMore,
    group: "general",
    crmOnly: true,
    roles: REP_UP,
  },
  {
    label: "Phone",
    to: "/phone",
    tone: "emerald",
    icon: PhoneCall,
    group: "general",
    crmOnly: true,
    roles: REP_UP,
    minFeature: "telephony",
  },
  {
    label: "Audio Analytics",
    to: "/audio-analytics",
    tone: "rose",
    icon: AudioWaveform,
    group: "analysis",
    minFeature: "analytics",
  },
  {
    label: "Lead Analytics",
    to: "/lead-analytics",
    tone: "emerald",
    icon: ChartNoAxesCombined,
    group: "analysis",
    minFeature: "analytics",
    roles: MANAGERS,
  },
  {
    label: "Attendance & Quotas",
    to: "/attendance",
    tone: "sky",
    icon: Gauge,
    group: "control",
    roles: REP_UP,
  },
  { label: "Sinfxona", to: "/content-library", tone: "amber", icon: GraduationCap },
  { label: "AI Assistant", to: "/ai-assistant", tone: "violet", icon: Sparkles },
  { label: "Settings", to: "/settings", tone: "slate", icon: Settings2 },
  {
    label: "Admin Panel",
    to: "/admin",
    tone: "primary",
    icon: ShieldCheck,
    adminOnly: true,
    roles: ["super_admin"],
  },
  // The platform owner's own menu (OwnerSidebar), in four groups.
  {
    label: "Kompaniyalar",
    to: "/platform/companies",
    tone: "sky",
    icon: Building2,
    platformOwnerOnly: true,
    ownerGroup: "business",
  },
  {
    label: "Arizalar",
    to: "/platform/applications",
    tone: "emerald",
    icon: Inbox,
    platformOwnerOnly: true,
    ownerGroup: "business",
  },
  {
    label: "Daromad",
    to: "/platform/revenue",
    tone: "emerald",
    icon: Wallet,
    platformOwnerOnly: true,
    ownerGroup: "business",
  },
  {
    label: "Hamkorlar",
    to: "/platform/partners",
    tone: "amber",
    icon: Handshake,
    platformOwnerOnly: true,
    ownerGroup: "business",
  },
  {
    label: "Tashriflar",
    to: "/platform/sessions",
    tone: "violet",
    icon: MonitorSmartphone,
    platformOwnerOnly: true,
    ownerGroup: "control",
  },
  {
    label: "Amallar",
    to: "/platform/actions",
    tone: "violet",
    icon: History,
    platformOwnerOnly: true,
    ownerGroup: "control",
  },
  {
    label: "Xatolar",
    to: "/platform/errors",
    tone: "rose",
    icon: Bug,
    platformOwnerOnly: true,
    ownerGroup: "control",
  },
  {
    label: "Yordam",
    to: "/platform/support",
    tone: "emerald",
    icon: LifeBuoy,
    platformOwnerOnly: true,
    ownerGroup: "comms",
  },
  {
    label: "So'rovlar",
    to: "/platform/notifications",
    tone: "amber",
    icon: BellRing,
    platformOwnerOnly: true,
    ownerGroup: "comms",
  },
  {
    label: "E'lonlar",
    to: "/platform/announcements",
    tone: "sky",
    icon: Megaphone,
    platformOwnerOnly: true,
    ownerGroup: "comms",
  },
  {
    label: "Botlar",
    to: "/platform/bot",
    tone: "violet",
    icon: Bot,
    platformOwnerOnly: true,
    ownerGroup: "comms",
  },
  {
    label: "Akkauntlar",
    to: "/platform/users",
    tone: "slate",
    icon: Users,
    platformOwnerOnly: true,
    ownerGroup: "system",
  },
  {
    label: "Integratsiya",
    to: "/platform/integrations",
    tone: "sky",
    icon: Plug,
    platformOwnerOnly: true,
    ownerGroup: "system",
  },

  {
    label: "Sozlamalar",
    to: "/platform/settings",
    tone: "slate",
    icon: SlidersHorizontal,
    platformOwnerOnly: true,
    ownerGroup: "system",
  },
];

// Pages a company can add to its sidebar (Admin panel → Yon menyu), each
// otherwise reached from the Admin panel or from inside another page.
export const MODULE_NAV_ITEMS: NavItem[] = [
  {
    label: "Invoices",
    to: "/invoices",
    tone: "amber",
    icon: Receipt,
    group: "control",
    crmOnly: true,
    optional: true,
  },
];

/** The extra modules one role may pin (same role / CRM rules as the standard sections). */
export function moduleItemsFor(role: AppRole | null, crmEnabled = true): NavItem[] {
  if (!role) return [];
  return MODULE_NAV_ITEMS.filter(
    (i) => (!i.roles || i.roles.includes(role)) && (crmEnabled || !i.crmOnly),
  );
}

// The company nav as one role sees it (platform-owner items excluded).
export function navItemsFor(role: AppRole | null, crmEnabled = true): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter(
    (i) =>
      !i.platformOwnerOnly && (!i.roles || i.roles.includes(role)) && (crmEnabled || !i.crmOnly),
  );
}

// CRM work pages: the funnel board and the lead / contact / company
// registers. With the CRM module off they don't open at all. A single
// lead's page (/crm/leads/<id>) stays: Audio tahlil links to it.
const CRM_ONLY_PATHS = ["/funnels"];

function isCrmOnlyPath(pathname: string): boolean {
  if (pathname === "/crm/leads" || pathname === "/crm/leads/") return true;
  return CRM_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// False when `pathname` is a nav page (or a page under one) this role
// doesn't get. Pages outside the nav (lead cards, inbox...) and the admin
// sub-pages aren't decided here -- they keep their own checks, since a ROP
// does open a few of those (automations, salesbots).
export function canOpenPath(role: AppRole | null, pathname: string, crmEnabled = true): boolean {
  if (!role) return true;
  if (!crmEnabled && isCrmOnlyPath(pathname)) return false;
  const item =
    NAV_ITEMS.find((i) => i.to === pathname) ??
    NAV_ITEMS.find((i) => i.to !== "/" && i.to !== "/admin" && pathname.startsWith(i.to + "/"));
  return !item?.roles || item.roles.includes(role);
}

// Every path here has a matching `nav.<path>` key in src/lib/i18n.tsx --
// broader than NAV_ITEMS (which is only the sidebar's own short list),
// since this also covers pages reached from inside another page rather
// than from the sidebar (e.g. /crm/leads, /integrations). Used to name a
// path a user is returning to (see AdminBackLink) when it isn't itself a
// sidebar entry. Ordered longest-prefix-first so a match like
// "/platform/users" is tried before the shorter "/platform".
export const NAV_LABEL_PATHS: string[] = [
  "/platform/companies",
  "/platform/users",
  "/platform/integrations",
  "/platform/ai",
  "/platform/errors",
  "/platform/sessions",
  "/platform/visit",
  "/platform/support",
  "/platform/bot",
  "/platform/notifications",
  "/platform/applications",
  "/platform/actions",
  "/platform/announcements",
  "/platform/settings",
  "/platform",
  "/funnels",
  "/lead-analytics",
  "/analytics",
  "/inbox",
  "/audio-analytics",
  "/attendance",
  "/refunds",
  "/integrations",
  "/settings",
  "/admin",
  "/ai-assistant",
  "/rollout-plan",
  "/help",
  "/content-library",
  "/",
];
