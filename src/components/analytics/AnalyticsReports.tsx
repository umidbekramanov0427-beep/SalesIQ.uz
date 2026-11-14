import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  Clock3,
  Loader2,
  Lock,
  MessageSquareText,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  StickyNote,
  Target,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { SectionCard, StatCard } from "@/components/layout/Primitives";
import { PlanGate } from "@/components/PlanGate";
import { ForecastSettingsButton } from "@/components/analytics/ForecastSettings";
import { CollapsibleTable } from "@/components/layout/CollapsibleTable";
import { useAnalytics, useAnalyticsEvents, type AnalyticsPeriod } from "@/hooks/use-crm-data";
import {
  ACTIVITY_KINDS,
  EVENT_KINDS,
  type ActivityKind,
  type AnalyticsData,
  type EventKind,
  type LogEvent,
} from "@/lib/analytics-reports";
import { useCurrency } from "@/lib/currency";
import { useOrgAccess } from "@/lib/use-org-access";
import type { CardBoardItem, Span } from "@/components/dashboard/HomeBoard";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The sales reports that used to make up Analitika (amoCRM's "Аналитика"),
// now shown inside Bosh sahifa's tabs: the sales funnel and win-loss under
// Konversiya, the per-manager summary under Reyting, staff activity and the
// events log under Faollik, the forecast under Prognoz. The server cuts the
// data to whose leads the person may see (a manager their own, a ROP their
// team).

// ---- small pieces -----------------------------------------------------------

/** A horizontal bar on the card's own track. */
function Bar({
  value,
  max,
  tone = "primary",
}: {
  value: number;
  max: number;
  tone?: "primary" | "success" | "destructive" | "muted";
}) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          tone === "primary" && "bg-primary",
          tone === "success" && "bg-success",
          tone === "destructive" && "bg-destructive",
          tone === "muted" && "bg-subtle",
        )}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

function Th({ children, right = false }: { children?: ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground",
        right ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  right = false,
  strong = false,
  className,
}: {
  children?: ReactNode;
  right?: boolean;
  strong?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums",
        right && "text-right",
        strong ? "font-semibold text-foreground" : "text-foreground/85",
        className,
      )}
    >
      {children}
    </td>
  );
}

// Long tables show their top on the card and the rest behind "Batafsil".
function TableWrap({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <CollapsibleTable {...(title ? { title } : {})} minWidth={640}>
      {children}
    </CollapsibleTable>
  );
}

type Who = (id: string | null) => string;

// ---- Savdo tahlili ------------------------------------------------------------

// Each report is a list of parts (its figure cards and blocks), so a page can
// lay them out on its board (CardBoard) one card at a time.
type PartCtx = { t: T; format: (n: number) => string };
type T = ReturnType<typeof useI18n>["t"];
type PartDef = Omit<CardBoardItem, "node"> & {
  render: (d: AnalyticsData, who: Who) => ReactNode;
};

const STAT_SIZES: Span[] = [3, 4, 6, 12];
const HALF_SIZES: Span[] = [6, 8, 12];
const BLOCK_SIZES: Span[] = [8, 12];

