import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Dumbbell,
  Loader2,
  Play,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import {
  useCoaching,
  useCoachingAction,
  useLessons,
  useProfilesRaw,
  type CoachingOverview,
} from "@/hooks/use-crm-data";
import { practiceText, type WeakSpot } from "@/lib/coaching";
import type { CoachingTaskView } from "@/lib/coaching.server";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, formatDate } from "@/lib/utils";

// Sinfxona → Mashqlar, the coaching cycle: each manager's weakest step of
// the sales script (AI call analysis), a practice task on it from the head
// of sales, and that step measured again in the calls made since -- before
// vs after. Rules: src/lib/coaching.ts; server: /coaching.

const VERDICT_TONE: Record<CoachingTaskView["verdict"], string> = {
  better: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  worse: "bg-red-500/10 text-red-700 dark:text-red-300",
  same: "bg-foreground/[0.06] text-muted-foreground",
  pending: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
};

function AssignForm({ spot, onDone }: { spot: WeakSpot; onDone: () => void }) {
  const { t, lang } = useI18n();
  const action = useCoachingAction();
  const { data: lessons } = useLessons();
  const [criterion, setCriterion] = useState(spot.stage);
  const [task, setTask] = useState(() => practiceText(spot.stage, lang));
  const [lessonId, setLessonId] = useState("");
  const [due, setDue] = useState(() => {
    const d = new Date(Date.now() + 7 * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const field =
    "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30";
  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        action.mutate(
          {
            action: "create",
            profileId: spot.ownerId,
            criterion,
            task,
            lessonId: lessonId || null,
            dueDate: due || null,
          },
          {
            onSuccess: () => {
              toast.success(t("coaching.assigned"));
              onDone();
            },
            onError: (err) => toast.error(describeError(err, t("coaching.failed"))),
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("coaching.criterion")}
          </span>
          <select
            value={criterion}
            onChange={(e) => {
              setCriterion(e.target.value);
              setTask(practiceText(e.target.value, lang));
            }}
            className={cn(field, "mt-1")}
          >
            {spot.stages.map((s) => (
              <option key={s.stage} value={s.stage}>
                {s.stage} — {s.rate}%
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("coaching.due")}
          </span>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className={cn(field, "mt-1")}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
          {t("coaching.task")}
        </span>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value.slice(0, 1000))}
          rows={3}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
        />
      </label>
      {(lessons ?? []).length > 0 && (
        <label className="block">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("coaching.lesson")}
          </span>
          <select
            value={lessonId}
            onChange={(e) => setLessonId(e.target.value)}
            className={cn(field, "mt-1")}
          >
            <option value="">{t("coaching.noLesson")}</option>
            {(lessons ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="h-9 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-accent"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={!task.trim() || action.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("coaching.assign")}
        </button>
      </div>
    </form>
  );
}

function WeakSpots({
  weak,
  names,
  boss,
}: {
  weak: WeakSpot[];
  names: Map<string, string>;
  boss: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <SectionCard
      icon={Target}
      tone="rose"
      title={boss ? t("coaching.weakTitle") : t("coaching.myWeakTitle")}
      description={t("coaching.weakDesc")}
    >
      {weak.length === 0 ? (
        <p className="rounded-xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">
          {t("coaching.weakEmpty")}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {weak.map((w) => (
            <li key={w.ownerId} className="px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-foreground">
                    {names.get(w.ownerId) ?? t("objection.manager")}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {t("coaching.calls", { n: String(w.calls) })}
                  </p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="truncate text-[14px] font-bold text-foreground">{w.stage}</p>
                  <p className="text-[12px] tabular-nums">
                    <span className="font-bold text-destructive">{w.rate}%</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {t("coaching.team", { n: String(w.teamRate) })}
                    </span>
                  </p>
                </div>
                {boss && (
                  <button
                    type="button"
                    onClick={() => setOpen(open === w.ownerId ? null : w.ownerId)}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[13px] font-bold text-primary-foreground hover:opacity-90"
                  >
                    <Dumbbell className="h-4 w-4" /> {t("coaching.give")}
                  </button>
                )}
              </div>
              {open === w.ownerId && <AssignForm spot={w} onDone={() => setOpen(null)} />}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function TaskCard({
  task,
  name,
  boss,
  mine,
  onWatch,
}: {
  task: CoachingTaskView;
  name: string;
  boss: boolean;
  mine: boolean;
  onWatch: (lessonId: string) => void;
}) {
  const { t } = useI18n();
  const action = useCoachingAction();
  const delta = task.before != null && task.after.total > 0 ? task.after.rate - task.before : null;
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          {boss && <p className="text-[12px] font-semibold text-muted-foreground">{name}</p>}
          <p className="text-[15px] font-extrabold text-foreground">{task.criterion}</p>
        </div>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[11.5px] font-bold",
            task.status === "done"
              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
              : "bg-primary/10 text-primary",
          )}
        >
          {task.status === "done" ? t("coaching.statusDone") : t("coaching.statusOpen")}
        </span>
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-foreground">{task.task}</p>
      <p className="mt-1.5 text-[12px] text-muted-foreground">
        {t("coaching.given", { date: formatDate(task.createdAt) })}
        {task.dueDate ? ` · ${t("coaching.until", { date: formatDate(task.dueDate) })}` : ""}
      </p>

      {/* Before -> after on the same step. */}
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-surface px-3.5 py-2.5">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("coaching.before")}
          </p>
          <p className="text-[18px] font-extrabold tabular-nums text-foreground">
            {task.before == null ? "—" : `${task.before}%`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("coaching.calls", { n: String(task.beforeCalls) })}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("coaching.after")}
          </p>
          <p className="text-[18px] font-extrabold tabular-nums text-foreground">
            {task.after.total > 0 ? `${task.after.rate}%` : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("coaching.calls", { n: String(task.after.total) })}
          </p>
        </div>
        <span className="flex-1" />
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-bold",
            VERDICT_TONE[task.verdict],
          )}
        >
          {task.verdict === "better" && <TrendingUp className="h-3.5 w-3.5" />}
          {task.verdict === "worse" && <TrendingDown className="h-3.5 w-3.5" />}
          {t(`coaching.verdict.${task.verdict}`)}
          {delta != null && task.verdict !== "pending" ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {task.lessonId && (
          <button
            type="button"
            onClick={() => onWatch(task.lessonId!)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold text-foreground hover:bg-accent"
          >
            <Play className="h-3.5 w-3.5" /> {t("coaching.watch")}
          </button>
        )}
        {task.status !== "done" && (mine || boss) && (
          <button
            type="button"
            disabled={action.isPending}
            onClick={() =>
              action.mutate(
                { action: "done", id: task.id },
                { onError: (e) => toast.error(describeError(e, t("coaching.failed"))) },
              )
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("coaching.markDone")}
          </button>
        )}
        <span className="flex-1" />
        {boss && (
          <button
            type="button"
            aria-label={t("coaching.delete")}
            title={t("coaching.delete")}
            disabled={action.isPending}
            onClick={() =>
              action.mutate(
                { action: "delete", id: task.id },
                { onError: (e) => toast.error(describeError(e, t("coaching.failed"))) },
              )
            }
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );
}

export function CoachingPanel({
  myId,
  onWatch,
}: {
  myId: string | undefined;
  onWatch: (lessonId: string) => void;
}) {
  const { t } = useI18n();
  const { data, isLoading, error } = useCoaching();
  const { data: profiles } = useProfilesRaw();
  const names = useMemo(
    () => new Map((profiles ?? []).map((p) => [p.id, p.full_name])),
    [profiles],
  );
  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (error || !data)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">{t("coaching.failed")}</p>
    );
  if (data.missing)
    return (
      <p className="rounded-2xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
        {t("coaching.notReady")}
      </p>
    );
  const ready = data as Extract<CoachingOverview, { missing: false }>;
  return (
    <div className="space-y-5">
      <WeakSpots weak={ready.weak} names={names} boss={ready.boss} />
      <SectionCard
        icon={Dumbbell}
        tone="violet"
        title={ready.boss ? t("coaching.tasksTitle") : t("coaching.myTasksTitle")}
        description={t("coaching.tasksDesc")}
      >
        {ready.tasks.length === 0 ? (
          <p className="rounded-xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">
            {ready.boss ? t("coaching.tasksEmptyBoss") : t("coaching.tasksEmpty")}
          </p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {ready.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                name={names.get(task.profileId) ?? ""}
                boss={ready.boss}
                mine={task.profileId === myId}
                onWatch={onWatch}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
