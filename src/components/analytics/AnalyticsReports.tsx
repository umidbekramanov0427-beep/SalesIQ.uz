import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  Loader2,
  Lock,
  Target,
  TrendingUp,
  Trophy,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { SectionCard, StatCard } from "@/components/layout/Primitives";
import { PlanGate } from "@/components/PlanGate";
import { CollapsibleTable } from "@/components/layout/CollapsibleTable";
import { useAnalytics, type AnalyticsPeriod } from "@/hooks/use-crm-data";
import type { AnalyticsData } from "@/lib/analytics-reports";
import { useCurrency } from "@/lib/currency";
import { useOrgAccess } from "@/lib/use-org-access";
import { CardPlaceholder, type CardBoardItem, type Span } from "@/components/dashboard/HomeBoard";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The sales reports that used to make up Analitika (amoCRM's "Аналитика"),
// now shown inside Bosh sahifa's tabs: win-loss under
// Konversiya, the per-manager summary under Reyting. The server cuts the
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

// ---- Umumiy hisobot ----------------------------------------------------------

function SummaryTab({ data, who }: { data: AnalyticsData; who: Who }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const rows = data.summary;
  const sum = (k: keyof (typeof rows)[number]) =>
    rows.reduce((s, r) => s + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  const won = sum("won");
  const lost = sum("lost");
  // Each column's best (green) and weakest (red) person, when there are two or more.
  const mark = (
    k: "newLeads" | "won" | "lost" | "conversion" | "tasksDone" | "calls" | "messages",
    v: number,
    lowerIsBetter = false,
  ) => {
    if (rows.length < 2) return v;
    const vals = rows.map((r) => r[k]);
    const hi = Math.max(...vals);
    const lo = Math.min(...vals);
    if (hi === lo) return v;
    const best = lowerIsBetter ? lo : hi;
    const worst = lowerIsBetter ? hi : lo;
    const cls =
      v === best
        ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
        : v === worst
          ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
          : "";
    return cls ? (
      <span className={`rounded-md px-1.5 py-0.5 font-semibold ${cls}`}>
        {k === "conversion" ? `${v}%` : v}
      </span>
    ) : k === "conversion" ? (
      `${v}%`
    ) : (
      v
    );
  };
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
                <Td right>{mark("newLeads", r.newLeads)}</Td>
                <Td right>
                  {r.open}
                  <span className="ml-1.5 text-[12px] text-muted-foreground">
                    {format(r.openSum)}
                  </span>
                </Td>
                <Td right>
                  {mark("won", r.won)}
                  <span className="ml-1.5 text-[12px] text-muted-foreground">
                    {format(r.wonSum)}
                  </span>
                </Td>
                <Td right>{mark("lost", r.lost, true)}</Td>
                <Td right strong>
                  {mark("conversion", r.conversion)}
                </Td>
                <Td right>{format(r.avgCheck)}</Td>
                <Td right>{mark("tasksDone", r.tasksDone)}</Td>
                <Td right>{mark("calls", r.calls)}</Td>
                <Td right>{mark("messages", r.messages)}</Td>
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

export type ReportKind = "summary" | "winloss";

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
    </div>
  );
}

// ---- the reports as board cards ---------------------------------------------

/** The reports a page can lay out card by card on its board. */
export type PartedReport = "winloss";
const isPartedReport = (r: ReportKind): r is PartedReport => r === "winloss";

function usePartDefs(report: ReportKind): PartDef[] {
  const { t } = useI18n();
  const { format } = useCurrency();
  const ctx = { t, format };
  if (report === "winloss") return winLossParts(ctx);
  return [];
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
          <CardPlaceholder stat={(p.span ?? 12) <= 4} error={error} />
        ),
    })),
  };
}
