import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  Clock3,
  Headphones,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Radio,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DeskBlock, DeskKpi } from "@/components/dashboard/desk/DeskParts";
import { CardBoard, type CardBoardItem } from "@/components/dashboard/HomeBoard";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  answerRate,
  clock,
  operatorStatus,
  type OperatorStatus,
  type PhoneCenterData,
} from "@/lib/phone-center";
import { cn } from "@/lib/utils";
import { PeriodBar } from "./PeriodBar";
import type { PcPeriod, PcSection } from "./PhoneCenterPage";

// Telefon → Asosiy (5TEL's dashboard): the period's calls in three cards,
// calls by hour, who is on the line right now and every operator's figures.

const tooltipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 13,
};

export const STATUS_DOT: Record<OperatorStatus, string> = {
  free: "bg-emerald-500",
  onCall: "bg-violet-500",
  unconfigured: "bg-amber-500",
  offline: "bg-slate-400",
};

/** Each operator with their live status (Operatorlar (jonli), Operatorlar). */
export function useLiveOperators(data: PhoneCenterData) {
  return useMemo(() => {
    const now = Date.now();
    const onCall = new Set(data.live?.onCall ?? []);
    return data.operators.map((o) => ({
      ...o,
      status: operatorStatus({
        extension: o.extension,
        onCall: onCall.has(o.id),
        seenAt: data.live?.seenAt?.[o.id] ?? null,
        now,
      }),
    }));
  }, [data]);
}

