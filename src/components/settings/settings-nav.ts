import {
  Bell,
  Bot,
  Building2,
  Calendar,
  ClipboardCheck,
  CreditCard,
  FileBarChart,
  LayoutGrid,
  ListChecks,
  MessageCircle,
  Palette,
  SlidersHorizontal,
  Thermometer,
  TrendingUp,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { appRoleOf } from "@/lib/nav";

export type SettingsSectionKey =
  | "profile"
  | "personalization"
  | "notifications"
  | "workSchedule"
  | "business"
  | "general"
  | "billing"
  | "reportProblem";

export type SettingsNavItem = {
  key: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  to: "/settings" | "/scoring-criteria" | "/daily-report-settings";
  search?: Record<string, string> | undefined;
};

export type SettingsNavGroup = {
  key: "general" | "callAnalysis" | "leadsCrm" | "reports";
  label: string;
  items: SettingsNavItem[];
};

// Everything the Settings area holds, for whoever is signed in:
//  - everyone: their own profile, appearance, and reporting a problem;
//  - ROP: + how the sales team is run (notifications, work schedule,
//    call/lead scoring, daily report);
//  - super admin: + the company itself (business profile, general
//    settings, subscription).
// The settings hub shows it as tiles; every settings page as tabs.
export function useSettingsNav(): SettingsNavGroup[] {
  const { t } = useI18n();
  const { user } = useAuth();
  const role = appRoleOf(user);
  const isAdmin = role === "super_admin";
  const isManager = isAdmin || role === "rop";

  const section = (
    key: SettingsSectionKey,
    icon: LucideIcon,
    label: string,
    desc: string,
  ): SettingsNavItem => ({ key, icon, label, desc, to: "/settings", search: { section: key } });
  const scoring = (
    tab: string,
    icon: LucideIcon,
    label: string,
    desc: string,
  ): SettingsNavItem => ({
    key: tab,
    icon,
    label,
    desc,
    to: "/scoring-criteria",
    search: { tab },
  });

  const general: SettingsNavItem[] = [
    section("profile", Users, t("settings.nav.profile"), t("settings.tile.profile")),
    section(
      "personalization",
      Palette,
      t("settings.nav.personalization"),
      t("settings.tile.personalization"),
    ),
    ...(isManager
      ? [
          section(
            "notifications",
            Bell,
            t("settings.nav.notifications"),
            t("settings.tile.notifications"),
          ),
          section(
            "workSchedule",
            Calendar,
            t("settings.nav.workSchedule"),
            t("settings.tile.workSchedule"),
          ),
        ]
      : []),
    ...(isAdmin
      ? [
          section("business", Building2, t("settings.nav.business"), t("settings.tile.business")),
          section(
            "general",
            SlidersHorizontal,
            t("settings.nav.general"),
            t("settings.tile.general"),
          ),
          section("billing", CreditCard, t("trial.subscribe"), t("settings.tile.billing")),
        ]
      : []),
    section(
      "reportProblem",
      MessageCircle,
      t("settings.nav.reportProblem"),
      t("settings.tile.reportProblem"),
    ),
  ];

  return [
    { key: "general", label: t("settings.navGroup.general"), items: general },
    ...(isManager
      ? ([
          {
            key: "callAnalysis",
            label: t("settings.navGroup.callAnalysis"),
            items: [
              scoring(
                "rubric",
                ClipboardCheck,
                t("settings.nav.scoringCriteria"),
                t("settings.tile.rubric"),
              ),
              scoring(
                "intake",
                ListChecks,
                t("settings.nav.scoringIntake"),
                t("settings.tile.intake"),
              ),
              scoring(
                "services",
                Workflow,
                t("settings.nav.scoringServices"),
                t("settings.tile.services"),
              ),
              scoring(
                "families",
                LayoutGrid,
                t("settings.nav.scoringFamilies"),
                t("settings.tile.families"),
              ),
              scoring(
                "aiInstructions",
                Bot,
                t("settings.nav.scoringAiInstructions"),
                t("settings.tile.aiInstructions"),
              ),
            ],
          },
          {
            key: "leadsCrm",
            label: t("settings.navGroup.leadsAndCrm"),
            items: [
              scoring(
                "leadQuality",
                Thermometer,
                t("settings.nav.scoringLeadQuality"),
                t("settings.tile.leadQuality"),
              ),
              scoring(
                "outcomes",
                TrendingUp,
                t("settings.nav.scoringOutcomes"),
                t("settings.tile.outcomes"),
              ),
              scoring(
                "leadAnalytics",
                FileBarChart,
                t("settings.nav.scoringLeadAnalytics"),
                t("settings.tile.leadAnalytics"),
              ),
            ],
          },
          {
            key: "reports",
            label: t("settings.navGroup.reports"),
            items: [
              {
                key: "dailyReport",
                icon: FileBarChart,
                label: t("settings.nav.dailyReportSettings"),
                desc: t("settings.tile.dailyReport"),
                to: "/daily-report-settings",
              },
            ],
          },
        ] satisfies SettingsNavGroup[])
      : []),
  ];
}
