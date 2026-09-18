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
  // Tailwind text-color utility applied to the icon when the item is not
  // the active route, so each item reads as its own thing at a glance
  // instead of a wall of identical muted icons.
  iconColor?: string;
};

// Sidebar is intentionally a short, fixed list — everything else (Leads,
// Contacts, Companies, Deals, Inbox, CRM Stages, Integrations) is reached
// from within these pages rather than getting its own nav slot.
export const NAV_ITEMS: NavItem[] = [
  { label: "Leaderboard", to: "/", icon: Trophy, group: "general", iconColor: "text-cyan-500" },
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    group: "general",
    iconColor: "text-sky-500",
  },
  {
    label: "Daily Report",
    to: "/daily-report",
    icon: FileBarChart,
    group: "general",
    iconColor: "text-blue-500",
  },
  {
    label: "Funnels",
    to: "/funnels",
    icon: Workflow,
    group: "general",
    iconColor: "text-blue-400",
  },
  {
    label: "Audio Analytics",
    to: "/audio-analytics",
    icon: AudioLines,
    group: "analysis",
    iconColor: "text-indigo-500",
  },
  {
    label: "Lead Analytics",
    to: "/lead-analytics",
    icon: Target,
    group: "analysis",
    iconColor: "text-indigo-400",
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
    iconColor: "text-violet-500",
  },
  {
    label: "Attendance & Quotas",
    to: "/attendance",
    icon: Clock,
    group: "control",
    iconColor: "text-violet-400",
  },
  { label: "AI Assistant", to: "/ai-assistant", icon: Sparkles, iconColor: "text-purple-500" },
  {
    label: "Sinfxona",
    to: "/content-library",
    icon: BookOpen,
    iconColor: "text-cyan-500",
  },
  { label: "Settings", to: "/settings", icon: Settings },
  {
    label: "Admin Panel",
    to: "/admin",
    icon: ShieldCheck,
    adminOnly: true,
    iconColor: "text-sky-500",
  },
  {
    label: "Kompaniyalar",
    to: "/platform/companies",
    icon: LayoutGrid,
    platformOwnerOnly: true,
    iconColor: "text-blue-500",
  },
  {
    label: "Platform",
    to: "/platform",
    icon: Building2,
    platformOwnerOnly: true,
    iconColor: "text-blue-400",
  },
  {
    label: "Users",
    to: "/platform/users",
    icon: Users,
    platformOwnerOnly: true,
    iconColor: "text-indigo-500",
  },
  {
    label: "Integrations",
    to: "/platform/integrations",
    icon: Plug,
    platformOwnerOnly: true,
    iconColor: "text-indigo-400",
  },
  {
    label: "AI Settings",
    to: "/platform/ai",
    icon: Bot,
    platformOwnerOnly: true,
    iconColor: "text-violet-500",
  },
  {
    label: "Errors",
    to: "/platform/errors",
    icon: AlertTriangle,
    platformOwnerOnly: true,
    iconColor: "text-violet-400",
  },
  {
    label: "Activity Log",
    to: "/platform/activity",
    icon: History,
    platformOwnerOnly: true,
    iconColor: "text-purple-500",
  },
  {
    label: "Notifications",
    to: "/platform/notifications",
    icon: Bell,
    platformOwnerOnly: true,
    iconColor: "text-cyan-500",
  },
];
