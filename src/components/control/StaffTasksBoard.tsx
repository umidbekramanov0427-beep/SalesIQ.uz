import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlarmClock,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  Loader2,
  Plus,
  Repeat,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/layout/Primitives";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { notifyTaskAssigned, useProfilesRaw } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { DUE_PRESETS, nextDue, presetDue, RECURRENCES, type Recurrence } from "@/lib/staff-tasks";

// Nazorat → «Xodim vazifalari» (5CRM's «Xodim vazifa»): work for the team
// that isn't tied to a lead -- with a deadline and who does it. Rows live in
// `tasks` with no lead. Heads create them (for one person, everyone or a
// role); each assignee gets the bell (Realtime), a push and sees it here at
// once. Cards move between Rejada / Jarayonda / Bajarilgan by dragging; a
// repeating task makes its next copy when it is done.

type Status = "Todo" | "In progress" | "Done";
type Priority = "Low" | "Normal" | "High" | "Urgent";
type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  created_by: string | null;
  due_date: string | null;
  priority: Priority;
  status: Status | "Review";
  recurrence?: string | null;
  organization_id: string;
};

const COLS: { status: Status; key: string; dot: string }[] = [
  { status: "Todo", key: "planned", dot: "bg-sky-500" },
  { status: "In progress", key: "doing", dot: "bg-amber-500" },
  { status: "Done", key: "done", dot: "bg-emerald-500" },
];
const PRIORITIES: Priority[] = ["Low", "Normal", "High", "Urgent"];
const PRIORITY_CHIP: Record<Priority, string> = {
  Low: "text-muted-foreground border-border",
  Normal: "text-sky-600 border-sky-500/40 dark:text-sky-300",
  High: "text-amber-600 border-amber-500/40 dark:text-amber-300",
  Urgent: "text-rose-600 border-rose-500/50 dark:text-rose-300",
};
const LINK = "/attendance?tab=vazifalar";
const KEY = ["staff-tasks"];

