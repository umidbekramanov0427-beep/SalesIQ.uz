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
};

// Sidebar is intentionally a short, fixed list — everything else (Leads,
// Contacts, Companies, Deals, Inbox, CRM Stages, Integrations) is reached
// from within these pages rather than getting its own nav slot.
export const NAV_ITEMS: NavItem[] = [
  { label: "Leaderboard", to: "/", icon: Trophy, group: "general" },
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, group: "general" },
  { label: "Daily Report", to: "/daily-report", icon: FileBarChart, group: "general" },
  { label: "Funnels", to: "/funnels", icon: Workflow, group: "general" },
  { label: "Audio Analytics", to: "/audio-analytics", icon: AudioLines, group: "analysis" },
  { label: "Lead Analytics", to: "/lead-analytics", icon: Target, group: "analysis" },
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
