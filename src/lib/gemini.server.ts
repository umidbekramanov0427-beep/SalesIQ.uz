// Shared Gemini generateContent caller for every server route that talks
// to it (audio transcription + scoring, the AI assistant's tool-calling
// loop, the daily report narrative). gemini-3.6-flash alone was observed
// returning 503 "This model is currently experiencing high demand" on
// roughly every attempt over several minutes -- a demand spike, not a
// one-off, so a couple of in-request retries against the same model
// wouldn't have helped. Falling through to other model versions on
// exactly that failure mode (and only that one -- a 400/401/etc. would
// fail identically on every model, so there's no point burning through
// the whole list for those) turns a sustained provider-side overload into
// a transparent success instead of a wall of retries for the user.
const GEMINI_MODEL_FALLBACKS = [
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
] as const;

export async function callGemini(
  apiKey: string,
  body: unknown,
  timeoutMs: number,
): Promise<Response> {
  let lastError: unknown;
  let lastRes: Response | undefined;

  for (const model of GEMINI_MODEL_FALLBACKS) {
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
      if (res.ok || (res.status !== 503 && res.status !== 429)) return res;
      lastRes = res;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastRes) return lastRes;
  throw lastError;
}
