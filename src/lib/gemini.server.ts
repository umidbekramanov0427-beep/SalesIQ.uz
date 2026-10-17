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
  if (status === 429) {
    // Usually the API key's quota (requests per minute/day), not load.
    return `AI xizmati hozir juda band (429: Gemini kaliti limiti). ${rawBody.slice(0, 200)}`;
  }
  if (status === 503) {
    return "AI xizmati hozir juda band (503: yuqori talab). Bir necha daqiqadan so'ng qaytadan urinib ko'ring.";
  }
  return `Gemini error (${status}): ${rawBody}`;
}

/**
 * Uploads audio to the Gemini Files API and returns its file_uri. For
 * recordings too big to send inline: a request carries at most ~20 MB, and
 * base64 adds a third, so anything over ~14 MB of audio has to go this way.
 * Resumable protocol, start + upload/finalize in one go; audio needs no
 * processing, but the state is polled briefly in case it reports PROCESSING.
 */
export async function uploadGeminiFile(
  apiKey: string,
  bytes: Uint8Array,
  mimeType: string,
  displayName: string,
): Promise<string> {
  const start = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "content-type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    },
  );
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) {
    throw new Error(
      `Gemini file upload failed to start (${start.status}): ${(await start.text()).slice(0, 200)}`,
    );
  }
  const done = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
    },
    body: new Blob([bytes as BlobPart]),
  });
  if (!done.ok) {
    throw new Error(
      `Gemini file upload failed (${done.status}): ${(await done.text()).slice(0, 200)}`,
    );
  }
  const json = (await done.json()) as { file?: { name?: string; uri?: string; state?: string } };
  const file = json.file;
  if (!file?.uri || !file.name) throw new Error("Gemini file upload returned no file.");
  let state = file.state;
  for (let i = 0; state === "PROCESSING" && i < 10; i++) {
    await sleep(1000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${apiKey}`,
    );
    state = res.ok ? ((await res.json()) as { state?: string }).state : state;
  }
  if (state === "FAILED") throw new Error("Gemini could not read the uploaded recording.");
  return file.uri;
}
