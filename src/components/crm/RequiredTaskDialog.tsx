import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DatePick, TimePick, TypePicker, roundTime } from "@/components/lead/AmoComposer";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { parseGuardError } from "@/lib/crm-guards";
import { describeError } from "@/lib/utils";
import { fetchLeadTaskBlock, useCreateTask, useStageTaskRule } from "@/hooks/use-crm-data";

export type GuardLead = { id: string; name: string; ownerId?: string | null };

/**
 * "Zapret zadacha": the lead needs an open task before it can go into this
 * stage (or before its card can be left). A short task form -- type, day,
 * time, text -- and once the task is saved the held-back action carries on.
 */
export function RequiredTaskDialog({
  lead,
  stage,
  reason,
  onDone,
  onCancel,
}: {
  lead: GuardLead;
  stage: string;
  reason: "move" | "leave";
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const createTask = useCreateTask();
  const [type, setType] = useState("contact");
  const [date, setDate] = useState<Date>(() => new Date());
  const [time, setTime] = useState(() => roundTime(new Date(Date.now() + 15 * 60_000)));
  const [text, setText] = useState("");
  const busy = createTask.isPending;

  async function save() {
    const [h = 9, m = 0] = time.split(":").map(Number);
    const due = new Date(date);
    due.setHours(h, m, 0, 0);
    const label = t(`amo.taskType.${type}`);
    const body = text.trim();
    try {
      await createTask.mutateAsync({
        title: body ? `${label}: ${body}` : label,
        description: body || null,
        lead_id: lead.id,
        due_date: due.toISOString(),
        assignee_id: lead.ownerId || user?.id || null,
        created_by: user?.id ?? null,
        organization_id: user!.organizationId!,
      });
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(t("amo.task.created"));
      onDone();
    } catch (err) {
      toast.error(describeError(err, t("guard.taskFailed")));
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onCancel()}>
      <DialogContent className="amo-skin max-w-md gap-0 overflow-hidden p-0">
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
              <AlarmClock className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold">
                {t("guard.taskTitle")}
              </DialogTitle>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                {t(reason === "move" ? "guard.taskMoveHint" : "guard.taskLeaveHint", { stage })}
              </p>
              <p className="mt-1 truncate text-[12.5px] font-medium text-foreground">{lead.name}</p>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-background p-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <DatePick
                value={date}
                onChange={(d, at) => {
                  setDate(d);
                  if (at) setTime(at);
                }}
              />
              <TimePick value={time} onChange={setTime} />
              <TypePicker value={type} onChange={setType} />
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              autoFocus
              placeholder={t("guard.taskPlaceholder")}
              className="mt-2 w-full resize-none bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t(reason === "move" ? "guard.taskSaveMove" : "guard.taskSave")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t(reason === "move" ? "common.cancel" : "guard.stay")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Wraps a stage move with the task rule: asks the database first when the
 * stage has a rule for this user, and catches the database's refusal too,
 * opening the task dialog either way; the move runs once a task exists.
 */
export function useTaskGuardedMove(): {
  guardMove: (
    lead: GuardLead,
    stageId: string,
    move: () => Promise<void>,
    failMessage: string,
  ) => Promise<void>;
  dialog: ReactNode;
} {
  const needsTask = useStageTaskRule();
  const [pending, setPending] = useState<{
    lead: GuardLead;
    stage: string;
    move: () => Promise<void>;
    failMessage: string;
  } | null>(null);

  async function run(move: () => Promise<void>, lead: GuardLead, failMessage: string) {
    try {
      await move();
    } catch (err) {
      const g = parseGuardError(err);
      if (g?.kind === "task") setPending({ lead, stage: g.stage, move, failMessage });
      else toast.error(describeError(err, failMessage));
    }
  }

  async function guardMove(
    lead: GuardLead,
    stageId: string,
    move: () => Promise<void>,
    failMessage: string,
  ) {
    if (needsTask(stageId)) {
      const blocked = await fetchLeadTaskBlock(lead.id, stageId);
      if (blocked) {
        setPending({ lead, stage: blocked, move, failMessage });
        return;
      }
    }
    await run(move, lead, failMessage);
  }

  const dialog = pending ? (
    <RequiredTaskDialog
      lead={pending.lead}
      stage={pending.stage}
      reason="move"
      onCancel={() => setPending(null)}
      onDone={() => {
        const p = pending;
        setPending(null);
        void run(p.move, p.lead, p.failMessage);
      }}
    />
  ) : null;

  return { guardMove, dialog };
}
