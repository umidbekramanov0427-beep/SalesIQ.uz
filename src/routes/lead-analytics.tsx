import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Loader2,
  Zap,
  Layers,
  SlidersHorizontal,
  Shuffle,
  GitBranch,
  User,
  Users,
  ChevronRight,
  ChevronLeft,
  Megaphone,
  DollarSign,
  Trash2,
  Plus,
  FileText,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { FilterTile, TileOption } from "@/components/filters/FilterTile";
import { PageHeader, SectionCard, StatCard, Pill } from "@/components/layout/Primitives";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useFunnelNames,
  useProfilesRaw,
  useLeadAnalyticsAction,
  useManagerIdsInFunnel,
  useLeadAnalyticsQuality,
  useLeadAnalyticsCurrent,
  useLeadAnalyticsDirection,
  useLeadAnalyticsMarketing,
  useMarketingSpend,
  useUpsertMarketingSpend,
  useDeleteMarketingSpend,
  useGenerateLeadAnalyticsReport,
  type LeadAnalyticsRecoverableRow,
  type LeadAnalyticsHotRow,
  type LeadAnalyticsTagResultRow,
  type LeadAnalyticsTagMatrixRow,
  type LeadAnalyticsTagCategoryRow,
  type LeadAnalyticsStageRow,
  type LeadAnalyticsManagerLoadRow,
  type LeadAnalyticsLostReasonRow,
  type LeadAnalyticsChurnRow,
  type LeadAnalyticsSourceRow,
  type LeadAnalyticsCampaignRow,
  type LeadAnalyticsQualityBySourceRow,
  type LeadAnalyticsLostReasonBySourceRow,
  type LeadAnalyticsSpeedBySourceRow,
  type LeadAnalyticsDailyTrendRow,
  type MarketingSpendRow,
  type LeadAnalyticsFullReportData,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PermissionGate } from "@/components/PermissionGate";

const CallPickupByHourChart = lazy(() =>
  import("@/components/dashboard/Charts").then((m) => ({ default: m.CallPickupByHourChart })),
);

export const Route = createFileRoute("/lead-analytics")({
  head: () => ({
    meta: [
      { title: "Lead Analytics — SalesIQ" },
      {
        name: "description",
        content: "At-risk leads, hot leads close to closing, and lead conversion health.",
      },
    ],
  }),
  component: LeadAnalyticsGated,
});

function LeadAnalyticsGated() {
  return (
    <PermissionGate action="View leads">
      <LeadAnalytics />
    </PermissionGate>
  );
}

type Tab = "action" | "quality" | "current" | "direction" | "marketing";
type Period = "daily" | "weekly" | "monthly" | "all";

function periodSince(period: Period, monthYear: number, monthIndex: number): Date | null {
  const now = new Date();
  if (period === "daily") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "weekly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "monthly") {
    return new Date(monthYear, monthIndex, 1);
  }
  return null;
}

const MONTH_TILE_LABELS = [
  "Yan",
  "Fev",
  "Mar",
  "Apr",
  "May",
  "Iyun",
  "Iyul",
  "Avg",
  "Sen",
  "Okt",
  "Noy",
  "Dek",
];

function TempPill({ temperature, t }: { temperature: string; t: (k: string) => string }) {
  const tone =
    temperature === "VeryHot"
      ? "danger"
      : temperature === "Hot"
        ? "danger"
        : temperature === "Warm"
          ? "gold"
          : "blue";
  const label =
    temperature === "VeryHot"
      ? t("leadAnalytics.tempVeryHot")
      : temperature === "Hot"
        ? t("leadAnalytics.tempHot")
        : temperature === "Warm"
          ? t("leadAnalytics.tempWarm")
          : t("leadAnalytics.tempCold");
  return <Pill tone={tone}>{label}</Pill>;
}

