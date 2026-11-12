import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Loader2,
  Plus,
  Users,
} from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TypeIcon, TypePicker, splitTitle } from "@/components/lead/AmoComposer";
import {
  useCreateLeadActivity,
  useCreateTask,
  useProfilesRaw,
  useUpdateTask,
  type CrmLeadView,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import type { TaskBoardItem } from "./FunnelTasksBoard";

// What the funnel's "Vazifalar" view gained from amoCRM's task list: a
// search and the task count, day / week / month calendars, a task added
// right here, and a task closed from its card with its result.

export type TasksView = "columns" | "day" | "week" | "month" | "team";

const pad = (n: number) => String(n).padStart(2, "0");
const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
/** Monday of the week. */
const weekStart = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

export function TasksToolbar({
  view,
  onView,
  count,
  onAdd,
}: {
  view: TasksView;
  onView: (v: TasksView) => void;
  count: number;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  // The funnel's own search above already narrows the tasks by lead.
  // Pinned right under the funnel's own pinned bar (its height comes from
  // --funnel-bar-h), as the bar's second row (same tone, no gap), so cards scroll away beneath it.
  return (
    <div className="sticky top-[var(--funnel-bar-h,0px)] z-[9] -mx-4 -mt-3 mb-4 flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5 sm:-mt-4 md:-mx-6 md:px-6 phone:-mx-3 phone:px-3">
      <Segmented
        value={view}
        onChange={onView}
        options={[
          { value: "columns", label: t("ftasks.view.columns"), icon: Columns3 },
          { value: "day", label: t("ftasks.view.day"), icon: CalendarDays },
          { value: "week", label: t("ftasks.view.week"), icon: CalendarRange },
          { value: "month", label: t("ftasks.view.month"), icon: Calendar },
          { value: "team", label: t("ftasks.view.team"), icon: Users },
        ]}
      />
      <span className="ml-auto text-[13px] font-medium tabular-nums text-muted-foreground">
        {t("ftasks.count", { n: count })}
      </span>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110"
      >
        <Plus className="h-4 w-4" /> {t("ftasks.add")}
      </button>
    </div>
  );
}

/** The task's type (Bog'lanish, Uchrashuv...) as an icon and a word. */
export function TaskTypeLabel({ title }: { title: string }) {
  const { t } = useI18n();
  const { type } = splitTitle(title, t);
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground">
      <TypeIcon type={type} />
      {t(`amo.taskType.${type}`)}
    </span>
  );
}

/** The task text without its "Type: " prefix. */
export function useTaskText() {
  const { t } = useI18n();
  return (title: string) => splitTitle(title, t).text;
}

/** ✓ on a card: closes the task, with an optional result written on the lead. */
export function CompleteTaskButton({ item }: { item: TaskBoardItem }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const update = useUpdateTask();
  const note = useCreateLeadActivity();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState("");
  async function done() {
    try {
      await update.mutateAsync({ id: item.taskId, patch: { status: "Done" } });
      const text = result.trim();
      if (text)
        await note.mutateAsync({
          lead_id: item.lead.id,
          type: "note",
          content: `${t("ftasks.resultNote")}: ${text}`,
          created_by: user?.id ?? null,
        });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(t("ftasks.closed"));
      setOpen(false);
      setResult("");
    } catch (e) {
      toast.error(describeError(e, t("ftasks.closeFailed")));
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("ftasks.complete")}
          aria-label={t("ftasks.complete")}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-600"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-[13px] font-semibold text-foreground">{t("ftasks.complete")}</p>
        <textarea
          autoFocus
          rows={3}
          value={result}
          onChange={(e) => setResult(e.target.value.slice(0, 500))}
          placeholder={t("ftasks.resultPh")}
          className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-[13px] text-foreground outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={update.isPending}
          onClick={() => void done()}
          className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("ftasks.markDone")}
        </button>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------ calendar */

function Chip({ item, now }: { item: TaskBoardItem; now: number }) {
  const text = useTaskText();
  const due = new Date(item.dueIso);
  const late = item.dueAt < now;
  return (
    <Link
      to="/crm/leads/$leadId"
      params={{ leadId: item.lead.id }}
      search={{ from: "funnels" }}
      title={`${item.lead.name} — ${item.title}`}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md border-l-[3px] bg-card px-1.5 py-1 text-[11.5px] transition-colors hover:bg-accent",
        late ? "border-red-500" : "border-sky-500",
      )}
    >
      <span
        className={cn(
          "shrink-0 font-bold tabular-nums",
          late ? "text-red-600 dark:text-red-400" : "text-foreground",
        )}
      >
        {timeOf(due)}
      </span>
      <span className="min-w-0 truncate text-foreground/85">
        {item.lead.name}
        {text(item.title) ? ` · ${text(item.title)}` : ""}
      </span>
    </Link>
  );
}

