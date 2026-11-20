import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarRange,
  GitBranch,
  Download,
  Loader2,
  Percent,
  Filter,
  LineChart,
  PieChart,
  Radio,
  Users,
  Receipt,
  Repeat2,
  ShoppingCart,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react";
import { FilterTile, TileOption } from "@/components/filters/FilterTile";
import { useDesk, useMyOrganization, useOrgGeneralSettings } from "@/hooks/use-crm-data";
import { useCurrency } from "@/lib/currency";
import { change, deskPeriod, type DeskData, type DeskPreset } from "@/lib/desk";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { downloadXlsx } from "@/lib/xlsx-write";
import {
  ChannelsBlock,
  DynamicsBlock,
  FunnelBlock,
  ManagersBlock,
  SourcesBlock,
} from "./DeskBlocks";
import { DeskKpi } from "./DeskParts";
import {
  BoardCustomizeButton,
  HomeBoard,
  type BoardLayout,
  type BoardWidget,
  type Span,
} from "@/components/dashboard/HomeBoard";

// Bosh sahifa → «Ish stoli»: the company's main figures for a period next
// to the period before (5CRM's dashboard, in the platform's look). Every
// card has its "!" and ⚙; «Panelni sozlash» moves, resizes, adds and
// removes the cards (HomeBoard, per person); «Telegram» sends the figures to their chat; «Tarix» shows the last
// 12 months; «Eksport» writes an Excel file.

const PRESETS: DeskPreset[] = ["today", "week", "month", "year", "range"];
const PRESET_STORE = "desk.preset.v1";

const KPI_SIZES: Span[] = [3, 4, 6, 12];
const BLOCK_SIZES: Span[] = [6, 8, 12];
const DESK_DEFAULTS: BoardLayout = {
  order: [
    "today",
    "revenue",
    "count",
    "avgCheck",
    "newClients",
    "repeat",
    "conversion",
    "channels",
    "sources",
    "dynamics",
    "funnel",
    "managers",
  ],
  size: {
    today: 4,
    revenue: 4,
    count: 4,
    avgCheck: 4,
    newClients: 4,
    repeat: 4,
    conversion: 4,
    channels: 12,
    sources: 12,
    dynamics: 12,
    funnel: 12,
    managers: 12,
  },
};

const fmtDay = (ymd: string) => ymd.split("-").reverse().join(".");

/** What the page's period and funnel are, for the cards the page adds. */
export type DeskView = {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  funnel: string | null;
};

