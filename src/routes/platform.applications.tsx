import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Columns3,
  Inbox,
  ListChecks,
  Plus,
  Rocket,
  Search,
  Table2,
  Target,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { OwnerEmpty } from "@/components/owner/OwnerPage";
import { FixedPage } from "@/components/layout/FixedPage";
import {
  AddLeadDialog,
  ago,
  CompanyMark,
  LostDialog,
  money,
  orgPhaseOf,
  PHASE_CHIP,
  StageChip,
  useCompanyLeads,
  useLeadAction,
  type LeadItem,
} from "@/components/owner/leads/shared";
import { stageOf, type ApplicationStatus } from "@/lib/applications";
import {
  callDay,
  PIPELINE_STAGES,
  STAGE_TONE,
  tashkentDay,
  tashkentTime,
} from "@/lib/company-leads";
import { PLAN_LABELS, normalizePlan } from "@/lib/plan-gating";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Owner -> Arizalar: the platform's own CRM of companies. Every company that
// signs up (with its plan, three answers and the booked call), leaves the
// website form or is added by hand is a lead on this board; its card opens
// the lead page (platform.applications_.$appId.tsx).
export const Route = createFileRoute("/platform/applications")({
  head: () => ({ meta: [{ title: "Arizalar — SalesIQ Owner" }] }),
  component: LeadsBoard,
});

type View = "board" | "table";
const SOURCES = ["all", "signup", "landing", "manual"] as const;

