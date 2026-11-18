import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Rocket,
  Sparkles,
  Target,
  Inbox,
  ListChecks,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { OwnerEmpty } from "@/components/owner/OwnerPage";
import { InfoTip } from "@/components/layout/InfoTip";
import { BackIconButton } from "@/components/layout/BackButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FixedPage } from "@/components/layout/FixedPage";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AddLeadDialog,
  ago,
  CompanyMark,
  LostDialog,
  money,
  orgPhaseOf,
  PHASE_CHIP,
  useCompanyLeads,
  useLeadAction,
  type LeadItem,
} from "@/components/owner/leads/shared";
import { type ApplicationStatus } from "@/lib/applications";
import {
  callDay,
  PIPELINE_STAGES,
  STAGE_TONE,
  tashkentDay,
  tashkentTime,
} from "@/lib/company-leads";
import { PLANS, PLAN_LABELS, normalizePlan } from "@/lib/plan-gating";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TONE_TILE } from "@/lib/tones";

// Owner -> Arizalar: the platform's own CRM of companies. Every company that
// signs up (with its plan, three answers and the booked call), leaves the
// website form or is added by hand is a lead on this board -- drawn like the
// CRM funnel: one toolbar row, stage columns without boxes, compact cards.
// A card opens the lead page (platform.applications_.$appId.tsx).
export const Route = createFileRoute("/platform/applications")({
  head: () => ({ meta: [{ title: "Arizalar — SalesIQ Owner" }] }),
  component: LeadsBoard,
});

const SOURCES = ["signup", "landing", "manual"] as const;
const PHASES = ["trial", "paid", "expired", "frozen", "none"] as const;

type LeadFilter = {
  sources: string[];
  stages: string[];
  plans: string[];
  phases: string[];
  call: "" | "booked" | "today";
  work: "" | "overdue" | "tasks" | "issues";
  period: "" | "today" | "7" | "30";
};
const EMPTY: LeadFilter = {
  sources: [],
  stages: [],
  plans: [],
  phases: [],
  call: "",
  work: "",
  period: "",
};

function filterCount(f: LeadFilter): number {
  return (
    (f.sources.length ? 1 : 0) +
    (f.stages.length ? 1 : 0) +
    (f.plans.length ? 1 : 0) +
    (f.phases.length ? 1 : 0) +
    (f.call ? 1 : 0) +
    (f.work ? 1 : 0) +
    (f.period ? 1 : 0)
  );
}

function matches(a: LeadItem, f: LeadFilter, today: string): boolean {
  if (f.sources.length && !f.sources.includes(a.source)) return false;
  if (f.stages.length && !f.stages.includes(a.status)) return false;
  if (f.plans.length && !f.plans.includes(normalizePlan(a.plan ?? a.org?.plan ?? null)))
    return false;
  if (f.phases.length && !f.phases.includes(orgPhaseOf(a.org))) return false;
  if (f.call === "booked" && !(a.meeting_at && a.status !== "lost")) return false;
  if (
    f.call === "today" &&
    !(a.meeting_at && a.status !== "lost" && tashkentDay(a.meeting_at) === today)
  )
    return false;
  if (f.work === "overdue" && a.overdue === 0) return false;
  if (f.work === "tasks" && a.tasks === 0) return false;
  if (f.work === "issues" && a.issues === 0) return false;
  if (f.period) {
    const days = f.period === "today" ? 0 : Number(f.period);
    const since =
      f.period === "today"
        ? today
        : tashkentDay(new Date(Date.now() - days * 86_400_000).toISOString());
    if (tashkentDay(a.created_at) < since) return false;
  }
  return true;
}

