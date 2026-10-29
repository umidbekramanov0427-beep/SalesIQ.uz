import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import { StagePlanGrid } from "@/components/plan/StagePlanGrid";
import {
  useProfilesRaw,
  useSalesPlanFacts,
  useSalesPlans,
  useSaveSalesPlan,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { monthKey, planProgress, shiftMonth, type PlanProgress } from "@/lib/sales-plan";
import { cn, describeError } from "@/lib/utils";

const STATUS_LOOK: Record<PlanProgress["status"], string> = {
  done: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  on_track: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  behind: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  no_plan: "bg-muted text-muted-foreground",
};
const BAR: Record<PlanProgress["status"], string> = {
  done: "bg-emerald-500",
  on_track: "bg-sky-500",
  behind: "bg-rose-500",
  no_plan: "bg-muted-foreground/40",
};

// Nazorat → Reja va fakt: the month's sales plan against what was
// actually closed: the team at the top (done %, where the month ends at
// this pace, what is needed per day), then every manager. Managers set the
// plans right in the table.
export function SalesPlanBoard() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { format } = useCurrency();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const plans = useSalesPlans(month);
  const facts = useSalesPlanFacts(month);
  const { data: profiles } = useProfilesRaw();
  const canEdit =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";

  const team = useMemo(
    () =>
      (profiles ?? [])
        .filter((p) => (p.role === "sotuv_menejeri" || p.role === "rop") && !p.is_intern)
        .map((p) => ({ id: p.id, name: p.full_name || p.email || "—" })),
    [profiles],
  );
  const planOf = (id: string | null) =>
    (plans.data ?? []).find((p) => (p.profile_id ?? null) === id) ?? null;
  const factOf = (id: string) =>
    (facts.data ?? []).find((f) => f.ownerId === id) ?? { deals: 0, revenue: 0 };

  const teamFact = (facts.data ?? []).reduce(
    (a, f) => ({ deals: a.deals + f.deals, revenue: a.revenue + f.revenue }),
    { deals: 0, revenue: 0 },
  );
  const teamPlan = planOf(null);
  // No team plan of its own: the sum of the managers' plans.
  const memberPlans = team.map((m) => planOf(m.id));
  const teamTarget =
    Number(teamPlan?.target_amount ?? 0) ||
    memberPlans.reduce((a, p) => a + Number(p?.target_amount ?? 0), 0);
  const teamDeals =
    Number(teamPlan?.target_deals ?? 0) ||
    memberPlans.reduce((a, p) => a + Number(p?.target_deals ?? 0), 0);
  const teamProgress = planProgress(teamTarget, teamFact.revenue, month);

  const rows = team
    .map((m) => {
      const plan = planOf(m.id);
      const fact = factOf(m.id);
      const target = Number(plan?.target_amount ?? 0);
      return { ...m, plan, fact, progress: planProgress(target, fact.revenue, month) };
    })
    .sort(
      (a, b) => (b.progress.pct ?? -1) - (a.progress.pct ?? -1) || b.fact.revenue - a.fact.revenue,
    );

  const monthLabel = formatMonth(month, lang);
  const notReady = plans.data === null || facts.data === null;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold text-foreground">{t("plan.title")}</p>
          <p className="text-sm text-muted-foreground">{t("plan.desc")}</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label={t("plan.prev")}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[140px] text-center text-sm font-semibold capitalize">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label={t("plan.next")}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {notReady ? (
        <SectionCard icon={Target} tone="amber" title={t("plan.notReadyTitle")}>
          <p className="text-sm text-muted-foreground">{t("plan.migrationPending")}</p>
        </SectionCard>
      ) : plans.isLoading || facts.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      ) : (
        <div className="space-y-5">
          <section className="grid gap-5 rounded-2xl border border-border bg-card p-6 md:grid-cols-[auto_1fr]">
            <Ring pct={teamProgress.pct} status={teamProgress.status} />
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-bold text-foreground">{t("plan.team")}</p>
                <StatusChip status={teamProgress.status} />
                {canEdit && (
                  <PlanEditor
                    month={month}
                    profileId={null}
                    amount={Number(teamPlan?.target_amount ?? 0)}
                    deals={Number(teamPlan?.target_deals ?? 0)}
                    label={t("plan.setTeam")}
                  />
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <Metric label={t("plan.fact")} value={format(teamFact.revenue)} />
                <Metric label={t("plan.target")} value={teamTarget ? format(teamTarget) : "—"} />
                <Metric
                  label={t("plan.forecast")}
                  value={format(teamProgress.forecast)}
                  hint={
                    teamProgress.forecastPct != null ? `${teamProgress.forecastPct}%` : undefined
                  }
                />
                <Metric
                  label={t("plan.perDay")}
                  value={
                    teamTarget && teamProgress.status !== "done"
                      ? format(teamProgress.perDayNeeded)
                      : "—"
                  }
                  hint={t("plan.daysLeft", { n: teamProgress.daysLeft })}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("plan.deals", { fact: teamFact.deals, plan: teamDeals || "—" })}
              </p>
            </div>
          </section>

          <StagePlanGrid month={month} canEdit={canEdit} />

          <SectionCard
            icon={TrendingUp}
            tone="sky"
            title={t("plan.managers")}
            description={canEdit ? t("plan.managersEditHint") : t("plan.managersHint")}
          >
            {!rows.length ? (
              <p className="text-sm text-muted-foreground">{t("plan.noManagers")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-[12px] text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-semibold">{t("plan.manager")}</th>
                      <th className="py-2 pr-3 font-semibold">{t("plan.target")}</th>
                      <th className="py-2 pr-3 font-semibold">{t("plan.fact")}</th>
                      <th className="w-[28%] py-2 pr-3 font-semibold">{t("plan.progress")}</th>
                      <th className="py-2 pr-3 font-semibold">{t("plan.forecast")}</th>
                      <th className="py-2 pr-3 font-semibold">{t("plan.dealsCol")}</th>
                      <th className="py-2 font-semibold">{t("plan.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className={cn(
                          "border-b border-border last:border-0",
                          r.id === user?.id && "bg-primary/5",
                        )}
                      >
                        <td className="py-3 pr-3 font-semibold text-foreground">{r.name}</td>
                        <td className="py-3 pr-3 tabular-nums">
                          {canEdit ? (
                            <PlanEditor
                              month={month}
                              profileId={r.id}
                              amount={Number(r.plan?.target_amount ?? 0)}
                              deals={Number(r.plan?.target_deals ?? 0)}
                              label={r.plan ? format(Number(r.plan.target_amount)) : t("plan.set")}
                              inline
                            />
                          ) : r.plan ? (
                            format(Number(r.plan.target_amount))
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 pr-3 font-semibold tabular-nums">
                          {format(r.fact.revenue)}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn("h-full rounded-full", BAR[r.progress.status])}
                                style={{ width: `${Math.min(100, r.progress.pct ?? 0)}%` }}
                              />
                            </div>
                            <span className="w-10 text-right text-[12.5px] font-semibold tabular-nums">
                              {r.progress.pct != null ? `${r.progress.pct}%` : "—"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-3 tabular-nums text-muted-foreground">
                          {r.progress.forecastPct != null ? `${r.progress.forecastPct}%` : "—"}
                        </td>
                        <td className="py-3 pr-3 tabular-nums">
                          {r.fact.deals}
                          {r.plan?.target_deals ? ` / ${r.plan.target_deals}` : ""}
                        </td>
                        <td className="py-3">
                          <StatusChip status={r.progress.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </>
  );
}

// Uzbek month names written out: browsers have no "uz" month names.
const UZ_MONTHS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr",
];

function formatMonth(month: string, lang: string): string {
  const d = new Date(`${month}T00:00:00`);
  if (lang === "uz") return `${UZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", {
    month: "long",
    year: "numeric",
  });
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StatusChip({ status }: { status: PlanProgress["status"] }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex rounded-lg px-2 py-0.5 text-[12px] font-semibold",
        STATUS_LOOK[status],
      )}
    >
      {t(`plan.st.${status}`)}
    </span>
  );
}

// The team's done % as a ring.
function Ring({ pct, status }: { pct: number | null; status: PlanProgress["status"] }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const shown = Math.min(100, Math.max(0, pct ?? 0));
  const stroke =
    status === "done"
      ? "#10b981"
      : status === "on_track"
        ? "#0ea5e9"
        : status === "behind"
          ? "#f43f5e"
          : "#94a3b8";
  return (
    <div className="relative grid h-[136px] w-[136px] place-items-center">
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-muted"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * shown) / 100}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="font-display text-3xl font-semibold tabular-nums text-foreground">
        {pct != null ? `${pct}%` : "—"}
      </span>
    </div>
  );
}

// Click to set a plan: amount and number of deals for the month.
function PlanEditor({
  month,
  profileId,
  amount,
  deals,
  label,
  inline = false,
}: {
  month: string;
  profileId: string | null;
  amount: number;
  deals: number;
  label: string;
  inline?: boolean;
}) {
  const { t } = useI18n();
  const save = useSaveSalesPlan();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(String(amount || ""));
  const [d, setD] = useState(String(deals || ""));

  async function submit() {
    try {
      await save.mutateAsync({
        month,
        profileId,
        targetAmount: Number(a.replace(/\s+/g, "")) || 0,
        targetDeals: Number(d) || 0,
      });
      setOpen(false);
      toast.success(t("plan.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === "MIGRATION_PENDING"
          ? t("plan.migrationPending")
          : describeError(err, t("plan.saveFailed")),
      );
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setA(String(amount || ""));
          setD(String(deals || ""));
          setOpen(true);
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors",
          inline
            ? "px-1.5 py-1 text-foreground hover:bg-accent"
            : "h-8 border border-border px-2.5 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {label} <Pencil className="h-3 w-3 opacity-60" />
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input
        autoFocus
        inputMode="numeric"
        value={a}
        onChange={(e) => setA(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder={t("plan.amount")}
        className="h-8 w-36 rounded-lg border border-border bg-surface px-2 text-sm tabular-nums outline-none focus:border-primary/50"
      />
      <input
        inputMode="numeric"
        value={d}
        onChange={(e) => setD(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder={t("plan.dealsShort")}
        className="h-8 w-16 rounded-lg border border-border bg-surface px-2 text-sm tabular-nums outline-none focus:border-primary/50"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={save.isPending}
        className="h-8 rounded-lg bg-primary px-2.5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("common.save")}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="h-8 rounded-lg px-2 text-[12.5px] text-muted-foreground hover:bg-accent"
      >
        {t("common.cancel")}
      </button>
    </span>
  );
}
