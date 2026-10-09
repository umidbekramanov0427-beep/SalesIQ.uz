// The rules the database enforces on leads, recognised from the error it
// raises so the UI can respond with the right dialog instead of a raw
// message: "duplicate_in_funnel:<lead id>" (the client already has a lead in
// this funnel), "task_required:<stage name>" (the stage needs an open task
// first) and "note_required:<stage name>" (it needs a fresh note first).

export type GuardError =
  | { kind: "duplicate"; leadId: string }
  | { kind: "task"; stage: string }
  | { kind: "note"; stage: string };

export function parseGuardError(err: unknown): GuardError | null {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
  const dup = /duplicate_in_funnel:([0-9a-f-]{36})/i.exec(message);
  if (dup) return { kind: "duplicate", leadId: dup[1]! };
  const task = /task_required:(.*)$/m.exec(message);
  if (task) return { kind: "task", stage: task[1]!.trim() };
  const note = /note_required:(.*)$/m.exec(message);
  if (note) return { kind: "note", stage: note[1]!.trim() };
  return null;
}
