import { callGemini, describeGeminiFailure } from "@/lib/gemini.server";

// The AI assistant's model loop (ai-assistant.chat.ts), kept apart from the
// route so it can be tested with a stubbed fetch.

export type GeminiPart =
  | { text: string; thought?: boolean }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

export type ChatEvent =
  | { t: "delta"; text: string }
  | { t: "status"; text: string }
  | { t: "done" }
  | { t: "error"; error: string };

// Chat budget: a busy model fails over to the next one within seconds.
const CHAT_GEMINI: { timeoutMs: number; retryDelaysMs: number[]; fallbackRetryDelaysMs: number[] } =
  {
    timeoutMs: 20_000,
    retryDelaysMs: [800],
    fallbackRetryDelaysMs: [800],
  };

/** Reads Gemini's server-sent events stream, one parsed JSON chunk at a time. */
export async function* readGeminiStream(res: Response): AsyncGenerator<GeminiStreamChunk> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      try {
        yield JSON.parse(line.slice(5).trim()) as GeminiStreamChunk;
      } catch {
        // A malformed keep-alive line; skip it.
      }
    }
  }
}

type GeminiStreamChunk = {
  candidates?: {
    content?: { parts?: (GeminiPart & { thought?: boolean })[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
};

// One model call per round: a round either answers (text, streamed to the
// browser as it arrives) or asks for tools, which run before the next round.
// Up to 4 rounds, since a request can chain a couple of tools (search, then
// act). Parts are sent back exactly as received so Gemini's thought
// signatures on function calls survive.
export async function runChatRounds(input: {
  apiKey: string;
  systemPrompt: string;
  contents: GeminiContent[];
  functionDeclarations: unknown[];
  // Runs one tool call; null when the caller has no company (no tools).
  runTool: ((name: string, args: Record<string, unknown>) => Promise<unknown>) | null;
  emit: (event: ChatEvent) => void;
}): Promise<void> {
  const { apiKey, systemPrompt, contents, functionDeclarations, runTool, emit } = input;
  let lowThinking = true;
  for (let round = 0; round < 4; round++) {
    const request = (thinking: boolean) =>
      callGemini(
        apiKey,
        {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools: [{ functionDeclarations }],
          generationConfig: {
            temperature: 0.4,
            ...(thinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
          },
        },
        CHAT_GEMINI.timeoutMs,
        { ...CHAT_GEMINI, stream: true },
      );

    let res: Response;
    try {
      res = await request(lowThinking);
      // A model that doesn't know the thinking setting rejects it with a
      // 400; ask again without it (and stop sending it for this chat).
      if (res.status === 400 && lowThinking) {
        const text = await res.text();
        if (!/thinking/i.test(text)) {
          emit({ t: "error", error: describeGeminiFailure(400, text) });
          return;
        }
        lowThinking = false;
        res = await request(false);
      }
    } catch {
      emit({ t: "error", error: "AI yordamchi javob bermadi (timeout). Qayta urinib ko'ring." });
      return;
    }
    if (!res.ok || !res.body) {
      emit({ t: "error", error: describeGeminiFailure(res.status, await res.text()) });
      return;
    }

    const parts: GeminiPart[] = [];
    let wroteText = false;
    let finishReason: string | undefined;
    let blockReason: string | undefined;
    for await (const chunk of readGeminiStream(res)) {
      blockReason ??= chunk.promptFeedback?.blockReason;
      const candidate = chunk.candidates?.[0];
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      for (const part of candidate?.content?.parts ?? []) {
        parts.push(part);
        if ("text" in part && part.text && !part.thought) {
          wroteText = true;
          emit({ t: "delta", text: part.text });
        }
      }
    }

    const functionCalls = parts.filter(
      (p): p is { functionCall: { name: string; args?: Record<string, unknown> } } =>
        "functionCall" in p,
    );
    if (functionCalls.length > 0 && runTool) {
      contents.push({ role: "model", parts });
      emit({ t: "status", text: "tools" });
      const responseParts: GeminiPart[] = [];
      for (const call of functionCalls) {
        const result = await runTool(call.functionCall.name, call.functionCall.args ?? {});
        responseParts.push({
          functionResponse: {
            name: call.functionCall.name,
            response:
              result && typeof result === "object"
                ? (result as Record<string, unknown>)
                : { result },
          },
        });
      }
      contents.push({ role: "user", parts: responseParts });
      continue;
    }

    if (!wroteText) {
      // HTTP 200 with nothing usable: a blocked prompt/response or an odd
      // finish reason. Said out loud instead of an empty bubble.
      const reason = blockReason ?? finishReason ?? "unknown";
      emit({
        t: "error",
        error: `AI yordamchi javob bera olmadi (sabab: ${reason}). Qayta urinib ko'ring.`,
      });
      return;
    }
    emit({ t: "done" });
    return;
  }
  emit({ t: "error", error: "AI yordamchi javob bera olmadi. Qayta urinib ko'ring." });
}
