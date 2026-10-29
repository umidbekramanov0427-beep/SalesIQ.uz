import { useEffect, useMemo, useState } from "react";
import { GitBranch, Info, Loader2, Pencil, User } from "lucide-react";
import { toast } from "sonner";
import { FilterSelect } from "@/components/filters/FilterSelect";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  usePipelines,
  usePipelineStagesRaw,
  useProfilesRaw,
  useSaveStagePlan,
  useStageEvents,
  useStagePlans,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { monthRange } from "@/lib/sales-plan";
import { computeStageGrid, type StageCell } from "@/lib/stage-plan";
import { cn, describeError } from "@/lib/utils";

// Nazorat -> Reja va fakt -> "Bosqichlar bo'yicha": one row per stage of a
// funnel, one column per day of the month. A past day shows fact / plan
// (green when the plan was met), today is highlighted, and the days ahead
// show how many a day are now needed to reach the month's plan. On the
// right: the month's total and where it ends at this pace. Managers set
// each stage's plan by clicking its total.
export function StagePlanGrid({ month, canEdit }: { month: string; canEdit: boolean }) {
  const { t } = useI18n();
  const { data: pipelines } = usePipelines();
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();
  const events = useStageEvents(month);
  const plans = useStagePlans(month);
  const [pipelineId, setPipelineId] = useState("");
  const [ownerId, setOwnerId] = useState("");

  useEffect(() => {
    if (!pipelineId && pipelines?.length) {
      setPipelineId((pipelines.find((p) => p.is_default) ?? pipelines[0])!.id);
    }
  }, [pipelines, pipelineId]);

  const funnelStages = useMemo(
    () =>
      (stages ?? [])
        .filter((s) => s.pipeline_id === pipelineId && !s.is_lost)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ id: s.id, name: s.name })),
    [stages, pipelineId],
  );
  const managers = useMemo(
    () =>
      (profiles ?? [])
        .filter((p) => (p.role === "sotuv_menejeri" || p.role === "rop") && !p.is_intern)
        .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")),
    [profiles],
  );

  const { from, days } = monthRange(month);
  const targets = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plans.data ?? []) {
      if ((p.profile_id ?? "") === ownerId) m.set(p.stage_id, p.target);
    }
    return m;
  }, [plans.data, ownerId]);
  const rows = useMemo(
    () =>
      computeStageGrid({
        monthStart: from,
        days,
        stages: funnelStages,
        events: (events.data?.events ?? []).filter((e) => !ownerId || e.owner_id === ownerId),
        targets,
      }),
    [from, days, funnelStages, events.data, ownerId, targets],
  );

  const totalTarget = rows.reduce((a, r) => a + r.target, 0);
  const lastRow = rows[rows.length - 1];
  const plansReady = plans.data !== null;

  return (
    <section className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground">{t("sp.title")}</p>
          <p className="mt-0.5 max-w-3xl text-[12.5px] text-subtle">{t("sp.desc")}</p>
        </div>
        {lastRow && lastRow.target > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[22px] font-bold tabular-nums text-foreground">
              {lastRow.total}
            </span>
            <span className="text-sm text-subtle">
              / {lastRow.target} {lastRow.name.toLowerCase()}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                (lastRow.forecastPct ?? 0) >= 100
                  ? "bg-success/12 text-success"
                  : "bg-destructive/12 text-destructive",
              )}
            >
              {(lastRow.forecastPct ?? 0) >= 100 ? t("sp.onTrack") : t("sp.behind")} ·{" "}
              {lastRow.pct ?? 0}%
            </span>
            <span className="rounded-full bg-amber-500/14 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              {t("sp.forecast")} ≈ {lastRow.forecast} · {lastRow.forecastPct ?? 0}%
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <FilterSelect
          icon={GitBranch}
          label={t("leadFilter.funnelLabel")}
          value={pipelineId}
          onChange={setPipelineId}
        >
          {(pipelines ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect icon={User} label={t("sp.whose")} value={ownerId} onChange={setOwnerId}>
          <option value="">{t("sp.team")}</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name || m.email}
            </option>
          ))}
        </FilterSelect>
        {events.data?.approximate && (
          <p className="flex max-w-xl items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("sp.approximate")}
          </p>
        )}
      </div>

      {events.isLoading ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">{t("sp.noStages")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1100px] table-fixed border-separate border-spacing-0 text-[11.5px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-[1] w-[150px] border-b border-border bg-card py-2 pl-1 text-left text-[12px] font-semibold text-muted-foreground">
                  {t("sp.stageDay")}
                </th>
                {rows[0]!.cells.map((c) => (
                  <th
                    key={c.day}
                    className={cn(
                      "w-[26px] border-b border-border py-2 text-center font-semibold",
                      c.kind === "today"
                        ? "rounded-t-lg bg-primary/14 text-[var(--primary-ink)]"
                        : "text-subtle",
                    )}
                  >
                    {c.day}
                  </th>
                ))}
                <th className="w-[104px] border-b border-border py-2 pr-2 text-right text-[12px] font-semibold text-muted-foreground">
                  {t("sp.total")}
                </th>
                <th className="w-[84px] border-b border-border py-2 pr-1 text-right text-[12px] font-semibold text-muted-foreground">
                  {t("sp.forecast")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.stageId}>
                  <td className="sticky left-0 z-[1] max-w-[150px] border-b border-border/60 bg-card py-2 pl-1">
                    <span className="block truncate text-[13px] font-semibold text-foreground">
                      {r.name}
                    </span>
                    {r.target > 0 && (
                      <span className="block text-[11px] text-subtle">
                        {t("sp.perDay", { n: Math.round((r.target / r.cells.length) * 10) / 10 })}
                      </span>
                    )}
                  </td>
                  {r.cells.map((c) => (
                    <GridCell key={c.day} c={c} hasPlan={r.target > 0} />
                  ))}
                  <td className="whitespace-nowrap border-b border-border/60 py-2.5 pr-2 text-right text-[12.5px]">
                    <TargetEditor
                      month={month}
                      stageId={r.stageId}
                      profileId={ownerId || null}
                      target={r.target}
                      disabled={!canEdit || !plansReady}
                    >
                      <b className="tabular-nums text-foreground">{r.total}</b>
                      <span className="text-subtle">/{r.target || "—"}</span>
                    </TargetEditor>
                    {r.pct != null && (
                      <span
                        className={cn(
                          "ml-1.5 rounded-full px-1.5 py-px text-[11px] font-semibold",
                          r.pct >= 70
                            ? "bg-success/12 text-success"
                            : "bg-destructive/12 text-destructive",
                        )}
                      >
                        {r.pct}%
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-b border-border/60 py-2.5 pr-1 text-right text-[12.5px] tabular-nums text-foreground">
                    ≈{r.forecast}
                    {r.forecastPct != null && (
                      <span className="text-subtle"> · {r.forecastPct}%</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-subtle">
        {plansReady
          ? canEdit
            ? t("sp.editHint", { n: totalTarget })
            : t("sp.viewHint")
          : t("sp.migrationPending")}
      </p>
    </section>
  );
}

function GridCell({ c, hasPlan }: { c: StageCell; hasPlan: boolean }) {
  const base = "border-b border-border/60 py-2.5 text-center tabular-nums";
  if (c.kind === "future") {
    return (
      <td className={cn(base, "text-amber-600 dark:text-amber-400")}>
        {hasPlan ? c.needed : <span className="text-subtle/60">·</span>}
      </td>
    );
  }
  const tone = !hasPlan
    ? c.fact > 0
      ? "text-foreground"
      : "text-subtle/60"
    : c.fact >= c.plan
      ? "text-success"
      : c.fact > 0
        ? "text-amber-600 dark:text-amber-400"
        : "text-destructive";
  return (
    <td
      className={cn(base, c.kind === "today" && "bg-primary/14")}
      title={hasPlan ? `${c.fact} / ${c.plan}` : String(c.fact)}
    >
      <span className={cn("font-bold", tone)}>{c.fact}</span>
    </td>
  );
}

function TargetEditor({
  month,
  stageId,
  profileId,
  target,
  disabled,
  children,
}: {
  month: string;
  stageId: string;
  profileId: string | null;
  target: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const save = useSaveStagePlan();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(target || ""));
  if (disabled) return <span>{children}</span>;
  async function submit() {
    try {
      await save.mutateAsync({ month, stageId, profileId, target: Number(value) || 0 });
      setOpen(false);
      toast.success(t("plan.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === "MIGRATION_PENDING"
          ? t("sp.migrationPending")
          : describeError(err, t("plan.saveFailed")),
      );
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(String(target || ""));
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-1 rounded-md px-1 hover:bg-accent"
          title={t("sp.setPlan")}
        >
          {children}
          <Pencil className="h-3 w-3 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-3">
        <p className="text-xs font-semibold text-muted-foreground">{t("sp.setPlan")}</p>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            autoFocus
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={save.isPending}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
