import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2, Save, Trash2, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { SectionCard, ExportButton } from "@/components/layout/Primitives";
import {
  useCrmLeads,
  useCustomReportsRaw,
  useCreateCustomReport,
  useDeleteCustomReport,
  usePipelineStagesRaw,
  useProfilesRaw,
  type CrmLeadView,
  type CustomReportConfig,
  type CustomReportDimension,
  type CustomReportMetric,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";

const DIMENSIONS: CustomReportDimension[] = [
  "stage",
  "owner",
  "source",
  "temperature",
  "city",
  "tag",
  "createdMonth",
];
const METRICS: CustomReportMetric[] = ["count", "sumBudget", "sumExpectedRevenue", "avgBudget"];

const DEFAULT_CONFIG: CustomReportConfig = {
  dimension: "stage",
  metric: "count",
  stageFilter: null,
  ownerFilter: null,
  temperatureFilter: null,
};

function dimensionKeys(row: CrmLeadView, dimension: CustomReportDimension): string[] {
  switch (dimension) {
    case "stage":
      return [row.stage || "—"];
    case "owner":
      return [row.owner || "—"];
    case "source":
      return [row.source || "—"];
    case "temperature":
      return [row.temperature || "—"];
    case "city":
      return [row.city || "—"];
    case "tag":
      return row.tags.length > 0 ? row.tags : ["—"];
    case "createdMonth":
      return [row.createdAtIso ? row.createdAtIso.slice(0, 7) : "—"];
  }
}

type Bucket = { key: string; count: number; sumBudget: number; sumExpectedRevenue: number };

function computeBuckets(rows: CrmLeadView[], config: CustomReportConfig): Bucket[] {
  const filtered = rows.filter(
    (r) =>
      (!config.stageFilter || r.stage === config.stageFilter) &&
      (!config.ownerFilter || r.ownerId === config.ownerFilter) &&
      (!config.temperatureFilter || r.temperature === config.temperatureFilter),
  );

  const byKey = new Map<string, Bucket>();
  for (const row of filtered) {
    for (const key of dimensionKeys(row, config.dimension)) {
      const bucket = byKey.get(key) ?? { key, count: 0, sumBudget: 0, sumExpectedRevenue: 0 };
      bucket.count += 1;
      bucket.sumBudget += row.budget || 0;
      bucket.sumExpectedRevenue += row.expectedRevenue || 0;
      byKey.set(key, bucket);
    }
  }

  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

function metricValue(bucket: Bucket, metric: CustomReportMetric): number {
  switch (metric) {
    case "count":
      return bucket.count;
    case "sumBudget":
      return bucket.sumBudget;
    case "sumExpectedRevenue":
      return bucket.sumExpectedRevenue;
    case "avgBudget":
      return bucket.count > 0 ? bucket.sumBudget / bucket.count : 0;
  }
}

// Self-service report builder (recommendation #9): pick a group-by
// dimension + a metric + a few filters over your own leads and save the
// result. Embedded as a tab on /daily-report (see DailyReportPage) rather
// than its own sidebar entry, alongside the fixed Kunlik hisobot dashboard.
export function ReportBuilderPanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { format: formatCurrency } = useCurrency();
  const { rows, isLoading } = useCrmLeads();
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();
  const savedReports = useCustomReportsRaw();
  const createReport = useCreateCustomReport();
  const deleteReport = useDeleteCustomReport();

  const [config, setConfig] = useState<CustomReportConfig>(DEFAULT_CONFIG);
  const [reportName, setReportName] = useState("");

  const buckets = useMemo(() => computeBuckets(rows, config), [rows, config]);
  const isMoney =
    config.metric === "sumBudget" ||
    config.metric === "sumExpectedRevenue" ||
    config.metric === "avgBudget";

  const chartData = useMemo(
    () =>
      buckets.slice(0, 20).map((b) => ({
        key: b.key,
        value: metricValue(b, config.metric),
      })),
    [buckets, config.metric],
  );

  const exportRows = useMemo(
    () =>
      buckets.map((b) => ({
        [t(`reportBuilder.dimension.${config.dimension}`)]: b.key,
        [t(`reportBuilder.metric.${config.metric}`)]: metricValue(b, config.metric),
        [t("reportBuilder.leadCount")]: b.count,
      })),
    [buckets, config, t],
  );

  async function saveReport() {
    if (!reportName.trim() || !user?.organizationId) return;
    try {
      await createReport.mutateAsync({
        organization_id: user.organizationId,
        name: reportName.trim(),
        config,
        created_by: user.id,
      });
      setReportName("");
      toast.success(t("reportBuilder.savedToast"));
    } catch (err) {
      toast.error(describeError(err, t("reportBuilder.saveFailed")));
    }
  }

  function loadReport(raw: unknown) {
    const c = raw as Partial<CustomReportConfig> | null;
    if (!c || typeof c !== "object") return;
    setConfig({
      dimension: DIMENSIONS.includes(c.dimension as CustomReportDimension)
        ? (c.dimension as CustomReportDimension)
        : "stage",
      metric: METRICS.includes(c.metric as CustomReportMetric)
        ? (c.metric as CustomReportMetric)
        : "count",
      stageFilter: c.stageFilter ?? null,
      ownerFilter: c.ownerFilter ?? null,
      temperatureFilter: c.temperatureFilter ?? null,
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
      <div className="space-y-5">
        <SectionCard title={t("reportBuilder.configTitle")}>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-subtle">
                {t("reportBuilder.dimensionLabel")}
              </label>
              <select
                value={config.dimension}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, dimension: e.target.value as CustomReportDimension }))
                }
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
              >
                {DIMENSIONS.map((d) => (
                  <option key={d} value={d}>
                    {t(`reportBuilder.dimension.${d}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-subtle">
                {t("reportBuilder.metricLabel")}
              </label>
              <select
                value={config.metric}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, metric: e.target.value as CustomReportMetric }))
                }
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
              >
                {METRICS.map((m) => (
                  <option key={m} value={m}>
                    {t(`reportBuilder.metric.${m}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-subtle">
                {t("reportBuilder.filterStage")}
              </label>
              <select
                value={config.stageFilter ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, stageFilter: e.target.value || null }))}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
              >
                <option value="">{t("reportBuilder.filterAll")}</option>
                {[...new Set((stages ?? []).map((s) => s.name))].map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-subtle">
                {t("reportBuilder.filterOwner")}
              </label>
              <select
                value={config.ownerFilter ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, ownerFilter: e.target.value || null }))}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
              >
                <option value="">{t("reportBuilder.filterAll")}</option>
                {(profiles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-subtle">
                {t("reportBuilder.filterTemperature")}
              </label>
              <select
                value={config.temperatureFilter ?? ""}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, temperatureFilter: e.target.value || null }))
                }
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
              >
                <option value="">{t("reportBuilder.filterAll")}</option>
                {["Sovuq", "Iliq", "Issiq", "Juda issiq"].map((temp) => (
                  <option key={temp} value={temp}>
                    {temp}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("reportBuilder.saveTitle")}>
          <div className="flex items-center gap-2">
            <input
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder={t("reportBuilder.namePlaceholder")}
              className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none placeholder:text-subtle focus:border-primary/40"
            />
            <button
              type="button"
              onClick={() => void saveReport()}
              disabled={createReport.isPending || !reportName.trim()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {createReport.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {(savedReports.data ?? []).length === 0 && (
              <p className="text-sm text-subtle">{t("reportBuilder.noSavedReports")}</p>
            )}
            {(savedReports.data ?? []).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => loadReport(r.config)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:text-primary"
                >
                  {r.name}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteReport.mutateAsync(r.id)}
                  disabled={deleteReport.isPending}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title={t("reportBuilder.resultTitle")}
        description={t("reportBuilder.resultDesc")}
        actions={<ExportButton filename="report" rows={exportRows} />}
      >
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        )}

        {!isLoading && buckets.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <BarChart3 className="h-8 w-8 text-subtle" />
            <p className="text-sm text-subtle">{t("reportBuilder.empty")}</p>
          </div>
        )}

        {!isLoading && buckets.length > 0 && (
          <>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: -14, right: 8, top: 8 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="key"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    stroke="var(--color-subtle)"
                    interval="preserveStartEnd"
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    stroke="var(--color-subtle)"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-popover)",
                      boxShadow: "var(--shadow-elevated)",
                      fontSize: 12,
                    }}
                    cursor={{ fill: "var(--color-accent)" }}
                    formatter={(value: number) => (isMoney ? formatCurrency(value) : value)}
                  />
                  <Bar dataKey="value" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-subtle">
                    <th className="py-2 pr-4">
                      {t(`reportBuilder.dimension.${config.dimension}`)}
                    </th>
                    <th className="py-2 pr-4">{t(`reportBuilder.metric.${config.metric}`)}</th>
                    <th className="py-2 pr-4">{t("reportBuilder.leadCount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr key={b.key} className="border-b border-border/60">
                      <td className="py-2 pr-4 font-medium text-foreground">{b.key}</td>
                      <td className="py-2 pr-4 tabular-nums">
                        {isMoney
                          ? formatCurrency(metricValue(b, config.metric))
                          : metricValue(b, config.metric)}
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">{b.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
