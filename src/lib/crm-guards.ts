// The two rules the database enforces on leads, recognised from the error
// it raises so the UI can respond with the right dialog instead of a raw
// message: "duplicate_in_funnel:<lead id>" (the client already has a lead in
// this funnel) and "task_required:<stage name>" (the stage needs an open
// task first).

export type GuardError = { kind: "duplicate"; leadId: string } | { kind: "task"; stage: string };

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
  return null;
}