function LeadsBoard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data, isLoading } = useCompanyLeads();
  const act = useLeadAction();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<LeadFilter>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [lostFor, setLostFor] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const all = useMemo(() => data?.items ?? [], [data]);
  const today = tashkentDay(new Date().toISOString());
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (a) =>
        matches(a, filter, today) &&
        (!needle ||
          [a.name, a.phone, a.company, a.email, a.business].some((v) =>
            v?.toLowerCase().includes(needle),
          )),
    );
  }, [all, q, filter, today]);
  const by = (s: string) => items.filter((a) => a.status === s);
  const stats = useMemo(() => {
    const month = today.slice(0, 7);
    const won = all.filter((a) => a.status === "installed").length;
    const lost = all.filter((a) => a.status === "lost").length;
    return {
      newToday: all.filter((a) => tashkentDay(a.created_at) === today).length,
      callsToday: all.filter(
        (a) => a.meeting_at && a.status !== "lost" && tashkentDay(a.meeting_at) === today,
      ).length,
      overdue: all.reduce((n, a) => n + a.overdue, 0),
      tasks: all.reduce((n, a) => n + a.tasks, 0),
      week: all.filter((a) => Date.now() - new Date(a.created_at).getTime() < 7 * 86_400_000)
        .length,
      issues: all.reduce((n, a) => n + a.issues, 0),
      installedMonth: all.filter(
        (a) =>
          a.status === "installed" &&
          tashkentDay(a.stage_changed_at ?? a.updated_at).slice(0, 7) === month,
      ).length,
      conv: won + lost ? Math.round((won / (won + lost)) * 100) : null,
    };
  }, [all, today]);

  function move(id: string, to: ApplicationStatus) {
    const lead = all.find((a) => a.id === id);
    if (!lead || lead.status === to) return;
    if (to === "lost") {
      setLostFor(id);
      return;
    }
    act.mutate({ method: "PATCH", body: { id, status: to } });
  }
  const drop = (to: ApplicationStatus) => (e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/lead");
    if (id) move(id, to);
  };
  const over = (s: string) => (e: DragEvent) => {
    e.preventDefault();
    if (dragOver !== s) setDragOver(s);
  };
  const open = (id: string) =>
    void navigate({ to: "/platform/applications/$appId", params: { appId: id } });

  return (
    <FixedPage>
      {/* One row, the CRM funnel's toolbar: back, name and totals, search with its filter, "Lid qo'shish". */}
      <header className="shrink-0 border-b border-border bg-card px-6 py-3 phone:px-3">
        <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">
          <BackIconButton />
          <div className="flex min-w-0 shrink-0 items-center gap-3.5 pl-1 pr-2">
            <h1 className="flex items-center gap-2 text-[15px] font-extrabold uppercase tracking-wide text-foreground sm:text-base">
              {t("lead.title")}
              <InfoTip
                size="md"
                side="bottom"
                title={t("lead.title")}
                tipKeys={["page:/platform/applications", "nav:/platform/applications"]}
              />
            </h1>
            <span className="h-7 w-px bg-border" />
            <p className="flex items-baseline gap-1.5 whitespace-nowrap leading-none">
              <span className="text-[13px] font-medium text-muted-foreground">
                {t("pipeline.columnCount", { count: items.length })}:
              </span>
              <span className="text-[17px] font-extrabold tabular-nums tracking-tight text-foreground">
                {money(items.reduce((x, a) => x + (a.amount ?? 0), 0))}
              </span>
            </p>
          </div>
          {/* Equal room on both sides: the search sits in the middle of the bar. */}
          <span className="flex-1 phone:hidden" />
          <div className="flex h-10 w-[340px] min-w-0 shrink-0 items-center gap-2 rounded-2xl border border-border bg-card pl-3.5 pr-1.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 phone:order-last phone:w-full">
            <Search className="h-4 w-4 shrink-0 text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("lead.search")}
              className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-subtle"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label={t("leadFilter.clearSearch")}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-subtle hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="h-5 w-px shrink-0 bg-border" />
            <LeadsFilter value={filter} onChange={setFilter} />
          </div>
          <span className="flex-1" />
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setAnalyticsOpen(true)}
            className="ctl-soft inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold text-foreground hover:border-primary/40"
          >
            <BarChart3 className="h-4 w-4 text-primary" />
            {t("lead.analytics")}
          </button>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ctl-lit inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold shadow-sm transition-[filter] hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            {t("lead.add")}
          </button>
        </div>
      </header>

      {data && (!data.ready || data.stagesReady === false) && (
        <p className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12.5px] text-amber-800 dark:text-amber-200">
          {t("lead.notReady")}
        </p>
      )}

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-full gap-4 px-6 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-40 w-[280px] animate-pulse rounded-xl bg-muted/60" />
            ))}
          </div>
        ) : !all.length ? (
          <div className="grid h-full place-items-center">
            <OwnerEmpty icon={Inbox} title={t("lead.empty")} hint={t("lead.emptyHint")} />
          </div>
        ) : (
          <div className="flex h-full gap-4 overflow-x-auto px-6 py-4 phone:px-3">
            {PIPELINE_STAGES.map((s) => {
              const col = by(s);
              const sum = col.reduce((x, a) => x + (a.amount ?? 0), 0);
              return (
                <section
                  key={s}
                  onDragOver={over(s)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={drop(s)}
                  className={cn(
                    // No box per stage, as on the CRM funnel: a header with a colored line over its cards.
                    "flex h-full w-[280px] shrink-0 flex-col rounded-xl transition-colors",
                    dragOver === s && "bg-primary/[0.06] ring-1 ring-primary/30",
                  )}
                >
                  <header className="px-1 pb-2 pt-1 text-center">
                    <h2 className="truncate text-[13px] font-bold uppercase tracking-[0.04em] text-foreground">
                      {t(`lead.st.${s}`)}
                    </h2>
                    <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
                      {t("pipeline.columnCount", { count: col.length })}: {money(sum)}
                    </p>
                    <span
                      className={cn(
                        "mt-2 block h-[2px] rounded-full bg-gradient-to-r",
                        STAGE_TONE[s].bar,
                      )}
                    />
                  </header>
                  <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-2">
                    {col.map((a) => (
                      <LeadCard key={a.id} a={a} onOpen={() => open(a.id)} today={today} />
                    ))}
                    {!col.length && (
                      <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12px] text-subtle">
                        {t("lead.dropHere")}
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
            <section
              onDragOver={over("lost")}
              onDragLeave={() => setDragOver(null)}
              onDrop={drop("lost")}
              className={cn(
                "flex h-full w-[220px] shrink-0 flex-col rounded-xl transition-colors",
                dragOver === "lost" && "bg-rose-500/[0.06] ring-1 ring-rose-500/30",
              )}
            >
              <header className="px-1 pb-2 pt-1 text-center">
                <h2 className="inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.04em] text-rose-600 dark:text-rose-400">
                  <XCircle className="h-3.5 w-3.5" /> {t("lead.st.lost")}
                </h2>
                <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
                  {t("pipeline.columnCount", { count: by("lost").length })}
                </p>
                <span className="mt-2 block h-[2px] rounded-full bg-rose-500/60" />
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-2">
                {by("lost")
                  .slice(0, 50)
                  .map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => open(a.id)}
                      className="rounded-lg border border-border bg-card px-2.5 py-2 text-left opacity-80 transition-opacity hover:opacity-100 dark:border-white/[0.1]"
                    >
                      <span className="block truncate text-[13px] font-semibold text-foreground">
                        {a.company || a.name}
                      </span>
                      {a.lost_reason && (
                        <span className="block truncate text-[11.5px] text-subtle">
                          {a.lost_reason}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Analytics: the board's figures in a window; a card filters the board to it. */}
      <Dialog open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
        <DialogContent className="max-w-[1100px] gap-5" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> {t("lead.analytics")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                ["newToday", Sparkles, "sky", stats.newToday, { ...EMPTY, period: "today" }],
                [
                  "callsToday",
                  CalendarClock,
                  "amber",
                  stats.callsToday,
                  { ...EMPTY, call: "today" },
                ],
                ["overdue", ListChecks, "rose", stats.overdue, { ...EMPTY, work: "overdue" }],
                ["tasks", ListChecks, "violet", stats.tasks, { ...EMPTY, work: "tasks" }],
                ["issues", AlertTriangle, "amber", stats.issues, { ...EMPTY, work: "issues" }],
                [
                  "installed",
                  Rocket,
                  "emerald",
                  stats.installedMonth,
                  { ...EMPTY, stages: ["installed"] },
                ],
                ["week", Sparkles, "primary", stats.week, { ...EMPTY, period: "7" }],
                ["conv", Target, "violet", stats.conv == null ? "—" : `${stats.conv}%`, null],
              ] as const
            ).map(([key, Icon, tone, value, f]) => (
              <button
                key={key}
                type="button"
                disabled={!f}
                onClick={() => {
                  if (!f) return;
                  setFilter(f as LeadFilter);
                  setAnalyticsOpen(false);
                }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 disabled:cursor-default disabled:hover:border-border"
              >
                <span
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                    TONE_TILE[tone],
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[24px] font-bold leading-none tabular-nums text-foreground">
                    {value}
                  </span>
                  <span className="mt-1 block truncate text-[12.5px] text-muted-foreground">
                    {t(`lead.kpi.${key}`)}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <StageRelay all={all} />
        </DialogContent>
      </Dialog>
      <AddLeadDialog open={adding} onClose={() => setAdding(false)} onCreated={open} />
      <LostDialog
        open={!!lostFor}
        busy={act.isPending}
        onClose={() => setLostFor(null)}
        onConfirm={(reason) =>
          act.mutate(
            { method: "PATCH", body: { id: lostFor, status: "lost", lostReason: reason } },
            { onSuccess: () => setLostFor(null) },
          )
        }
      />
    </FixedPage>
  );
}

/** A lead on the board, drawn like the CRM funnel's card. */
function LeadCard({ a, onOpen, today }: { a: LeadItem; onOpen: () => void; today: string }) {
  const { t, lang } = useI18n();
  const phase = orgPhaseOf(a.org);
  const callToday = a.meeting_at && tashkentDay(a.meeting_at) === today;
  const callPast = a.meeting_at && new Date(a.meeting_at).getTime() < Date.now();
  const title = a.company || a.name;
  const plan = a.plan ?? a.org?.plan ?? null;
  const hasFooter = !!a.amount || a.tasks > 0 || a.issues > 0;
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/lead", a.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      className="group relative cursor-pointer rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] shadow-[0_1px_1px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-[0_2px_8px_rgba(16,24,40,0.08)] active:cursor-grabbing dark:border-white/[0.1] dark:bg-[color-mix(in_oklab,var(--card),white_5%)]"
    >
      <div className="flex min-w-0 gap-2.5">
        <CompanyMark name={title} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1 font-medium text-foreground/75">
              <UserRound className="h-3 w-3 shrink-0 text-subtle" />
              <span className="truncate">{a.name}</span>
            </span>
            <span className="flex-1" />
            <span className="shrink-0 tabular-nums">
              {ago(a.last_activity_at ?? a.updated_at, t)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[14px] font-semibold leading-[19px] text-primary">
            {title}
          </p>
          {a.phone && (
            <p className="truncate text-[13px] leading-[18px] tabular-nums text-foreground/85">
              {a.phone}
            </p>
          )}
          {(phase !== "none" || plan || a.sales_reps) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {phase !== "none" && (
                <span
                  className={cn(
                    "rounded px-1.5 py-px text-[11px] font-semibold",
                    PHASE_CHIP[phase],
                  )}
                >
                  {t(`lead.phase.${phase}`)}
                </span>
              )}
              {plan && (
                <span className="rounded bg-muted px-1.5 py-px text-[11px] font-semibold text-muted-foreground">
                  {PLAN_LABELS[normalizePlan(plan)]}
                </span>
              )}
              {a.sales_reps && (
                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-px text-[11px] font-semibold text-muted-foreground">
                  <Users className="h-3 w-3" /> {a.sales_reps}
                </span>
              )}
            </div>
          )}
          {a.meeting_at && a.status !== "lost" && (
            <p
              className={cn(
                "mt-1.5 inline-flex items-center gap-1.5 rounded px-1.5 py-px text-[11.5px] font-semibold",
                callToday
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : callPast
                    ? "bg-muted text-subtle"
                    : "bg-sky-500/10 text-sky-700 dark:text-sky-300",
              )}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {callToday ? t("lead.today") : callDay(a.meeting_at, lang)},{" "}
              {tashkentTime(a.meeting_at)}
            </p>
          )}
          {hasFooter && (
            <div className="mt-1.5 flex items-center gap-2 border-t border-border/70 pt-1.5 text-[12px]">
              <span className="font-semibold tabular-nums text-foreground">
                {a.amount ? money(a.amount) : ""}
              </span>
              <span className="flex-1" />
              {a.issues > 0 && (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> {a.issues}
                </span>
              )}
              {a.tasks > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    a.overdue > 0 ? "font-semibold text-rose-600" : "text-muted-foreground",
                  )}
                >
                  <ListChecks className="h-3.5 w-3.5" /> {a.overdue > 0 ? a.overdue : a.tasks}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** The search box's filter: source, stage, plan, company phase, calls, work and when added. */
function LeadsFilter({
  value,
  onChange,
}: {
  value: LeadFilter;
  onChange: (f: LeadFilter) => void;
}) {
  const { t } = useI18n();
  const n = filterCount(value);
  const toggle = (k: "sources" | "stages" | "plans" | "phases", v: string) => {
    const cur = value[k];
    onChange({ ...value, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  const chip = (on: boolean, onClick: () => void, label: ReactNode, key: string) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-lg border px-2.5 text-[12.5px] font-semibold transition-colors",
        on
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
  const group = (label: string, children: ReactNode) => (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("funnelFilter.button")}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[12.5px] font-semibold transition-colors data-[state=open]:bg-primary/12 data-[state=open]:text-primary",
            n > 0
              ? "bg-primary/12 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t("funnelFilter.button")}
          {n > 0 && (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10.5px] font-bold text-primary-foreground">
              {n}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(600px,calc(100vw-2rem))] p-0">
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          {group(
            t("lead.col.stage"),
            [...PIPELINE_STAGES, "lost" as const].map((s) =>
              chip(value.stages.includes(s), () => toggle("stages", s), t(`lead.st.${s}`), s),
            ),
          )}
          <div className="space-y-4">
            {group(
              t("lead.col.source"),
              SOURCES.map((s) =>
                chip(value.sources.includes(s), () => toggle("sources", s), t(`lead.src.${s}`), s),
              ),
            )}
            {group(
              t("lead.col.plan"),
              PLANS.map((p) =>
                chip(value.plans.includes(p), () => toggle("plans", p), PLAN_LABELS[p], p),
              ),
            )}
          </div>
          {group(
            t("oinbox.f.phase"),
            PHASES.map((p) =>
              chip(
                value.phases.includes(p),
                () => toggle("phases", p),
                p === "none" ? t("lead.f.noCompany") : t(`lead.phase.${p}`),
                p,
              ),
            ),
          )}
          {group(
            t("lead.f.call"),
            (["booked", "today"] as const).map((c) =>
              chip(
                value.call === c,
                () => onChange({ ...value, call: value.call === c ? "" : c }),
                t(`lead.f.call.${c}`),
                c,
              ),
            ),
          )}
          {group(
            t("lead.f.work"),
            (["overdue", "tasks", "issues"] as const).map((w) =>
              chip(
                value.work === w,
                () => onChange({ ...value, work: value.work === w ? "" : w }),
                t(`lead.f.work.${w}`),
                w,
              ),
            ),
          )}
          {group(
            t("lead.f.period"),
            (["today", "7", "30"] as const).map((d) =>
              chip(
                value.period === d,
                () => onChange({ ...value, period: value.period === d ? "" : d }),
                t(`lead.f.period.${d}`),
                d,
              ),
            ),
          )}
        </div>
        {n > 0 && (
          <div className="flex justify-end border-t border-border px-4 py-2.5">
            <button
              type="button"
              onClick={() => onChange(EMPTY)}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> {t("oinbox.reset")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** How many leads reached each stage and how many passed on to the next. */
function StageRelay({ all }: { all: LeadItem[] }) {
  const { t } = useI18n();
  const order = PIPELINE_STAGES;
  const reached = order.map(
    (_, i) => all.filter((a) => order.indexOf(a.status as (typeof order)[number]) >= i).length,
  );
  const max = Math.max(1, reached[0] ?? 1);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-subtle">
        {t("lead.kpi.relay")}
      </p>
      <div className="grid gap-2.5">
        {order.map((s, i) => {
          const pass =
            i > 0 && reached[i - 1] ? Math.round((reached[i]! / reached[i - 1]!) * 100) : null;
          return (
            <div key={s} className="flex items-center gap-3 text-[13px]">
              <span className="w-[170px] shrink-0 truncate text-foreground">
                {t(`lead.st.${s}`)}
              </span>
              <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("block h-full rounded-full bg-gradient-to-r", STAGE_TONE[s].bar)}
                  style={{ width: `${((reached[i] ?? 0) / max) * 100}%` }}
                />
              </span>
              <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-foreground">
                {reached[i]}
              </span>
              <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                {pass == null ? "" : `${pass}%`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
