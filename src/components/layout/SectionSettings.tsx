import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlarmClock,
  Award,
  Bell,
  BellRing,
  Coins,
  Bot,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  FileText,
  HardDrive,
  Lock,
  MessageSquareReply,
  MessageSquareText,
  MessagesSquare,
  Palette,
  Repeat2,
  Send,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TONE_TILE } from "@/lib/tones";
import type { CardTone } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// "Sozlash" on Inbox, Nazorat, Sinfxona and Bosh sahifa: every setting that
// shapes that section, in one side panel -- the ones that fit are switched
// right there (`inline`), the rest open their own page. Admins and heads of
// sales see it; a page's own people don't need it.

export type SettingsSection = "inbox" | "control" | "classroom" | "home";

type LinkEntry = {
  key: string;
  icon: LucideIcon;
  tone: CardTone;
  to: string;
  search?: Record<string, string>;
  /** i18n keys of the name and the one line under it. */
  title: string;
  desc: string;
  /** Only the super admin can change it (others don't see the row). */
  adminOnly?: boolean;
};

const ENTRIES: Record<SettingsSection, LinkEntry[]> = {
  inbox: [
    {
      key: "replyRules",
      icon: AlarmClock,
      tone: "amber",
      to: "/admin/reply-rules",
      title: "hub.item.replyRules.title",
      desc: "hub.item.replyRules.desc",
      adminOnly: true,
    },
    {
      key: "templates",
      icon: MessagesSquare,
      tone: "sky",
      to: "/funnels/settings",
      search: { tab: "templates" },
      title: "fs.tab.templates",
      desc: "secset.templatesDesc",
    },
    {
      key: "autoreplies",
      icon: MessageSquareReply,
      tone: "violet",
      to: "/funnels/settings",
      search: { tab: "autoreplies" },
      title: "fs.tab.autoreplies",
      desc: "secset.autorepliesDesc",
    },
    {
      key: "salesbots",
      icon: Bot,
      tone: "emerald",
      to: "/funnels/settings",
      search: { tab: "salesbots" },
      title: "fs.tab.salesbots",
      desc: "secset.salesbotsDesc",
    },
    {
      key: "followups",
      icon: Repeat2,
      tone: "rose",
      to: "/funnels/settings",
      search: { tab: "followups" },
      title: "fs.tab.followups",
      desc: "secset.followupsDesc",
    },
    {
      key: "telegram",
      icon: Send,
      tone: "sky",
      to: "/daily-report-settings",
      title: "hub.item.telegramLink.title",
      desc: "hub.item.telegramLink.desc",
      adminOnly: true,
    },
    {
      key: "instagram",
      icon: MessageSquareText,
      tone: "rose",
      to: "/integrations/instagram",
      title: "hub.item.instagram.title",
      desc: "hub.item.instagram.desc",
      adminOnly: true,
    },
    {
      key: "files",
      icon: HardDrive,
      tone: "slate",
      to: "/admin/files",
      title: "hub.item.files.title",
      desc: "hub.item.files.desc",
      adminOnly: true,
    },
  ],
  control: [
    {
      key: "attendanceRules",
      icon: UserCheck,
      tone: "sky",
      to: "/admin/attendance",
      title: "hub.item.attendanceRules.title",
      desc: "hub.item.attendanceRules.desc",
      adminOnly: true,
    },
    {
      key: "workSchedule",
      icon: CalendarClock,
      tone: "sky",
      to: "/settings",
      search: { section: "workSchedule" },
      title: "secset.workSchedule",
      desc: "secset.workScheduleDesc",
      adminOnly: true,
    },
    {
      key: "dailyReport",
      icon: FileText,
      tone: "violet",
      to: "/daily-report-settings",
      title: "secset.dailyReport",
      desc: "secset.dailyReportDesc",
      adminOnly: true,
    },
    {
      key: "taskControl",
      icon: ClipboardCheck,
      tone: "amber",
      to: "/funnels/settings",
      search: { tab: "tasks" },
      title: "fs.tab.tasks",
      desc: "secset.taskControlDesc",
    },
    {
      key: "replyRules",
      icon: AlarmClock,
      tone: "rose",
      to: "/admin/reply-rules",
      title: "hub.item.replyRules.title",
      desc: "hub.item.replyRules.desc",
      adminOnly: true,
    },
    {
      key: "normativ",
      icon: Target,
      tone: "emerald",
      to: "/attendance",
      search: { tab: "normativ" },
      title: "attendance.tabNormativ",
      desc: "secset.normativDesc",
      adminOnly: true,
    },
    {
      key: "fines",
      icon: Coins,
      tone: "rose",
      to: "/attendance",
      search: { tab: "jarimalar" },
      title: "attendance.tabJarimalar",
      desc: "secset.finesDesc",
      adminOnly: true,
    },
    {
      key: "kpi",
      icon: Award,
      tone: "amber",
      to: "/attendance",
      search: { tab: "kpi" },
      title: "attendance.tabKpi",
      desc: "secset.kpiDesc",
      adminOnly: true,
    },
    {
      key: "payroll",
      icon: Wallet,
      tone: "violet",
      to: "/attendance",
      search: { tab: "oylik" },
      title: "attendance.tabOylik",
      desc: "secset.payrollDesc",
      adminOnly: true,
    },
    {
      key: "plan",
      icon: TrendingUp,
      tone: "sky",
      to: "/attendance",
      search: { tab: "reja" },
      title: "attendance.tabReja",
      desc: "secset.planDesc",
      adminOnly: true,
    },
    {
      key: "reminders",
      icon: BellRing,
      tone: "amber",
      to: "/attendance",
      search: { tab: "eslatmalar" },
      title: "rem.title",
      desc: "secset.remindersDesc",
    },
    {
      key: "employees",
      icon: Users,
      tone: "emerald",
      to: "/admin/employees",
      title: "hub.item.employees.title",
      desc: "hub.item.employees.desc",
      adminOnly: true,
    },
    {
      key: "permissions",
      icon: Lock,
      tone: "slate",
      to: "/admin/permissions",
      title: "hub.item.permissions.title",
      desc: "hub.item.permissions.desc",
      adminOnly: true,
    },
  ],
  classroom: [
    {
      key: "aiAgents",
      icon: Sparkles,
      tone: "violet",
      to: "/admin/ai-agents",
      title: "hub.item.aiAgents.title",
      desc: "hub.item.aiAgents.desc",
      adminOnly: true,
    },
    {
      key: "aiSetup",
      icon: Sparkles,
      tone: "amber",
      to: "/onboarding/ai-setup",
      title: "hub.item.aiSetup.title",
      desc: "hub.item.aiSetup.desc",
      adminOnly: true,
    },
    {
      key: "employees",
      icon: Users,
      tone: "emerald",
      to: "/admin/employees",
      title: "hub.item.employees.title",
      desc: "secset.internsDesc",
      adminOnly: true,
    },
    {
      key: "permissions",
      icon: Lock,
      tone: "slate",
      to: "/admin/permissions",
      title: "hub.item.permissions.title",
      desc: "hub.item.permissions.desc",
      adminOnly: true,
    },
  ],
  home: [
    {
      key: "notifications",
      icon: Bell,
      tone: "amber",
      to: "/settings",
      search: { section: "notifications" },
      title: "secset.notifications",
      desc: "secset.notificationsDesc",
    },
    {
      key: "personalization",
      icon: Palette,
      tone: "violet",
      to: "/settings",
      search: { section: "personalization" },
      title: "secset.personalization",
      desc: "secset.personalizationDesc",
    },
    {
      key: "dailyReport",
      icon: FileText,
      tone: "sky",
      to: "/daily-report-settings",
      title: "secset.dailyReport",
      desc: "secset.dailyReportDesc",
      adminOnly: true,
    },
  ],
};

