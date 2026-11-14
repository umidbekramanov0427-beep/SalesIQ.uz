import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BarChart3,
  Check,
  Columns2,
  PanelLeft,
  PanelTop,
  Grid3x3,
  Headphones,
  History,
  LayoutGrid,
  Megaphone,
  PhoneCall,
  PhoneForwarded,
  SlidersHorizontal,
  Star,
  type LucideIcon,
} from "lucide-react";
import { IconTile, PageHeader, StatusChip, type CardTone } from "@/components/layout/Primitives";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CallAnalytics } from "@/components/phone/CallAnalytics";
import { CallHistoryPanel } from "@/components/phone/PhoneProvider";
import { useCallSettings, usePhoneCenter } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { sectionVisible } from "@/lib/call-settings";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AutoDialer } from "./AutoDialer";
import {
  CallsSection,
  DialerSection,
  OperatorsSection,
  OverviewSection,
  RatingSection,
} from "./Sections";
import { VoiceMessage } from "./VoiceMessage";

// Telefon (5TEL's functions in the platform's look): one page with every
// calling tool -- the dialer, the call log, all calls, reports, operators,
// voice messages to clients' Telegram, the autodialer and AI call scores.
// Everything to set up (connection, rules, the desktop app) is in Admin →
// Qo'ng'iroq sozlamalari (/admin/call-settings). Calls go out through the
// company's PBX (click-to-call): it rings the salesperson's own phone or
// SIP line first, then the client.

export const PC_SECTIONS = [
  "main",
  "dial",
  "log",
  "calls",
  "reports",
  "operators",
  "auto",
  "voice",
  "rating",
] as const;
export type PcSection = (typeof PC_SECTIONS)[number];

const ICON: Record<PcSection, [LucideIcon, CardTone]> = {
  main: [LayoutGrid, "primary"],
  dial: [Grid3x3, "emerald"],
  log: [History, "sky"],
  calls: [PhoneCall, "emerald"],
  reports: [BarChart3, "violet"],
  operators: [Headphones, "amber"],
  auto: [PhoneForwarded, "rose"],
  voice: [Megaphone, "sky"],
  rating: [Star, "amber"],
};

const TONE_ICON: Record<CardTone, string> = {
  primary: "text-primary",
  emerald: "text-emerald-600 dark:text-emerald-400",
  sky: "text-sky-600 dark:text-sky-400",
  violet: "text-violet-600 dark:text-violet-400",
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
  slate: "text-slate-500 dark:text-slate-400",
};

export type PcPeriodKey = "today" | "week" | "month";
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function pcPeriod(key: PcPeriodKey, now = new Date()) {
  const back = key === "today" ? 0 : key === "week" ? 6 : 29;
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
  return { from: ymd(from), to: ymd(now) };
}

