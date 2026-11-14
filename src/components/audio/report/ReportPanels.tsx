import { lazy, Suspense, useMemo, type ReactNode } from "react";
import {
  CardTools,
  HiddenCard,
  cardStateClass,
  useCardChrome,
  valueStateClass,
} from "@/components/layout/CardTools";
import { FigureCard, FigureLine } from "@/components/layout/Primitives";
import { InfoTip } from "@/components/layout/InfoTip";
import {
  Award,
  ChartBar,
  ChevronRight,
  MessagesSquare,
  Percent,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Timer,
  type LucideIcon,
} from "lucide-react";
import type { CardBoardItem } from "@/components/dashboard/HomeBoard";
import type { CardTone } from "@/lib/tones";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallPickupByHour, type AudioCallView, type CallCardDetail } from "@/hooks/use-crm-data";
import { GRADES, gradeCounts, gradeOf, type Grade } from "@/lib/call-grade";
import { useI18n, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { GradeLetter, SheetHeading, Stamp } from "./ReportControls";
import { formatClock, formatDuration, formatWhen } from "./report-utils";

const PickupHoursChart = lazy(() => import("./PickupHoursChart"));

function talkTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}` : `0:${String(m).padStart(2, "0")}`;
}

const GRADE_BG: Record<Grade, string> = {
  A: "var(--rp-a)",
  B: "var(--rp-b)",
  C: "var(--rp-c)",
  D: "var(--rp-d)",
};

/**
 * The "tabel" across the top as board cards (CardBoard): the period's calls,
 * conversations, pickup rate, talk time, the average grade and how the
 * grades are spread, one card each.
 */
export function useTabelItems(
  calls: AudioCallView[],
  talks: AudioCallView[],
  minTalkSeconds: number,
  loading: boolean,
): CardBoardItem[] {
  const { t } = useI18n();
  const stats = useMemo(() => {
    const scored = calls.filter((c) => c.score != null);
    const avg = scored.length
      ? Math.round(scored.reduce((s, c) => s + (c.score ?? 0), 0) / scored.length)
      : null;
    const connected = calls.filter((c) => c.connected).length;
    const seconds = calls.reduce((s, c) => s + c.durationSeconds, 0);
    return {
      scored: scored.length,
      avg,
      connected,
      seconds,
      counts: gradeCounts(scored.map((c) => c.score)),
    };
  }, [calls]);
  const totalGraded = GRADES.reduce((s, g) => s + stats.counts[g], 0);
  const sheet = "h-full";
  const wait = (node: ReactNode) =>
    loading ? <Skeleton className="h-[104px] w-full rounded-xl" /> : node;
  const cell = (
    id: string,
    icon: LucideIcon,
    tone: CardTone,
    label: string,
    value: string,
    sub: string,
  ): CardBoardItem => ({
    id,
    title: label,
    icon,
    tone,
    node: wait(
      <TabelCell className={sheet} icon={icon} tone={tone} label={label} value={value} sub={sub} />,
    ),
  });
  return [
    cell(
      "calls",
      Phone,
      "sky",
      t("rp.tCalls"),
      String(calls.length),
      t("audio.kpiAnalyzed", { count: stats.scored }),
    ),
    cell(
      "talks",
      MessagesSquare,
      "primary",
      t("rp.tTalks"),
      String(talks.length),
      t("rp.tTalksSub", { min: minTalkSeconds }),
    ),
    cell(
      "connectRate",
      Percent,
      "emerald",
      t("audio.kpiConnectRate"),
      calls.length ? `${Math.round((stats.connected / calls.length) * 100)}%` : "—",
      t("audio.kpiConnectedOf", { count: stats.connected }),
    ),
    cell("talkTime", Timer, "amber", t("rp.tTalkTime"), talkTime(stats.seconds), t("rp.tHours")),
    {
      id: "avgGrade",
      title: t("rp.tAvgGrade"),
      icon: Award,
      tone: "violet",
      span: 4,
      node: wait(
        <FigureCard
          icon={Award}
          tone="violet"
          label={t("rp.tAvgGrade")}
          className={sheet}
          tools={<InfoTip tipKeys={["rp.tAvgGrade"]} title={t("rp.tAvgGrade")} />}
          value={
            <span className="flex items-baseline gap-2">
              <GradeLetter
                grade={stats.avg != null ? gradeOf(stats.avg) : null}
                className="text-[30px]"
              />
              {stats.avg != null && (
                <span className="font-mono text-[15px] font-semibold">{stats.avg}</span>
              )}
            </span>
          }
        >
          <FigureLine>{t("rp.tLow", { count: stats.counts.D })}</FigureLine>
        </FigureCard>,
      ),
    },
    {
      id: "spread",
      title: t("rp.tSpread"),
      icon: ChartBar,
      tone: "rose",
      span: 8,
      sizes: [4, 6, 8, 12],
      node: wait(
        <FigureCard
          icon={ChartBar}
          tone="rose"
          label={t("rp.tSpread")}
          className={sheet}
          tools={<InfoTip tipKeys={["rp.tSpread"]} title={t("rp.tSpread")} />}
          value={
            totalGraded === 0 ? (
              <span className="text-[15px] font-medium text-muted-foreground">
                {t("rp.tNoGrades")}
              </span>
            ) : (
              <div className="mt-1 flex h-[34px] gap-0.5 overflow-hidden rounded-md">
                {GRADES.map((g) =>
                  stats.counts[g] === 0 ? null : (
                    <span
                      key={g}
                      className="grid min-w-[38px] place-items-center text-[14px] font-semibold text-white"
                      style={{
                        width: `${(stats.counts[g] / totalGraded) * 100}%`,
                        background: GRADE_BG[g],
                      }}
                    >
                      {g} {stats.counts[g]}
                    </span>
                  ),
                )}
              </div>
            )
          }
        >
          <FigureLine>A ≥ 80 · B 60–79 · C 40–59 · D &lt; 40</FigureLine>
        </FigureCard>,
      ),
    },
  ];
}

function TabelCell({
  label,
  value,
  sub,
  className,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  className: string;
  icon: LucideIcon;
  tone: CardTone;
}) {
  const chrome = useCardChrome({ label, value });
  if (chrome.hidden) return <HiddenCard chrome={chrome} label={label} />;
  return (
    <FigureCard
      icon={icon}
      tone={tone}
      label={label}
      tools={<CardTools chrome={chrome} label={label} text={sub} />}
      value={value}
      valueClassName={valueStateClass(chrome.state)}
      className={cn(className, cardStateClass(chrome.state))}
    >
      <FigureLine>{sub}</FigureLine>
    </FigureCard>
  );
}

/** "Ro'yxat" view: one call per ruled line, for scanning many at once. */
export function ReportLines({
  calls,
  details,
  lang,
  onOpen,
}: {
  calls: AudioCallView[];
  details: Map<string, CallCardDetail> | undefined;
  lang: Lang;
  onOpen: (call: AudioCallView) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="rp-sheet overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
        <thead>
          <tr className="rp-mute text-left text-[11px] uppercase tracking-[0.08em]">
            <th className="px-3.5 py-2.5 font-bold">{t("rp.colClient")}</th>
            <th className="px-3 py-2.5 font-bold">{t("audio.colManager")}</th>
            <th className="px-3 py-2.5 font-bold">{t("audio.colDate")}</th>
            <th className="px-3 py-2.5 font-bold">{t("audio.colDuration")}</th>
            <th className="px-3 py-2.5 font-bold">{t("rp.colOutcome")}</th>
            <th className="px-3 py-2.5 text-center font-bold">{t("rp.colGrade")}</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => {
            const d = details?.get(c.id);
            const clickable = c.analyzed || !!c.leadId;
            return (
              <tr
                key={c.id}
                onClick={clickable ? () => onOpen(c) : undefined}
                className={cn(
                  "rp-dash",
                  clickable && "cursor-pointer hover:bg-[var(--rp-paper-2)]",
                )}
                style={{ borderTop: "1px dashed var(--rp-rule)" }}
              >
                <td className="max-w-[260px] px-3.5 py-2.5">
                  <p className="truncate font-semibold">
                    {c.leadName || c.company || c.phone || t("audio.noLead")}
                  </p>
                  {d?.summary && <p className="rp-mute truncate text-[12px]">{d.summary}</p>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">{c.owner || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                  {formatWhen(c.occurredAtRaw, lang, {
                    today: t("rp.today"),
                    yesterday: t("rp.yesterday"),
                  })}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    {c.direction === "in" ? (
                      <PhoneIncoming className="h-3 w-3" />
                    ) : (
                      <PhoneOutgoing className="h-3 w-3" />
                    )}
                    {c.durationSeconds > 0 ? formatClock(c.durationSeconds) : "—"}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {d?.outcome ? (
                    <Stamp tone={d.outcome.tone} className="text-[10.5px]">
                      {d.outcome.label}
                    </Stamp>
                  ) : (
                    <span className="rp-mute text-[12.5px]">
                      {c.connected ? t("audio.connected") : t("audio.notConnected")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <GradeLetter
                    grade={c.score != null ? gradeOf(c.score) : null}
                    className="text-[24px]"
                  />
                </td>
                <td className="pr-3">
                  {clickable && <ChevronRight className="rp-mute h-4 w-4" />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type ManagerRow = {
  key: string;
  ownerId: string | null;
  name: string;
  calls: number;
  connected: number;
  seconds: number;
  scores: number[];
};

/** Menejerlar tabeli: a manager's line filters the cards to their calls. */
export function ManagerRegister({
  rows,
  loading,
  selected,
  onSelect,
}: {
  rows: ManagerRow[];
  loading: boolean;
  selected: string;
  onSelect: (ownerId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="mt-9">
      <SheetHeading title={t("rp.registerTitle")} right={t("rp.registerHint")} />
      <div className="rp-sheet mt-3 overflow-x-auto">
        {loading && rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full rounded" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="rp-mute p-4 text-[13.5px]">{t("audio.noCalls")}</p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
            <thead>
              <tr
                className="rp-mute text-left text-[11px] uppercase tracking-[0.08em]"
                style={{ borderBottom: "1px solid var(--rp-strong)" }}
              >
                <th className="px-3.5 py-2.5 font-bold">{t("audio.colManager")}</th>
                <th className="px-3 py-2.5 font-bold">{t("audio.colCalls")}</th>
                <th className="px-3 py-2.5 font-bold">{t("rp.colConnected")}</th>
                <th className="px-3 py-2.5 font-bold">{t("audio.colConnectRate")}</th>
                <th className="px-3 py-2.5 font-bold">{t("audio.colTalkTime")}</th>
                <th className="px-3 py-2.5 font-bold">{t("rp.colGrade")}</th>
                <th className="px-3 py-2.5 font-bold">A · B · C · D</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const avg = r.scores.length
                  ? Math.round(r.scores.reduce((s, x) => s + x, 0) / r.scores.length)
                  : null;
                const counts = gradeCounts(r.scores);
                const on = !!r.ownerId && selected === r.ownerId;
                return (
                  <tr
                    key={r.key}
                    onClick={r.ownerId ? () => onSelect(on ? "" : r.ownerId!) : undefined}
                    className={cn(
                      r.ownerId && "cursor-pointer hover:bg-[var(--rp-paper-2)]",
                      on && "bg-[var(--rp-paper-2)]",
                    )}
                    style={{ borderTop: "1px dashed var(--rp-rule)" }}
                    title={r.ownerId ? t("rp.registerRowHint") : undefined}
                  >
                    <td className="px-3.5 py-2.5 font-bold">
                      {on && <span className="mr-1.5">●</span>}
                      {r.name}
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums">{r.calls}</td>
                    <td className="px-3 py-2.5 font-mono tabular-nums">{r.connected}</td>
                    <td className="px-3 py-2.5 font-mono tabular-nums">
                      {r.calls ? Math.round((r.connected / r.calls) * 100) : 0}%
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums">{formatClock(r.seconds)}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-baseline gap-1.5">
                        <GradeLetter
                          grade={avg != null ? gradeOf(avg) : null}
                          className="text-[22px]"
                        />
                        {avg != null && (
                          <span className="rp-mute font-mono text-[12px]">{avg}</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2 font-mono text-[12px]">
                        {GRADES.map((g) => (
                          <span key={g} className={cn("inline-flex items-center gap-1", `rp-${g}`)}>
                            <i
                              className="inline-block h-3 w-3 rounded-[3px]"
                              style={{
                                background: GRADE_BG[g],
                                opacity: counts[g] ? 1 : 0.2,
                              }}
                            />
                            {counts[g]}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** Mijozlar qaysi soatda telefon ko'taradi: the pickup rate as a line by hour. */
export function PickupHours({ range }: { range: { from: Date | null; to: Date | null } }) {
  const { t } = useI18n();
  const { rows, bestHour, isLoading } = useCallPickupByHour(range);
  const shown = useMemo(() => {
    const busy = rows.filter((r) => r.total > 0).map((r) => r.hour);
    if (busy.length === 0) return [];
    const from = Math.min(...busy, 9);
    const to = Math.max(...busy, 19);
    return rows.filter((r) => r.hour >= from && r.hour <= to);
  }, [rows]);
  return (
    <section className="mt-9">
      <SheetHeading title={t("rp.hoursTitle")} right={t("rp.hoursHint")} />
      <div className="rp-sheet mt-3 px-5 pb-4 pt-5 phone:px-3">
        {isLoading ? (
          <Skeleton className="h-40 w-full rounded" />
        ) : shown.length === 0 ? (
          <p className="rp-mute text-[13.5px]">{t("rp.hoursNoData")}</p>
        ) : (
          <>
            <Suspense fallback={<Skeleton className="h-[230px] w-full rounded" />}>
              <PickupHoursChart
                data={shown.map((r) => ({
                  hour: r.hour,
                  rate: r.total > 0 ? r.rate : null,
                  total: r.total,
                  connected: r.connected,
                }))}
              />
            </Suspense>
            {bestHour && bestHour.total > 0 && (
              <p className="rp-mute mt-3 text-[13px]">
                {t("rp.hoursBest", {
                  from: `${bestHour.hour}:00`,
                  to: `${bestHour.hour + 1}:00`,
                  rate: Math.round(bestHour.rate),
                })}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
