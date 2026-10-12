import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useIsFetching } from "@tanstack/react-query";
import {
  CalendarRange,
  Download,
  FileSpreadsheet,
  FileText,
  GitBranch,
  Loader2,
  Lock,
  Send,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterSelect } from "@/components/filters/FilterSelect";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useOrgAccess } from "@/lib/use-org-access";
import { cn } from "@/lib/utils";
import { downloadReportCsv, exportReportPdf, type ReportSection } from "@/lib/export-csv";
import { usePeriodStats, type PeriodStats, type ProfileRow } from "@/hooks/use-crm-data";

// The dashboard's "Hisobot" button: pick a period and a slice of the team,
// tick the parts you want, get one file -- every number side by side with
// the period right before it.

type Preset =
  "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom";
const PRESETS: Preset[] = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "custom",
];

type SectionKey = "main" | "calls" | "managers" | "stages";
const SECTIONS: SectionKey[] = ["main", "calls", "managers", "stages"];

type Range = { from: Date; to: Date };
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function startOfWeek(d: Date): Date {
  const c = startOfDay(d);
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7)); // weeks start on Monday
  return c;
}
function toInputDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fromInputDate(v: string): Date | null {
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// [from, to) of a preset; months jump a whole calendar month back, the
// rest step back by their own length.
function presetRanges(
  preset: Preset,
  customFrom: string,
  customTo: string,
): { range: Range; prev: Range } | null {
  const today = startOfDay(new Date());
  let range: Range;
  let prev: Range;
  switch (preset) {
    case "today":
      range = { from: today, to: addDays(today, 1) };
      break;
    case "yesterday":
      range = { from: addDays(today, -1), to: today };
      break;
    case "thisWeek": {
      const from = startOfWeek(today);
      range = { from, to: addDays(from, 7) };
      break;
    }
    case "lastWeek": {
      const from = addDays(startOfWeek(today), -7);
      range = { from, to: addDays(from, 7) };
      break;
    }
    case "thisMonth":
    case "lastMonth": {
      const shift = preset === "thisMonth" ? 0 : -1;
      const from = new Date(today.getFullYear(), today.getMonth() + shift, 1);
      const to = new Date(today.getFullYear(), today.getMonth() + shift + 1, 1);
      range = { from, to };
      prev = { from: new Date(from.getFullYear(), from.getMonth() - 1, 1), to: from };
      return { range, prev };
    }
    case "custom": {
      const from = fromInputDate(customFrom);
      const toDay = fromInputDate(customTo);
      if (!from || !toDay || toDay < from) return null;
      range = { from, to: addDays(toDay, 1) };
      break;
    }
  }
  const span = range.to.getTime() - range.from.getTime();
  prev = { from: new Date(range.from.getTime() - span), to: range.from };
  return { range, prev };
}

function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

function changePct(cur: number, prev: number): string {
  if (prev === 0) return cur === 0 ? "0%" : "—";
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

export function ReportExportDialog({
  funnelNames,
  rops,
  operators,
  initialFunnel,
  initialTeamId,
  initialOperatorId,
}: {
  funnelNames: string[];
  rops: ProfileRow[];
  operators: ProfileRow[];
  initialFunnel: string | null;
  initialTeamId: string | null;
  initialOperatorId: string | null;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { format } = useCurrency();
  const access = useOrgAccess();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState(() => toInputDate(addDays(new Date(), -6)));
  const [customTo, setCustomTo] = useState(() => toInputDate(new Date()));
  const [funnel, setFunnel] = useState<string>("");
  const [teamId, setTeamId] = useState<string>("");
  const [operatorId, setOperatorId] = useState<string>("");
  const [sections, setSections] = useState<Set<SectionKey>>(() => new Set(SECTIONS));
  const [fileFormat, setFileFormat] = useState<"excel" | "pdf">("excel");

  function openDialog() {
    // Starts from whatever the dashboard is filtered to right now.
    setFunnel(initialFunnel ?? "");
    setTeamId(initialTeamId ?? "");
    setOperatorId(initialOperatorId ?? "");
    setOpen(true);
  }

  const ranges = useMemo(
    () => presetRanges(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );
  // The period before `prev` -- only so `prev` itself gets complete stats.
  const prevPrev = useMemo(() => {
    if (!ranges) return null;
    const span = ranges.prev.to.getTime() - ranges.prev.from.getTime();
    return { from: new Date(ranges.prev.from.getTime() - span), to: ranges.prev.from };
  }, [ranges]);

  const scope = useMemo(
    () => ({ funnel: funnel || null, teamId: teamId || null, operatorId: operatorId || null }),
    [funnel, teamId, operatorId],
  );
  const active = open && !!ranges;
  const cur = usePeriodStats(active ? ranges.range : null, active ? ranges.prev : null, scope);
  const prev = usePeriodStats(active ? ranges.prev : null, active ? prevPrev : null, scope);
  const fetchingLeads = useIsFetching({ queryKey: ["leads", "created_between"] });
  const fetchingCalls = useIsFetching({ queryKey: ["amocrm_calls", "with_lead"] });
  const loading = active && fetchingLeads + fetchingCalls > 0;

  const teamOperators = useMemo(
    () =>
      teamId ? operators.filter((p) => p.id === teamId || p.manager_id === teamId) : operators,
    [operators, teamId],
  );

  function toggleSection(key: SectionKey) {
    setSections((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function buildSections(c: PeriodStats, p: PeriodStats): ReportSection[] {
    const col = {
      metric: t("report.col.metric"),
      current: t("report.col.current"),
      previous: t("report.col.previous"),
      change: t("report.col.change"),
    };
    const compare = (label: string, a: number, b: number, show: (v: number) => string) => ({
      [col.metric]: label,
      [col.current]: show(a),
      [col.previous]: show(b),
      [col.change]: changePct(a, b),
    });
    const n = (v: number) => String(v);
    const pct = (v: number) => `${v}%`;
    const out: ReportSection[] = [];
    if (sections.has("main")) {
      out.push({
        title: t("report.section.main"),
        rows: [
          compare(t("report.m.newLeads"), c.newLeads, p.newLeads, n),
          compare(t("report.m.soldLeads"), c.soldLeads, p.soldLeads, n),
          compare(t("report.m.soldPct"), c.soldLeadsPct, p.soldLeadsPct, pct),
          compare(t("report.m.wonLeads"), c.wonLeadsCreated, p.wonLeadsCreated, n),
          compare(t("report.m.openLeads"), c.openLeads, p.openLeads, n),
          compare(t("report.m.revenue"), c.periodRevenue, p.periodRevenue, (v) => format(v)),
          compare(t("report.m.fullPayments"), c.fullPaymentCount, p.fullPaymentCount, n),
        ],
      });
    }
    if (sections.has("calls")) {
      out.push({
        title: t("report.section.calls"),
        rows: [
          compare(t("report.m.calls"), c.totalCalls, p.totalCalls, n),
          compare(t("report.m.connected"), c.connectedCalls, p.connectedCalls, n),
          compare(t("report.m.missed"), c.missedCalls, p.missedCalls, n),
          compare(t("report.m.contactRate"), c.contactRatePct, p.contactRatePct, pct),
          compare(t("report.m.talkTime"), c.totalCallSeconds, p.totalCallSeconds, formatDuration),
          compare(t("report.m.avgTalk"), c.avgCallSeconds, p.avgCallSeconds, formatDuration),
          compare(t("report.m.avgScore"), c.avgCallScore ?? 0, p.avgCallScore ?? 0, n),
        ],
      });
    }
    if (sections.has("managers")) {
      out.push({
        title: t("report.section.managers"),
        rows: c.operatorBreakdown.map((o) => ({
          [t("report.col.manager")]: o.name,
          [t("report.m.newLeads")]: o.leads,
          [t("report.m.soldLeads")]: o.sold,
          [t("report.m.revenue")]: format(o.revenue),
          [t("report.m.calls")]: o.calls,
          [t("report.m.talkTime")]: formatDuration(o.totalSeconds),
          [t("report.m.avgScore")]: o.avgScore ?? "—",
        })),
      });
    }
    if (sections.has("stages") && scope.funnel) {
      out.push({
        title: t("report.section.stages"),
        rows: c.stageBreakdown.map((s) => ({
          [t("report.col.stage")]: s.stage,
          [t("report.col.leads")]: s.count,
          [t("report.col.share")]: `${s.pct}%`,
        })),
      });
    }
    return out;
  }

  function download() {
    if (!ranges) return;
    const built = buildSections(cur, prev);
    if (built.every((s) => s.rows.length === 0)) {
      toast.info(t("report.empty"));
      return;
    }
    const lastDay = addDays(ranges.range.to, -1);
    const periodLabel =
      ranges.range.to.getTime() - ranges.range.from.getTime() <= DAY_MS
        ? formatDate(ranges.range.from)
        : `${formatDate(ranges.range.from)} – ${formatDate(lastDay)}`;
    const teamName = rops.find((r) => r.id === teamId)?.full_name;
    const operatorName = operators.find((o) => o.id === operatorId)?.full_name;
    const heading = [
      `${t("report.period")}: ${periodLabel}`,
      `${t("report.funnel")}: ${funnel || t("leadFilter.allFunnels")}`,
      `${t("report.team")}: ${teamName ?? t("leadAnalytics.allTeams")}`,
      `${t("report.manager")}: ${operatorName ?? t("leadAnalytics.allManagers")}`,
    ];
    const title = `${t("report.fileTitle")} ${periodLabel}`;
    if (fileFormat === "pdf") exportReportPdf(title, heading, built);
    else
      downloadReportCsv(
        `${t("report.fileTitle")}_${toInputDate(ranges.range.from)}`,
        heading,
        built,
      );
    toast.success(t("report.done"));
  }

  const canSchedule = user?.role === "rop" || user?.role === "super_admin";

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Download className="h-4 w-4" /> {t("report.button")}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("report.title")}</DialogTitle>
            <DialogDescription>{t("report.desc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-subtle">
                {t("report.period")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(p)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors",
                      preset === p
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface text-foreground hover:bg-accent",
                    )}
                  >
                    {t(`report.preset.${p}`)}
                  </button>
                ))}
              </div>
              {preset === "custom" && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <CalendarRange className="h-4 w-4 text-muted-foreground" />
                  <input
                    id="report-from"
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-9 rounded-lg border border-border bg-surface px-2"
                  />
                  <span className="text-muted-foreground">—</span>
                  <input
                    id="report-to"
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-9 rounded-lg border border-border bg-surface px-2"
                  />
                </div>
              )}
              {!ranges && <p className="mt-2 text-xs text-destructive">{t("report.badRange")}</p>}
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterSelect
                icon={GitBranch}
                label={t("report.funnel")}
                value={funnel}
                onChange={setFunnel}
                className="sm:w-52"
              >
                <option value="">{t("leadFilter.allFunnels")}</option>
                {funnelNames.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </FilterSelect>
              {rops.length > 0 && (
                <FilterSelect
                  icon={Users}
                  label={t("report.team")}
                  value={teamId}
                  onChange={(v) => {
                    setTeamId(v);
                    setOperatorId("");
                  }}
                  className="sm:w-52"
                >
                  <option value="">{t("leadAnalytics.allTeams")}</option>
                  {rops.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.full_name}
                    </option>
                  ))}
                </FilterSelect>
              )}
              <FilterSelect
                icon={User}
                label={t("report.manager")}
                value={operatorId}
                onChange={setOperatorId}
                className="sm:w-52"
              >
                <option value="">{t("leadAnalytics.allManagers")}</option>
                {teamOperators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-subtle">
                {t("report.contents")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SECTIONS.map((key) => {
                  const disabled = key === "stages" && !funnel;
                  return (
                    <label
                      key={key}
                      htmlFor={`report-section-${key}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-surface p-3",
                        disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Checkbox
                        id={`report-section-${key}`}
                        checked={sections.has(key) && !disabled}
                        disabled={disabled}
                        onCheckedChange={() => toggleSection(key)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">
                          {t(`report.section.${key}`)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {disabled ? t("report.stagesNeedFunnel") : t(`report.sectionDesc.${key}`)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-subtle">
                {t("report.format")}
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["excel", FileSpreadsheet, "report.formatExcel"],
                    ["pdf", FileText, "report.formatPdf"],
                  ] as const
                ).map(([key, Icon, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFileFormat(key)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors",
                      fileFormat === key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface text-foreground hover:bg-accent",
                    )}
                  >
                    <Icon className="h-4 w-4" /> {t(label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              {canSchedule ? (
                <Link
                  to="/daily-report-settings"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  <Send className="h-4 w-4" /> {t("report.schedule")}
                </Link>
              ) : (
                <span />
              )}
              {access.has("exports") ? (
                <button
                  type="button"
                  onClick={download}
                  disabled={!ranges || loading || sections.size === 0}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {loading ? t("report.preparing") : t("report.download")}
                </button>
              ) : (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" /> {t("trial.exportLocked")}
                </span>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