export function PhoneCenterPage({
  section,
  onSection,
  onClose,
}: {
  section: PcSection;
  onSection: (s: PcSection) => void;
  /** Opened over a page (the funnel's phone button): the window's close. */
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { value: callRules } = useCallSettings();
  const [periodKey, setPeriodKey] = useState<PcPeriodKey>(callRules.period);
  useEffect(() => setPeriodKey(callRules.period), [callRules.period]);
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  // Sections an admin hid from salespeople (Qo'ng'iroq sozlamalari).
  const sections = PC_SECTIONS.filter((s) => sectionVisible(s, user?.role, callRules));
  const period = useMemo(() => pcPeriod(periodKey), [periodKey]);
  const { data, isLoading, error } = usePhoneCenter(period);
  const connected = !!data?.provider?.connected;
  const withPeriod =
    section === "main" || section === "calls" || section === "operators" || section === "rating";

  const [layout, setLayout] = usePcLayout();

  const content = (
    <div key={section} className={cn("tab-enter min-w-0", section === "log" && "h-full")}>
      {section === "log" ? (
        <CallHistoryPanel embedded onClose={onClose ?? (() => {})} />
      ) : section === "reports" ? (
        <div className="surface-card overflow-hidden">
          <CallAnalytics />
        </div>
      ) : section === "dial" ? (
        <DialerSection data={data} />
      ) : section === "auto" ? (
        <AutoDialer connected={connected} />
      ) : section === "voice" ? (
        <VoiceMessage />
      ) : (
        <PeriodSections
          section={section}
          data={data}
          isLoading={isLoading}
          error={error}
          onSection={onSection}
        />
      )}
    </div>
  );

  const badge = (s: PcSection) =>
    s === "calls" && data && data.totals.missed > 0 ? (
      <span className="rounded-full bg-rose-500/12 px-1.5 text-[11px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">
        {data.totals.missed}
      </span>
    ) : null;

  // Tabs in the platform's track (the «Tablar» and «Terish paneli» layouts).
  const tabRow = (list: readonly PcSection[]) => (
    <div
      role="tablist"
      className="ctl-track flex shrink-0 items-center gap-1 overflow-x-auto rounded-2xl p-1 [scrollbar-width:none]"
    >
      {list.map((s) => {
        const [Icon, tone] = ICON[s];
        const on = s === section;
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={on}
            data-state={on ? "active" : "inactive"}
            onClick={() => onSection(s)}
            className="ctl-tab inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold"
          >
            <Icon className={cn("h-4 w-4", !on && TONE_ICON[tone])} />
            {t(`ptel.s.${s}`)}
            {badge(s)}
          </button>
        );
      })}
    </div>
  );

  // The page holds still: the header and the section list stay where they
  // are; only the section's own content scrolls (no bounce dragging the
  // menu along).
  const scroll = (node: ReactNode) => (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 pr-1 phone:overflow-visible phone:pr-0">
      {node}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 phone:h-auto">
      <PageHeader
        back={!onClose}
        title={t("ptel.title")}
        description={t("ptel.subtitle")}
        icon={PhoneCall}
        tone="emerald"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {data &&
              (() => {
                const chip = (
                  <StatusChip state={connected ? "ok" : "warn"}>
                    {connected
                      ? t("ptel.connectedTo", {
                          name: t(`ptel.provider.${data.provider!.id}`),
                        })
                      : t("ptel.notConnected")}
                  </StatusChip>
                );
                return isAdmin ? (
                  <Link to="/admin/call-settings" title={t("callSet.title")}>
                    {chip}
                  </Link>
                ) : (
                  chip
                );
              })()}
            {isAdmin && (
              <Link
                to="/admin/call-settings"
                className="ctl-soft inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {t("callSet.title")}
              </Link>
            )}
            {data?.myExtension && (
              <span className="rounded-lg border border-border bg-card px-2.5 py-1 text-[12.5px] font-semibold tabular-nums text-foreground">
                {t("ptel.ext", { n: data.myExtension })}
              </span>
            )}
            {withPeriod && (
              <div
                role="tablist"
                className="ctl-track inline-flex items-center gap-0.5 rounded-xl p-0.5"
              >
                {(["today", "week", "month"] as PcPeriodKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={periodKey === k}
                    data-state={periodKey === k ? "active" : "inactive"}
                    onClick={() => setPeriodKey(k)}
                    className="ctl-tab h-8 rounded-lg px-3 text-[12.5px] font-semibold"
                  >
                    {t(`ptel.period.${k}`)}
                  </button>
                ))}
              </div>
            )}
            <LayoutPicker value={layout} onChange={setLayout} />
          </div>
        }
      />

      {layout === "rail" && (
        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] gap-4 phone:grid-cols-1">
          <nav
            aria-label={t("ptel.title")}
            className="surface-card max-h-full self-start overflow-y-auto p-1.5 phone:flex phone:gap-1 phone:overflow-x-auto phone:[scrollbar-width:none]"
          >
            {sections.map((s) => {
              const [Icon, tone] = ICON[s];
              const on = s === section;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSection(s)}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium transition-colors phone:w-auto phone:shrink-0 phone:whitespace-nowrap",
                    on
                      ? "bg-sidebar-active font-semibold text-sidebar-active-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", TONE_ICON[tone])} />
                  <span className="min-w-0 flex-1 truncate">{t(`ptel.s.${s}`)}</span>
                  {badge(s)}
                </button>
              );
            })}
          </nav>
          {scroll(content)}
        </div>
      )}

      {layout === "tabs" && (
        <>
          {tabRow(sections)}
          {scroll(content)}
        </>
      )}

      {layout === "hub" &&
        (section === "main" ? (
          scroll(
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3 phone:grid-cols-2">
                {sections
                  .filter((s) => s !== "main")
                  .map((s) => {
                    const [Icon, tone] = ICON[s];
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onSection(s)}
                        className="surface-card group flex items-start gap-3 p-4 text-left transition-colors hover:border-primary/40"
                      >
                        <IconTile icon={Icon} tone={tone} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
                            {t(`ptel.s.${s}`)}
                            {badge(s)}
                          </span>
                          <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                            {t(`ptel.d.${s}`)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
              </div>
              {content}
            </div>,
          )
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => onSection("main")}
                className="ctl-soft inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("ptel.allSections")}
              </button>
              <span className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
                {(() => {
                  const [Icon, tone] = ICON[section];
                  return <IconTile icon={Icon} tone={tone} size="sm" />;
                })()}
                {t(`ptel.s.${section}`)}
              </span>
            </div>
            {scroll(content)}
          </>
        ))}

      {layout === "dock" && (
        <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] gap-4 phone:grid-cols-1">
          <div className="min-h-0 overflow-y-auto overscroll-contain phone:overflow-visible">
            <DialerSection data={data} compact />
          </div>
          <div className="flex min-h-0 flex-col gap-3">
            {tabRow(sections.filter((s) => s !== "dial"))}
            {scroll(
              section === "dial" ? (
                <PeriodSections
                  section="main"
                  data={data}
                  isLoading={isLoading}
                  error={error}
                  onSection={onSection}
                />
              ) : (
                content
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export type PcLayout = "rail" | "tabs" | "hub" | "dock";
const LAYOUTS: { id: PcLayout; icon: LucideIcon }[] = [
  { id: "rail", icon: PanelLeft },
  { id: "tabs", icon: PanelTop },
  { id: "hub", icon: LayoutGrid },
  { id: "dock", icon: Columns2 },
];
const LAYOUT_STORE = "phone.layout.v1";

/** The page's look, per person (this browser). */
function usePcLayout(): [PcLayout, (v: PcLayout) => void] {
  const [v, setV] = useState<PcLayout>("rail");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORE) as PcLayout | null;
      if (saved && LAYOUTS.some((l) => l.id === saved)) setV(saved);
    } catch {
      /* private window */
    }
  }, []);
  return [
    v,
    (next) => {
      setV(next);
      try {
        localStorage.setItem(LAYOUT_STORE, next);
      } catch {
        /* private window */
      }
    },
  ];
}

/** «Ko'rinish»: four ways to lay the page out. */
function LayoutPicker({ value, onChange }: { value: PcLayout; onChange: (v: PcLayout) => void }) {
  const { t } = useI18n();
  const Current = LAYOUTS.find((l) => l.id === value)!.icon;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ctl-soft inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold"
        >
          <Current className="h-4 w-4" />
          {t("ptel.layout")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        {LAYOUTS.map((l, k) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onChange(l.id)}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-accent/60",
              value === l.id && "bg-primary/[0.08]",
            )}
          >
            <l.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-foreground">
                {k + 1}. {t(`ptel.layout.${l.id}`)}
              </span>
              <span className="block text-[12px] leading-snug text-muted-foreground">
                {t(`ptel.layout.${l.id}Desc`)}
              </span>
            </span>
            {value === l.id && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function PeriodSections({
  section,
  data,
  isLoading,
  error,
  onSection,
}: {
  section: PcSection;
  data: ReturnType<typeof usePhoneCenter>["data"];
  isLoading: boolean;
  error: unknown;
  onSection: (s: PcSection) => void;
}) {
  const { t } = useI18n();
  if (!data) {
    return (
      <p className="surface-card px-4 py-16 text-center text-[13px] text-muted-foreground">
        {isLoading
          ? t("common.loading")
          : error instanceof Error
            ? error.message
            : t("ptel.failed")}
      </p>
    );
  }
  if (section === "calls") return <CallsSection data={data} />;
  if (section === "operators") return <OperatorsSection data={data} />;
  if (section === "rating") return <RatingSection data={data} />;
  return <OverviewSection data={data} onSection={onSection} />;
}