function salesParts({ t, format }: PartCtx): PartDef[] {
  const stat = (
    id: string,
    icon: LucideIcon,
    tone: CardBoardItem["tone"],
    label: string,
    render: PartDef["render"],
  ): PartDef => ({
    id: `sales:${id}`,
    title: t(label),
    icon,
    tone,
    span: 4,
    sizes: STAT_SIZES,
    render,
  });
  return [
    stat("newLeads", UserPlus, "sky", "an.newLeads", (d) => (
      <StatCard
        icon={UserPlus}
        iconTone="sky"
        label={t("an.newLeads")}
        tipKey="an.newLeads"
        value={String(d.sales.newLeads)}
        {...(d.sales.quality
          ? { hint: t("an.qualityHint", { q: d.sales.quality.qualified, j: d.sales.quality.junk }) }
          : {})}
      />
    )),
    stat("won", Trophy, "emerald", "an.won", (d) => (
      <StatCard
        icon={Trophy}
        iconTone="emerald"
        label={t("an.won")}
        tipKey="an.won"
        value={String(d.sales.won.count)}
        hint={format(d.sales.won.sum)}
      />
    )),
    stat("lost", XCircle, "rose", "an.lost", (d) => (
      <StatCard
        icon={XCircle}
        iconTone="rose"
        label={t("an.lost")}
        tipKey="an.lost"
        value={String(d.sales.lost.count)}
        hint={format(d.sales.lost.sum)}
      />
    )),
    stat("conversion", Target, "violet", "an.conversion", (d) => (
      <StatCard
        icon={Target}
        iconTone="violet"
        label={t("an.conversion")}
        tipKey="an.conversion"
        value={`${d.sales.conversion}%`}
        info={t("an.conversionInfo")}
      />
    )),
    stat("avgCheck", Banknote, "amber", "an.avgCheck", (d) => (
      <StatCard
        icon={Banknote}
        iconTone="amber"
        label={t("an.avgCheck")}
        tipKey="an.avgCheck"
        value={format(d.sales.avgCheck)}
      />
    )),
    stat("cycle", Clock3, "slate", "an.cycle", (d) => (
      <StatCard
        icon={Clock3}
        iconTone="slate"
        label={t("an.cycle")}
        tipKey="an.cycle"
        value={d.sales.avgCycleDays === null ? "—" : t("an.days", { count: d.sales.avgCycleDays })}
        info={t("an.cycleInfo")}
      />
    )),
    {
      id: "sales:funnel",
      title: t("an.funnelTitle"),
      icon: ArrowRightLeft,
      tone: "violet",
      span: 12,
      sizes: BLOCK_SIZES,
      render: (d) => <SalesFunnelCard data={d} />,
    },
  ];
}

