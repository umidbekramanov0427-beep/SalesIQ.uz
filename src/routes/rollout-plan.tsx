import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronDown, Loader2, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  useCreateRolloutPlan,
  useCreateRolloutPlanTask,
  useDeleteRolloutPlan,
  useDeleteRolloutPlanTask,
  useRolloutPlanPhaseColors,
  useRolloutPlanTasks,
  useRolloutPlans,
  useSetRolloutPlanPhaseColor,
  useSetRolloutPlanTaskDone,
  useUpdateRolloutPlanTask,
  type RolloutPlanRow,
  type RolloutPlanTaskRow,
  type RolloutPlanTaskStatus,
  type RolloutPlanTaskWeight,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/rollout-plan")({
  head: () => ({
    meta: [
      { title: "Amalga oshirish rejasi — SalesIQ" },
      {
        name: "description",
        content: "Phased implementation checklist with a planned-vs-actual progress chart.",
      },
    ],
  }),
  component: RolloutPlanPage,
});

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message || fallback;
  }
  return fallback;
}

const WEIGHT_ORDER: RolloutPlanTaskWeight[] = ["light", "medium", "heavy"];
const STATUS_ORDER: RolloutPlanTaskStatus[] = ["not_done", "in_progress", "done"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function dayOffset(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
}

function RolloutPlanPage() {
  const { user } = useAuth();
  const { t } = useI18n();

  if (user && user.role !== "super_admin") {
    return (
      <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  return <RolloutPlanContent />;
}

function CreatePlanDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useI18n();
  const createPlan = useCreateRolloutPlan();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const plan = await createPlan.mutateAsync({ name, startDate });
      toast.success(t("rolloutPlan.planCreated"));
      onCreated(plan.id);
      onOpenChange(false);
      setName("");
      setStartDate(todayIso());
    } catch (err) {
      toast.error(errorMessage(err, t("rolloutPlan.createPlanFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rolloutPlan.newPlan")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("rolloutPlan.planName")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("rolloutPlan.planNamePlaceholder")}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("rolloutPlan.startDate")}</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("rolloutPlan.create")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Splits a pasted block into non-empty lines. Google Sheets copies a
// single-column selection as one line per cell, so pasting a whole
// "Vazifa" column straight from the sheet here lands as one task per
// line, in the same order -- no more re-typing every row one at a time.
function splitTaskLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function AddTaskForm({
  planId,
  nextDay,
  existingTasks,
}: {
  planId: string;
  nextDay: number;
  existingTasks: RolloutPlanTaskRow[];
}) {
  const { t } = useI18n();
  const createTask = useCreateRolloutPlanTask();
  const [dayNumber, setDayNumber] = useState(nextDay);
  const [phase, setPhase] = useState("");
  const [taskText, setTaskText] = useState("");
  const [weight, setWeight] = useState<RolloutPlanTaskWeight>("medium");
  const [busy, setBusy] = useState(false);

  useEffect(() => setDayNumber(nextDay), [nextDay]);

  const lines = useMemo(() => splitTaskLines(taskText), [taskText]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!phase.trim() || lines.length === 0) return;
    setBusy(true);
    const basePosition =
      Math.max(
        0,
        ...existingTasks.filter((r) => r.day_number === dayNumber).map((r) => r.position),
      ) + 1;
    const results = await Promise.allSettled(
      lines.map((line, i) =>
        createTask.mutateAsync({
          planId,
          dayNumber,
          phase,
          task: line,
          weight,
          position: basePosition + i,
        }),
      ),
    );
    setBusy(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      toast.success(t("rolloutPlan.tasksAdded", { count: String(lines.length) }));
      setTaskText("");
    } else if (failed < results.length) {
      toast.error(
        t("rolloutPlan.tasksAddedPartial", {
          added: String(results.length - failed),
          failed: String(failed),
        }),
      );
      setTaskText("");
    } else {
      toast.error(t("rolloutPlan.addTaskFailed"));
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[80px_1fr_140px]">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("rolloutPlan.fieldDay")}</Label>
          <Input
            type="number"
            min={1}
            value={dayNumber}
            onChange={(e) => setDayNumber(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("rolloutPlan.fieldPhase")}</Label>
          <Input
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            placeholder={t("rolloutPlan.fieldPhasePlaceholder")}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("rolloutPlan.fieldWeight")}</Label>
          <select
            value={weight}
            onChange={(e) => setWeight(e.target.value as RolloutPlanTaskWeight)}
            className="h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
          >
            {WEIGHT_ORDER.map((w) => (
              <option key={w} value={w}>
                {t(`rolloutPlan.weight${w[0]!.toUpperCase()}${w.slice(1)}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t("rolloutPlan.fieldTask")}</Label>
        <textarea
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
          placeholder={t("rolloutPlan.fieldTaskPastePlaceholder")}
          rows={4}
          required
          className="w-full rounded-xl border border-border bg-accent px-3 py-2 text-sm outline-none focus:border-primary/40"
        />
        <p className="text-xs text-subtle">{t("rolloutPlan.fieldTaskPasteHint")}</p>
      </div>
      <button
        type="submit"
        disabled={busy || lines.length === 0}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {lines.length > 1
          ? t("rolloutPlan.addTasksCount", { count: String(lines.length) })
          : t("rolloutPlan.addTask")}
      </button>
    </form>
  );
}

function NoteCell({ task, planId }: { task: RolloutPlanTaskRow; planId: string }) {
  const { t } = useI18n();
  const updateTask = useUpdateRolloutPlanTask();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.note);

  async function save() {
    try {
      await updateTask.mutateAsync({ id: task.id, planId, patch: { note: value.trim() } });
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err, t("rolloutPlan.updateFailed")));
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save()}
          onBlur={() => void save()}
          className="h-8 w-full min-w-[120px] rounded-lg border border-border bg-accent px-2 text-xs outline-none focus:border-primary/40"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setValue(task.note);
        setEditing(true);
      }}
      className="block w-full truncate text-left text-xs text-muted-foreground hover:text-foreground"
    >
      {task.note || "—"}
    </button>
  );
}

const WEIGHT_TONE: Record<RolloutPlanTaskWeight, "neutral" | "warning" | "danger"> = {
  light: "neutral",
  medium: "warning",
  heavy: "danger",
};

// A fixed categorical palette for phase backgrounds -- kept separate from
// the app's success/warning/danger tones, which are reserved for status
// coloring on this same page (see the status <select> below).
const PHASE_COLORS = [
  "slate",
  "blue",
  "purple",
  "pink",
  "orange",
  "teal",
  "indigo",
  "cyan",
] as const;
type PhaseColorName = (typeof PHASE_COLORS)[number];

const PHASE_COLOR_CLASS: Record<PhaseColorName, string> = {
  slate: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  purple: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  pink: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  cyan: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
};

const PHASE_SWATCH_CLASS: Record<PhaseColorName, string> = {
  slate: "bg-slate-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  orange: "bg-orange-500",
  teal: "bg-teal-500",
  indigo: "bg-indigo-500",
  cyan: "bg-cyan-500",
};

function isPhaseColorName(value: string | undefined): value is PhaseColorName {
  return !!value && (PHASE_COLORS as readonly string[]).includes(value);
}

function PhaseBadge({
  phase,
  color,
  onSetColor,
}: {
  phase: string;
  color?: string | undefined;
  onSetColor: (color: PhaseColorName) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const tone = isPhaseColorName(color)
    ? PHASE_COLOR_CLASS[color]
    : "bg-accent text-muted-foreground";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("rolloutPlan.choosePhaseColor")}
          className={cn(
            "inline-flex max-w-[200px] items-center rounded-lg px-2 py-1 text-left text-xs font-semibold transition-opacity hover:opacity-80",
            tone,
          )}
        >
          <span className="truncate">{phase}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <p className="mb-2 text-[11px] font-medium text-subtle">
          {t("rolloutPlan.choosePhaseColor")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PHASE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => {
                onSetColor(c);
                setOpen(false);
              }}
              className={cn(
                "h-6 w-6 rounded-full ring-offset-2 ring-offset-popover transition-transform hover:scale-110",
                PHASE_SWATCH_CLASS[c],
                color === c && "ring-2 ring-foreground",
              )}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EditTaskDialog({
  task,
  planId,
  open,
  onOpenChange,
}: {
  task: RolloutPlanTaskRow;
  planId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const updateTask = useUpdateRolloutPlanTask();
  const [dayNumber, setDayNumber] = useState(task.day_number);
  const [phase, setPhase] = useState(task.phase);
  const [taskText, setTaskText] = useState(task.task);
  const [weight, setWeight] = useState<RolloutPlanTaskWeight>(task.weight as RolloutPlanTaskWeight);
  const [note, setNote] = useState(task.note ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDayNumber(task.day_number);
    setPhase(task.phase);
    setTaskText(task.task);
    setWeight(task.weight as RolloutPlanTaskWeight);
    setNote(task.note ?? "");
  }, [open, task]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!phase.trim() || !taskText.trim()) return;
    setSaving(true);
    try {
      await updateTask.mutateAsync({
        id: task.id,
        planId,
        patch: {
          day_number: dayNumber,
          phase: phase.trim(),
          task: taskText.trim(),
          weight,
          note: note.trim(),
        },
      });
      toast.success(t("rolloutPlan.taskUpdated"));
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t("rolloutPlan.updateFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rolloutPlan.editTask")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[80px_1fr_140px]">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("rolloutPlan.fieldDay")}</Label>
              <Input
                type="number"
                min={1}
                value={dayNumber}
                onChange={(e) => setDayNumber(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("rolloutPlan.fieldPhase")}</Label>
              <Input value={phase} onChange={(e) => setPhase(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("rolloutPlan.fieldWeight")}</Label>
              <select
                value={weight}
                onChange={(e) => setWeight(e.target.value as RolloutPlanTaskWeight)}
                className="h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
              >
                {WEIGHT_ORDER.map((w) => (
                  <option key={w} value={w}>
                    {t(`rolloutPlan.weight${w[0]!.toUpperCase()}${w.slice(1)}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("rolloutPlan.fieldTask")}</Label>
            <textarea
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              rows={3}
              required
              className="w-full rounded-xl border border-border bg-accent px-3 py-2 text-sm outline-none focus:border-primary/40"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("rolloutPlan.fieldNote")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskChecklistRow({
  task,
  planId,
  phaseColor,
  onSetPhaseColor,
}: {
  task: RolloutPlanTaskRow;
  planId: string;
  phaseColor?: string | undefined;
  onSetPhaseColor: (phase: string, color: PhaseColorName) => void;
}) {
  const { t } = useI18n();
  const setDone = useSetRolloutPlanTaskDone();
  const updateTask = useUpdateRolloutPlanTask();
  const deleteTask = useDeleteRolloutPlanTask();
  const [editOpen, setEditOpen] = useState(false);
  const isDone = task.status === "done";

  async function toggleDone() {
    try {
      await setDone.mutateAsync({ id: task.id, planId, done: !isDone });
    } catch (err) {
      toast.error(errorMessage(err, t("rolloutPlan.updateFailed")));
    }
  }

  async function changeStatus(status: RolloutPlanTaskStatus) {
    if (status === "done" || task.status === "done") {
      await toggleDone();
      return;
    }
    try {
      await updateTask.mutateAsync({ id: task.id, planId, patch: { status } });
    } catch (err) {
      toast.error(errorMessage(err, t("rolloutPlan.updateFailed")));
    }
  }

  async function remove() {
    try {
      await deleteTask.mutateAsync({ id: task.id, planId });
      toast.success(t("rolloutPlan.deleted"));
    } catch (err) {
      toast.error(errorMessage(err, t("rolloutPlan.deleteFailed")));
    }
  }

  return (
    <tr className={cn("border-b border-border last:border-0", isDone && "bg-success/5")}>
      <td className="px-3 py-3">
        <button
          type="button"
          aria-label={t("rolloutPlan.done")}
          onClick={() => void toggleDone()}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-lg border-2 text-transparent transition-colors",
            isDone
              ? "border-success bg-success text-success-foreground"
              : "border-border hover:border-success",
          )}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor">
            <path
              d="M3 8.5l3 3 7-7"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </td>
      <td className="px-3 py-3 text-center text-sm font-semibold text-subtle">{task.day_number}</td>
      <td className="px-3 py-3 text-sm">
        <PhaseBadge
          phase={task.phase}
          color={phaseColor}
          onSetColor={(color) => onSetPhaseColor(task.phase, color)}
        />
      </td>
      <td className="min-w-[180px] px-3 py-3 text-sm text-foreground">
        <span className={cn(isDone && "text-muted-foreground line-through")}>{task.task}</span>
      </td>
      <td className="px-3 py-3">
        <Pill tone={WEIGHT_TONE[task.weight as RolloutPlanTaskWeight] ?? "neutral"}>
          {t(
            `rolloutPlan.weight${(task.weight as string)[0]!.toUpperCase()}${task.weight.slice(1)}`,
          )}
        </Pill>
      </td>
      <td className="px-3 py-3">
        <select
          value={task.status}
          onChange={(e) => void changeStatus(e.target.value as RolloutPlanTaskStatus)}
          className={cn(
            "h-8 rounded-lg border px-2 text-xs font-semibold outline-none focus:border-primary/40",
            task.status === "done" && "border-transparent bg-mint text-mint-foreground",
            task.status === "in_progress" &&
              "border-transparent bg-warning/25 text-warning-foreground",
            task.status === "not_done" && "border-transparent bg-destructive/15 text-destructive",
          )}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {t(
                `rolloutPlan.status${s === "not_done" ? "NotDone" : s === "in_progress" ? "InProgress" : "Done"}`,
              )}
            </option>
          ))}
        </select>
      </td>
      <td className="min-w-[140px] px-3 py-3">
        <NoteCell task={task} planId={planId} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            aria-label={t("rolloutPlan.editTask")}
            className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            aria-label={t("rolloutPlan.deleteTask")}
            className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
      <EditTaskDialog task={task} planId={planId} open={editOpen} onOpenChange={setEditOpen} />
    </tr>
  );
}

const CHART_SURFACE_STYLE = {
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-popover)",
  boxShadow: "var(--shadow-elevated)",
  fontSize: 12,
};

function ProgressChart({ tasks, startDate }: { tasks: RolloutPlanTaskRow[]; startDate: string }) {
  const { t } = useI18n();

  const chartData = useMemo(() => {
    const total = tasks.length;
    if (total === 0) return [];
    const start = new Date(`${startDate}T00:00:00`);
    const today = new Date();
    const maxPlanDay = Math.max(...tasks.map((tk) => tk.day_number));
    const elapsedDays = dayOffset(start, today) + 1;
    const lastDay = Math.max(maxPlanDay, elapsedDays);

    const plannedByDay = new Map<number, number>();
    for (const tk of tasks)
      plannedByDay.set(tk.day_number, (plannedByDay.get(tk.day_number) ?? 0) + 1);

    const actualByOffset = new Map<number, number>();
    for (const tk of tasks) {
      if (!tk.completed_at) continue;
      const offset = Math.max(0, dayOffset(start, new Date(tk.completed_at)));
      actualByOffset.set(offset, (actualByOffset.get(offset) ?? 0) + 1);
    }

    const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
    let plannedCum = 0;
    let actualCum = 0;
    const rows: { day: number; date: string; planned: number; actual: number | null }[] = [];
    for (let day = 1; day <= lastDay; day++) {
      plannedCum += plannedByDay.get(day) ?? 0;
      actualCum += actualByOffset.get(day - 1) ?? 0;
      const date = new Date(start.getTime() + (day - 1) * 86400000);
      rows.push({
        day,
        date: dateFmt.format(date),
        planned: Math.round((plannedCum / total) * 100),
        actual: day <= elapsedDays ? Math.round((actualCum / total) * 100) : null,
      });
    }
    return rows;
  }, [tasks, startDate]);

  if (chartData.length === 0) {
    return <p className="py-10 text-center text-sm text-subtle">{t("rolloutPlan.chartEmpty")}</p>;
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ left: -14, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            stroke="var(--color-subtle)"
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={11}
            stroke="var(--color-subtle)"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip contentStyle={CHART_SURFACE_STYLE} formatter={(v: number) => `${v}%`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="planned"
            name={t("rolloutPlan.chartPlanned")}
            stroke="var(--color-subtle)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name={t("rolloutPlan.chartActual")}
            stroke="var(--color-primary)"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PlanDetail({ plan }: { plan: RolloutPlanRow }) {
  const { t } = useI18n();
  const { data: tasks, isLoading } = useRolloutPlanTasks(plan.id);
  const { data: phaseColors } = useRolloutPlanPhaseColors(plan.id);
  const setPhaseColor = useSetRolloutPlanPhaseColor();
  const rows = tasks ?? [];

  async function handleSetPhaseColor(phase: string, color: PhaseColorName) {
    try {
      await setPhaseColor.mutateAsync({ planId: plan.id, phase, color });
    } catch (err) {
      toast.error(errorMessage(err, t("rolloutPlan.updateFailed")));
    }
  }

  const totalDays = rows.length ? Math.max(...rows.map((r) => r.day_number)) : 0;
  const elapsedDays = Math.max(
    0,
    Math.min(totalDays, dayOffset(new Date(`${plan.start_date}T00:00:00`), new Date()) + 1),
  );
  const doneCount = rows.filter((r) => r.status === "done").length;
  const percent = rows.length ? Math.round((doneCount / rows.length) * 100) : 0;
  const nextDay = rows.length ? Math.max(...rows.map((r) => r.day_number)) : 1;

  return (
    <div className="space-y-6">
      <SectionCard>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-3xl font-bold text-foreground">{percent}%</p>
            <p className="text-xs text-subtle">
              {t("rolloutPlan.percentDone", { percent: String(percent) })}
            </p>
          </div>
          <div className="h-10 w-px bg-border" />
          <div>
            <p className="text-lg font-semibold text-foreground">
              {elapsedDays} / {totalDays || 0}
            </p>
            <p className="text-xs text-subtle">
              {t("rolloutPlan.daysElapsed", {
                elapsed: String(elapsedDays),
                total: String(totalDays || 0),
              })}
            </p>
          </div>
          <div className="ml-auto h-2 w-full max-w-xs overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t("rolloutPlan.addTask")}>
        <AddTaskForm planId={plan.id} nextDay={nextDay} existingTasks={rows} />
      </SectionCard>

      <SectionCard>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-subtle">{t("rolloutPlan.noTasks")}</p>
        ) : (
          <div className="-m-6 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-3 py-3 font-medium">{t("rolloutPlan.done")}</th>
                  <th className="px-3 py-3 text-center font-medium">{t("rolloutPlan.fieldDay")}</th>
                  <th className="px-3 py-3 font-medium">{t("rolloutPlan.fieldPhase")}</th>
                  <th className="px-3 py-3 font-medium">{t("rolloutPlan.fieldTask")}</th>
                  <th className="px-3 py-3 font-medium">{t("rolloutPlan.fieldWeight")}</th>
                  <th className="px-3 py-3 font-medium">{t("rolloutPlan.fieldStatus")}</th>
                  <th className="px-3 py-3 font-medium">{t("rolloutPlan.fieldNote")}</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((task) => (
                  <TaskChecklistRow
                    key={task.id}
                    task={task}
                    planId={plan.id}
                    phaseColor={phaseColors?.[task.phase]}
                    onSetPhaseColor={handleSetPhaseColor}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title={t("rolloutPlan.chartTitle")}>
        <ProgressChart tasks={rows} startDate={plan.start_date} />
      </SectionCard>
    </div>
  );
}

function PlanSection({
  plan,
  defaultExpanded,
}: {
  plan: RolloutPlanRow;
  defaultExpanded: boolean;
}) {
  const { t } = useI18n();
  const deletePlan = useDeleteRolloutPlan();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function removePlan() {
    try {
      await deletePlan.mutateAsync(plan.id);
      toast.success(t("rolloutPlan.deleted"));
    } catch (err) {
      toast.error(errorMessage(err, t("rolloutPlan.deleteFailed")));
    } finally {
      setConfirmDelete(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", !expanded && "-rotate-90")} />
          {plan.name}
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label={t("rolloutPlan.deletePlan")}
          className="rounded-lg p-2 text-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && <PlanDetail plan={plan} />}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("rolloutPlan.deletePlanConfirmTitle")}
        description={t("rolloutPlan.deletePlanConfirmDesc")}
        onConfirm={() => void removePlan()}
      />
    </div>
  );
}

function RolloutPlanContent() {
  const { t } = useI18n();
  const { data: plans, isLoading } = useRolloutPlans();
  const [createOpen, setCreateOpen] = useState(false);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title={t("rolloutPlan.title")}
        description={t("rolloutPlan.desc")}
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t("rolloutPlan.newPlan")}
          </button>
        }
      />

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (plans ?? []).length === 0 ? (
        <SectionCard>
          <p className="py-10 text-center text-sm text-subtle">{t("rolloutPlan.noPlans")}</p>
        </SectionCard>
      ) : (
        <div className="space-y-8">
          {(plans ?? []).map((p, i) => (
            <PlanSection key={p.id} plan={p} defaultExpanded={i === 0 || p.id === lastCreatedId} />
          ))}
        </div>
      )}

      <CreatePlanDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={setLastCreatedId}
      />
    </>
  );
}
