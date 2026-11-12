import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlarmClock, Check, Clock, Plus, Repeat2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { REMINDER_REPEATS, quickTimes, reminderGroup, type ReminderRepeat } from "@/lib/reminders";
import {
  useCreateReminder,
  useDeleteReminder,
  useProfilesRaw,
  useReminders,
  useUpdateReminder,
  type ReminderRow,
} from "@/hooks/use-crm-data";

// Nazorat -> Eslatmalar: the viewer's reminders (src/lib/reminders.ts) -- add one with a
// quick time or an exact one, once or repeating; heads of sales and admins
// can remind a colleague too. Due ones come as a bell notification, push
// and Telegram message from the every-minute cron (reminders.server.ts).

const pad = (n: number) => String(n).padStart(2, "0");
/** "2026-11-12T18:00" for a datetime-local input, in local time. */
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function RemindersBoard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: rows = [], isLoading, isError } = useReminders();
  const { data: profiles = [] } = useProfilesRaw();
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const remove = useDeleteReminder();
  const canRemindOthers = ["super_admin", "rop", "platform_owner"].includes(user?.role ?? "");

  const [text, setText] = useState("");
  const [when, setWhen] = useState(() => toLocalInput(quickTimes(Date.now())[0]!.at));
  const [repeat, setRepeat] = useState<ReminderRepeat>("none");
  const [forWhom, setForWhom] = useState<string>(user?.id ?? "");
  const now = Date.now();
  const nameOf = (id: string | null) =>
    id ? (profiles.find((p) => p.id === id)?.full_name ?? "") : "";

  const groups = useMemo(() => {
    const out: Record<"due" | "today" | "upcoming" | "done", ReminderRow[]> = {
      due: [],
      today: [],
      upcoming: [],
      done: [],
    };
    for (const r of rows) out[reminderGroup(r, now)].push(r);
    out.done.sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
    out.done = out.done.slice(0, 20);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` moves every render
  }, [rows]);

  async function add() {
    const body = text.trim();
    const at = new Date(when);
    if (!body || Number.isNaN(at.getTime()) || !user?.organizationId) return;
    try {
      await create.mutateAsync({
        organization_id: user.organizationId,
        profile_id: forWhom || user.id,
        created_by: user.id,
        text: body.slice(0, 500),
        remind_at: at.toISOString(),
        repeat,
      });
      setText("");
      toast.success(t("rem.added"));
    } catch (err) {
      toast.error(
        /reminders/.test(err instanceof Error ? err.message : "")
          ? t("rem.migrationPending")
          : describeError(err, t("rem.failed")),
      );
    }
  }

  const act = (id: string, patch: Partial<ReminderRow>) =>
    update.mutate(
      { id, patch },
      { onError: (err) => toast.error(describeError(err, t("rem.failed"))) },
    );

  const sections: { key: keyof typeof groups; title: string; tone: string }[] = [
    { key: "due", title: t("rem.group.due"), tone: "text-red-600 dark:text-red-400" },
    { key: "today", title: t("rem.group.today"), tone: "text-emerald-600 dark:text-emerald-400" },
    { key: "upcoming", title: t("rem.group.upcoming"), tone: "text-sky-600 dark:text-sky-400" },
    { key: "done", title: t("rem.group.done"), tone: "text-muted-foreground" },
  ];

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <SectionCard icon={Plus} tone="amber" title={t("rem.new")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
            className="space-y-3"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={t("rem.textPh")}
              className="w-full rounded-xl border border-border bg-input px-3.5 py-2.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary"
            />
            <div className="flex flex-wrap gap-1.5">
              {quickTimes(now).map((q) => (
                <button
                  key={q.key}
                  type="button"
                  onClick={() => setWhen(toLocalInput(q.at))}
                  className={cn(
                    "h-8 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors",
                    when === toLocalInput(q.at)
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`rem.quick.${q.key}`)}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
                {t("rem.when")}
              </span>
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-input px-3 text-[14px] text-foreground outline-none [color-scheme:light] focus:border-primary dark:[color-scheme:dark]"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
                  {t("rem.repeat")}
                </span>
                <select
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value as ReminderRepeat)}
                  className="h-10 w-full rounded-xl border border-border bg-input px-2.5 text-[13.5px] text-foreground outline-none [color-scheme:light] focus:border-primary dark:[color-scheme:dark]"
                >
                  {REMINDER_REPEATS.map((r) => (
                    <option key={r} value={r}>
                      {t(`rem.repeat.${r}`)}
                    </option>
                  ))}
                </select>
              </label>
              {canRemindOthers && (
                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
                    {t("rem.forWhom")}
                  </span>
                  <select
                    value={forWhom}
                    onChange={(e) => setForWhom(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-input px-2.5 text-[13.5px] text-foreground outline-none [color-scheme:light] focus:border-primary dark:[color-scheme:dark]"
                  >
                    <option value={user?.id ?? ""}>{t("rem.me")}</option>
                    {profiles
                      .filter(
                        (p) => p.id !== user?.id && p.organization_id === user?.organizationId,
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={!text.trim() || create.isPending}>
              <AlarmClock className="h-4 w-4" /> {t("rem.add")}
            </Button>
            <p className="text-[12px] leading-snug text-muted-foreground">{t("rem.howSent")}</p>
          </form>
        </SectionCard>

        <div className="min-w-0 space-y-5">
          {isError ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
              {t("rem.migrationPending")}
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-[13.5px] text-muted-foreground">
              {isLoading ? t("common.loading") : t("rem.empty")}
            </p>
          ) : (
            sections
              .filter((sec) => groups[sec.key].length > 0)
              .map((sec) => (
                <section key={sec.key}>
                  <p className={cn("console-caption mb-2 !text-[11px]", sec.tone)}>
                    {sec.title} · {groups[sec.key].length}
                  </p>
                  <ul className="space-y-2">
                    {groups[sec.key].map((r) => (
                      <ReminderItem
                        key={r.id}
                        r={r}
                        due={sec.key === "due"}
                        forName={r.profile_id !== user?.id ? nameOf(r.profile_id) : ""}
                        byName={
                          r.created_by && r.created_by !== user?.id ? nameOf(r.created_by) : ""
                        }
                        onDone={() => act(r.id, { done_at: new Date().toISOString() })}
                        onUndo={() => act(r.id, { done_at: null })}
                        onSnooze={() =>
                          act(r.id, {
                            remind_at: new Date(Date.now() + 3_600_000).toISOString(),
                            sent_at: null,
                          })
                        }
                        onDelete={() =>
                          remove.mutate(r.id, {
                            onError: (err) => toast.error(describeError(err, t("rem.failed"))),
                          })
                        }
                      />
                    ))}
                  </ul>
                </section>
              ))
          )}
        </div>
      </div>
    </>
  );
}

function ReminderItem({
  r,
  due,
  forName,
  byName,
  onDone,
  onUndo,
  onSnooze,
  onDelete,
}: {
  r: ReminderRow;
  due: boolean;
  forName: string;
  byName: string;
  onDone: () => void;
  onUndo: () => void;
  onSnooze: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const at = new Date(r.remind_at);
  const done = !!r.done_at;
  const iconBtn =
    "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-card px-3.5 py-3",
        due ? "border-red-500/40 border-l-[3px] border-l-red-500" : "border-border",
        done && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={done ? onUndo : onDone}
        aria-label={done ? t("rem.undo") : t("rem.done")}
        title={done ? t("rem.undo") : t("rem.done")}
        className={cn(
          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
          done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-border hover:border-emerald-500 hover:text-emerald-600",
        )}
      >
        {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "whitespace-pre-wrap text-[14px] font-medium text-foreground",
            done && "line-through",
          )}
        >
          {r.text}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-1 font-semibold tabular-nums",
              due && "text-red-600 dark:text-red-400",
            )}
          >
            <Clock className="h-3 w-3" />
            {pad(at.getDate())}.{pad(at.getMonth() + 1)} {pad(at.getHours())}:{pad(at.getMinutes())}
          </span>
          {r.repeat !== "none" && (
            <span className="inline-flex items-center gap-1">
              <Repeat2 className="h-3 w-3" /> {t(`rem.repeat.${r.repeat}`)}
            </span>
          )}
          {forName && <span>{t("rem.for", { name: forName })}</span>}
          {byName && <span>{t("rem.by", { name: byName })}</span>}
          {r.lead_id && (
            <Link
              to="/crm/leads/$leadId"
              params={{ leadId: r.lead_id }}
              className="font-semibold text-primary hover:underline"
            >
              {t("rem.openLead")}
            </Link>
          )}
        </p>
      </div>
      {!done && (
        <button
          type="button"
          onClick={onSnooze}
          title={t("rem.snooze")}
          aria-label={t("rem.snooze")}
          className={iconBtn}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        title={t("common.delete")}
        aria-label={t("common.delete")}
        className={cn(iconBtn, "hover:bg-destructive/10 hover:text-destructive")}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