function SalesFunnelCard({ data }: { data: AnalyticsData }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const s = data.sales;
  const max = Math.max(1, ...s.stages.map((x) => Math.max(x.entered, x.now)));
  return (
    <SectionCard
      icon={ArrowRightLeft}
      tone="violet"
      title={t("an.funnelTitle")}
      description={t("an.funnelDesc", { funnel: data.funnel ?? "—" })}
    >
      {s.stages.length === 0 ? (
        <Empty>{t("an.noStages")}</Empty>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_90px_120px_80px] gap-4 px-2 pb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground phone:hidden">
            <span>{t("an.stage")}</span>
            <span>{t("an.entered")}</span>
            <span className="text-right">{t("an.now")}</span>
            <span className="text-right">{t("an.amount")}</span>
            <span className="text-right">{t("an.pass")}</span>
          </div>
          {s.stages.map((x) => (
            <div
              key={x.id}
              className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_90px_120px_80px] items-center gap-4 rounded-lg px-2 py-2 hover:bg-accent/50 phone:grid-cols-[minmax(0,1fr)_auto] phone:gap-2"
            >
              <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-foreground">
                {x.kind === "won" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : x.kind === "lost" ? (
                  <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                ) : (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
                <span className="truncate">{x.name}</span>
              </span>
              <span className="flex items-center gap-3 phone:hidden">
                <Bar
                  value={x.entered}
                  max={max}
                  tone={
                    x.kind === "won" ? "success" : x.kind === "lost" ? "destructive" : "primary"
                  }
                />
                <span className="w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums text-foreground">
                  {x.entered}
                </span>
              </span>
              <span className="text-right text-[13px] tabular-nums text-foreground/85">
                {x.now}
              </span>
              <span className="text-right text-[13px] tabular-nums text-foreground/85 phone:hidden">
                {format(x.nowSum)}
              </span>
              <span className="text-right phone:hidden">
                {x.passRate !== null && (
                  <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-primary">
                    {x.passRate}%
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ---- Umumiy hisobot ----------------------------------------------------------

function SummaryTab({ data, who }: { data: AnalyticsData; who: Who }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const rows = data.summary;
  const sum = (k: keyof (typeof rows)[number]) =>
    rows.reduce((s, r) => s + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  const won = sum("won");
  const lost = sum("lost");
  return (
    <SectionCard
      icon={Users}
      tone="sky"
      title={t("an.tab.summary")}
      description={t("an.summaryDesc")}
    >
      {rows.length === 0 ? (
        <Empty>{t("an.noData")}</Empty>
      ) : (
        <TableWrap>
          <thead className="border-b border-border">
            <tr>
              <Th>{t("an.person")}</Th>
              <Th right>{t("an.newLeads")}</Th>
              <Th right>{t("an.open")}</Th>
              <Th right>{t("an.won")}</Th>
              <Th right>{t("an.lost")}</Th>
              <Th right>{t("an.conversion")}</Th>
              <Th right>{t("an.avgCheck")}</Th>
              <Th right>{t("an.kind.tasks")}</Th>
              <Th right>{t("an.kind.calls")}</Th>
              <Th right>{t("an.kind.messages")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ownerId ?? "none"} className="border-b border-border/60 last:border-0">
                <Td strong>{who(r.ownerId)}</Td>
                <Td right>{r.newLeads}</Td>
                <Td right>
                  {r.open}
                  <span className="ml-1.5 text-[12px] text-muted-foreground">
                    {format(r.openSum)}
                  </span>
                </Td>
                <Td right className="text-success">
                  {r.won}
                  <span className="ml-1.5 text-[12px] text-muted-foreground">
                    {format(r.wonSum)}
                  </span>
                </Td>
                <Td right>{r.lost}</Td>
                <Td right strong>
                  {r.conversion}%
                </Td>
                <Td right>{format(r.avgCheck)}</Td>
                <Td right>{r.tasksDone}</Td>
                <Td right>{r.calls}</Td>
                <Td right>{r.messages}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border">
            <tr>
              <Td strong>{t("an.total")}</Td>
              <Td right strong>
                {sum("newLeads")}
              </Td>
              <Td right strong>
                {sum("open")}
                <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">
                  {format(sum("openSum"))}
                </span>
              </Td>
              <Td right strong>
                {won}
                <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">
                  {format(sum("wonSum"))}
                </span>
              </Td>
              <Td right strong>
                {lost}
              </Td>
              <Td right strong>
                {won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : 0}%
              </Td>
              <Td right strong>
                {format(won ? Math.round(sum("wonSum") / won) : 0)}
              </Td>
              <Td right strong>
                {sum("tasksDone")}
              </Td>
              <Td right strong>
                {sum("calls")}
              </Td>
              <Td right strong>
                {sum("messages")}
              </Td>
            </tr>
          </tfoot>
        </TableWrap>
      )}
    </SectionCard>
  );
}

// ---- Win-Loss ----------------------------------------------------------------

function winLossParts({ t }: PartCtx): PartDef[] {
  const stat = (
    id: string,
    icon: LucideIcon,
    tone: CardBoardItem["tone"],
    label: string,
    value: (d: AnalyticsData) => string,
  ): PartDef => ({
    id: `winloss:${id}`,
    title: `${t(label)} · Win-Loss`,
    icon,
    tone,
    span: 4,
    sizes: STAT_SIZES,
    render: (d) => (
      <StatCard icon={icon} iconTone={tone} label={t(label)} tipKey={label} value={value(d)} />
    ),
  });
  const rate = (d: AnalyticsData) => {
    const w = d.winLoss;
    return w.won + w.lost ? Math.round((w.won / (w.won + w.lost)) * 1000) / 10 : 0;
  };
  return [
    stat("won", Trophy, "emerald", "an.won", (d) => String(d.winLoss.won)),
    stat("lost", XCircle, "rose", "an.lost", (d) => String(d.winLoss.lost)),
    stat("winRate", Target, "violet", "an.winRate", (d) => `${rate(d)}%`),
    {
      id: "winloss:reasons",
      title: t("an.reasons"),
      icon: XCircle,
      tone: "rose",
      span: 6,
      sizes: HALF_SIZES,
      render: (d) => <LostReasonsCard data={d} />,
    },
    {
      id: "winloss:bySource",
      title: t("an.bySource"),
      icon: TrendingUp,
      tone: "emerald",
      span: 6,
      sizes: HALF_SIZES,
      render: (d) => <WinBySourceCard data={d} />,
    },
    {
      id: "winloss:byOwner",
      title: t("an.byOwner"),
      icon: Users,
      tone: "sky",
      span: 12,
      sizes: HALF_SIZES,
      render: (d, who) => <WinByOwnerCard data={d} who={who} />,
    },
  ];
}

function WinSplit({ won, lost }: { won: number; lost: number }) {
  const total = won + lost;
  return (
    <div className="flex h-2 w-full min-w-[120px] overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-success" style={{ width: `${total ? (won / total) * 100 : 0}%` }} />
      <div
        className="h-full bg-destructive/80"
        style={{ width: `${total ? (lost / total) * 100 : 0}%` }}
      />
    </div>
  );
}

function LostReasonsCard({ data }: { data: AnalyticsData }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const w = data.winLoss;
  const maxReason = Math.max(1, ...w.lostByReason.map((r) => r.count));
  return (
    <SectionCard
      icon={XCircle}
      tone="rose"
      title={t("an.reasons")}
      description={t("an.reasonsDesc")}
    >
      {w.lostByReason.length === 0 ? (
        <Empty>{t("an.noLost")}</Empty>
      ) : (
        <ul className="space-y-3">
          {w.lostByReason.map((r) => (
            <li key={r.reason ?? "none"} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate font-semibold text-foreground">
                  {r.reason ?? t("an.noReason")}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{r.count}</span> ·{" "}
                  {Math.round((r.count / Math.max(1, w.lost)) * 100)}% · {format(r.sum)}
                </span>
              </div>
              <Bar value={r.count} max={maxReason} tone="destructive" />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function WinBySourceCard({ data }: { data: AnalyticsData }) {
  const { t } = useI18n();
  const w = data.winLoss;
  return (
    <SectionCard
      icon={TrendingUp}
      tone="emerald"
      title={t("an.bySource")}
      description={t("an.bySourceDesc")}
    >
      {w.bySource.length === 0 ? (
        <Empty>{t("an.noData")}</Empty>
      ) : (
        <ul className="space-y-3">
          {w.bySource.map((r) => (
            <li
              key={r.source ?? "none"}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-3 text-[13px]"
            >
              <span className="truncate font-semibold text-foreground">
                {r.source ?? t("an.noSource")}
              </span>
              <WinSplit won={r.won} lost={r.lost} />
              <span className="w-[92px] text-right tabular-nums text-muted-foreground">
                <span className="text-success">{r.won}</span> /{" "}
                <span className="text-destructive">{r.lost}</span> ·{" "}
                <span className="font-semibold text-foreground">{r.winRate}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function WinByOwnerCard({ data, who }: { data: AnalyticsData; who: Who }) {
  const { t } = useI18n();
  const w = data.winLoss;
  return (
    <SectionCard icon={Users} tone="sky" title={t("an.byOwner")}>
      {w.byOwner.length === 0 ? (
        <Empty>{t("an.noData")}</Empty>
      ) : (
        <ul className="space-y-3">
          {w.byOwner.map((r) => (
            <li
              key={r.ownerId ?? "none"}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-3 text-[13px]"
            >
              <span className="truncate font-semibold text-foreground">{who(r.ownerId)}</span>
              <WinSplit won={r.won} lost={r.lost} />
              <span className="w-[92px] text-right tabular-nums text-muted-foreground">
                <span className="text-success">{r.won}</span> /{" "}
                <span className="text-destructive">{r.lost}</span> ·{" "}
                <span className="font-semibold text-foreground">{r.winRate}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ---- Xodimlar hisoboti ----------------------------------------------------------

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  leads: UserPlus,
  moves: ArrowRightLeft,
  notes: StickyNote,
  tasks: CheckCircle2,
  calls: Phone,
  messages: MessageSquareText,
};

function StaffTab({ data, who }: { data: AnalyticsData; who: Who }) {
  const { t } = useI18n();
  const a = data.activity;
  const days = a.days.slice(-31);
  const maxDay = Math.max(1, ...a.people.flatMap((p) => days.map((d) => p.perDay[d] ?? 0)));
  return (
    <SectionCard
      icon={Users}
      tone="amber"
      title={t("an.tab.staff")}
      description={t("an.staffDesc")}
    >
      {a.people.length === 0 ? (
        <Empty>{t("an.noData")}</Empty>
      ) : (
        <TableWrap>
          <thead className="border-b border-border">
            <tr>
              <Th>{t("an.person")}</Th>
              {ACTIVITY_KINDS.map((k) => {
                const Icon = KIND_ICON[k];
                return (
                  <Th key={k} right>
                    <span className="inline-flex items-center gap-1">
                      <Icon className="h-3.5 w-3.5" />
                      {t(`an.kind.${k}`)}
                    </span>
                  </Th>
                );
              })}
              <Th right>{t("an.total")}</Th>
              <Th>{t("an.byDay")}</Th>
            </tr>
          </thead>
          <tbody>
            {a.people.map((p) => {
              const total = ACTIVITY_KINDS.reduce((s, k) => s + p.totals[k], 0);
              return (
                <tr key={p.actor ?? "none"} className="border-b border-border/60 last:border-0">
                  <Td strong>{who(p.actor)}</Td>
                  {ACTIVITY_KINDS.map((k) => (
                    <Td key={k} right className={p.totals[k] ? "" : "text-subtle"}>
                      {p.totals[k]}
                    </Td>
                  ))}
                  <Td right strong>
                    {total}
                  </Td>
                  <td className="px-3 py-2.5">
                    {/* One cell a day: darker = busier. */}
                    <div className="flex gap-[3px]" aria-label={t("an.byDay")}>
                      {days.map((d) => {
                        const n = p.perDay[d] ?? 0;
                        return (
                          <span
                            key={d}
                            title={`${d}: ${n}`}
                            className="h-4 w-[7px] rounded-[2px] bg-primary"
                            style={{ opacity: n ? 0.2 + 0.8 * (n / maxDay) : 0.07 }}
                          />
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </SectionCard>
  );
}

// ---- Hodisalar jurnali ----------------------------------------------------------

const EVENT_ICON: Record<EventKind, { icon: LucideIcon; cls: string }> = {
  lead: { icon: UserPlus, cls: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  stage: { icon: ArrowRightLeft, cls: "bg-violet-500/12 text-violet-600 dark:text-violet-400" },
  note: { icon: StickyNote, cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  task: { icon: CheckCircle2, cls: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  call: { icon: Phone, cls: "bg-primary/12 text-primary" },
  message: { icon: MessageSquareText, cls: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  payment: { icon: Banknote, cls: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
};

function EventText({ e }: { e: LogEvent }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  if (e.kind === "call") {
    const [dir, sec] = e.text.split(":");
    const Icon = dir === "missed" ? PhoneMissed : dir === "out" ? PhoneOutgoing : PhoneIncoming;
    const s = Number(sec) || 0;
    return (
      <span className="inline-flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", dir === "missed" && "text-destructive")} />
        {t(`an.call.${dir}`)}
        {s > 0 && ` · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}
      </span>
    );
  }
  if (e.kind === "payment") return <>{format(Number(e.text) || 0)}</>;
  if (e.kind === "stage") return <>→ {e.text}</>;
  return <>{e.text}</>;
}

function EventsTab({
  period,
  data,
  who,
}: {
  period: AnalyticsPeriod;
  data: AnalyticsData;
  who: Who;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<EventKind | null>(null);
  const [actor, setActor] = useState<string | null>(null);
  const q = useAnalyticsEvents(period, kind, actor);
  const events = q.data?.pages.flatMap((p) => p.events) ?? [];
  const when = (iso: string) =>
    new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <SectionCard
      icon={Clock3}
      tone="slate"
      title={t("an.tab.events")}
      description={t("an.eventsDesc")}
      actions={
        <select
          value={actor ?? ""}
          onChange={(e) => setActor(e.target.value || null)}
          className="h-9 rounded-lg border border-border bg-card px-2.5 text-[13px] text-foreground outline-none"
          aria-label={t("an.person")}
        >
          <option value="">{t("an.everyone")}</option>
          {data.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      }
    >
      <div className="mb-4 flex flex-wrap gap-1.5 phone-tabs">
        {[null, ...EVENT_KINDS].map((k) => (
          <button
            key={k ?? "all"}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
              kind === k
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {k &&
              (() => {
                const Icon = EVENT_ICON[k].icon;
                return <Icon className="h-3.5 w-3.5" />;
              })()}
            {k ? t(`an.ev.${k}`) : t("an.all")}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <Empty>{t("an.noEvents")}</Empty>
      ) : (
        <ul className="divide-y divide-border/60">
          {events.map((e, i) => {
            const { icon: Icon, cls } = EVENT_ICON[e.kind];
            return (
              <li key={`${e.at}-${i}`} className="flex items-center gap-3 py-2.5">
                <span className="w-[104px] shrink-0 whitespace-nowrap font-mono text-[12px] tabular-nums text-muted-foreground">
                  {when(e.at)}
                </span>
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", cls)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] text-foreground">
                    <span className="font-semibold">{t(`an.ev.${e.kind}`)}</span>
                    {e.leadId && (
                      <>
                        {" · "}
                        <Link
                          to="/crm/leads/$leadId"
                          params={{ leadId: e.leadId }}
                          className="font-semibold text-primary hover:underline"
                        >
                          {e.leadName ?? t("an.lead")}
                        </Link>
                      </>
                    )}
                  </p>
                  <p className="truncate text-[12.5px] text-muted-foreground">
                    {who(e.actor)}
                    {e.text && (
                      <>
                        {" · "}
                        <EventText e={e} />
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {q.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-semibold text-foreground hover:bg-accent disabled:opacity-60"
          >
            {q.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("an.more")}
          </button>
        </div>
      )}
    </SectionCard>
  );
}

// ---- Prognoz ---------------------------------------------------------------------

function forecastParts({ t, format }: PartCtx): PartDef[] {
  const stat = (
    id: string,
    icon: LucideIcon,
    tone: CardBoardItem["tone"],
    label: string,
    value: (d: AnalyticsData) => string,
    info?: string,
  ): PartDef => ({
    id: `forecast:${id}`,
    title: t(label),
    icon,
    tone,
    span: 4,
    sizes: STAT_SIZES,
    render: (d) => (
      <StatCard
        icon={icon}
        iconTone={tone}
        label={t(label)}
        tipKey={label}
        value={value(d)}
        {...(info ? { info } : {})}
      />
    ),
  });
  return [
    stat("openLeads", Users, "sky", "an.openLeads", (d) => String(d.forecast.total.count)),
    stat("pipelineSum", Banknote, "amber", "an.pipelineSum", (d) => format(d.forecast.total.sum)),
    stat(
      "expected",
      TrendingUp,
      "emerald",
      "an.expected",
      (d) => format(d.forecast.total.weighted),
      t("an.expectedInfo"),
    ),
    {
      id: "forecast:stages",
      title: t("an.forecastStages"),
      icon: TrendingUp,
      tone: "emerald",
      span: 12,
      sizes: BLOCK_SIZES,
      render: (d) => <ForecastStagesCard data={d} />,
    },
    {
      id: "forecast:owners",
      title: t("an.forecastOwners"),
      icon: Users,
      tone: "sky",
      span: 12,
      sizes: HALF_SIZES,
      render: (d, who) => <ForecastOwnersCard data={d} who={who} />,
    },
  ];
}

function ForecastStagesCard({ data }: { data: AnalyticsData }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const f = data.forecast;
  const maxSum = Math.max(1, ...f.stages.map((s) => s.sum));
  return (
    <SectionCard
      icon={TrendingUp}
      tone="emerald"
      title={t("an.forecastStages")}
      description={t("an.forecastDesc")}
      actions={<ForecastSettingsButton stages={f.stages} />}
    >
      {f.stages.length === 0 ? (
        <Empty>{t("an.noStages")}</Empty>
      ) : (
        <TableWrap>
          <thead className="border-b border-border">
            <tr>
              <Th>{t("an.stage")}</Th>
              <Th right>{t("an.leads")}</Th>
              <Th>{t("an.amount")}</Th>
              <Th right>{t("an.probability")}</Th>
              <Th right>{t("an.expected")}</Th>
            </tr>
          </thead>
          <tbody>
            {f.stages.map((s) => (
              <tr key={s.id} className="border-b border-border/60 last:border-0">
                <Td strong>{s.name}</Td>
                <Td right>{s.count}</Td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-full min-w-[120px]">
                      <Bar value={s.sum} max={maxSum} />
                    </div>
                    <span className="w-[110px] shrink-0 text-right text-[13px] tabular-nums text-foreground/85">
                      {format(s.sum)}
                    </span>
                  </div>
                </td>
                <Td right>{s.probability}%</Td>
                <Td right strong>
                  {format(s.weighted)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </SectionCard>
  );
}

function ForecastOwnersCard({ data, who }: { data: AnalyticsData; who: Who }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const f = data.forecast;
  return (
    <SectionCard icon={Users} tone="sky" title={t("an.forecastOwners")}>
      {f.byOwner.length === 0 ? (
        <Empty>{t("an.noData")}</Empty>
      ) : (
        <TableWrap>
          <thead className="border-b border-border">
            <tr>
              <Th>{t("an.person")}</Th>
              <Th right>{t("an.leads")}</Th>
              <Th right>{t("an.amount")}</Th>
              <Th right>{t("an.expected")}</Th>
            </tr>
          </thead>
          <tbody>
            {f.byOwner.map((o) => (
              <tr key={o.ownerId ?? "none"} className="border-b border-border/60 last:border-0">
                <Td strong>{who(o.ownerId)}</Td>
                <Td right>{o.count}</Td>
                <Td right>{format(o.sum)}</Td>
                <Td right strong>
                  {format(o.weighted)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </SectionCard>
  );
}

export type ReportKind = "sales" | "summary" | "winloss" | "staff" | "events" | "forecast";

const ymdOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * A [from, to) day range (the home page's period) as the reports' inclusive
 * dates, at most a year long.
 */
export function reportPeriod(range: { from: Date; to: Date }): AnalyticsPeriod {
  const lastDay = new Date(range.to.getTime() - 1);
  const earliest = new Date(lastDay.getTime() - 365 * 86_400_000);
  const from = range.from < earliest ? earliest : range.from;
  return { from: ymdOf(from), to: ymdOf(lastDay) };
}

/** One of the reports for the period and funnel (null = the first one the person may see). */
export function AnalyticsReport({
  report,
  period,
  funnel,
}: {
  report: ReportKind;
  period: AnalyticsPeriod;
  funnel: string | null;
}) {
  return (
    <PlanGate feature="analytics">
      <ReportBody report={report} period={period} funnel={funnel} />
    </PlanGate>
  );
}

function ReportBody({
  report,
  period,
  funnel,
}: {
  report: ReportKind;
  period: AnalyticsPeriod;
  funnel: string | null;
}) {
  const { t } = useI18n();
  const q = useAnalytics(period, funnel);
  const defs = usePartDefs(report);
  const data = q.data;
  const people = useMemo(
    () => new Map((data?.people ?? []).map((p) => [p.id, p.name])),
    [data?.people],
  );
  const who = (id: string | null) => (id ? (people.get(id) ?? "—") : t("an.nobody"));
  if (q.isError) return <Empty>{t("an.loadError")}</Empty>;
  if (!data) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {data.truncated && (
        <p className="rounded-xl bg-warning/10 px-4 py-2.5 text-[13px] text-foreground">
          {t("an.truncated")}
        </p>
      )}
      {isPartedReport(report) && (
        <div className="grid grid-cols-12 gap-3.5 phone:grid-cols-1">
          {defs.map((p) => (
            <div
              key={p.id}
              className="min-w-0 [grid-column:span_var(--span)/span_var(--span)] phone:[grid-column:1/-1]"
              style={{ "--span": p.span ?? 12 } as CSSProperties}
            >
              {p.render(data, who)}
            </div>
          ))}
        </div>
      )}
      {report === "summary" && <SummaryTab data={data} who={who} />}
      {report === "staff" && <StaffTab data={data} who={who} />}
      {report === "events" && <EventsTab period={period} data={data} who={who} />}
    </div>
  );
}

// ---- the reports as board cards ---------------------------------------------

/** The reports a page can lay out card by card on its board. */
export type PartedReport = "sales" | "winloss" | "forecast";
const isPartedReport = (r: ReportKind): r is PartedReport =>
  r === "sales" || r === "winloss" || r === "forecast";

function usePartDefs(report: ReportKind): PartDef[] {
  const { t } = useI18n();
  const { format } = useCurrency();
  const ctx = { t, format };
  if (report === "sales") return salesParts(ctx);
  if (report === "winloss") return winLossParts(ctx);
  if (report === "forecast") return forecastParts(ctx);
  return [];
}

function PartPlaceholder({ stat, error }: { stat: boolean; error: string | null }) {
  return (
    <div
      className={cn(
        "surface-card grid place-items-center p-5",
        stat ? "min-h-[118px]" : "min-h-[240px]",
      )}
    >
      {error ? (
        <p className="text-center text-[13px] text-muted-foreground">{error}</p>
      ) : (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

/**
 * A report as board cards (CardBoard): each figure card and block is its own
 * item, holding a placeholder until the data arrives. A company whose plan
 * has no analytics gets one card saying so. `notice` is the "cut short"
 * warning for above the board.
 */
export function useReportItems(
  report: PartedReport,
  period: AnalyticsPeriod,
  funnel: string | null,
  enabled = true,
): { items: CardBoardItem[]; notice: ReactNode } {
  const { t } = useI18n();
  const locked = !!useOrgAccess().lockReason("analytics");
  const q = useAnalytics(period, funnel, enabled && !locked);
  const defs = usePartDefs(report);
  const data = q.data;
  const people = useMemo(
    () => new Map((data?.people ?? []).map((p) => [p.id, p.name])),
    [data?.people],
  );
  if (locked) {
    return {
      notice: null,
      items: [
        {
          id: `${report}:locked`,
          title: t("an.title"),
          icon: Lock,
          tone: "slate",
          span: 12,
          sizes: [12],
          node: <AnalyticsReport report={report} period={period} funnel={funnel} />,
        },
      ],
    };
  }
  const who = (id: string | null) => (id ? (people.get(id) ?? "—") : t("an.nobody"));
  const error = q.isError ? t("an.loadError") : null;
  return {
    notice: data?.truncated ? (
      <p className="mb-3 rounded-xl bg-warning/10 px-4 py-2.5 text-[13px] text-foreground">
        {t("an.truncated")}
      </p>
    ) : null,
    items: defs.map(({ render, ...p }) => ({
      ...p,
      node:
        data && !error ? (
          render(data, who)
        ) : (
          <PartPlaceholder stat={(p.span ?? 12) <= 4} error={error} />
        ),
    })),
  };
}
