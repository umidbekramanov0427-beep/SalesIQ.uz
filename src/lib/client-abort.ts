// A caller that hangs up before its request has fully arrived (amoCRM or a
// PBX timing out on a webhook, a closed browser tab) makes Node fail the
// request body with `Error: aborted` (code ECONNRESET). Nobody is left to
// answer and nothing on our side broke, so server.ts does not report it as
// a server error.

const CAUSE_DEPTH_LIMIT = 5;

/** True when `error` (or one of its causes) is Node's "client went away" error. */
export function isClientAbort(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < CAUSE_DEPTH_LIMIT && current instanceof Error; depth++) {
    const { code } = current as { code?: unknown };
    if (current.message === "aborted" && (code === undefined || code === "ECONNRESET")) {
      return true;
    }
    current = current.cause;
  }
  return false;
}