function RecoverableTable({
  rows,
  format,
  t,
}: {
  rows: LeadAnalyticsRecoverableRow[];
  format: (n: number) => string;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{t("leadAnalytics.noLost")}</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
            <th className="py-2 pr-3">{t("leadAnalytics.colLead")}</th>
            <th className="py-2 pr-3">{t("leadAnalytics.colManager")}</th>
            <th className="py-2 pr-3 text-right">{t("leadAnalytics.colDaysClosed")}</th>
            <th className="py-2 pr-3 text-right">{t("leadAnalytics.colValue")}</th>
            <th className="py-2 pl-3">{t("leadAnalytics.colNextFollowUp")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.lead_id} className="border-b border-border/60 last:border-0">
              <td
                className="max-w-[140px] truncate py-2 pr-3 font-semibold text-foreground"
                title={r.reason ?? undefined}
              >
                {r.name}
              </td>
              <td className="max-w-[120px] truncate py-2 pr-3 text-muted-foreground">
                {r.manager}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                {r.days_since_closed}d
              </td>
              <td className="py-2 pr-3 text-right font-semibold tabular-nums text-success">
                {format(r.value)}
              </td>
              <td className="max-w-[180px] truncate py-2 pl-3 text-xs text-subtle">
                {r.next_follow_up || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HotPipelineTable({
  rows,
  format,
  t,
}: {
  rows: LeadAnalyticsHotRow[];
  format: (n: number) => string;
  t: (k: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{t("leadAnalytics.noHot")}</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
            <th className="py-2 pr-3">{t("leadAnalytics.colLead")}</th>
            <th className="py-2 pr-3">{t("leadAnalytics.colManager")}</th>
            <th className="py-2 pr-3 text-right">{t("leadAnalytics.colScore")}</th>
            <th className="py-2 pr-3">{t("leadAnalytics.colTemperature")}</th>
            <th className="py-2 pr-3">{t("leadAnalytics.colStage")}</th>
            <th className="py-2 pl-3 text-right">{t("leadAnalytics.colValue")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.lead_id} className="border-b border-border/60 last:border-0">
              <td className="max-w-[140px] truncate py-2 pr-3 font-semibold text-foreground">
                {r.name}
              </td>
              <td className="max-w-[120px] truncate py-2 pr-3 text-muted-foreground">
                {r.manager}
              </td>
              <td className="py-2 pr-3 text-right font-bold tabular-nums text-foreground">
                {r.score}
              </td>
              <td className="py-2 pr-3">
                <TempPill temperature={r.temperature} t={t} />
              </td>
              <td className="max-w-[120px] truncate py-2 pr-3 text-muted-foreground">{r.stage}</td>
              <td className="py-2 pl-3 text-right font-semibold tabular-nums text-foreground">
                {format(r.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-popover)",
  boxShadow: "var(--shadow-elevated)",
  fontSize: 12,
};

function ActionTab({
  data,
  isLoading,
  format,
  t,
}: {
  data: ReturnType<typeof useLeadAnalyticsAction>["data"];
  isLoading: boolean;
  format: (n: number) => string;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <div className="mt-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
          01 &nbsp;{t("leadAnalytics.actionSectionLabel")}
        </p>
        <h2 className="mt-1 text-xl font-bold text-foreground">{t("leadAnalytics.actionTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("leadAnalytics.actionDesc")}</p>
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-2">
        <SectionCard
          title={t("leadAnalytics.lostTitle")}
          description={t("leadAnalytics.lostDesc")}
          actions={
            !isLoading && (
              <div className="text-right">
                <p className="text-lg font-bold tabular-nums text-success">
                  {format(data?.recoverableRevenue ?? 0)}
                </p>
                <p className="text-[11px] text-subtle">
                  {t("leadAnalytics.recoverableCountHint", {
                    count: data?.recoverableCount ?? 0,
                  })}
                </p>
              </div>
            )
          }
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <RecoverableTable rows={data?.recoverable ?? []} format={format} t={t} />
          )}
        </SectionCard>

        <SectionCard title={t("leadAnalytics.hotTitle")} description={t("leadAnalytics.hotDesc")}>
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <HotPipelineTable rows={data?.hotPipeline ?? []} format={format} t={t} />
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title={t("leadAnalytics.operatorActivityTitle")}
          description={t("leadAnalytics.operatorActivityDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (data?.operatorActivity ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("leadAnalytics.noOperatorActivity")}
            </p>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data?.operatorActivity ?? []}
                  margin={{ left: -14, right: 8, top: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="manager"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    stroke="var(--color-subtle)"
                    interval={0}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    stroke="var(--color-subtle)"
                  />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)" }} />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value: string) =>
                      value === "won_connected"
                        ? t("leadAnalytics.legendWonConnected")
                        : value === "won_attempts"
                          ? t("leadAnalytics.legendWonAttempts")
                          : value === "lost_connected"
                            ? t("leadAnalytics.legendLostConnected")
                            : t("leadAnalytics.legendLostAttempts")
                    }
                  />
                  <Bar dataKey="won_connected" stackId="a" fill="var(--color-success)" />
                  <Bar dataKey="won_attempts" stackId="a" fill="var(--color-mint-border)" />
                  <Bar dataKey="lost_connected" stackId="a" fill="var(--color-warning)" />
                  <Bar dataKey="lost_attempts" stackId="a" fill="var(--color-destructive)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function TagResultsBars({
  rows,
  t,
}: {
  rows: LeadAnalyticsTagResultRow[];
  t: (k: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("leadAnalytics.noTagData")}
      </p>
    );
  }
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-success" /> {t("leadAnalytics.legendSold")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive" />{" "}
          {t("leadAnalytics.legendLost")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />{" "}
          {t("leadAnalytics.legendOpen")}
        </span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.tag} className="flex items-center gap-3">
            <span
              className="w-32 shrink-0 truncate text-xs font-medium text-foreground"
              title={r.tag}
            >
              {r.tag}
            </span>
            <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-success" style={{ width: `${(r.sold / max) * 100}%` }} />
              <div
                className="h-full bg-destructive"
                style={{ width: `${(r.lost / max) * 100}%` }}
              />
              <div
                className="h-full bg-muted-foreground/40"
                style={{ width: `${(r.open / max) * 100}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-subtle">
              {r.total}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Green (good) -> red (bad) blend, normalized against this tag set's own
// min/max for the column -- an absolute 0-100 scale would leave every real
// account's spread looking uniformly beige, since scores/conversion rarely
// span the full range in practice.
function heatStyle(value: number | null, min: number, max: number): CSSProperties {
  if (value == null || max === min) return {};
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const r = Math.round(239 - (239 - 34) * t);
  const g = Math.round(68 + (197 - 68) * t);
  const b = Math.round(68 + (94 - 68) * t);
  return { backgroundColor: `rgba(${r}, ${g}, ${b}, 0.16)` };
}

function TagMatrixTable({
  rows,
  t,
}: {
  rows: LeadAnalyticsTagMatrixRow[];
  t: (k: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("leadAnalytics.noTagData")}
      </p>
    );
  }
  const scores = rows.map((r) => r.avg_score).filter((v): v is number => v != null);
  const convs = rows.map((r) => r.conversion).filter((v): v is number => v != null);
  const scoreMin = Math.min(...scores, 0);
  const scoreMax = Math.max(...scores, 1);
  const convMin = Math.min(...convs, 0);
  const convMax = Math.max(...convs, 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
            <th className="py-2 pr-3">{t("leadAnalytics.colTag")}</th>
            <th className="py-2 pr-3 text-right">{t("leadAnalytics.colLeads")}</th>
            <th className="py-2 pr-3 text-right">{t("leadAnalytics.colScore")}</th>
            <th className="py-2 pr-3 text-right">{t("leadAnalytics.colConv")}</th>
            <th className="py-2 pl-3 text-right">{t("leadAnalytics.colQualification")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.tag}
              className={cn(
                "border-b border-border/60 last:border-0",
                r.low_sample && "opacity-40",
              )}
            >
              <td className="max-w-[160px] truncate py-2 pr-3 font-semibold text-foreground">
                {r.tag}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-foreground">{r.total}</td>
              <td
                className="py-2 pr-3 text-right tabular-nums text-foreground"
                style={heatStyle(r.avg_score, scoreMin, scoreMax)}
              >
                {r.avg_score ?? "—"} <span className="text-subtle">/{r.total}</span>
              </td>
              <td
                className="py-2 pr-3 text-right tabular-nums text-foreground"
                style={heatStyle(r.conversion, convMin, convMax)}
              >
                {r.conversion != null ? `${r.conversion}%` : "—"}
              </td>
              <td className="py-2 pl-3 text-right tabular-nums text-subtle">
                {t("leadAnalytics.noQualificationData")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-subtle">
        {t("leadAnalytics.matrixFootnote")}
      </p>
    </div>
  );
}

function TagCategoryChart({ rows }: { rows: LeadAnalyticsTagCategoryRow[] }) {
  const data = rows.map((r) => ({
    tag: r.tag,
    Sovuq: r.cold,
    Iliq: r.warm,
    Issiq: r.hot,
    "Juda issiq": r.very_hot,
  }));
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -14, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="tag"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            stroke="var(--color-subtle)"
            interval={0}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-subtle)" />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Sovuq" stackId="a" fill="var(--color-primary)" />
          <Bar dataKey="Iliq" stackId="a" fill="var(--color-mint-border)" />
          <Bar dataKey="Issiq" stackId="a" fill="var(--color-warning)" />
          <Bar dataKey="Juda issiq" stackId="a" fill="var(--color-destructive)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function QualityTab({
  funnel,
  managerId,
  teamId,
  since,
  t,
}: {
  funnel: string;
  managerId: string;
  teamId: string;
  since: Date | null;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const { data, isLoading } = useLeadAnalyticsQuality(
    funnel || null,
    managerId || null,
    teamId || null,
    since,
  );
  return (
    <>
      <div className="mt-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
          02 &nbsp;{t("leadAnalytics.tagResultsLabel")}
        </p>
        <h2 className="mt-1 text-xl font-bold text-foreground">
          {t("leadAnalytics.qualityTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("leadAnalytics.qualityDesc")}</p>
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-2">
        <SectionCard
          title={t("leadAnalytics.tagResultsTitle")}
          description={t("leadAnalytics.tagResultsDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <TagResultsBars rows={data?.tagResults ?? []} t={t} />
          )}
        </SectionCard>

        <SectionCard
          title={t("leadAnalytics.matrixTitle")}
          description={t("leadAnalytics.matrixDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <TagMatrixTable rows={data?.tagMatrix ?? []} t={t} />
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title={t("leadAnalytics.categoryTitle")}
          description={t("leadAnalytics.categoryDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (data?.tagCategories ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("leadAnalytics.noTagData")}
            </p>
          ) : (
            <TagCategoryChart rows={data?.tagCategories ?? []} />
          )}
        </SectionCard>
      </div>
    </>
  );
}

function TemperatureDonut({
  temperature,
  t,
}: {
  temperature: { cold: number; warm: number; hot: number; veryHot: number };
  t: (k: string) => string;
}) {
  const data = [
    { name: t("leadAnalytics.tempCold"), value: temperature.cold, color: "var(--color-primary)" },
    {
      name: t("leadAnalytics.tempWarm"),
      value: temperature.warm,
      color: "var(--color-mint-border)",
    },
    { name: t("leadAnalytics.tempHot"), value: temperature.hot, color: "var(--color-warning)" },
    {
      name: t("leadAnalytics.tempVeryHot"),
      value: temperature.veryHot,
      color: "var(--color-destructive)",
    },
  ];
  const total = temperature.cold + temperature.warm + temperature.hot + temperature.veryHot;
  return (
    <div className="relative h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={70} outerRadius={100} paddingAngle={2}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-extrabold text-foreground">{total}</span>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
        {data.map((d) => (
          <span key={d.name} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
            {d.name} {d.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function StageFunnelList({ rows, t }: { rows: LeadAnalyticsStageRow[]; t: (k: string) => string }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("leadAnalytics.noStages")}
      </p>
    );
  }
  const max = Math.max(...rows.map((r) => r.lead_count), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.stage} className="flex items-center gap-3">
          <span
            className="w-36 shrink-0 truncate text-xs font-medium text-foreground"
            title={r.stage}
          >
            {r.stage}
          </span>
          <div className="h-6 flex-1 overflow-hidden rounded-lg bg-muted">
            <div
              className="flex h-full items-center rounded-lg bg-primary/70 px-2"
              style={{ width: `${Math.max((r.lead_count / max) * 100, 8)}%` }}
            >
              <span className="text-[11px] font-bold text-primary-foreground">{r.lead_count}</span>
            </div>
          </div>
          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-subtle">
            {r.avg_days != null ? `${r.avg_days}${t("leadAnalytics.daysSuffix")}` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ManagerLoadChart({ rows }: { rows: LeadAnalyticsManagerLoadRow[] }) {
  const data = rows.map((r) => ({
    manager: r.manager,
    Sovuq: r.cold,
    Iliq: r.warm,
    Issiq: r.hot,
    "Juda issiq": r.very_hot,
  }));
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -14, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="manager"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            stroke="var(--color-subtle)"
            interval={0}
            angle={-30}
            textAnchor="end"
            height={60}
          />
          <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-subtle)" />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Sovuq" stackId="a" fill="var(--color-primary)" />
          <Bar dataKey="Iliq" stackId="a" fill="var(--color-mint-border)" />
          <Bar dataKey="Issiq" stackId="a" fill="var(--color-warning)" />
          <Bar dataKey="Juda issiq" stackId="a" fill="var(--color-destructive)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CurrentTab({
  funnel,
  managerId,
  teamId,
  since,
  t,
}: {
  funnel: string;
  managerId: string;
  teamId: string;
  since: Date | null;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const { data, isLoading } = useLeadAnalyticsCurrent(
    funnel || null,
    managerId || null,
    teamId || null,
    since,
  );
  return (
    <>
      <div className="mt-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
          03 &nbsp;{t("leadAnalytics.stagesLabel")}
        </p>
        <h2 className="mt-1 text-xl font-bold text-foreground">
          {t("leadAnalytics.currentTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("leadAnalytics.currentDesc")}</p>
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-2">
        <SectionCard
          title={t("leadAnalytics.temperatureTitle")}
          description={t("leadAnalytics.temperatureDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <TemperatureDonut
              temperature={data?.temperature ?? { cold: 0, warm: 0, hot: 0, veryHot: 0 }}
              t={t}
            />
          )}
        </SectionCard>

        <SectionCard
          title={t("leadAnalytics.stagesTitle")}
          description={t("leadAnalytics.stagesDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <StageFunnelList rows={data?.stages ?? []} t={t} />
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title={t("leadAnalytics.managerLoadTitle")}
          description={t("leadAnalytics.managerLoadDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (data?.managerLoad ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("leadAnalytics.noManagerLoad")}
            </p>
          ) : (
            <ManagerLoadChart rows={data?.managerLoad ?? []} />
          )}
        </SectionCard>
      </div>
    </>
  );
}

function TrajectoryDonut({
  direction,
  t,
}: {
  direction: { closingSoon: number; neutral: number; losingSoon: number };
  t: (k: string) => string;
}) {
  const data = [
    {
      name: t("leadAnalytics.closingSoon"),
      value: direction.closingSoon,
      color: "var(--color-success)",
    },
    { name: t("leadAnalytics.neutral"), value: direction.neutral, color: "var(--color-primary)" },
    {
      name: t("leadAnalytics.losingSoon"),
      value: direction.losingSoon,
      color: "var(--color-destructive)",
    },
  ];
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={70} outerRadius={100} paddingAngle={2}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => {
              const d = data.find((x) => x.name === value);
              return `${value} ${d?.value ?? 0}`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

const LOST_REASON_COLORS = [
  "var(--color-destructive)",
  "var(--color-warning)",
  "var(--color-primary)",
  "var(--color-mint-border)",
  "var(--color-success)",
];

function LostReasonsDonut({
  rows,
  t,
}: {
  rows: LeadAnalyticsLostReasonRow[];
  t: (k: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("leadAnalytics.noLostReasons")}
      </p>
    );
  }
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="relative h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows}
            dataKey="count"
            nameKey="reason"
            innerRadius={70}
            outerRadius={100}
            paddingAngle={2}
          >
            {rows.map((r, i) => (
              <Cell key={r.reason} fill={LOST_REASON_COLORS[i % LOST_REASON_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-extrabold text-foreground">{total}</span>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {rows[0]!.reason} — {t("leadAnalytics.legendLost")}
      </p>
    </div>
  );
}

function StageSpeedChart({ rows, t }: { rows: LeadAnalyticsStageRow[]; t: (k: string) => string }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("leadAnalytics.noStages")}
      </p>
    );
  }
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ left: -14, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="stage"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            stroke="var(--color-subtle)"
            interval={0}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-subtle)" />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)" }} />
          <Bar dataKey="avg_days" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChurnRiskTable({
  rows,
  t,
}: {
  rows: LeadAnalyticsChurnRow[];
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("leadAnalytics.noChurnRisk")}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
            <th className="py-2 pr-3">{t("leadAnalytics.colLead")}</th>
            <th className="py-2 pr-3">{t("leadAnalytics.colManager")}</th>
            <th className="py-2 pr-3">{t("leadAnalytics.colLastContact")}</th>
            <th className="py-2 pl-3">{t("leadAnalytics.colRisk")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.lead_id} className="border-b border-border/60 last:border-0">
              <td className="max-w-[140px] truncate py-2 pr-3 font-semibold text-foreground">
                {r.name}
              </td>
              <td className="max-w-[120px] truncate py-2 pr-3 text-muted-foreground">
                {r.manager}
              </td>
              <td className="py-2 pr-3 tabular-nums text-foreground">
                {r.days_since_contact != null
                  ? `${r.days_since_contact}${t("leadAnalytics.daysSuffix")}`
                  : t("leadAnalytics.neverContacted")}
              </td>
              <td className="py-2 pl-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-destructive"
                      style={{ width: `${r.risk_percent}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold tabular-nums text-destructive">
                    {r.risk_percent}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DirectionTab({
  funnel,
  managerId,
  teamId,
  since,
  t,
}: {
  funnel: string;
  managerId: string;
  teamId: string;
  since: Date | null;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const { data, isLoading } = useLeadAnalyticsDirection(
    funnel || null,
    managerId || null,
    teamId || null,
    since,
  );
  const { data: currentData, isLoading: currentLoading } = useLeadAnalyticsCurrent(
    funnel || null,
    managerId || null,
    teamId || null,
    since,
  );
  return (
    <>
      <div className="mt-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
          04 &nbsp;{t("leadAnalytics.trajectoryTitle")}
        </p>
        <h2 className="mt-1 text-xl font-bold text-foreground">
          {t("leadAnalytics.directionTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("leadAnalytics.directionDesc")}</p>
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-2">
        <SectionCard
          title={t("leadAnalytics.trajectoryTitle")}
          description={t("leadAnalytics.trajectoryDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <TrajectoryDonut
              direction={data?.direction ?? { closingSoon: 0, neutral: 0, losingSoon: 0 }}
              t={t}
            />
          )}
        </SectionCard>

        <SectionCard
          title={t("leadAnalytics.lostReasonsTitle")}
          description={t("leadAnalytics.lostReasonsDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <LostReasonsDonut rows={data?.lostReasons ?? []} t={t} />
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <SectionCard
          title={t("leadAnalytics.speedTitle")}
          description={t("leadAnalytics.speedDesc")}
        >
          {currentLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <StageSpeedChart rows={currentData?.stages ?? []} t={t} />
          )}
        </SectionCard>

        <SectionCard
          title={t("leadAnalytics.churnRiskTitle")}
          description={t("leadAnalytics.churnRiskDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <ChurnRiskTable rows={data?.churnRisk ?? []} t={t} />
          )}
        </SectionCard>
      </div>
    </>
  );
}

type ChannelRow = {
  total: number;
  won: number;
  lost: number;
  revenue: number;
  conversion: number | null;
};

function ChannelBreakdownTable<T extends ChannelRow>({
  rows,
  getLabel,
  format,
  t,
  emptyMessage,
}: {
  rows: T[];
  getLabel: (row: T) => string;
  format: (n: number) => string;
  t: (k: string) => string;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
            <th className="py-2 pr-3">{t("leadAnalytics.colChannel")}</th>
            <th className="py-2 pr-3 text-right">{t("leadAnalytics.colTotal")}</th>
            <th className="py-2 pr-3 text-right">{t("leadAnalytics.colWon")}</th>
            <th className="py-2 pr-3 text-right">{t("leadAnalytics.colLost")}</th>
            <th className="py-2 pr-3 text-right">{t("leadAnalytics.colConversion")}</th>
            <th className="py-2 pl-3 text-right">{t("leadAnalytics.colRevenue")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={getLabel(r)} className="border-b border-border/60 last:border-0">
              <td className="max-w-[160px] truncate py-2 pr-3 font-semibold text-foreground">
                {getLabel(r)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-foreground">{r.total}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-success">{r.won}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-destructive">{r.lost}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                {r.conversion != null ? `${r.conversion}%` : "—"}
              </td>
              <td className="py-2 pl-3 text-right font-semibold tabular-nums text-foreground">
                {format(r.revenue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QualityBySourceChart({
  rows,
  t,
}: {
  rows: LeadAnalyticsQualityBySourceRow[];
  t: (k: string) => string;
}) {
  const qualifiedLabel = t("leadAnalytics.qualified");
  const unqualifiedLabel = t("leadAnalytics.unqualified");
  const unscoredLabel = t("leadAnalytics.unscored");
  const data = rows.map((r) => ({
    source: r.source,
    [qualifiedLabel]: r.qualified,
    [unqualifiedLabel]: r.unqualified,
    [unscoredLabel]: r.unscored,
  }));
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("leadAnalytics.noSourceData")}
      </p>
    );
  }
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -14, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="source"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            stroke="var(--color-subtle)"
            interval={0}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-subtle)" />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey={qualifiedLabel} stackId="a" fill="var(--color-success)" />
          <Bar dataKey={unqualifiedLabel} stackId="a" fill="var(--color-destructive)" />
          <Bar dataKey={unscoredLabel} stackId="a" fill="var(--color-subtle)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LostReasonsBySourceTable({
  rows,
  t,
}: {
  rows: LeadAnalyticsLostReasonBySourceRow[];
  t: (k: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("leadAnalytics.noLostReasonsBySource")}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
            <th className="py-2 pr-3">{t("leadAnalytics.colChannel")}</th>
            <th className="py-2 pr-3">{t("leadAnalytics.colLostReason")}</th>
            <th className="py-2 pl-3 text-right">{t("leadAnalytics.colCount")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.source}-${r.reason}-${i}`}
              className="border-b border-border/60 last:border-0"
            >
              <td className="max-w-[140px] truncate py-2 pr-3 font-semibold text-foreground">
                {r.source}
              </td>
              <td className="max-w-[220px] truncate py-2 pr-3 text-muted-foreground">{r.reason}</td>
              <td className="py-2 pl-3 text-right font-bold tabular-nums text-destructive">
                {r.count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpeedBySourceChart({
  rows,
  t,
}: {
  rows: LeadAnalyticsSpeedBySourceRow[];
  t: (k: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("leadAnalytics.noSpeedBySource")}
      </p>
    );
  }
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ left: -14, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="source"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            stroke="var(--color-subtle)"
            interval={0}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-subtle)" />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--color-accent)" }}
            formatter={(value: number) => [
              `${value}${t("leadAnalytics.hoursSuffix")}`,
              t("leadAnalytics.colSpeed"),
            ]}
          />
          <Bar dataKey="avg_hours" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function pivotDailyTrend(rows: LeadAnalyticsDailyTrendRow[], otherLabel: string) {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.source, (totals.get(r.source) ?? 0) + r.count);
  const topSources = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source]) => source);
  const topSet = new Set(topSources);
  const hasOther = totals.size > topSources.length;
  const byDate = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const key = topSet.has(r.source) ? r.source : otherLabel;
    const bucket = byDate.get(r.date) ?? {};
    bucket[key] = (bucket[key] ?? 0) + r.count;
    byDate.set(r.date, bucket);
  }
  const dates = [...byDate.keys()].sort();
  const series = hasOther ? [...topSources, otherLabel] : topSources;
  const data = dates.map((date) => ({ date, ...byDate.get(date) }));
  return { data, series };
}

function DailyTrendChart({
  rows,
  t,
}: {
  rows: LeadAnalyticsDailyTrendRow[];
  t: (k: string) => string;
}) {
  const { data, series } = useMemo(
    () => pivotDailyTrend(rows, t("leadAnalytics.otherSource")),
    [rows, t],
  );
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("leadAnalytics.noDailyTrend")}
      </p>
    );
  }
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -14, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            stroke="var(--color-subtle)"
          />
          <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-subtle)" />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s, i) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              stroke={LOST_REASON_COLORS[i % LOST_REASON_COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MarketingSpendSection({
  monthDate,
  bySource,
  format,
  t,
}: {
  monthDate: Date;
  bySource: LeadAnalyticsSourceRow[];
  format: (n: number) => string;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const { data: spendRows, isLoading } = useMarketingSpend(monthDate);
  const upsertSpend = useUpsertMarketingSpend();
  const deleteSpend = useDeleteMarketingSpend();
  const [source, setSource] = useState("");
  const [campaign, setCampaign] = useState("");
  const [amount, setAmount] = useState("");

  const spendBySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of spendRows ?? []) {
      map.set(s.source, (map.get(s.source) ?? 0) + Number(s.amount));
    }
    return map;
  }, [spendRows]);

  const totalSpend = useMemo(
    () => [...spendBySource.values()].reduce((sum, v) => sum + v, 0),
    [spendBySource],
  );

  async function addSpend(e: FormEvent) {
    e.preventDefault();
    const amountNum = Number(amount);
    if (!source.trim() || !Number.isFinite(amountNum) || amountNum < 0) return;
    try {
      await upsertSpend.mutateAsync({ source, campaign, month: monthDate, amount: amountNum });
      toast.success(t("leadAnalytics.spendSaved"));
      setSource("");
      setCampaign("");
      setAmount("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("leadAnalytics.spendSaveFailed"));
    }
  }

  async function removeSpend(id: string) {
    try {
      await deleteSpend.mutateAsync(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("leadAnalytics.spendSaveFailed"));
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
        {isLoading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
        ) : bySource.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("leadAnalytics.noSourceData")}
          </p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
                <th className="py-2 pr-3">{t("leadAnalytics.colChannel")}</th>
                <th className="py-2 pr-3 text-right">{t("leadAnalytics.colLeads")}</th>
                <th className="py-2 pr-3 text-right">{t("leadAnalytics.colSpend")}</th>
                <th className="py-2 pr-3 text-right">{t("leadAnalytics.colCpl")}</th>
                <th className="py-2 pl-3 text-right">{t("leadAnalytics.colRoi")}</th>
              </tr>
            </thead>
            <tbody>
              {bySource.map((r) => {
                const spend = spendBySource.get(r.source) ?? 0;
                const cpl = spend > 0 && r.total > 0 ? spend / r.total : null;
                const roi = spend > 0 ? ((r.revenue - spend) / spend) * 100 : null;
                return (
                  <tr key={r.source} className="border-b border-border/60 last:border-0">
                    <td className="max-w-[160px] truncate py-2 pr-3 font-semibold text-foreground">
                      {r.source}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">{r.total}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                      {spend > 0 ? format(spend) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                      {cpl != null ? format(cpl) : "—"}
                    </td>
                    <td
                      className={cn(
                        "py-2 pl-3 text-right font-bold tabular-nums",
                        roi == null
                          ? "text-subtle"
                          : roi >= 0
                            ? "text-success"
                            : "text-destructive",
                      )}
                    >
                      {roi != null ? `${roi.toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-surface p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-subtle">
          {t("leadAnalytics.spendListTitle", { total: format(totalSpend) })}
        </p>
        {(spendRows ?? []).length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {(spendRows ?? []).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm"
              >
                <span className="truncate text-foreground">
                  {s.source}
                  {s.campaign ? ` · ${s.campaign}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-foreground">
                    {format(Number(s.amount))}
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeSpend(s.id)}
                    className="rounded-lg p-1.5 text-subtle hover:bg-destructive/10 hover:text-destructive"
                    aria-label={t("settings.list.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={(e) => void addSpend(e)} className="flex flex-wrap items-center gap-2">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder={t("leadAnalytics.spendSourcePlaceholder")}
            className="h-9 min-w-[140px] flex-1 rounded-lg border border-dashed border-border bg-background px-2.5 text-xs outline-none focus:border-primary/40"
          />
          <input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder={t("leadAnalytics.spendCampaignPlaceholder")}
            className="h-9 min-w-[140px] flex-1 rounded-lg border border-dashed border-border bg-background px-2.5 text-xs outline-none focus:border-primary/40"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("leadAnalytics.spendAmountPlaceholder")}
            className="h-9 w-32 rounded-lg border border-dashed border-border bg-background px-2.5 text-xs outline-none focus:border-primary/40"
          />
          <button
            type="submit"
            disabled={upsertSpend.isPending || !source.trim() || !amount}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-dashed border-border px-3 text-xs font-medium text-subtle transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("leadAnalytics.spendAdd")}
          </button>
        </form>
        <p className="mt-2 text-[11px] leading-relaxed text-subtle">
          {t("leadAnalytics.spendHint")}
        </p>
      </div>
    </>
  );
}

function MarketingTab({
  funnel,
  managerId,
  teamId,
  since,
  until,
  monthDate,
  period,
  format,
  t,
}: {
  funnel: string;
  managerId: string;
  teamId: string;
  since: Date | null;
  until: Date | null;
  monthDate: Date;
  period: Period;
  format: (n: number) => string;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const { data, isLoading } = useLeadAnalyticsMarketing(
    funnel || null,
    managerId || null,
    teamId || null,
    since,
    until,
  );

  return (
    <>
      <div className="mt-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
          05 &nbsp;{t("leadAnalytics.marketingSectionLabel")}
        </p>
        <h2 className="mt-1 text-xl font-bold text-foreground">
          {t("leadAnalytics.marketingTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("leadAnalytics.marketingDesc")}</p>
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-2">
        <SectionCard
          title={t("leadAnalytics.bySourceTitle")}
          description={t("leadAnalytics.bySourceDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <ChannelBreakdownTable
              rows={data?.bySource ?? []}
              getLabel={(r) => r.source}
              format={format}
              t={t}
              emptyMessage={t("leadAnalytics.noSourceData")}
            />
          )}
        </SectionCard>

        <SectionCard
          title={t("leadAnalytics.byCampaignTitle")}
          description={t("leadAnalytics.byCampaignDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <ChannelBreakdownTable
              rows={data?.byCampaign ?? []}
              getLabel={(r) => r.campaign}
              format={format}
              t={t}
              emptyMessage={t("leadAnalytics.noCampaignData")}
            />
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <SectionCard
          title={t("leadAnalytics.qualityBySourceTitle")}
          description={t("leadAnalytics.qualityBySourceDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <QualityBySourceChart rows={data?.qualityBySource ?? []} t={t} />
          )}
        </SectionCard>

        <SectionCard
          title={t("leadAnalytics.speedBySourceTitle")}
          description={t("leadAnalytics.speedBySourceDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <SpeedBySourceChart rows={data?.speedBySource ?? []} t={t} />
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title={t("leadAnalytics.lostReasonsBySourceTitle")}
          description={t("leadAnalytics.lostReasonsBySourceDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <LostReasonsBySourceTable rows={data?.lostReasonsBySource ?? []} t={t} />
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title={t("leadAnalytics.dailyTrendTitle")}
          description={t("leadAnalytics.dailyTrendDesc")}
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
          ) : (
            <DailyTrendChart rows={data?.dailyTrend ?? []} t={t} />
          )}
        </SectionCard>
      </div>

      {period === "monthly" && (
        <div className="mt-6">
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-success" />
                {t("leadAnalytics.cplRoiTitle")}
              </span>
            }
            description={t("leadAnalytics.cplRoiDesc")}
          >
            <MarketingSpendSection
              monthDate={monthDate}
              bySource={data?.bySource ?? []}
              format={format}
              t={t}
            />
          </SectionCard>
        </div>
      )}
    </>
  );
}

const TABS: { key: Tab; icon: typeof Zap; labelKey: string }[] = [
  { key: "action", icon: Zap, labelKey: "leadAnalytics.tabAction" },
  { key: "quality", icon: Layers, labelKey: "leadAnalytics.tabQuality" },
  { key: "current", icon: SlidersHorizontal, labelKey: "leadAnalytics.tabCurrent" },
  { key: "direction", icon: Shuffle, labelKey: "leadAnalytics.tabDirection" },
  { key: "marketing", icon: Megaphone, labelKey: "leadAnalytics.tabMarketing" },
];

function MonthStrip({
  year,
  monthIndex,
  onSelect,
  onPrevYear,
  onNextYear,
  onToday,
  t,
}: {
  year: number;
  monthIndex: number;
  onSelect: (year: number, month: number) => void;
  onPrevYear: () => void;
  onNextYear: () => void;
  onToday: () => void;
  t: (k: string) => string;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-foreground">{year}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPrevYear}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToday}
            className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-bold text-foreground transition-colors hover:bg-accent"
          >
            {t("leadAnalytics.today")}
          </button>
          <button
            type="button"
            onClick={onNextYear}
            disabled={year >= currentYear}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-12">
        {MONTH_TILE_LABELS.map((label, i) => {
          const isFuture = year > currentYear || (year === currentYear && i > currentMonth);
          const selected = i === monthIndex;
          return (
            <button
              key={label}
              type="button"
              disabled={isFuture}
              onClick={() => onSelect(year, i)}
              className={cn(
                "rounded-xl border px-2 py-2.5 text-center transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : isFuture
                    ? "cursor-not-allowed border-border/50 bg-surface/50 text-subtle/50"
                    : "border-border bg-surface text-foreground hover:bg-accent",
              )}
            >
              <p
                className={cn(
                  "text-[10px]",
                  selected ? "text-primary-foreground/80" : "text-subtle",
                )}
              >
                {year}
              </p>
              <p className="text-sm font-bold">{label}</p>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-subtle">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success" /> {t("leadAnalytics.legendAvailable")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-warning" /> {t("leadAnalytics.legendIncomplete")}
        </span>
      </div>
    </div>
  );
}

// The on-demand "Hisobotni olish" report is a plain-text business document,
// not UI chrome -- same reasoning as the daily Telegram report in
// daily-report-builder.server.ts, which is also hard-coded Uzbek regardless
// of the viewer's language setting.
function formatFullReportText(input: {
  data: LeadAnalyticsFullReportData;
  format: (n: number) => string;
  funnelLabel: string;
  teamLabel: string;
  managerLabel: string;
  periodLabel: string;
}): string {
  const { data, format, funnelLabel, teamLabel, managerLabel, periodLabel } = input;
  const dateLabel = new Date().toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const lines: string[] = [
    "LID TAHLILI HISOBOTI",
    `Sana: ${dateLabel}`,
    `Davr: ${periodLabel}`,
    `Voronka: ${funnelLabel}`,
    `Jamoa: ${teamLabel}`,
    `Operator: ${managerLabel}`,
    "",
    "UMUMIY KO'RSATKICHLAR",
    `- Jami lidlar: ${data.action.totalLeads}`,
    `- O'rtacha konversiya: ${data.action.avgConversion}%`,
    `- Issiq lidlar: ${data.action.hotLeads}`,
    `- Churn xavfidagi lidlar: ${data.action.churnRisk}`,
    "",
    "HARAKAT KERAK",
    `- Qaytarish mumkin bo'lgan lidlar: ${data.action.recoverable.length}`,
    `- Bugun yopilishi mumkin bo'lgan issiq lidlar: ${data.action.hotPipeline.length}`,
    `- Faolligi kuzatilgan operatorlar: ${data.action.operatorActivity.length}`,
    "",
  ];

  if (data.quality.tagResults.length > 0) {
    lines.push("LID SIFATI (TEG BO'YICHA)");
    for (const r of data.quality.tagResults.slice(0, 10)) {
      lines.push(
        `- ${r.tag}: sotilgan ${r.sold}, yo'qotilgan ${r.lost}, ochiq ${r.open}, jami ${r.total}`,
      );
    }
    lines.push("");
  }

  lines.push("HOZIRGI HOLAT");
  const temp = data.current.temperature;
  lines.push(
    `- Sovuq: ${temp.cold}, Iliq: ${temp.warm}, Issiq: ${temp.hot}, Juda issiq: ${temp.veryHot}`,
  );
  if (data.current.stages.length > 0) {
    lines.push("Bosqichlar bo'yicha:");
    for (const s of data.current.stages.slice(0, 12)) {
      lines.push(
        `- ${s.stage}: ${s.lead_count} ta${s.avg_days != null ? `, o'rtacha ${s.avg_days} kun` : ""}`,
      );
    }
  }
  if (data.current.managerLoad.length > 0) {
    lines.push("Menejerlar yuklamasi:");
    for (const m of data.current.managerLoad.slice(0, 15)) {
      lines.push(`- ${m.manager}: jami ${m.total}`);
    }
  }
  lines.push("");

  lines.push("YO'NALISH");
  const dir = data.direction.direction;
  lines.push(
    `- Yaqin orada yopiladi: ${dir.closingSoon}, Neytral: ${dir.neutral}, Yaqin orada yo'qotiladi: ${dir.losingSoon}`,
  );
  if (data.direction.lostReasons.length > 0) {
    lines.push("Yo'qotish sabablari (top):");
    for (const r of data.direction.lostReasons.slice(0, 8)) {
      lines.push(`- ${r.reason}: ${r.count}`);
    }
  }
  lines.push(`- Churn xavfidagi lidlar: ${data.direction.churnRisk.length}`);
  lines.push("");

  lines.push("MARKETING");
  if (data.marketing.bySource.length > 0) {
    lines.push("Manba bo'yicha:");
    for (const r of data.marketing.bySource.slice(0, 10)) {
      lines.push(
        `- ${r.source}: jami ${r.total}, yutilgan ${r.won}, konversiya ${r.conversion != null ? `${r.conversion}%` : "—"}, daromad ${format(r.revenue)}`,
      );
    }
  }
  if (data.marketing.byCampaign.length > 0) {
    lines.push("Kampaniya bo'yicha:");
    for (const r of data.marketing.byCampaign.slice(0, 10)) {
      lines.push(
        `- ${r.campaign}: jami ${r.total}, yutilgan ${r.won}, konversiya ${r.conversion != null ? `${r.conversion}%` : "—"}, daromad ${format(r.revenue)}`,
      );
    }
  }
  if (data.marketing.qualityBySource.length > 0) {
    lines.push("Manba bo'yicha sifat (audio tahlil orqali baholangan):");
    for (const r of data.marketing.qualityBySource.slice(0, 10)) {
      lines.push(
        `- ${r.source}: sifatli ${r.qualified}, sifatsiz ${r.unqualified}, baholanmagan ${r.unscored}, jami ${r.total}`,
      );
    }
  }
  if (data.marketing.speedBySource.length > 0) {
    lines.push("Manba bo'yicha tezlik (birinchi qo'ng'iroqqacha o'rtacha soat):");
    for (const r of data.marketing.speedBySource.slice(0, 10)) {
      lines.push(`- ${r.source}: ${r.avg_hours} soat (${r.sample_size} ta lid)`);
    }
  }
  if (data.marketing.lostReasonsBySource.length > 0) {
    lines.push("Manba bo'yicha yo'qotish sabablari (top):");
    for (const r of data.marketing.lostReasonsBySource.slice(0, 10)) {
      lines.push(`- ${r.source} — ${r.reason}: ${r.count}`);
    }
  }

  return lines.join("\n");
}

function LeadAnalytics() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("action");
  const [period, setPeriod] = useState<Period>("monthly");
  const now = useMemo(() => new Date(), []);
  const [monthYear, setMonthYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [funnel, setFunnel] = useState("");
  const [managerId, setManagerId] = useState("");
  const [teamId, setTeamId] = useState("");
  const { names: funnelNames } = useFunnelNames();
  const { data: profiles } = useProfilesRaw();
  const generateReport = useGenerateLeadAnalyticsReport();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");

  const since = useMemo(
    () => periodSince(period, monthYear, monthIndex),
    [period, monthYear, monthIndex],
  );
  // Only the Marketing tab's CPL/ROI section needs an exact month window --
  // the other tabs' RPCs are since-only ("from p_since through today").
  const until = useMemo(
    () => (period === "monthly" ? new Date(monthYear, monthIndex + 1, 1) : null),
    [period, monthYear, monthIndex],
  );
  const monthDate = useMemo(() => new Date(monthYear, monthIndex, 1), [monthYear, monthIndex]);
  const { data, isLoading } = useLeadAnalyticsAction(
    funnel || null,
    managerId || null,
    since,
    teamId || null,
  );

  // The RPCs enforce real scoping (super_admin/platform_owner see everyone,
  // rop sees themself + direct reports, everyone else sees only themself),
  // so picking a team/operator outside that scope would just come back
  // empty. Mirror the same scope here to keep the dropdowns from offering
  // choices the backend will refuse.
  const isUnrestricted = user?.role === "super_admin" || user?.role === "platform_owner";
  const isRop = user?.role === "rop";

  const rops = useMemo(() => {
    const list = (profiles ?? []).filter((p) => p.role === "rop");
    const scoped = isUnrestricted ? list : list.filter((p) => p.id === user?.id);
    return scoped.slice().sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [profiles, isUnrestricted, user?.id]);

  const { data: managerIdsInFunnel } = useManagerIdsInFunnel(funnel || null);

  const managers = useMemo(() => {
    let all = (profiles ?? []).slice();
    if (!isUnrestricted) {
      all = isRop
        ? all.filter((p) => p.id === user?.id || p.manager_id === user?.id)
        : all.filter((p) => p.id === user?.id);
    }
    all = all.sort((a, b) => a.full_name.localeCompare(b.full_name));
    if (teamId) all = all.filter((p) => p.id === teamId || p.manager_id === teamId);
    if (funnel && managerIdsInFunnel) all = all.filter((p) => managerIdsInFunnel.has(p.id));
    return all;
  }, [profiles, teamId, funnel, managerIdsInFunnel, isUnrestricted, isRop, user?.id]);

  const selectedTeamName =
    rops.find((r) => r.id === teamId)?.full_name ?? t("leadAnalytics.allTeams");
  const selectedManagerName =
    managers.find((m) => m.id === managerId)?.full_name ?? t("leadAnalytics.allManagers");
  const selectedFunnelName = funnel || t("leadFilter.allFunnels");

  const PERIODS: { key: Period; labelKey: string }[] = [
    { key: "daily", labelKey: "leadAnalytics.periodDaily" },
    { key: "weekly", labelKey: "leadAnalytics.periodWeekly" },
    { key: "monthly", labelKey: "leadAnalytics.periodMonthly" },
  ];

  async function handleGenerateReport() {
    try {
      const periodLabel =
        period === "monthly"
          ? `${MONTH_TILE_LABELS[monthIndex]} ${monthYear}`
          : t(PERIODS.find((p) => p.key === period)?.labelKey ?? "leadAnalytics.periodMonthly");
      const result = await generateReport.mutateAsync({
        funnel: funnel || null,
        manager: managerId || null,
        team: teamId || null,
        since,
        until: period === "monthly" ? until : null,
      });
      setReportText(
        formatFullReportText({
          data: result,
          format,
          funnelLabel: selectedFunnelName,
          teamLabel: selectedTeamName,
          managerLabel: selectedManagerName,
          periodLabel,
        }),
      );
      setReportOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("leadAnalytics.reportFailed"));
    }
  }

  return (
    <>
      <PageHeader
        title={t("leadAnalytics.title")}
        description={t("leadAnalytics.desc")}
        actions={
          <button
            type="button"
            onClick={() => void handleGenerateReport()}
            disabled={generateReport.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generateReport.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {t("leadAnalytics.getReport")}
          </button>
        }
      />

      <div className="mb-6 inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-soft">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl bg-surface px-3.5 py-2 text-sm font-semibold ring-1 ring-transparent transition-colors",
              tab === tb.key
                ? "bg-primary/10 text-primary ring-primary/50"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <tb.icon className="h-4 w-4" />
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-2xl border border-border bg-card p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                period === p.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>

        <FilterTile icon={Users} label={t("leadAnalytics.jamoaLabel")} value={selectedTeamName}>
          <TileOption
            label={t("leadAnalytics.allTeams")}
            active={!teamId}
            onClick={() => {
              setTeamId("");
              setManagerId("");
            }}
          />
          {rops.map((r) => (
            <TileOption
              key={r.id}
              label={r.full_name}
              active={teamId === r.id}
              onClick={() => {
                setTeamId(r.id);
                setManagerId("");
              }}
            />
          ))}
        </FilterTile>

        <FilterTile
          icon={User}
          label={t("leadAnalytics.operatorLabel")}
          value={selectedManagerName}
        >
          <TileOption
            label={t("leadAnalytics.allManagers")}
            active={!managerId}
            onClick={() => setManagerId("")}
          />
          {managers.map((m) => (
            <TileOption
              key={m.id}
              label={m.full_name}
              active={managerId === m.id}
              onClick={() => setManagerId(m.id)}
            />
          ))}
        </FilterTile>

        <FilterTile
          icon={GitBranch}
          label={t("leadAnalytics.funnelLabel")}
          value={selectedFunnelName}
        >
          <TileOption
            label={t("leadFilter.allFunnels")}
            active={!funnel}
            onClick={() => {
              setFunnel("");
              setManagerId("");
            }}
          />
          {funnelNames.map((f) => (
            <TileOption
              key={f}
              label={f}
              active={funnel === f}
              onClick={() => {
                setFunnel(f);
                setManagerId("");
              }}
            />
          ))}
        </FilterTile>
      </div>

      {period === "monthly" && (
        <MonthStrip
          year={monthYear}
          monthIndex={monthIndex}
          onSelect={(y, m) => {
            setMonthYear(y);
            setMonthIndex(m);
          }}
          onPrevYear={() => setMonthYear((y) => y - 1)}
          onNextYear={() => setMonthYear((y) => y + 1)}
          onToday={() => {
            setMonthYear(now.getFullYear());
            setMonthIndex(now.getMonth());
          }}
          t={t}
        />
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("leadAnalytics.kpiTotalLeads")}
          value={String(data?.totalLeads ?? 0)}
          hint={t("leadAnalytics.kpiTotalLeadsHint")}
          info={t("leadAnalytics.kpiTotalLeadsInfo")}
        />
        <StatCard
          label={t("leadAnalytics.kpiAvgConversion")}
          value={`${data?.avgConversion ?? 0}%`}
          hint={t("leadAnalytics.kpiAvgConversionHint")}
          info={t("leadAnalytics.kpiAvgConversionInfo")}
        />
        <StatCard
          label={t("leadAnalytics.kpiHotLeads")}
          value={String(data?.hotLeads ?? 0)}
          tone="mint"
          hint={t("leadAnalytics.kpiHotLeadsHint")}
          info={t("leadAnalytics.kpiHotLeadsInfo")}
        />
        <StatCard
          label={t("leadAnalytics.kpiChurnRisk")}
          value={String(data?.churnRisk ?? 0)}
          tone="danger-soft"
          hint={t("leadAnalytics.kpiChurnRiskHint")}
          info={t("leadAnalytics.kpiChurnRiskInfo")}
        />
      </div>

      {tab === "action" ? (
        <ActionTab data={data} isLoading={isLoading} format={format} t={t} />
      ) : tab === "quality" ? (
        <QualityTab funnel={funnel} managerId={managerId} teamId={teamId} since={since} t={t} />
      ) : tab === "current" ? (
        <CurrentTab funnel={funnel} managerId={managerId} teamId={teamId} since={since} t={t} />
      ) : tab === "direction" ? (
        <DirectionTab funnel={funnel} managerId={managerId} teamId={teamId} since={since} t={t} />
      ) : (
        <MarketingTab
          funnel={funnel}
          managerId={managerId}
          teamId={teamId}
          since={since}
          until={until}
          monthDate={monthDate}
          period={period}
          format={format}
          t={t}
        />
      )}

      <div className="mt-6">
        <Suspense fallback={null}>
          <CallPickupByHourChart dateRange={{ from: since, to: until }} />
        </Suspense>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              {t("leadAnalytics.getReport")}
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(reportText);
                  toast.success(t("leadAnalytics.reportCopied"));
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
                {t("leadAnalytics.reportCopy")}
              </button>
            </DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap break-words text-sm text-foreground">
            {reportText}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}
