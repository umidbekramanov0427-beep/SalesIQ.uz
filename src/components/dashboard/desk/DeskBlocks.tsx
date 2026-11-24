import { useMemo, useState } from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartSpline, Filter, PieChart, Radio, Users, Wallet } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useCurrency } from "@/lib/currency";
import { change, NO_SOURCE, SERIES_COLORS, type DeskData } from "@/lib/desk";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Change, DeltaChip, DeskBlock, MiniSegment } from "./DeskParts";
import { CardViewToggle, CategoryLine, WithToggle, useCardView } from "./CardView";

const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const dur = (s: number) =>
  s <= 0 ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Sotuv bo'yicha kanallar: each channel's sales, as tiles in a row or a line. */
export function ChannelsBlock({ d }: { d: DeskData }) {
  const { t } = useI18n();
  const { format, formatCompact } = useCurrency();
  const { lang } = useI18n();
  const [view, setView] = useCardView("desk.channels");
  const total = d.revenue.cur;
  const rows = d.channels.length ? d.channels : [{ name: NO_SOURCE, revenue: 0, count: 0 }];
  const name = (n: string) => (n === NO_SOURCE ? t("desk.noSource") : n);
  return (
    <DeskBlock
      tipKey="desk.channels"
      title={t("desk.channels")}
      icon={Radio}
      tone="rose"
      actions={<CardViewToggle view={view} onChange={setView} />}
    >
      {view === "chart" ? (
        <CategoryLine
          items={rows.map((c) => ({
            name: name(c.name),
            value: c.revenue,
            sub: t("desk.nSales", { n: c.count }),
          }))}
          format={(n) => formatCompact(n, lang)}
        />
      ) : (
        <ul className="-mx-1 grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
          {rows.map((c, k) => (
            <li
              key={c.name}
              className="flex min-w-0 flex-col gap-1.5 border-border px-4 py-2 [&:not(:first-child)]:border-l phone:border-l-0 phone:border-t phone:first:border-t-0"
            >
              <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-foreground">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: SERIES_COLORS[Math.min(k, SERIES_COLORS.length - 1)] }}
                />
                <span className="truncate" title={name(c.name)}>
                  {name(c.name)}
                </span>
              </span>
              <b className="text-[17px] font-bold tabular-nums text-foreground">
                {format(c.revenue)}
              </b>
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {t("desk.nSales", { n: c.count })} · {pctOf(c.revenue, total)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </DeskBlock>
  );
}

/** Lid manbasi: where the period's leads came from, as a list or a line. */
export function SourcesBlock({ d }: { d: DeskData }) {
  const { t } = useI18n();
  const [view, setView] = useCardView("desk.sources");
  const total = d.leads.cur;
  const top = d.sources.slice(0, SERIES_COLORS.length - 1);
  const rest = d.sources.slice(SERIES_COLORS.length - 1);
  const rows = rest.length
    ? [...top, { name: t("desk.other"), leads: rest.reduce((a, s) => a + s.leads, 0) }]
    : top;
  const name = (n: string) => (n === NO_SOURCE ? t("desk.noSource") : n);
  return (
    <DeskBlock
      tipKey="desk.sources"
      title={t("desk.sources")}
      icon={PieChart}
      tone="violet"
      actions={
        <WithToggle toggle={<CardViewToggle view={view} onChange={setView} />}>
          <span className="text-[12.5px] text-muted-foreground">
            {t("desk.totalLeadsN", { n: total })}
          </span>
        </WithToggle>
      }
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">{t("desk.noLeads")}</p>
      ) : view === "chart" ? (
        <CategoryLine
          color="#7B5CE0"
          items={rows.map((s) => ({
            name: name(s.name),
            value: s.leads,
            sub: `${pctOf(s.leads, total)}%`,
          }))}
        />
      ) : (
        <ul className="divide-y divide-dashed divide-border">
          {rows.map((s, k) => (
            <li key={s.name} className="flex items-center gap-2.5 py-2.5 text-[13.5px]">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: SERIES_COLORS[k] }}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{name(s.name)}</span>
              <b className="font-semibold tabular-nums">{s.leads}</b>
              <span className="w-12 text-right tabular-nums text-muted-foreground">
                {pctOf(s.leads, total)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </DeskBlock>
  );
}

/** Sotuv dinamikasi: the period's sales curve against the period before. */
export function DynamicsBlock({
  d,
  curLabel,
  prevLabel,
}: {
  d: DeskData;
  curLabel: string;
  prevLabel: string;
}) {
  const { t, lang } = useI18n();
  const { format, formatCompact } = useCurrency();
  const [by, setBy] = useState<"hour" | "day">(d.dynamics.days.length > 1 ? "day" : "hour");
  const data = by === "day" ? d.dynamics.days : d.dynamics.hours;
  const empty = d.count.cur === 0 && d.count.prev === 0;
  return (
    <DeskBlock
      tipKey="desk.dynamics"
      title={t("desk.dynamics")}
      icon={ChartSpline}
      tone="primary"
      actions={
        <MiniSegment
          value={by}
          onChange={setBy}
          options={[
            { value: "hour", label: t("desk.byHour") },
            { value: "day", label: t("desk.byDay") },
          ]}
        />
      }
    >
      <div className="flex flex-wrap gap-8">
        <div>
          <p className="text-[12px] font-semibold text-muted-foreground">{t("desk.curPeriod")}</p>
          <p className="text-[18px] font-bold tabular-nums text-foreground">
            {format(d.revenue.cur)}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {t("desk.nSales", { n: d.count.cur })} · <Change value={change(d.revenue)} />
          </p>
        </div>
        <div>
          <p className="text-[12px] font-semibold text-muted-foreground">{t("desk.prevPeriod")}</p>
          <p className="text-[18px] font-bold tabular-nums text-muted-foreground">
            {format(d.revenue.prev)}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {t("desk.nSales", { n: d.count.prev })}
          </p>
        </div>
      </div>
      <div className="relative mt-3 h-[240px]">
        {empty ? (
          <p className="grid h-full place-items-center text-[13px] font-semibold text-muted-foreground">
            {t("desk.noSales")}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="deskCur" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                minTickGap={16}
                className="fill-muted-foreground"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={64}
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => formatCompact(v, lang)}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{ borderRadius: 6, fontSize: 12 }}
                formatter={(v: number, key: string) => [
                  format(v),
                  key === "cur" ? curLabel : prevLabel,
                ]}
              />
              <Area
                type="monotone"
                dataKey="cur"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#deskCur)"
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="prev"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
          {t("desk.curPeriod")} ({curLabel})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#94a3b8]" />
          {t("desk.prevPeriod")} ({prevLabel})
        </span>
      </div>
    </DeskBlock>
  );
}

/** Sotuv voronkasi: the period's leads per funnel, or a chosen funnel's stages. */
export function FunnelBlock({
  d,
  onPick,
}: {
  d: DeskData;
  onPick: (funnel: string | null) => void;
}) {
  const { t } = useI18n();
  const total = d.funnelBars.total;
  const won = d.funnelBars.funnels.reduce((a, f) => a + f.sales, 0);
  const [view, setView] = useCardView("desk.funnel", "chart");
  const points = d.funnel
    ? [
        { name: t("desk.lead"), value: total, sub: "100%" },
        ...d.funnelBars.stages.map((st) => ({
          name: st.name,
          value: st.count,
          sub: `${pctOf(st.count, total)}%`,
          ...(st.kind === "won"
            ? { accent: "#10b981" }
            : st.kind === "lost"
              ? { accent: "#f43f5e" }
              : {}),
        })),
      ]
    : d.funnelBars.funnels.map((f) => ({
        name: f.name,
        value: f.leads,
        sub: `${t("desk.nSales", { n: f.sales })} · ${pctOf(f.sales, f.leads)}%`,
      }));
  const bar = (n: number, color: string) => (
    <span className="h-3 overflow-hidden rounded-full bg-muted">
      <span
        className="block h-full rounded-full"
        style={{ width: `${total ? Math.max(1, pctOf(n, total)) : 0}%`, background: color }}
      />
    </span>
  );
  return (
    <DeskBlock
      tipKey="desk.funnel"
      title={t("desk.funnel")}
      icon={Filter}
      tone="sky"
      actions={
        <WithToggle toggle={<CardViewToggle view={view} onChange={setView} />}>
          <span className="text-[12.5px] text-muted-foreground">
            {t("desk.totalLeadsN", { n: total })}
          </span>
        </WithToggle>
      }
    >
      {view === "chart" ? (
        <CategoryLine items={points} />
      ) : (
        <ul className="space-y-2.5">
          <li className="grid grid-cols-[minmax(0,180px)_1fr_110px_150px] items-center gap-3 text-[13px]">
            <span className="font-semibold text-foreground">{t("desk.lead")}</span>
            {bar(total, "#94a3b8")}
            <span className="tabular-nums">
              <b>{total}</b> <span className="text-muted-foreground">(100%)</span>
            </span>
            <span />
          </li>
          {d.funnel
            ? d.funnelBars.stages.map((s) => (
                <li
                  key={s.id}
                  className="grid grid-cols-[minmax(0,180px)_1fr_110px_150px] items-center gap-3 text-[13px]"
                >
                  <span className="truncate text-foreground" title={s.name}>
                    {s.name}
                  </span>
                  {bar(
                    s.count,
                    s.kind === "won" ? "#10b981" : s.kind === "lost" ? "#f43f5e" : "#2563eb",
                  )}
                  <span className="tabular-nums">
                    <b>{s.count}</b>{" "}
                    <span className="text-muted-foreground">({pctOf(s.count, total)}%)</span>
                  </span>
                  <span />
                </li>
              ))
            : d.funnelBars.funnels.map((f) => (
                <li
                  key={f.name}
                  className="grid grid-cols-[minmax(0,180px)_1fr_110px_150px] items-center gap-3 text-[13px]"
                >
                  <button
                    type="button"
                    onClick={() => onPick(f.name)}
                    className="truncate text-left font-medium text-primary hover:underline"
                    title={f.name}
                  >
                    {f.name}
                  </button>
                  {bar(f.leads, "#60a5fa")}
                  <span className="tabular-nums">
                    <b>{f.leads}</b>{" "}
                    <span className="text-muted-foreground">({pctOf(f.leads, total)}%)</span>
                  </span>
                  <span className="text-right text-[12.5px] tabular-nums text-muted-foreground">
                    {t("desk.nSales", { n: f.sales })} · {pctOf(f.sales, f.leads)}%
                  </span>
                </li>
              ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[12.5px]">
        <span className="font-semibold text-foreground">
          {t("desk.convTotal", { n: pctOf(won, total) })}
        </span>
        {d.funnel ? (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="font-semibold text-primary hover:underline"
          >
            {t("desk.allFunnels")}
          </button>
        ) : (
          <span className="text-muted-foreground">{t("desk.pickFunnel")}</span>
        )}
      </div>
    </DeskBlock>
  );
}

/** Menejerlar bo'yicha natijalar. */
export function ManagersBlock({ d }: { d: DeskData }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const [growth, setGrowth] = useState(false);
  const [view, setView] = useCardView("desk.managers");
  const { formatCompact } = useCurrency();
  const { lang } = useI18n();
  const sub = (p: { cur: number; prev: number }, money = false) =>
    growth ? <Change value={change(p)} /> : money ? format(p.prev) : p.prev;
  const totals = useMemo(() => {
    const m = d.managers;
    return {
      leads: m.reduce((a, x) => a + x.leads.cur, 0) + d.others.leads,
      sales: m.reduce((a, x) => a + x.sales.cur, 0) + d.others.sales,
      revenue: m.reduce((a, x) => a + x.revenue.cur, 0) + d.others.revenue,
    };
  }, [d]);
  const th = "px-3 py-2.5 font-semibold whitespace-nowrap";
  return (
    <DeskBlock
      tipKey="desk.managers"
      title={t("desk.managers")}
      icon={Users}
      tone="emerald"
      actions={
        <WithToggle toggle={<CardViewToggle view={view} onChange={setView} />}>
          {view === "list" && (
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground">
              {t("desk.growth")}
              <Switch checked={growth} onCheckedChange={setGrowth} />
            </label>
          )}
        </WithToggle>
      }
    >
      {view === "chart" ? (
        <CategoryLine
          color="#10b981"
          items={[...d.managers]
            .sort((x, y) => y.revenue.cur - x.revenue.cur)
            .map((m) => ({
              name: m.name,
              value: m.revenue.cur,
              sub: t("desk.nSales", { n: m.sales.cur }),
            }))}
          format={(n) => formatCompact(n, lang)}
        />
      ) : (
        <div className="-mx-4 -my-4 overflow-x-auto sm:-mx-5 sm:-my-5">
          <table className="w-full min-w-[980px] text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[12px] text-muted-foreground">
                <th className={cn(th, "pl-4")}>{t("desk.col.manager")}</th>
                <th className={cn(th, "text-right")}>{t("desk.col.leads")}</th>
                <th className={cn(th, "text-right")}>{t("desk.col.worked")}</th>
                <th className={cn(th, "text-right")}>{t("desk.col.sales")}</th>
                <th className={cn(th, "text-right")}>{t("desk.col.revenue")}</th>
                <th className={cn(th, "text-right")}>{t("desk.col.plan")}</th>
                <th className={cn(th, "text-right")}>{t("desk.col.conv")}</th>
                <th className={cn(th, "text-right")}>{t("desk.col.avg")}</th>
                <th className={cn(th, "text-right")}>{t("desk.col.talks")}</th>
                <th className={cn(th, "pr-4 text-right")}>{t("desk.col.longest")}</th>
              </tr>
            </thead>
            <tbody>
              {d.managers.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">
                    {t("desk.noManagers")}
                  </td>
                </tr>
              )}
              {d.managers.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-border/70 last:border-0 hover:bg-accent/40"
                >
                  <td className="py-2.5 pl-4 pr-3 font-semibold text-foreground">{m.name}</td>
                  <Cell main={m.leads.cur} sub={sub(m.leads)} />
                  <Cell main={m.worked} sub={`${pctOf(m.worked, m.leads.cur)}%`} />
                  <Cell main={m.sales.cur} sub={sub(m.sales)} />
                  <Cell main={format(m.revenue.cur)} sub={sub(m.revenue, true)} />
                  <Cell
                    main={m.plan ? format(m.plan) : "—"}
                    sub={m.plan ? `${pctOf(m.revenue.cur, m.plan)}%` : undefined}
                  />
                  <Cell main={`${m.conversion}%`} />
                  <Cell main={m.avgCheck ? format(m.avgCheck) : "—"} />
                  <Cell main={m.talks || "—"} />
                  <Cell main={dur(m.longest)} last />
                </tr>
              ))}
              {(d.others.leads > 0 || d.others.sales > 0) && (
                <tr className="border-t border-border text-muted-foreground">
                  <td className="py-2.5 pl-4 pr-3">{t("desk.others")}</td>
                  <Cell main={d.others.leads} />
                  <Cell main="" />
                  <Cell main={d.others.sales} />
                  <Cell main={format(d.others.revenue)} />
                  <td colSpan={5} />
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface font-semibold">
                <td className="py-2.5 pl-4 pr-3">{t("desk.total")}</td>
                <Cell main={totals.leads} />
                <Cell main="" />
                <Cell main={totals.sales} />
                <Cell main={format(totals.revenue)} />
                <Cell main={d.plan.team ? format(d.plan.team) : "—"} />
                <Cell main={`${d.conversion.cur}%`} />
                <Cell main={d.avgCheck.cur ? format(d.avgCheck.cur) : "—"} />
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </DeskBlock>
  );
}

function Cell({
  main,
  sub,
  last,
}: {
  main: React.ReactNode;
  sub?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <td className={cn("px-3 py-2.5 text-right tabular-nums", last && "pr-4")}>
      <span className="block text-foreground">{main}</span>
      {sub !== undefined && sub !== "" && (
        <span className="block text-[11.5px] text-muted-foreground">{sub}</span>
      )}
    </td>
  );
}

/** Bugungi sotuv: today's takings so far against yesterday, and today's sales on a time line. */
export function TodayBlock({ d }: { d: DeskData }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const today = d.today;
  return (
    <DeskBlock
      tipKey="desk.today"
      title={t("desk.today")}
      icon={Wallet}
      tone="emerald"
      className="h-full"
      actions={<DeltaChip value={change({ cur: today.revenue, prev: today.yRevenue })} />}
    >
      <p className="font-display text-[30px] font-bold leading-tight tabular-nums text-foreground">
        {format(today.revenue)}
      </p>
      <p className="mt-1 text-[12.5px] tabular-nums text-muted-foreground">
        {t("desk.nSales", { n: today.count })} ·{" "}
        {t("desk.yesterdayUntil", { time: today.until, v: format(today.yRevenue) })}
      </p>
      <ol className="mt-4 border-t border-dashed border-border pt-4">
        {(today.list ?? []).length === 0 && (
          <li className="py-6 text-center text-[13px] text-muted-foreground">
            {t("desk.todayEmpty")}
          </li>
        )}
        {(today.list ?? []).map((s, k, all) => (
          <li key={s.id} className="grid grid-cols-[44px_16px_1fr_auto] items-start gap-2.5 pb-4">
            <span className="pt-px text-[12.5px] tabular-nums text-muted-foreground">{s.time}</span>
            <span className="relative flex justify-center self-stretch">
              {k < all.length - 1 && (
                <i className="absolute bottom-[-18px] top-[14px] w-0.5 bg-border" />
              )}
              <i className="relative mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15" />
            </span>
            <span className="min-w-0">
              <b
                className="block truncate text-[13.5px] font-semibold text-foreground"
                title={s.name}
              >
                {s.name || "—"}
              </b>
              <span className="block truncate text-[12px] text-muted-foreground">
                {[s.owner, s.funnel].filter(Boolean).join(" · ")}
              </span>
            </span>
            <b className="text-[13.5px] font-semibold tabular-nums text-foreground">
              {format(s.revenue)}
            </b>
          </li>
        ))}
      </ol>
    </DeskBlock>
  );
}