// Browsers have no Uzbek month or weekday names, so these are written out.
const UZ_MONTHS = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];
const UZ_DAYS = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
const UZ_DAYS_LONG = [
  "yakshanba",
  "dushanba",
  "seshanba",
  "chorshanba",
  "payshanba",
  "juma",
  "shanba",
];

function dateFmt(lang: string) {
  const locale = lang === "ru" ? "ru-RU" : "en-GB";
  const uz = lang === "uz";
  return {
    weekday: (d: Date) =>
      uz ? UZ_DAYS[d.getDay()]! : d.toLocaleDateString(locale, { weekday: "short" }),
    dayMonth: (d: Date) =>
      uz
        ? `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}`
        : d.toLocaleDateString(locale, { day: "numeric", month: "short" }),
    full: (d: Date) =>
      uz
        ? `${UZ_DAYS_LONG[d.getDay()]}, ${d.getDate()}-${UZ_MONTHS[d.getMonth()]}`
        : d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }),
    month: (d: Date) =>
      uz
        ? `${UZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`
        : d.toLocaleDateString(locale, { month: "long", year: "numeric" }),
  };
}

export function TaskCalendar({
  mode,
  items,
  now,
}: {
  mode: Exclude<TasksView, "columns">;
  items: TaskBoardItem[];
  now: number;
}) {
  const { t, lang } = useI18n();
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const fmt = dateFmt(lang);
  const step = (dir: 1 | -1) =>
    setAnchor((a) =>
      mode === "day"
        ? addDays(a, dir)
        : mode === "week"
          ? addDays(a, 7 * dir)
          : new Date(a.getFullYear(), a.getMonth() + dir, 1),
    );
  const byDay = useMemo(() => {
    const m = new Map<number, TaskBoardItem[]>();
    for (const it of items) {
      const k = startOfDay(new Date(it.dueIso)).getTime();
      const list = m.get(k);
      if (list) list.push(it);
      else m.set(k, [it]);
    }
    for (const list of m.values()) list.sort((a, b) => a.dueAt - b.dueAt);
    return m;
  }, [items]);
  const on = (d: Date) => byDay.get(startOfDay(d).getTime()) ?? [];

  const title =
    mode === "day"
      ? fmt.full(anchor)
      : mode === "week"
        ? `${fmt.dayMonth(weekStart(anchor))} — ${fmt.dayMonth(addDays(weekStart(anchor), 6))} ${addDays(weekStart(anchor), 6).getFullYear()}`
        : fmt.month(anchor);

  const today = new Date(now);
  const dayHead = fmt.weekday;

  return (
    <section className="rounded-2xl border border-border bg-card/60 p-3 dark:bg-white/[0.035]">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={t("ftasks.prev")}
          className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={t("ftasks.next")}
          className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setAnchor(startOfDay(new Date()))}
          className="h-8 rounded-lg border border-border px-3 text-[12.5px] font-semibold text-foreground hover:bg-accent"
        >
          {t("ftasks.today")}
        </button>
        <h3 className="ml-1 text-[15px] font-bold capitalize text-foreground">{title}</h3>
      </div>

      {mode === "day" && (
        <ul className="space-y-1.5">
          {on(anchor).length === 0 ? (
            <li className="rounded-xl border border-dashed border-border px-3 py-10 text-center text-[13px] text-muted-foreground">
              {t("ftasks.emptyDay")}
            </li>
          ) : (
            on(anchor).map((it) => (
              <li key={it.taskId} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Chip item={it} now={now} />
                </div>
                <CompleteTaskButton item={it} />
              </li>
            ))
          )}
        </ul>
      )}

      {mode === "week" && (
        <div className="grid grid-cols-7 gap-2 phone:grid-cols-1">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i)).map((d) => (
            <div
              key={d.getTime()}
              className={cn(
                "min-h-[220px] rounded-xl border p-1.5",
                sameDay(d, today) ? "border-primary/60 bg-primary/[0.04]" : "border-border",
              )}
            >
              <p className="mb-1.5 px-1 text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">
                {dayHead(d)} <span className="text-foreground">{d.getDate()}</span>
                {on(d).length > 0 && <span className="ml-1 text-primary">· {on(d).length}</span>}
              </p>
              <div className="space-y-1">
                {on(d).map((it) => (
                  <Chip key={it.taskId} item={it} now={now} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === "month" && (
        <div className="grid grid-cols-7 gap-1.5 phone:gap-1">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart(new Date(2026, 0, 5)), i)).map(
            (d) => (
              <p
                key={`h${d.getDay()}`}
                className="px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
              >
                {dayHead(d)}
              </p>
            ),
          )}
          {Array.from({ length: 42 }, (_, i) =>
            addDays(weekStart(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), i),
          ).map((d) => {
            const list = on(d);
            const inMonth = d.getMonth() === anchor.getMonth();
            return (
              <div
                key={d.getTime()}
                className={cn(
                  "min-h-[96px] rounded-lg border p-1",
                  sameDay(d, today) ? "border-primary/60 bg-primary/[0.04]" : "border-border",
                  !inMonth && "opacity-45",
                )}
              >
                <p className="px-0.5 text-[12px] font-bold text-foreground">{d.getDate()}</p>
                <div className="mt-0.5 space-y-0.5">
                  {list.slice(0, 3).map((it) => (
                    <Chip key={it.taskId} item={it} now={now} />
                  ))}
                  {list.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setAnchor(startOfDay(d))}
                      className="px-1 text-[11px] font-semibold text-primary hover:underline"
                    >
                      {t("ftasks.more", { n: list.length - 3 })}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ new task */

export function NewTaskDialog({
  open,
  onOpenChange,
  leads,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leads: CrmLeadView[];
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const create = useCreateTask();
  const { data: profiles = [] } = useProfilesRaw();
  const [q, setQ] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [type, setType] = useState("contact");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [time, setTime] = useState("10:00");
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  const lead = leads.find((l) => l.id === leadId) ?? null;
  const found = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (
      n ? leads.filter((l) => `${l.name} ${l.phone}`.toLowerCase().includes(n)) : leads
    ).slice(0, 8);
  }, [leads, q]);

  async function save() {
    if (!lead || !user?.organizationId) return;
    const [h = 10, m = 0] = time.split(":").map(Number);
    const due = new Date(`${date}T00:00:00`);
    due.setHours(h, m, 0, 0);
    const label = t(`amo.taskType.${type}`);
    const body = text.trim();
    try {
      await create.mutateAsync({
        title: body ? `${label}: ${body}` : label,
        description: body || null,
        lead_id: lead.id,
        due_date: due.toISOString(),
        assignee_id: assignee || lead.ownerId || user.id,
        created_by: user.id,
        organization_id: user.organizationId,
      });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(t("amo.task.created"));
      onOpenChange(false);
      setLeadId(null);
      setQ("");
      setText("");
    } catch (e) {
      toast.error(describeError(e, t("ftasks.addFailed")));
    }
  }

  const field =
    "h-10 w-full rounded-lg border border-border bg-background px-3 text-[13.5px] text-foreground outline-none focus:border-primary";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{t("ftasks.add")}</DialogTitle>
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[12px] font-semibold text-muted-foreground">
              {t("ftasks.lead")}
            </p>
            {lead ? (
              <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">
                  {lead.name}
                </span>
                <button
                  type="button"
                  onClick={() => setLeadId(null)}
                  className="text-[12px] font-semibold text-primary hover:underline"
                >
                  {t("ftasks.change")}
                </button>
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("ftasks.leadPh")}
                  className={field}
                />
                <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border">
                  {found.length === 0 ? (
                    <li className="px-3 py-3 text-[12.5px] text-muted-foreground">
                      {t("ftasks.noLead")}
                    </li>
                  ) : (
                    found.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          onClick={() => setLeadId(l.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-accent"
                        >
                          <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                            {l.name}
                          </span>
                          <span className="shrink-0 text-[12px] text-muted-foreground">
                            {l.phone}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-[13px]">
            <TypePicker value={type} onChange={setType} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={field}
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={field}
            />
          </div>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            placeholder={t("ftasks.textPh")}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] text-foreground outline-none focus:border-primary"
          />
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={field}>
            <option value="">{t("ftasks.assigneeDefault")}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!lead || create.isPending}
            onClick={() => void save()}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("ftasks.save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