export function DeskTab({
  renderTabs,
  onView,
  extra,
}: {
  /** The page's tab row, with these filters on its right. */
  renderTabs: (filters: ReactNode) => ReactNode;
  /** Told whenever the period or funnel changes. */
  onView?: (v: DeskView) => void;
  /** More cards on the same board, after the desk's own. */
  extra?: { widgets: BoardWidget[]; layout: BoardLayout };
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { data: org } = useMyOrganization();
  // Sozlamalar → Umumiy: the company's own logo, as in the sidebar.
  const { data: orgGeneral } = useOrgGeneralSettings();
  const companyLogo = orgGeneral?.company_logo_url ?? null;

  const [preset, setPresetState] = useState<DeskPreset>("month");
  const [custom, setCustom] = useState<{ from: string; to: string } | undefined>();
  const [funnel, setFunnel] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    try {
      const p = localStorage.getItem(PRESET_STORE) as DeskPreset | null;
      if (p && p !== "range" && PRESETS.includes(p)) setPresetState(p);
    } catch {
      /* private window */
    }
  }, []);
  function setPreset(p: DeskPreset) {
    setPresetState(p);
    if (p !== "range") {
      try {
        localStorage.setItem(PRESET_STORE, p);
      } catch {
        /* private window */
      }
    }
  }

  const period = useMemo(() => deskPeriod(preset, new Date(), custom), [preset, custom]);
  const query = { ...period, funnel };
  const { data: d, isLoading, error, isFetching } = useDesk(query);
  useEffect(() => {
    onView?.({ ...period, funnel });
  }, [period, funnel, onView]);
  const defaults = useMemo<BoardLayout>(
    () =>
      extra
        ? {
            order: [...DESK_DEFAULTS.order, ...extra.layout.order],
            size: { ...DESK_DEFAULTS.size, ...extra.layout.size },
          }
        : DESK_DEFAULTS,
    [extra],
  );

  const periodText = `${fmtDay(period.from)} – ${fmtDay(period.to)}`;
  const prevText = `${fmtDay(period.prevFrom)} – ${fmtDay(period.prevTo)}`;
  const revenueLabel = t(`desk.revenue.${preset}`);
  const prevWord = preset === "month" ? t("desk.prevMonthDays") : t("desk.prevPeriodShort");

  function exportXlsx(data: DeskData) {
    const row = (label: string, p: { cur: number; prev: number }) => [
      label,
      p.cur,
      p.prev,
      change(p),
    ];
    downloadXlsx(`ish-stoli-${period.from}-${period.to}.xlsx`, [
      {
        name: t("desk.xl.figures"),
        rows: [
          [t("desk.xl.figure"), periodText, prevText, "%"],
          row(revenueLabel, data.revenue),
          row(t("desk.count"), data.count),
          row(t("desk.avgCheck"), data.avgCheck),
          row(t("desk.newClients"), data.newClients),
          row(t("desk.repeat"), data.repeat),
          row(t("desk.leads"), data.leads),
          row(t("desk.conversion"), data.conversion),
          [
            t("desk.plan"),
            data.plan.team,
            data.plan.fact,
            data.plan.team ? Math.round((data.plan.fact / data.plan.team) * 100) : null,
          ],
        ],
      },
      {
        name: t("desk.managers"),
        rows: [
          [
            t("desk.col.manager"),
            t("desk.col.leads"),
            t("desk.col.worked"),
            t("desk.col.sales"),
            t("desk.col.revenue"),
            t("desk.col.plan"),
            t("desk.col.conv"),
            t("desk.col.avg"),
            t("desk.col.talks"),
            t("desk.col.longest"),
          ],
          ...data.managers.map((m) => [
            m.name,
            m.leads.cur,
            m.worked,
            m.sales.cur,
            m.revenue.cur,
            m.plan,
            m.conversion,
            m.avgCheck,
            m.talks,
            m.longest,
          ]),
        ],
      },
      {
        name: t("desk.channels"),
        rows: [
          [t("desk.xl.channel"), t("desk.col.sales"), t("desk.col.revenue")],
          ...data.channels.map((c) => [c.name, c.count, c.revenue]),
        ],
      },
      {
        name: t("desk.sources"),
        rows: [
          [t("desk.xl.source"), t("desk.col.leads")],
          ...data.sources.map((s) => [s.name, s.leads]),
        ],
      },
    ]);
  }

  const initial = (org?.name ?? "S").trim().slice(0, 1).toUpperCase();
  const btn =
    "ctl-soft inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-foreground disabled:opacity-50";

  // The desk as a board (HomeBoard): «Panelni sozlash» moves, resizes,
  // adds and removes its cards; each person's layout is kept in this browser.
  const boardWidgets: BoardWidget[] = d
    ? [
        {
          id: "today",
          title: t("desk.today"),
          icon: Wallet,
          tone: "emerald",
          sizes: KPI_SIZES,
          node: (
            <DeskKpi
              tipKey="desk.today"
              label={t("desk.today")}
              icon={Wallet}
              tone="emerald"
              rawValue={d.today.revenue}
              value={format(d.today.revenue)}
              change={change({ cur: d.today.revenue, prev: d.today.yRevenue })}
              prevText={t("desk.yesterdayUntil", {
                time: d.today.until,
                v: format(d.today.yRevenue),
              })}
            />
          ),
        },
        {
          id: "revenue",
          title: revenueLabel,
          icon: TrendingUp,
          tone: "primary",
          sizes: KPI_SIZES,
          node: (
            <DeskKpi
              tipKey="desk.revenue"
              label={revenueLabel}
              icon={TrendingUp}
              tone="primary"
              rawValue={d.revenue.cur}
              value={format(d.revenue.cur)}
              change={change(d.revenue)}
              prevText={`(${prevWord}: ${format(d.revenue.prev)})`}
            />
          ),
        },
        {
          id: "count",
          title: t("desk.count"),
          icon: ShoppingCart,
          tone: "sky",
          sizes: KPI_SIZES,
          node: (
            <DeskKpi
              tipKey="desk.count"
              label={t("desk.count")}
              icon={ShoppingCart}
              tone="sky"
              rawValue={d.count.cur}
              value={t("desk.pcs", { n: d.count.cur })}
              change={change(d.count)}
              prevText={`(${t("desk.prevPeriodShort")}: ${t("desk.pcs", { n: d.count.prev })})`}
            />
          ),
        },
        {
          id: "avgCheck",
          title: t("desk.avgCheck"),
          icon: Receipt,
          tone: "amber",
          sizes: KPI_SIZES,
          node: (
            <DeskKpi
              tipKey="desk.avgCheck"
              label={t("desk.avgCheck")}
              icon={Receipt}
              tone="amber"
              rawValue={d.avgCheck.cur}
              value={format(d.avgCheck.cur)}
              change={change(d.avgCheck)}
              prevText={`(${t("desk.prevPeriodShort")}: ${format(d.avgCheck.prev)})`}
            />
          ),
        },
        {
          id: "newClients",
          title: t("desk.newClients"),
          icon: UserPlus,
          tone: "sky",
          sizes: KPI_SIZES,
          node: (
            <DeskKpi
              tipKey="desk.newClients"
              label={t("desk.newClients")}
              icon={UserPlus}
              tone="sky"
              rawValue={d.newClients.cur}
              value={t("desk.pcs", { n: d.newClients.cur })}
              change={change(d.newClients)}
              prevText={`(${t("desk.prevPeriodShort")}: ${t("desk.pcs", { n: d.newClients.prev })})`}
            />
          ),
        },
        {
          id: "repeat",
          title: t("desk.repeat"),
          icon: Repeat2,
          tone: "violet",
          sizes: KPI_SIZES,
          node: (
            <DeskKpi
              tipKey="desk.repeat"
              label={t("desk.repeat")}
              icon={Repeat2}
              tone="violet"
              rawValue={d.repeat.cur}
              value={t("desk.pcs", { n: d.repeat.cur })}
              change={change(d.repeat)}
              prevText={`(${t("desk.prevPeriodShort")}: ${t("desk.pcs", { n: d.repeat.prev })})`}
            />
          ),
        },
        {
          id: "conversion",
          title: t("desk.conversion"),
          icon: Percent,
          tone: "rose",
          sizes: KPI_SIZES,
          node: (
            <DeskKpi
              tipKey="desk.conversion"
              label={t("desk.conversion")}
              icon={Percent}
              tone="rose"
              rawValue={d.conversion.cur}
              value={`${d.conversion.cur}%`}
              change={change(d.conversion)}
              prevText={`(${t("desk.prevPeriodShort")}: ${d.conversion.prev}% · ${t("desk.leadsN", { n: d.leads.cur })})`}
            />
          ),
        },
        {
          id: "channels",
          title: t("desk.channels"),
          icon: Radio,
          tone: "sky",
          sizes: BLOCK_SIZES,
          node: <ChannelsBlock d={d} />,
        },
        {
          id: "sources",
          title: t("desk.sources"),
          icon: PieChart,
          tone: "violet",
          sizes: BLOCK_SIZES,
          node: <SourcesBlock d={d} />,
        },
        {
          id: "dynamics",
          title: t("desk.dynamics"),
          icon: LineChart,
          tone: "primary",
          sizes: BLOCK_SIZES,
          node: <DynamicsBlock d={d} curLabel={periodText} prevLabel={prevText} />,
        },
        {
          id: "funnel",
          title: t("desk.funnel"),
          icon: Filter,
          tone: "amber",
          sizes: BLOCK_SIZES,
          node: <FunnelBlock d={d} onPick={setFunnel} />,
        },
        {
          id: "managers",
          title: t("desk.managers"),
          icon: Users,
          tone: "emerald",
          sizes: BLOCK_SIZES,
          node: <ManagersBlock d={d} />,
        },
      ]
    : [];

  // The tab's filters, in the same card as the other tabs' filters: the
  // period and the funnel as filter tiles, then the board's own buttons.
  const filters = (
    <div className="phone-joined flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2.5 shadow-soft phone:[--phone-cell:140px] phone:[&_svg]:hidden">
      <FilterTile
        icon={CalendarRange}
        label={t("desk.periodTile")}
        active={preset !== "month"}
        value={preset === "range" ? periodText : t(`desk.preset.${preset}`)}
      >
        {PRESETS.filter((p) => p !== "range").map((p) => (
          <TileOption
            key={p}
            label={t(`desk.preset.${p}`)}
            active={preset === p}
            onClick={() => setPreset(p)}
          />
        ))}
        <RangeForm
          value={custom ?? { from: period.from, to: period.to }}
          onApply={(v) => {
            setCustom(v);
            setPreset("range");
          }}
        />
      </FilterTile>
      <FilterTile
        icon={GitBranch}
        label={t("leadAnalytics.funnelLabel")}
        active={!!funnel}
        value={funnel ?? t("desk.allFunnels")}
      >
        <TileOption label={t("desk.allFunnels")} active={!funnel} onClick={() => setFunnel(null)} />
        {(d?.funnels ?? []).map((f) => (
          <TileOption key={f} label={f} active={funnel === f} onClick={() => setFunnel(f)} />
        ))}
      </FilterTile>
      {!editing && <BoardCustomizeButton onClick={() => setEditing(true)} />}
      <button type="button" className={btn} onClick={() => d && exportXlsx(d)} disabled={!d}>
        <Download className="h-4 w-4" />
        {t("desk.export")}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* One row: the company (small, top left) and, on the right, the
          desk's own controls -- they belong to this tab only; the page's
          tabs come under this row. */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {companyLogo ? (
            <img
              src={companyLogo}
              alt=""
              className="h-10 w-10 shrink-0 rounded-[10px] border border-border bg-card object-contain p-1"
            />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-border bg-card text-[16px] font-bold text-primary">
              {initial}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-[18px] font-bold leading-tight tracking-tight text-foreground">
              {org?.name ?? "—"}
            </h1>
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              {t("desk.mainFigures")} · <span className="tabular-nums">{periodText}</span>
              {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
            </p>
          </div>
        </div>
      </header>

      {renderTabs(filters)}

      {error && !d ? (
        <p className="surface-card px-4 py-10 text-center text-[13px] text-muted-foreground">
          {describeError(error, t("desk.failed"))}
        </p>
      ) : isLoading || !d ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <HomeBoard
            boardKey="desk"
            widgets={extra ? [...boardWidgets, ...extra.widgets] : boardWidgets}
            defaults={defaults}
            editing={editing}
            onEditingChange={setEditing}
          />
        </>
      )}
    </div>
  );
}

/** «Oraliq» inside the period's list: from / to and «Qo'llash». */
function RangeForm({
  value,
  onApply,
}: {
  value: { from: string; to: string };
  onApply: (v: { from: string; to: string }) => void;
}) {
  const { t } = useI18n();
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  useEffect(() => {
    setFrom(value.from);
    setTo(value.to);
  }, [value.from, value.to]);
  const ok = from && to && from <= to;
  const input =
    "h-9 w-full rounded-[6px] border border-border bg-background px-2.5 text-[13px] tabular-nums outline-none focus:border-primary phone:text-base";
  return (
    <div className="mt-1.5 space-y-2 border-t border-border px-1.5 pb-1 pt-2.5">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
        <CalendarRange className="h-3.5 w-3.5" />
        {t("desk.preset.range")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11.5px] font-semibold text-muted-foreground">
          {t("desk.from")}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
        <label className="block text-[11.5px] font-semibold text-muted-foreground">
          {t("desk.to")}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
      </div>
      <button
        type="button"
        data-close-menu
        disabled={!ok}
        onClick={() => onApply({ from, to })}
        className="ctl-lit h-9 w-full rounded-[6px] text-[13px] font-semibold disabled:opacity-50"
      >
        {t("desk.apply")}
      </button>
    </div>
  );
}