const fmt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function StaffTasksBoard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isHead =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";
  const { data: profiles = [] } = useProfilesRaw();
  const [who, setWho] = useState<string>("");
  const [prio, setPrio] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: KEY,
    enabled: !!user?.organizationId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<TaskRow[]> => {
      let q = supabase
        .from("tasks")
        .select("*")
        .is("lead_id", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(500);
      if (!isHead && user?.id) q = q.eq("assignee_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TaskRow[];
    },
  });

  // A task given to this person shows at once: their notification row comes
  // over Realtime, and with it the list is read again.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`staff-tasks-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => void qc.invalidateQueries({ queryKey: KEY }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  const name = (id: string | null) =>
    profiles.find((p) => p.id === id)?.full_name || profiles.find((p) => p.id === id)?.email || "—";
  const shown = rows.filter(
    (r) => (!who || r.assignee_id === who) && (!prio || r.priority === prio),
  );
  const now = Date.now();
  const late = (r: TaskRow) =>
    r.status !== "Done" && !!r.due_date && new Date(r.due_date).getTime() < now;
  const stats = useMemo(() => {
    const done = shown.filter((r) => r.status === "Done").length;
    const doing = shown.filter((r) => r.status === "In progress").length;
    const planned = shown.length - done - doing;
    return { total: shown.length, done, doing, planned, overdue: shown.filter(late).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  async function setStatus(row: TaskRow, status: Status) {
    if (row.status === status) return;
    const { error } = await supabase.from("tasks").update({ status }).eq("id", row.id);
    if (error) {
      toast.error(describeError(error, t("stask.saveFailed")));
      return;
    }
    // A repeating task: its next copy, due one period later.
    const rec = (row.recurrence ?? "once") as Recurrence;
    if (status === "Done" && rec !== "once" && row.due_date) {
      await supabase.from("tasks").insert({
        title: row.title,
        description: row.description,
        assignee_id: row.assignee_id,
        created_by: row.created_by,
        organization_id: row.organization_id,
        priority: row.priority,
        status: "Todo",
        due_date: nextDue(row.due_date, rec),
        recurrence: rec,
      } as never);
    }
    void qc.invalidateQueries({ queryKey: KEY });
  }

  async function remove(row: TaskRow) {
    if (!window.confirm(t("stask.deleteConfirm", { title: row.title }))) return;
    const { error } = await supabase.from("tasks").delete().eq("id", row.id);
    if (error) toast.error(describeError(error, t("stask.saveFailed")));
    void qc.invalidateQueries({ queryKey: KEY });
  }

  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const selectCls =
    "h-10 rounded-lg border border-border bg-card px-3 text-[13.5px] text-foreground outline-none focus:border-primary";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[640px] text-[13.5px] text-muted-foreground">{t("stask.desc")}</p>
        {isHead && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> {t("stask.create")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("stask.total")}
          tipKey="stask.total"
          icon={ClipboardList}
          iconTone="sky"
          value={String(stats.total)}
          hint={t("stask.totalHint", { planned: stats.planned, doing: stats.doing })}
        />
        <StatCard
          label={t("stask.done")}
          tipKey="stask.done"
          icon={CheckCircle2}
          iconTone="emerald"
          value={`${stats.done} / ${stats.total}`}
          hint={`${pct}%`}
          meter={pct}
        />
        <StatCard
          label={t("stask.doing")}
          tipKey="stask.doing"
          icon={ListChecks}
          iconTone="amber"
          value={String(stats.doing)}
          hint={t("stask.doingHint")}
        />
        <StatCard
          label={t("stask.overdue")}
          tipKey="stask.overdue"
          icon={AlarmClock}
          iconTone="rose"
          tone={stats.overdue ? "danger" : "default"}
          value={String(stats.overdue)}
          hint={stats.overdue ? t("stask.overdueHint") : t("stask.noOverdue")}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          {isHead && (
            <select value={who} onChange={(e) => setWho(e.target.value)} className={selectCls}>
              <option value="">{t("stask.allStaff")}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          )}
          <select value={prio} onChange={(e) => setPrio(e.target.value)} className={selectCls}>
            <option value="">{t("stask.allPriority")}</option>
            {[...PRIORITIES].reverse().map((p) => (
              <option key={p} value={p}>
                {t(`stask.p.${p}`)}
              </option>
            ))}
          </select>
          <p className="ml-auto text-[12.5px] text-muted-foreground">{t("stask.dragHint")}</p>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : shown.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground">
              <ListChecks className="h-5 w-5" />
            </span>
            <p className="text-[15px] font-semibold text-foreground">{t("stask.empty")}</p>
            <p className="max-w-[360px] text-[13px] text-muted-foreground">{t("stask.desc")}</p>
            {isHead && (
              <Button className="mt-2" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> {t("stask.first")}
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {COLS.map((col) => {
              const items = shown.filter((r) =>
                col.status === "Todo"
                  ? r.status === "Todo" || r.status === "Review"
                  : r.status === col.status,
              );
              return (
                <section
                  key={col.status}
                  onDragOver={(e: DragEvent) => e.preventDefault()}
                  onDrop={() => {
                    const row = rows.find((r) => r.id === dragged);
                    setDragged(null);
                    if (row) void setStatus(row, col.status);
                  }}
                  className="min-h-[160px] rounded-xl bg-muted/40 p-2.5"
                >
                  <header className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold text-foreground">
                    <span className={cn("h-2 w-2 rounded-full", col.dot)} />
                    {t(`stask.col.${col.key}`)}
                    <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
                      {items.length}
                    </span>
                  </header>
                  <div className="space-y-2">
                    {items.map((r) => (
                      <article
                        key={r.id}
                        draggable
                        onDragStart={() => setDragged(r.id)}
                        onDragEnd={() => setDragged(null)}
                        className={cn(
                          "group rounded-lg border border-border bg-card p-3 shadow-soft",
                          dragged === r.id && "opacity-40",
                          late(r) && "border-destructive/50",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <p
                            className={cn(
                              "min-w-0 flex-1 break-words text-[14px] font-semibold text-foreground",
                              r.status === "Done" && "text-muted-foreground line-through",
                            )}
                          >
                            {r.title}
                          </p>
                          {isHead && (
                            <button
                              type="button"
                              onClick={() => void remove(r)}
                              aria-label={t("common.delete")}
                              className="invisible text-muted-foreground hover:text-destructive group-hover:visible"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        {r.description && (
                          <p className="mt-1 line-clamp-3 text-[12.5px] text-muted-foreground">
                            {r.description}
                          </p>
                        )}
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 font-semibold",
                              PRIORITY_CHIP[r.priority],
                            )}
                          >
                            {t(`stask.p.${r.priority}`)}
                          </span>
                          {r.due_date && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1",
                                late(r)
                                  ? "font-semibold text-destructive"
                                  : "text-muted-foreground",
                              )}
                            >
                              <CalendarClock className="h-3.5 w-3.5" /> {fmt(r.due_date)}
                            </span>
                          )}
                          {r.recurrence && r.recurrence !== "once" && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Repeat className="h-3.5 w-3.5" /> {t(`stask.r.${r.recurrence}`)}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-[12px]">
                          <span className="truncate text-muted-foreground">
                            {name(r.assignee_id)}
                          </span>
                          {r.status !== "Done" && r.assignee_id === user?.id && (
                            <button
                              type="button"
                              onClick={() =>
                                void setStatus(
                                  r,
                                  r.status === "In progress" ? "Done" : "In progress",
                                )
                              }
                              className="shrink-0 font-semibold text-primary hover:underline"
                            >
                              {r.status === "In progress" ? t("stask.finish") : t("stask.start")}
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {isHead && (
        <CreateTaskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          profiles={profiles}
          onCreated={() => void qc.invalidateQueries({ queryKey: KEY })}
        />
      )}
    </div>
  );
}

type Assign = "one" | "all" | "sotuv_menejeri" | "rop";

function CreateTaskDialog({
  open,
  onOpenChange,
  profiles,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profiles: { id: string; full_name: string | null; email: string; role: string }[];
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assign, setAssign] = useState<Assign>("one");
  const [person, setPerson] = useState("");
  const [priority, setPriority] = useState<Priority>("Normal");
  const [due, setDue] = useState<string>("");
  const [rec, setRec] = useState<Recurrence>("once");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setDesc("");
    setAssign("one");
    setPerson("");
    setPriority("Normal");
    setDue("");
    setRec("once");
    setErr(null);
  };

  const targets = () =>
    assign === "one"
      ? person
        ? [person]
        : []
      : profiles
          .filter((p) => p.role !== "platform_owner" && (assign === "all" || p.role === assign))
          .map((p) => p.id);

  async function create() {
    if (!title.trim()) return setErr(t("stask.noTitle"));
    const ids = targets();
    if (ids.length === 0) return setErr(t("stask.noPerson"));
    if (!user?.organizationId) return;
    setBusy(true);
    try {
      const base = {
        title: title.trim(),
        description: desc.trim() || null,
        created_by: user.id,
        organization_id: user.organizationId,
        priority,
        status: "Todo" as const,
        due_date: due ? new Date(due).toISOString() : null,
      };
      const withRec = ids.map((id) => ({ ...base, assignee_id: id, recurrence: rec }));
      let { error } = await supabase.from("tasks").insert(withRec as never);
      // Before the 20270202 migration there is no `recurrence` column.
      if (error && /recurrence/.test(error.message)) {
        ({ error } = await supabase
          .from("tasks")
          .insert(ids.map((id) => ({ ...base, assignee_id: id }))));
      }
      if (error) throw error;
      await Promise.all(
        ids
          .filter((id) => id !== user.id)
          .map((id) => notifyTaskAssigned(id, base.title, LINK).catch(() => undefined)),
      );
      toast.success(t("stask.created", { n: ids.length }));
      onCreated();
      reset();
      onOpenChange(false);
    } catch (e) {
      setErr(describeError(e, t("stask.saveFailed")));
    } finally {
      setBusy(false);
    }
  }

  const field =
    "h-10 w-full rounded-lg border border-border bg-background px-3 text-[13.5px] text-foreground outline-none focus:border-primary";
  const label = "mb-1.5 block text-[12.5px] font-semibold text-muted-foreground";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-[560px] rounded-2xl">
        <DialogTitle>{t("stask.new")}</DialogTitle>
        <div className="mt-2 space-y-4">
          <label className="block">
            <span className={label}>{t("stask.f.title")}</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setErr(null);
              }}
              placeholder={t("stask.f.titlePh")}
              className={field}
            />
          </label>
          <label className="block">
            <span className={label}>{t("stask.f.desc")}</span>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              className={cn(field, "h-auto py-2")}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>{t("stask.f.assign")}</span>
              <select
                value={assign}
                onChange={(e) => setAssign(e.target.value as Assign)}
                className={field}
              >
                {(["one", "all", "sotuv_menejeri", "rop"] as Assign[]).map((a) => (
                  <option key={a} value={a}>
                    {t(`stask.a.${a}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>{t("stask.f.person")}</span>
              <select
                value={person}
                disabled={assign !== "one"}
                onChange={(e) => setPerson(e.target.value)}
                className={cn(field, "disabled:opacity-50")}
              >
                <option value="">{t("stask.notChosen")}</option>
                {profiles
                  .filter((p) => p.role !== "platform_owner")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={label}>{t("stask.f.priority")}</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={field}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`stask.p.${p}`)}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className={label}>{t("stask.f.due")}</span>
              <DuePicker value={due} onChange={setDue} />
            </div>
            <label className="block">
              <span className={label}>{t("stask.f.repeat")}</span>
              <select
                value={rec}
                onChange={(e) => setRec(e.target.value as Recurrence)}
                className={field}
              >
                {RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {t(`stask.r.${r}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {err && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {err}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={busy} onClick={() => void create()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("stask.createBtn")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The deadline: quick choices on the left (5CRM), or an exact date and time. */
function DuePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const shownText = value ? fmt(new Date(value).toISOString()) : t("stask.f.duePh");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-left text-[13.5px] text-foreground"
        >
          <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>
            {shownText}
          </span>
          {value && (
            <X
              className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] p-0">
        <div className="flex">
          <ul className="w-[150px] border-r border-border py-1.5">
            {DUE_PRESETS.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => setDraft(presetDue(p))}
                  className="w-full px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
                >
                  {t(`stask.d.${p}`)}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex-1 space-y-3 p-3">
            <input
              type={allDay ? "date" : "datetime-local"}
              value={allDay ? draft.slice(0, 10) : draft}
              onChange={(e) => setDraft(allDay ? `${e.target.value}T18:00` : e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-[13.5px] text-foreground"
            />
            <label className="flex items-center gap-2 text-[13px] text-foreground">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              {t("stask.d.allDay")}
            </label>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                {t("stask.d.pick")}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
