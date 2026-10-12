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
// The first (real) model gets the bulk of the retry budget -- ~54s of
// backoff, since the observed demand spikes have lasted well past the
// ~9.5s the previous 3-retry budget gave it and came back as the exact
// same error. The second model is an alias of uncertain value (it may
// just point at the same overloaded capacity), so it only gets a couple
// of quick attempts rather than repeating the full ladder. Vite's nitro
// config raises the function's own maxDuration to cover this.
const PRIMARY_RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 24000];
const FALLBACK_RETRY_DELAYS_MS = [2000, 4000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type CallGeminiOptions = {
  // Waits between retries of an overloaded model (first model / fallback).
  // Interactive callers (the chat) pass short ones so a busy model fails
  // over in seconds instead of minutes.
  retryDelaysMs?: number[];
  fallbackRetryDelaysMs?: number[];
  // streamGenerateContent with server-sent events: the response body is a
  // stream of "data: {...}" chunks. timeoutMs then covers getting the
  // response headers, not reading the whole stream.
  stream?: boolean;
};

export async function callGemini(
  apiKey: string,
  body: unknown,
  timeoutMs: number,
  options: CallGeminiOptions = {},
): Promise<Response> {
  let lastError: unknown;
  let lastRes: Response | undefined;
  const method = options.stream ? "streamGenerateContent?alt=sse&" : "generateContent?";

  for (const [modelIndex, model] of GEMINI_MODELS.entries()) {
    const retryDelays =
      modelIndex === 0
        ? (options.retryDelaysMs ?? PRIMARY_RETRY_DELAYS_MS)
        : (options.fallbackRetryDelaysMs ?? FALLBACK_RETRY_DELAYS_MS);
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      if (attempt > 0) await sleep(retryDelays[attempt - 1]!);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}key=${apiKey}`,
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

/** A user-facing message for a Gemini response that survived callGemini's full retry budget -- 503/429 means every model is still overloaded, which the raw JSON body doesn't communicate to a non-technical user. Other statuses (400 bad request, 401/403 bad key) are real bugs, so their detail is kept for whoever reads the error. */
export function describeGeminiFailure(status: number, rawBody: string): string {
  if (status === 503 || status === 429) {
    return "AI xizmati hozir juda band (yuqori talab). Bir necha daqiqadan so'ng qaytadan urinib ko'ring.";
  }
  return `Gemini error (${status}): ${rawBody}`;
}
