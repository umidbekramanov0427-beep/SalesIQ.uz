// What SalesIQ writes back into amoCRM after the AI analyses a call (amoCRM
// workspace -> "AI -> amoCRM" tab): a task with the AI's next step for the
// lead's owner, and a note with what was learned about the client and the
// gist of the call. Kept in the company's amoCRM config
// (integration_settings.config, key "amocrm") next to the analysis rules.
// Pure, so it is unit-tested; read by analyzeCallById.

export type AmoWriteBack = {
  /** Put the AI's next step into amoCRM as a task for the lead's owner. */
  task: boolean;
  /** The task's deadline, hours after the analysis. */
  taskDueHours: number;
  /** Leave a note on the amoCRM lead. */
  note: boolean;
  /** The note lists the client's answers and facts (job, budget, needs...). */
  noteClient: boolean;
  /** The note carries the objections and the agreement / next step. */
  noteOutcome: boolean;
};

export const DEFAULT_WRITE_BACK: AmoWriteBack = {
  task: true,
  taskDueHours: 24,
  note: true,
  noteClient: true,
  noteOutcome: true,
};

export const TASK_DUE_CHOICES = [2, 4, 24, 48, 72] as const;

const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

function hours(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 720 ? Math.round(n) : DEFAULT_WRITE_BACK.taskDueHours;
}

/** The settings stored in the amoCRM config (missing keys keep today's behaviour). */
export function readWriteBack(config: Record<string, unknown> | null | undefined): AmoWriteBack {
  const c = (config?.["write_back"] ?? {}) as {
    task?: unknown;
    task_due_hours?: unknown;
    note?: unknown;
    note_client?: unknown;
    note_outcome?: unknown;
  };
  return {
    task: bool(c.task, true),
    taskDueHours: hours(c.task_due_hours ?? DEFAULT_WRITE_BACK.taskDueHours),
    note: bool(c.note, true),
    noteClient: bool(c.note_client, true),
    noteOutcome: bool(c.note_outcome, true),
  };
}

/** A request body -> what to store under config.write_back. */
export function toStored(body: Partial<Record<keyof AmoWriteBack, unknown>>) {
  const d = DEFAULT_WRITE_BACK;
  return {
    task: bool(body.task, d.task),
    task_due_hours: hours(body.taskDueHours ?? d.taskDueHours),
    note: bool(body.note, d.note),
    note_client: bool(body.noteClient, d.noteClient),
    note_outcome: bool(body.noteOutcome, d.noteOutcome),
  };
}
