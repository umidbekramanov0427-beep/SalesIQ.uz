// Shared Gemini generateContent caller for every server route that talks
// to it (audio transcription + scoring, the AI assistant's tool-calling
// loop, the daily report narrative). gemini-3.6-flash alone was observed
// returning 503 "This model is currently experiencing high demand" on
// roughly every attempt over several minutes -- a demand spike, not a
// one-off, so a single request needs actual retries with backoff to ride
// it out, not just one shot.
//
// A same-file model-fallback list was tried first, but the obvious
// candidate (gemini-2.5-flash) turned out to be hard-deprecated for this
// account: it 404s immediately with "no longer available to new users...
// use gemini-3.6-flash". So there's currently no second real model to
// fall back to -- gemini-flash-latest is kept as a last-ditch attempt in
// case it resolves to something usable, but the real fix is persistence
// on the one model that actually works.
const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-flash-latest"] as const;
const OVERLOAD_STATUSES = new Set([503, 429]);
// Retry delays for an overloaded model, in ms -- 3 retries (~9.5s added
// worst case) before giving up on that model and trying the next one.
const RETRY_DELAYS_MS = [1500, 3000, 5000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callGemini(
  apiKey: string,
  body: unknown,
  timeoutMs: number,
): Promise<Response> {
  let lastError: unknown;
  let lastRes: Response | undefined;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]!);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );
        if (res.ok) return res;
        if (OVERLOAD_STATUSES.has(res.status)) {
          // Genuinely overloaded -- worth retrying the same model; it's
          // usually back within seconds.
          lastRes = res;
          continue;
        }
        if (res.status === 404) {
          // This model doesn't exist/isn't available for this account --
          // no amount of retrying it will help, move straight to the next
          // model instead of burning the retry budget on it.
          lastRes = res;
          break;
        }
        // Anything else (400 bad request, 401/403 bad key, etc.) will
        // fail identically on every model and every retry -- return it
        // immediately instead of pretending another attempt might help.
        return res;
      } catch (err) {
        // Network error or our own timeout aborting -- try the next model.
        lastError = err;
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  if (lastRes) return lastRes;
  throw lastError;
}