export function HourlyChart({ data }: { data: PhoneCenterData }) {
  const { t } = useI18n();
  const rows = (data.hourly ?? []).map((h) => ({ ...h, label: String(h.hour).padStart(2, "0") }));
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ left: -18, right: 6, top: 8 }} barGap={2}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            stroke="var(--color-muted-foreground)"
            interval={1}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            stroke="var(--color-muted-foreground)"
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)" }} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar
            dataKey="incoming"
            name={t("ptel.dir.incoming")}
            fill="#10b981"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="outgoing"
            name={t("ptel.dir.outgoing")}
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LiveOperators({ data }: { data: PhoneCenterData }) {
  const { t } = useI18n();
  const ops = useLiveOperators(data);
  if (ops.length === 0)
    return <p className="py-8 text-center text-[14px] text-muted-foreground">{t("ptel.noOps")}</p>;
  const order: OperatorStatus[] = ["onCall", "free", "unconfigured", "offline"];
  const sorted = [...ops].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <ul className="divide-y divide-border">
      {sorted.map((o) => (
        <li key={o.id} className="flex items-center gap-3 py-2.5 text-[14px]">
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-[13px] font-bold text-primary">
            {o.name.slice(0, 1).toUpperCase()}
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card",
                STATUS_DOT[o.status],
              )}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-foreground" title={o.name}>
              {o.name}
            </span>
            <span className="block truncate text-[13px] text-muted-foreground">
              {t(`ptel.st.${o.status}`)}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-bold tabular-nums text-foreground">{o.total}</span>
            <span className="block text-[12px] tabular-nums text-muted-foreground">
              {o.extension ? `#${o.extension}` : "—"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function OperatorsTable({ data }: { data: PhoneCenterData }) {
  const { t } = useI18n();
  const rows = data.operators.filter((o) => o.total > 0);
  const th = "px-3 py-3 text-right font-semibold whitespace-nowrap";
  if (rows.length === 0)
    return (
      <p className="py-8 text-center text-[14px] text-muted-foreground">{t("ptel.noCalls")}</p>
    );
  return (
    <div className="-mx-4 -my-4 overflow-x-auto sm:-mx-5 sm:-my-5">
      <table className="w-full min-w-[760px] text-[14px]">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-[13px] text-muted-foreground">
            <th className="py-3 pl-5 pr-3 font-semibold">{t("ptel.col.operator")}</th>
            <th className={th}>{t("ptel.col.total")}</th>
            <th className={th}>{t("ptel.col.in")}</th>
            <th className={th}>{t("ptel.col.out")}</th>
            <th className={th}>{t("ptel.col.missed")}</th>
            <th className={th}>{t("ptel.col.rate")}</th>
            <th className={th}>{t("ptel.col.talk")}</th>
            <th className="py-3 pl-3 pr-5 text-right font-semibold">{t("ptel.col.avg")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b border-border/70 last:border-0 hover:bg-accent/40">
              <td className="py-3 pl-5 pr-3 font-semibold text-foreground">{o.name}</td>
              <td className="px-3 py-3 text-right font-bold tabular-nums">{o.total}</td>
              <td className="px-3 py-3 text-right tabular-nums">{o.incoming}</td>
              <td className="px-3 py-3 text-right tabular-nums">{o.outgoing}</td>
              <td
                className={cn(
                  "px-3 py-3 text-right tabular-nums",
                  o.missed > 0 && "font-semibold text-rose-600 dark:text-rose-400",
                )}
              >
                {o.missed}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{o.answerRate}%</td>
              <td className="px-3 py-3 text-right tabular-nums">{clock(o.talkSeconds)}</td>
              <td className="py-3 pl-3 pr-5 text-right tabular-nums">{clock(o.avgSeconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OverviewSection({
  data,
  period,
  onPeriod,
  onSection,
}: {
  data: PhoneCenterData;
  period: PcPeriod;
  onPeriod: (p: PcPeriod) => void;
  onSection: (s: PcSection) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const x = data.totals;
  const sp = data.split ?? { outAnswered: 0, outNoAnswer: 0, inAnswered: 0, inMissed: 0 };
  const live = useLiveOperators(data);
  const onLine = live.filter((o) => o.status === "free" || o.status === "onCall").length;
  const share = x.total ? Math.round((x.incoming / x.total) * 100) : 0;

  const items: CardBoardItem[] = [
    {
      id: "total",
      title: t("ptel.k.total"),
      icon: PhoneCall,
      tone: "primary",
      span: 4,
      node: (
        <DeskKpi
          tipKey="ptel.k.total"
          label={t("ptel.k.total")}
          icon={PhoneCall}
          tone="primary"
          rawValue={x.total}
          value={x.total}
          prevText={t("ptel.k.totalHint", { i: x.incoming, o: x.outgoing })}
        >
          <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-emerald-500" style={{ width: `${share}%` }} />
            <div
              className="h-full bg-blue-500"
              style={{ width: `${x.total ? 100 - share : 0}%` }}
            />
          </div>
        </DeskKpi>
      ),
    },
    {
      id: "incoming",
      title: t("ptel.k.incoming"),
      icon: PhoneIncoming,
      tone: "emerald",
      span: 4,
      node: (
        <DeskKpi
          tipKey="ptel.k.incoming"
          label={t("ptel.k.incoming")}
          icon={PhoneIncoming}
          tone="emerald"
          rawValue={x.incoming}
          value={x.incoming}
        >
          <p className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px]">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {t("ptel.k.inAnswered", { n: sp.inAnswered })}
            </span>
            <span className="font-semibold text-rose-600 dark:text-rose-400">
              {t("ptel.k.inMissed", { n: sp.inMissed })}
            </span>
          </p>
        </DeskKpi>
      ),
    },
    {
      id: "outgoing",
      title: t("ptel.k.outgoing"),
      icon: PhoneOutgoing,
      tone: "sky",
      span: 4,
      node: (
        <DeskKpi
          tipKey="ptel.k.outgoing"
          label={t("ptel.k.outgoing")}
          icon={PhoneOutgoing}
          tone="sky"
          rawValue={x.outgoing}
          value={x.outgoing}
        >
          <p className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px]">
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {t("ptel.k.outAnswered", { n: sp.outAnswered })}
            </span>
            <span className="font-semibold text-muted-foreground">
              {t("ptel.k.outRate", { n: answerRate(sp.outAnswered, x.outgoing) })}
            </span>
          </p>
        </DeskKpi>
      ),
    },
    {
      id: "hourly",
      title: t("ptel.b.hourly"),
      icon: Clock3,
      tone: "primary",
      span: 8,
      sizes: [6, 8, 12],
      node: (
        <DeskBlock title={t("ptel.b.hourly")} icon={Clock3} tone="primary">
          <HourlyChart data={data} />
        </DeskBlock>
      ),
    },
    {
      id: "live",
      title: t("ptel.b.live"),
      icon: Radio,
      tone: "emerald",
      span: 4,
      sizes: [4, 6, 8, 12],
      node: (
        <DeskBlock
          title={t("ptel.b.live")}
          icon={Radio}
          tone="emerald"
          actions={
            <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
              {t("ptel.onLine", { n: onLine })}
            </span>
          }
        >
          <LiveOperators data={data} />
        </DeskBlock>
      ),
    },
    {
      id: "byOperator",
      title: t("ptel.b.byOperator"),
      icon: Headphones,
      tone: "amber",
      span: 12,
      sizes: [8, 12],
      node: (
        <DeskBlock
          title={t("ptel.b.byOperator")}
          icon={Headphones}
          tone="amber"
          actions={
            <span className="flex items-center gap-3">
              {isAdmin && (
                <Link
                  to="/admin/call-settings"
                  search={{ tab: "operators" }}
                  className="text-[13px] font-semibold text-primary hover:underline"
                >
                  {t("ptel.setExt")}
                </Link>
              )}
              <button
                type="button"
                onClick={() => onSection("operators")}
                className="text-[13px] font-semibold text-primary hover:underline"
              >
                {t("ptel.more")}
              </button>
            </span>
          }
        >
          <OperatorsTable data={data} />
        </DeskBlock>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Phones: the board's toolbar is hidden there, so the period sits on its own. */}
      <PeriodBar
        className="hidden phone:flex"
        options={["today", "yesterday", "week", "month"]}
        value={period}
        onChange={onPeriod}
      />
      <CardBoard
        boardKey="phone.main.v2"
        items={items}
        toolbar={
          <PeriodBar
            className="mr-auto"
            options={["today", "yesterday", "week", "month"]}
            value={period}
            onChange={onPeriod}
          />
        }
      />
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Activity className="h-4 w-4" />
        {t("ptel.liveNote")}
      </p>
    </div>
  );
}