function LeadsBoard() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { data, isLoading } = useCompanyLeads();
  const act = useLeadAction();
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem("owner.leads.view") as View) || "board";
    } catch {
      return "board";
    }
  });
  const [q, setQ] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]>("all");
  const [onlyCalls, setOnlyCalls] = useState(false);
  const [adding, setAdding] = useState(false);
  const [lostFor, setLostFor] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const all = useMemo(() => data?.items ?? [], [data]);
  const today = tashkentDay(new Date().toISOString());
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (a) =>
        (source === "all" || a.source === source) &&
        (!onlyCalls || (a.meeting_at && a.status !== "lost")) &&
        (!needle ||
          [a.name, a.phone, a.company, a.email, a.business].some((v) =>
            v?.toLowerCase().includes(needle),
          )),
    );
  }, [all, q, source, onlyCalls]);

  const by = (s: string) => items.filter((a) => a.status === s);
  const count = (s: string) => all.filter((a) => a.status === s).length;
  const callsToday = all.filter(
    (a) => a.meeting_at && a.status !== "lost" && tashkentDay(a.meeting_at) === today,
  );
  const nextCall = all
    .filter(
      (a) => a.meeting_at && a.status !== "lost" && new Date(a.meeting_at).getTime() > Date.now(),
    )
    .sort((x, y) => x.meeting_at!.localeCompare(y.meeting_at!))[0];
  const overdue = all.reduce((s, a) => s + a.overdue, 0);
  const openTasks = all.reduce((s, a) => s + a.tasks, 0);
  const month = today.slice(0, 7);
  const installedMonth = all.filter(
    (a) => a.status === "installed" && (a.stage_changed_at ?? a.updated_at).slice(0, 7) === month,
  ).length;
  const closed = count("installed") + count("lost");
  const conv = closed ? Math.round((count("installed") / closed) * 100) : null;

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
  const setViewSaved = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("owner.leads.view", v);
    } catch {
      /* private window */
    }
  };

  const [analytics, setAnalytics] = useState<boolean>(() => {
    try {
      return localStorage.getItem("owner.leads.analytics") === "1";
    } catch {
      return false;
    }
  });
  const toggleAnalytics = () => {
    setAnalytics((v) => {
      try {
        localStorage.setItem("owner.leads.analytics", v ? "0" : "1");
      } catch {
        /* private window */
      }
      return !v;
    });
  };

  return (
    <FixedPage>
      {/* One compact bar: the title, filters, views and actions. */}
      <header className="shrink-0 space-y-2 border-b border-border bg-card px-4 py-2.5 phone:px-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/12 text-sky-700 dark:text-sky-300">
            <Inbox className="h-[18px] w-[18px]" />
          </span>
          <h1 className="mr-2 text-[17px] font-bold tracking-tight text-foreground">
            {t("lead.title")}
          </h1>
          <MiniChip
            icon={CalendarClock}
            tone="amber"
            value={callsToday.length}
            label={t("lead.mini.calls")}
          />
          <MiniChip
            icon={ListChecks}
            tone={overdue ? "rose" : "slate"}
            value={overdue}
            label={t("lead.mini.overdue")}
          />
          <MiniChip
            icon={Rocket}
            tone="emerald"
            value={installedMonth}
            label={t("lead.mini.installed")}
          />
          <MiniChip
            icon={Target}
            tone="violet"
            value={conv == null ? "—" : `${conv}%`}
            label={t("lead.mini.conv")}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={analytics}
              onClick={toggleAnalytics}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[12.5px] font-semibold transition-colors",
                analytics
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <BarChart3 className="h-4 w-4" /> {t("lead.analytics")}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", analytics && "rotate-180")}
              />
            </button>
            <div className="ctl-track inline-flex rounded-xl p-1">
              {(
                [
                  ["board", Columns3],
                  ["table", Table2],
                ] as const
              ).map(([v, Icon]) => (
                <button
                  key={v}
                  type="button"
                  aria-selected={view === v}
                  onClick={() => setViewSaved(v)}
                  className="ctl-tab inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold"
                >
                  <Icon className="h-4 w-4" /> {t(`lead.view.${v}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="ctl-lit inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold"
            >
              <Plus className="h-4 w-4" /> {t("lead.add")}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 w-[280px] items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-primary phone:w-full">
            <Search className="h-4 w-4 text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("lead.search")}
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
            />
          </label>
          <div className="ctl-track inline-flex rounded-xl p-1">
            {SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                aria-selected={source === s}
                onClick={() => setSource(s)}
                className="ctl-tab h-7 rounded-lg px-2.5 text-[12px] font-semibold"
              >
                {t(`lead.src.${s}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={onlyCalls}
            onClick={() => setOnlyCalls(!onlyCalls)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[12px] font-semibold",
              onlyCalls
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <CalendarClock className="h-4 w-4" /> {t("lead.onlyCalls")}
          </button>
          {nextCall?.meeting_at && (
            <span className="ml-auto text-[12px] text-muted-foreground">
              {t("lead.statCallsNext", {
                day: callDay(nextCall.meeting_at, lang),
                time: tashkentTime(nextCall.meeting_at),
              })}
            </span>
          )}
        </div>
      </header>

      {data && (!data.ready || data.stagesReady === false) && (
        <p className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12.5px] text-amber-800 dark:text-amber-200">
          {t("lead.notReady")}
        </p>
      )}

      {/* Analytics: opened with its button, small cards and the stage relay. */}
      {analytics && (
        <div className="shrink-0 space-y-2.5 border-b border-border bg-surface/50 px-4 py-3 phone:px-3">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <SmallStat
              icon={CalendarClock}
              tone="amber"
              label={t("lead.statCalls")}
              value={callsToday.length}
              note={
                nextCall?.meeting_at
                  ? t("lead.statCallsNext", {
                      day: callDay(nextCall.meeting_at, lang),
                      time: tashkentTime(nextCall.meeting_at),
                    })
                  : t("lead.statCallsNone")
              }
            />
            <SmallStat
              icon={ListChecks}
              tone={overdue ? "rose" : "slate"}
              label={t("lead.statOverdue")}
              value={overdue}
              note={t("lead.statOpenTasks", { n: openTasks })}
            />
            <SmallStat
              icon={Rocket}
              tone="emerald"
              label={t("lead.statInstalled")}
              value={installedMonth}
              note={t("lead.statInstalledAll", { n: count("installed") })}
            />
            <SmallStat
              icon={Target}
              tone="violet"
              label={t("lead.statConv")}
              value={conv == null ? "—" : `${conv}%`}
              note={t("lead.statConvNote", { won: count("installed"), lost: count("lost") })}
            />
          </div>
          <PipelineRail all={all} />
        </div>
      )}

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-full gap-3 px-4 py-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-full w-[272px] animate-pulse rounded-2xl bg-muted/60" />
            ))}
          </div>
        ) : !all.length ? (
          <div className="grid h-full place-items-center">
            <OwnerEmpty icon={Inbox} title={t("lead.empty")} hint={t("lead.emptyHint")} />
          </div>
        ) : view === "board" ? (
          <div className="flex h-full gap-3 overflow-x-auto px-4 py-3 phone:px-3">
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
                    "flex h-full w-[272px] shrink-0 flex-col rounded-2xl border bg-surface/60 transition-colors",
                    dragOver === s ? "border-primary/60 bg-primary/[0.05]" : "border-border",
                  )}
                >
                  <header className="px-3 pb-2 pt-3">
                    <span
                      className={cn(
                        "mb-2.5 block h-1 rounded-full bg-gradient-to-r",
                        STAGE_TONE[s].bar,
                      )}
                    />
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">
                        {t(`lead.st.${s}`)}
                      </span>
                      <span className="rounded-md bg-card px-1.5 text-[12px] font-bold tabular-nums text-muted-foreground">
                        {col.length}
                      </span>
                    </div>
                    {sum > 0 && (
                      <p className="mt-0.5 text-[11.5px] tabular-nums text-subtle">{money(sum)}</p>
                    )}
                  </header>
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                    {col.map((a) => (
                      <LeadCard key={a.id} a={a} onOpen={() => open(a.id)} today={today} />
                    ))}
                    {!col.length && (
                      <p className="grid flex-1 place-items-center rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12px] text-subtle">
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
                "flex h-full w-[200px] shrink-0 flex-col rounded-2xl border border-dashed transition-colors",
                dragOver === "lost"
                  ? "border-rose-500/60 bg-rose-500/[0.06]"
                  : "border-rose-500/25 bg-rose-500/[0.025]",
              )}
            >
              <header className="flex items-center gap-2 px-3 pb-2 pt-4">
                <XCircle className="h-4 w-4 text-rose-500" />
                <span className="flex-1 text-[13.5px] font-semibold text-foreground">
                  {t("lead.st.lost")}
                </span>
                <span className="text-[12px] font-bold tabular-nums text-muted-foreground">
                  {by("lost").length}
                </span>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
                {by("lost")
                  .slice(0, 30)
                  .map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => open(a.id)}
                      className="rounded-lg bg-card/70 px-2.5 py-2 text-left hover:bg-card"
                    >
                      <span className="block truncate text-[12.5px] font-medium text-foreground">
                        {a.company || a.name}
                      </span>
                      {a.lost_reason && (
                        <span className="block truncate text-[11px] text-subtle">
                          {a.lost_reason}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </section>
          </div>
        ) : (
          <LeadsTable items={items} onOpen={open} />
        )}
      </div>

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

const MINI_TONE = {
  amber: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  rose: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  emerald: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  violet: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  slate: "bg-muted text-muted-foreground",
} as const;

/** A figure in the top bar: icon, number, a word. */
function MiniChip({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: LucideIcon;
  tone: keyof typeof MINI_TONE;
  value: ReactNode;
  label: string;
}) {
  return (
    <span
      title={label}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold phone:hidden",
        MINI_TONE[tone],
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="tabular-nums">{value}</span>
      <span className="font-medium opacity-80">{label}</span>
    </span>
  );
}

/** A small analytics card: icon, number, label and one line under it. */
function SmallStat({
  icon: Icon,
  tone,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  tone: keyof typeof MINI_TONE;
  label: string;
  value: ReactNode;
  note: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", MINI_TONE[tone])}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <span className="text-[19px] font-bold leading-none tabular-nums text-foreground">
            {value}
          </span>
          <span className="truncate text-[12px] font-medium text-muted-foreground">{label}</span>
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-subtle">{note}</p>
      </div>
    </div>
  );
}

/** The stages as one relay: how many stand at each and how many pass on. */
function PipelineRail({ all }: { all: LeadItem[] }) {
  const { t } = useI18n();
  const order = PIPELINE_STAGES;
  // "Reached" = at this stage or further (lost ones count where they stood: unknown, so not).
  const reached = order.map(
    (_, i) =>
      all.filter((a) => {
        const k = order.indexOf(stageOf(a.status) as (typeof order)[number]);
        return k >= i;
      }).length,
  );
  const max = Math.max(1, reached[0] ?? 1);
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card px-4 py-2.5">
      <div className="flex min-w-[860px] items-stretch">
        {order.map((s, i) => {
          const here = all.filter((a) => a.status === s).length;
          const pass =
            i > 0 && reached[i - 1] ? Math.round((reached[i]! / reached[i - 1]!) * 100) : null;
          return (
            <div key={s} className="flex min-w-0 flex-1 items-center">
              {i > 0 && (
                <span className="flex w-12 shrink-0 flex-col items-center text-[10.5px] font-semibold tabular-nums text-subtle">
                  <ChevronRight className="h-4 w-4" />
                  {pass == null ? "" : `${pass}%`}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[18px] font-bold leading-none tabular-nums text-foreground">
                    {here}
                  </span>
                  <span className="truncate text-[12px] font-medium text-muted-foreground">
                    {t(`lead.st.${s}`)}
                  </span>
                </div>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn("block h-full rounded-full bg-gradient-to-r", STAGE_TONE[s].bar)}
                    style={{ width: `${Math.max(4, ((reached[i] ?? 0) / max) * 100)}%` }}
                  />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadCard({ a, onOpen, today }: { a: LeadItem; onOpen: () => void; today: string }) {
  const { t, lang } = useI18n();
  const phase = orgPhaseOf(a.org);
  const callToday = a.meeting_at && tashkentDay(a.meeting_at) === today;
  const callPast = a.meeting_at && new Date(a.meeting_at).getTime() < Date.now();
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/lead", a.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      className="group w-full cursor-grab rounded-xl border border-border bg-card p-3 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-foreground/20 hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start gap-2.5">
        <CompanyMark name={a.company || a.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold leading-tight text-foreground">
            {a.company || a.name}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">
            {a.company ? a.name : a.phone}
          </p>
        </div>
        {a.amount ? (
          <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-foreground">
            {Math.round(a.amount / 1000).toLocaleString("ru-RU")}k
          </span>
        ) : null}
      </div>
      {(a.business || a.plan || a.sales_reps || phase !== "none") && (
        <div className="mt-2 flex flex-wrap gap-1">
          {phase !== "none" && (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold",
                PHASE_CHIP[phase],
              )}
            >
              {t(`lead.phase.${phase}`)}
            </span>
          )}
          {a.plan && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
              {PLAN_LABELS[normalizePlan(a.plan)]}
            </span>
          )}
          {a.sales_reps && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
              <Users className="h-3 w-3" /> {a.sales_reps}
            </span>
          )}
          {a.business && (
            <span className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
              {a.business}
            </span>
          )}
        </div>
      )}
      {a.meeting_at && a.status !== "lost" && (
        <p
          className={cn(
            "mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] font-semibold",
            callToday
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              : callPast
                ? "bg-muted text-subtle"
                : "bg-sky-500/10 text-sky-700 dark:text-sky-300",
          )}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          {callToday ? t("lead.today") : callDay(a.meeting_at, lang)}, {tashkentTime(a.meeting_at)}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-subtle">
        {a.overdue > 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
            <ListChecks className="h-3.5 w-3.5" /> {a.overdue}
          </span>
        ) : a.tasks > 0 ? (
          <span className="inline-flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5" /> {a.tasks}
          </span>
        ) : null}
        {a.issues > 0 && (
          <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" /> {a.issues}
          </span>
        )}
        <span className="ml-auto">{ago(a.last_activity_at ?? a.updated_at, t)}</span>
      </div>
    </button>
  );
}

function LeadsTable({ items, onOpen }: { items: LeadItem[]; onOpen: (id: string) => void }) {
  const { t, lang } = useI18n();
  return (
    <div className="h-full overflow-auto bg-card">
      <table className="w-full min-w-[980px] text-left">
        <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
          <tr className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
            <th className="px-4 py-3">{t("lead.col.company")}</th>
            <th className="px-3 py-3">{t("lead.col.stage")}</th>
            <th className="px-3 py-3">{t("lead.col.plan")}</th>
            <th className="px-3 py-3">{t("wiz.step.business")}</th>
            <th className="px-3 py-3">{t("lead.col.call")}</th>
            <th className="px-3 py-3">{t("lead.col.work")}</th>
            <th className="px-3 py-3 text-right">{t("lead.col.activity")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => {
            const phase = orgPhaseOf(a.org);
            return (
              <tr
                key={a.id}
                onClick={() => onOpen(a.id)}
                className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <CompanyMark name={a.company || a.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-foreground">
                        {a.company || a.name}
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {a.name} · {a.phone}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <StageChip stage={a.status} />
                </td>
                <td className="px-3 py-3 text-[12.5px]">
                  <span className="text-foreground">
                    {a.plan ? PLAN_LABELS[normalizePlan(a.plan)] : "—"}
                  </span>
                  {phase !== "none" && (
                    <span
                      className={cn(
                        "ml-1.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold",
                        PHASE_CHIP[phase],
                      )}
                    >
                      {t(`lead.phase.${phase}`)}
                    </span>
                  )}
                </td>
                <td className="max-w-[200px] px-3 py-3 text-[12.5px] text-muted-foreground">
                  <span className="block truncate">{a.business || "—"}</span>
                  {a.sales_reps && (
                    <span className="text-subtle">{t("lead.reps", { n: a.sales_reps })}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-[12.5px] tabular-nums text-foreground">
                  {a.meeting_at
                    ? `${callDay(a.meeting_at, lang)}, ${tashkentTime(a.meeting_at)}`
                    : "—"}
                </td>
                <td className="px-3 py-3 text-[12.5px]">
                  <span
                    className={cn(
                      a.overdue ? "font-semibold text-rose-600" : "text-muted-foreground",
                    )}
                  >
                    {t("lead.tasksN", { n: a.tasks })}
                  </span>
                  {a.issues > 0 && (
                    <span className="ml-2 font-semibold text-amber-600">
                      {t("lead.issuesN", { n: a.issues })}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right text-[12px] text-subtle">
                  {ago(a.last_activity_at ?? a.updated_at, t)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