/**
 * The "Sozlash" button and its side panel. `inline` is the section's own
 * settings shown right inside the panel (e.g. the after-hours reply for
 * Inbox), `actions` extra buttons at the top (e.g. "arrange the board").
 */
export function SectionSettingsButton({
  section,
  inline,
  actions,
  className,
  compact = false,
}: {
  section: SettingsSection;
  inline?: ReactNode;
  actions?: (close: () => void) => ReactNode;
  className?: string;
  /** Only the icon (narrow places like the Inbox list's header). */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const role = user?.role ?? "";
  const isAdmin = role === "super_admin" || role === "platform_owner";
  if (!isAdmin && role !== "rop") return null;
  const entries = ENTRIES[section].filter((e) => isAdmin || !e.adminOnly);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("secset.button")}
        aria-label={t("secset.button")}
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-border bg-card text-[13px] font-semibold text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.05)] transition-colors hover:border-primary/40 hover:text-primary",
          compact ? "w-9 justify-center" : "px-3.5",
          className,
        )}
      >
        <Settings2 className="h-4 w-4" />
        {!compact && t("secset.button")}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[460px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              {t(`secset.title.${section}`)}
            </SheetTitle>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {t(`secset.desc.${section}`)}
            </p>
          </SheetHeader>
          <div className="mt-5 space-y-4">
            {actions && <div className="flex flex-wrap gap-2">{actions(() => setOpen(false))}</div>}
            {inline && <div className="space-y-3">{inline}</div>}
            {entries.length > 0 && (
              <div>
                <p className="console-caption mb-2">{t("secset.more")}</p>
                <ul className="space-y-2">
                  {entries.map((e) => (
                    <li key={e.key}>
                      <Link
                        to={e.to}
                        search={(e.search ?? {}) as never}
                        onClick={() => setOpen(false)}
                        className="group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40"
                      >
                        <span
                          className={cn(
                            "icon-tile grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                            TONE_TILE[e.tone],
                          )}
                        >
                          <e.icon className="h-[18px] w-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold text-foreground">
                            {t(e.title)}
                          </span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {t(e.desc)}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
