import { useMemo, useState } from "react";
import {
  BarChart3,
  Cable,
  Grid3x3,
  Headphones,
  History,
  LayoutGrid,
  Megaphone,
  MonitorDown,
  PhoneCall,
  PhoneForwarded,
  Settings,
  Star,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, StatusChip, type CardTone } from "@/components/layout/Primitives";
import { CallAnalytics } from "@/components/phone/CallAnalytics";
import { CallHistoryPanel } from "@/components/phone/PhoneProvider";
import { usePhoneCenter } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AutoDialer } from "./AutoDialer";
import {
  CallsSection,
  ConnectSection,
  DesktopSection,
  DialerSection,
  OperatorsSection,
  OverviewSection,
  RatingSection,
  SettingsSection,
} from "./Sections";
import { VoiceMessage } from "./VoiceMessage";

// Telefon (5TEL's functions in the platform's look): one page with every
// phone tool -- the dialer, the call log, all calls, reports, operators,
// settings and connection, voice messages to clients' Telegram, the
// autodialer, AI call scores and the desktop app. Calls go out through the
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
  "connect",
  "settings",
  "desktop",
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
  connect: [Cable, "slate"],
  settings: [Settings, "slate"],
  desktop: [MonitorDown, "primary"],
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
}: {
  section: PcSection;
  onSection: (s: PcSection) => void;
}) {
  const { t } = useI18n();
  const [periodKey, setPeriodKey] = useState<PcPeriodKey>("today");
  const period = useMemo(() => pcPeriod(periodKey), [periodKey]);
  const { data, isLoading, error } = usePhoneCenter(period);
  const connected = !!data?.provider?.connected;
  const withPeriod =
    section === "main" || section === "calls" || section === "operators" || section === "rating";

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("ptel.title")}
        description={t("ptel.subtitle")}
        icon={PhoneCall}
        tone="emerald"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {data && (
              <StatusChip state={connected ? "ok" : "warn"}>
                {connected
                  ? t("ptel.connectedTo", {
                      name: t(`ptel.provider.${data.provider!.id}`),
                    })
                  : t("ptel.notConnected")}
              </StatusChip>
            )}
            {data?.myExtension && (
              <span className="rounded-[6px] border border-border bg-card px-2.5 py-1 text-[12.5px] font-semibold tabular-nums text-foreground">
                {t("ptel.ext", { n: data.myExtension })}
              </span>
            )}
            {withPeriod && (
              <div
                role="tablist"
                className="ctl-track inline-flex items-center gap-0.5 rounded-[6px] p-0.5"
              >
                {(["today", "week", "month"] as PcPeriodKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={periodKey === k}
                    data-state={periodKey === k ? "active" : "inactive"}
                    onClick={() => setPeriodKey(k)}
                    className="ctl-tab h-8 rounded-[4px] px-3 text-[12.5px] font-semibold"
                  >
                    {t(`ptel.period.${k}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-[220px_minmax(0,1fr)] items-start gap-4 phone:grid-cols-1">
        <nav
          aria-label={t("ptel.title")}
          className="sticky top-2 rounded-[8px] border border-border bg-card p-1.5 phone:static phone:flex phone:gap-1 phone:overflow-x-auto phone:[scrollbar-width:none]"
        >
          {PC_SECTIONS.map((s) => {
            const [Icon, tone] = ICON[s];
            const on = s === section;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onSection(s)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-[13.5px] font-medium transition-colors phone:w-auto phone:shrink-0 phone:whitespace-nowrap",
                  on
                    ? "bg-primary/[0.09] text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", TONE_ICON[tone])} />
                <span className="min-w-0 flex-1 truncate">{t(`ptel.s.${s}`)}</span>
                {s === "calls" && data && data.totals.missed > 0 && (
                  <span className="rounded-full bg-rose-500/12 px-1.5 text-[11px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                    {data.totals.missed}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div key={section} className="tab-enter min-w-0">
          {section === "log" ? (
            <CallHistoryPanel embedded onClose={() => {}} />
          ) : section === "reports" ? (
            <div className="overflow-hidden rounded-[8px] border border-border bg-card">
              <CallAnalytics />
            </div>
          ) : section === "dial" ? (
            <DialerSection data={data} />
          ) : section === "auto" ? (
            <AutoDialer connected={connected} />
          ) : section === "voice" ? (
            <VoiceMessage />
          ) : section === "connect" ? (
            <ConnectSection data={data} />
          ) : section === "settings" ? (
            <SettingsSection />
          ) : section === "desktop" ? (
            <DesktopSection />
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
      </div>
    </div>
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
      <p className="rounded-[8px] border border-border bg-card px-4 py-16 text-center text-[13px] text-muted-foreground">
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
