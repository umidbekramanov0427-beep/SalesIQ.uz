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

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  adminOnly?: boolean;
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
};

// Sidebar is intentionally a short, fixed list — everything else (Leads,
// Contacts, Companies, Deals, Inbox, CRM Stages, Integrations) is reached
// from within these pages rather than getting its own nav slot.
export const NAV_ITEMS: NavItem[] = [
  { label: "Leaderboard", to: "/", icon: Trophy, group: "general" },
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, group: "general" },
  {
    label: "Daily Report",
    to: "/daily-report",
    icon: FileBarChart,
    group: "general",
    minFeature: "analytics",
  },
  { label: "Funnels", to: "/funnels", icon: Workflow, group: "general" },
  {
    label: "Audio Analytics",
    to: "/audio-analytics",
    icon: AudioLines,
    group: "analysis",
    minFeature: "analytics",
  },
  {
    label: "Lead Analytics",
    to: "/lead-analytics",
    icon: Target,
    group: "analysis",
    minFeature: "analytics",
  },
  {
    label: "Amalga oshirish rejasi",
    to: "/rollout-plan",
    icon: ListChecks,
    // Replaces the old company-wide "Important Tasks" board — a phased
    // implementation checklist (day/week, phase, weight, status) the
    // company's own super_admin runs after logging into their own org,
    // not a platform_owner cross-company tool.
    adminOnly: true,
    group: "control",
  },
  { label: "Attendance & Quotas", to: "/attendance", icon: Clock, group: "control" },
  { label: "AI Assistant", to: "/ai-assistant", icon: Sparkles },
  { label: "Sinfxona", to: "/content-library", icon: BookOpen },
  { label: "Settings", to: "/settings", icon: Settings },
  { label: "Admin Panel", to: "/admin", icon: ShieldCheck, adminOnly: true },
  {
    label: "Kompaniyalar",
    to: "/platform/companies",
    icon: LayoutGrid,
    platformOwnerOnly: true,
  },
  { label: "Platform", to: "/platform", icon: Building2, platformOwnerOnly: true },
  { label: "Users", to: "/platform/users", icon: Users, platformOwnerOnly: true },
  {
    label: "Integrations",
    to: "/platform/integrations",
    icon: Plug,
    platformOwnerOnly: true,
  },
  { label: "AI Settings", to: "/platform/ai", icon: Bot, platformOwnerOnly: true },
  { label: "Errors", to: "/platform/errors", icon: AlertTriangle, platformOwnerOnly: true },
  {
    label: "Activity Log",
    to: "/platform/activity",
    icon: History,
    platformOwnerOnly: true,
  },
  {
    label: "Notifications",
    to: "/platform/notifications",
    icon: Bell,
    platformOwnerOnly: true,
  },
];

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
