import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlarmClock, CircleX, Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DatePick, TimePick, TypePicker, roundTime } from "@/components/lead/AmoComposer";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { parseGuardError } from "@/lib/crm-guards";
import { cn, describeError } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchLeadNoteBlock,
  fetchLeadTaskBlock,
  useCreateLeadActivity,
  useCreateTask,
  usePipelineStagesRaw,
  useStageNoteRule,
  useStageTaskRule,
} from "@/hooks/use-crm-data";

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
 * "Izoh majburiy": before the lead goes into this stage someone has to have
 * written down what happened with the client since it arrived in its
 * current stage. One required text box; saved as a note, then the move
 * carries on.
 */
export function RequiredNoteDialog({
  lead,
  stage,
  onDone,
  onCancel,
}: {
  lead: GuardLead;
  stage: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const createActivity = useCreateLeadActivity();
  const [text, setText] = useState("");
  const busy = createActivity.isPending;
  const body = text.trim();
  const enough = body.length >= MIN_NOTE_CHARS;

  async function save() {
    if (!enough) return;
    try {
      await createActivity.mutateAsync({
        lead_id: lead.id,
        type: "note",
        content: body,
        created_by: user?.id ?? null,
      });
      await qc.invalidateQueries({ queryKey: ["lead_activities", lead.id] });
      onDone();
    } catch (err) {
      toast.error(describeError(err, t("guard.noteFailed")));
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onCancel()}>
      <DialogContent className="amo-skin max-w-md gap-0 overflow-hidden p-0">
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <StickyNote className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold">
                {t("guard.noteTitle")}
              </DialogTitle>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                {t("guard.noteHint", { stage })}
              </p>
              <p className="mt-1 truncate text-[12.5px] font-medium text-foreground">{lead.name}</p>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            autoFocus
            placeholder={t("guard.notePlaceholder")}
            className="mt-4 w-full resize-none rounded-lg border border-border bg-background p-3 text-[13px] text-foreground outline-none placeholder:text-subtle focus:border-primary"
          />
          {!enough && body.length > 0 && (
            <p className="mt-1 text-[12px] text-subtle">
              {t("guard.noteTooShort", { count: MIN_NOTE_CHARS })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <button
            type="button"
            disabled={busy || !enough}
            onClick={() => void save()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("guard.noteSaveMove")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("common.cancel")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const MIN_NOTE_CHARS = 15;

// The usual reasons a deal is lost; "Boshqa" lets the manager write one.
export const LOSS_REASON_KEYS = [
  "price",
  "competitor",
  "noNeed",
  "noAnswer",
  "later",
  "wrongNumber",
] as const;

/**
 * Before a lead goes into a lost stage the manager says why: one of the
 * usual reasons or their own words. Saved on the lead (leads.loss_reason,
 * which Lid tahlili's "Rad etish sabablari" counts) and as a note.
 */
export function LossReasonDialog({
  lead,
  stage,
  onDone,
  onCancel,
}: {
  lead: GuardLead;
  stage: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const createActivity = useCreateLeadActivity();
  const [picked, setPicked] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const reason = picked === "other" ? other.trim() : picked ? t(`guard.loss.${picked}`) : "";

  async function save() {
    if (!reason) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({ loss_reason: reason })
        .eq("id", lead.id);
      if (error) throw error;
      await createActivity.mutateAsync({
        lead_id: lead.id,
        type: "note",
        content: `${t("guard.lossNote")}: ${reason}`,
        created_by: user?.id ?? null,
      });
      await qc.invalidateQueries({ queryKey: ["lead_activities", lead.id] });
      onDone();
    } catch (err) {
      toast.error(describeError(err, t("guard.lossFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onCancel()}>
      <DialogContent className="amo-skin max-w-md gap-0 overflow-hidden p-0">
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
              <CircleX className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold">
                {t("guard.lossTitle")}
              </DialogTitle>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                {t("guard.lossHint", { stage })}
              </p>
              <p className="mt-1 truncate text-[12.5px] font-medium text-foreground">{lead.name}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[...LOSS_REASON_KEYS, "other" as const].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPicked(k)}
                aria-pressed={picked === k}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  picked === k
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:border-primary/40",
                )}
              >
                {t(`guard.loss.${k}`)}
              </button>
            ))}
          </div>
          {picked === "other" && (
            <textarea
              value={other}
              onChange={(e) => setOther(e.target.value)}
              rows={3}
              autoFocus
              placeholder={t("guard.lossPlaceholder")}
              className="mt-3 w-full resize-none rounded-lg border border-border bg-background p-3 text-[13px] text-foreground outline-none placeholder:text-subtle focus:border-primary"
            />
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <button
            type="button"
            disabled={busy || !reason}
            onClick={() => void save()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("guard.lossSaveMove")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("common.cancel")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Wraps a stage move with the stage's rules: asks the database first when
 * the stage has a task or note rule for this user, and catches the
 * database's refusal too, opening the matching dialog either way. Once the
 * task / note is saved the move is tried again -- a stage with both rules
 * asks for the task, then the note.
 */
export type GuardMoveOptions = {
  optimistic?: boolean;
  /** Set once the loss reason was given, so it isn't asked again. */
  lossReasonGiven?: boolean;
};

export function useTaskGuardedMove(): {
  guardMove: (
    lead: GuardLead,
    stageId: string,
    move: () => Promise<void>,
    failMessage: string,
    opts?: GuardMoveOptions,
  ) => Promise<void>;
  dialog: ReactNode;
} {
  const needsTask = useStageTaskRule();
  const needsNote = useStageNoteRule();
  const { data: allStages } = usePipelineStagesRaw();
  type Pending = {
    kind: "task" | "note" | "loss";
    lead: GuardLead;
    stageId: string;
    stage: string;
    move: () => Promise<void>;
    failMessage: string;
    opts?: GuardMoveOptions;
  };
  const [pending, setPending] = useState<Pending | null>(null);

  async function guardMove(
    lead: GuardLead,
    stageId: string,
    move: () => Promise<void>,
    failMessage: string,
    opts?: GuardMoveOptions,
  ) {
    const ask = (kind: Pending["kind"], stage: string) =>
      setPending({ kind, lead, stageId, stage, move, failMessage, ...(opts ? { opts } : {}) });
    // A lost stage asks why first -- before an optimistic card moves too.
    const target = allStages?.find((s) => s.id === stageId);
    if (target?.is_lost && !opts?.lossReasonGiven) return ask("loss", target.name);
    // Optimistic callers move first: the database refuses a move that
    // needs a task or note (task_required / note_required), the move rolls
    // itself back and the dialog opens -- no round trip before the card
    // moves.
    if (opts?.optimistic) {
      try {
        await move();
      } catch (err) {
        const g = parseGuardError(err);
        if (g?.kind === "task" || g?.kind === "note") ask(g.kind, g.stage);
        else toast.error(describeError(err, failMessage));
      }
      return;
    }
    if (needsTask(stageId)) {
      const blocked = await fetchLeadTaskBlock(lead.id, stageId);
      if (blocked) return ask("task", blocked);
    }
    if (needsNote(stageId)) {
      const blocked = await fetchLeadNoteBlock(lead.id, stageId);
      if (blocked) return ask("note", blocked);
    }
    try {
      await move();
    } catch (err) {
      const g = parseGuardError(err);
      if (g?.kind === "task" || g?.kind === "note") ask(g.kind, g.stage);
      else toast.error(describeError(err, failMessage));
    }
  }

  function resume() {
    const p = pending;
    setPending(null);
    if (!p) return;
    const opts = p.kind === "loss" ? { ...p.opts, lossReasonGiven: true } : p.opts;
    void guardMove(p.lead, p.stageId, p.move, p.failMessage, opts);
  }

  const dialog = !pending ? null : pending.kind === "loss" ? (
    <LossReasonDialog
      lead={pending.lead}
      stage={pending.stage}
      onCancel={() => setPending(null)}
      onDone={resume}
    />
  ) : pending.kind === "task" ? (
    <RequiredTaskDialog
      lead={pending.lead}
      stage={pending.stage}
      reason="move"
      onCancel={() => setPending(null)}
      onDone={resume}
    />
  ) : (
    <RequiredNoteDialog
      lead={pending.lead}
      stage={pending.stage}
      onCancel={() => setPending(null)}
      onDone={resume}
    />
  );

  return { guardMove, dialog };
}
