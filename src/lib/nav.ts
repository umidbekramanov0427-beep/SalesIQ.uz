import type { CardTone } from "./tones";
import {
  Trophy,
  LayoutDashboard,
  FileBarChart,
  Workflow,
  ListChecks,
  AudioLines,
  Settings,
  ShieldCheck,
  Sparkles,
  Clock,
  Building2,
  Users,
  Plug,
  Bot,
  AlertTriangle,
  History,
  Bell,
  Target,
  LayoutGrid,
  BookOpen,
  type LucideIcon,
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
};

// Sidebar is intentionally a short, fixed list — everything else (Leads,
// Contacts, Companies, Deals, Inbox, CRM Stages, Integrations) is reached
// from within these pages rather than getting its own nav slot.
const REP_UP: AppRole[] = ["sotuv_menejeri", "rop", "super_admin"];
const MANAGERS: AppRole[] = ["rop", "super_admin"];

export const NAV_ITEMS: NavItem[] = [
  { label: "Leaderboard", to: "/", tone: "amber", icon: Trophy, group: "general", roles: REP_UP },
  {
    label: "Dashboard",
    to: "/dashboard",
    tone: "primary",
    icon: LayoutDashboard,
    group: "general",
    roles: MANAGERS,
  },
  {
    label: "Daily Report",
    to: "/daily-report",
    tone: "sky",
    icon: FileBarChart,
    group: "general",
    minFeature: "analytics",
    roles: REP_UP,
  },
  {
    label: "Funnels",
    to: "/funnels",
    tone: "violet",
    icon: Workflow,
    group: "general",
    crmOnly: true,
  },
  {
    label: "Audio Analytics",
    to: "/audio-analytics",
    tone: "rose",
    icon: AudioLines,
    group: "analysis",
    minFeature: "analytics",
  },
  {
    label: "Lead Analytics",
    to: "/lead-analytics",
    tone: "emerald",
    icon: Target,
    group: "analysis",
    minFeature: "analytics",
    roles: MANAGERS,
  },
  {
    label: "Amalga oshirish rejasi",
    to: "/rollout-plan",
    tone: "emerald",
    icon: ListChecks,
    // Replaces the old company-wide "Important Tasks" board — a phased
    // implementation checklist (day/week, phase, weight, status) the
    // company's own super_admin runs after logging into their own org,
    // not a platform_owner cross-company tool.
    adminOnly: true,
    roles: ["super_admin"],
    group: "control",
  },
  {
    label: "Attendance & Quotas",
    to: "/attendance",
    tone: "sky",
    icon: Clock,
    group: "control",
    roles: REP_UP,
  },
  { label: "AI Assistant", to: "/ai-assistant", tone: "violet", icon: Sparkles },
  { label: "Sinfxona", to: "/content-library", tone: "amber", icon: BookOpen },
  { label: "Settings", to: "/settings", tone: "slate", icon: Settings },
  {
    label: "Admin Panel",
    to: "/admin",
    tone: "primary",
    icon: ShieldCheck,
    adminOnly: true,
    roles: ["super_admin"],
  },
  {
    label: "Kompaniyalar",
    to: "/platform/companies",
    tone: "sky",
    icon: LayoutGrid,
    platformOwnerOnly: true,
  },
  { label: "Platform", to: "/platform", tone: "primary", icon: Building2, platformOwnerOnly: true },
  { label: "Users", to: "/platform/users", tone: "violet", icon: Users, platformOwnerOnly: true },
  {
    label: "Integrations",
    to: "/platform/integrations",
    tone: "sky",
    icon: Plug,
    platformOwnerOnly: true,
  },
  { label: "AI Settings", to: "/platform/ai", tone: "violet", icon: Bot, platformOwnerOnly: true },
  {
    label: "Errors",
    to: "/platform/errors",
    tone: "rose",
    icon: AlertTriangle,
    platformOwnerOnly: true,
  },
  {
    label: "Activity Log",
    to: "/platform/activity",
    tone: "amber",
    icon: History,
    platformOwnerOnly: true,
  },
  {
    label: "Notifications",
    to: "/platform/notifications",
    tone: "amber",
    icon: Bell,
    platformOwnerOnly: true,
  },
];

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
const CRM_ONLY_PATHS = ["/funnels", "/crm/contacts", "/crm/companies", "/crm-stages"];

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
  "/platform/activity",
  "/platform/notifications",
  "/platform",
  "/crm/leads",
  "/crm/contacts",
  "/crm/companies",
  "/crm/deals",
  "/dashboard",
  "/daily-report",
  "/funnels",
  "/analytics",
  "/lead-analytics",
  "/lead-tasks",
  "/inbox",
  "/crm-stages",
  "/audio-analytics",
  "/attendance",
  "/history",
  "/normatives",
  "/integrations",
  "/settings",
  "/admin",
  "/ai-assistant",
  "/content-library",
  "/",
];
