import { runChatRounds, type ChatEvent, type GeminiContent } from "@/lib/ai-chat-rounds.server";

// Gemini's streamGenerateContent body: server-sent events, one JSON chunk
// per "data:" line, split across network reads at awkward places.
function sse(chunks: unknown[], splitAt = 7): Response {
  const text = chunks.map((c) => `data: ${JSON.stringify(c)}\r\n\r\n`).join("");
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += splitAt)
        controller.enqueue(bytes.slice(i, i + splitAt));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const textChunk = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

async function run(
  responses: Response[],
  runTool: ((n: string) => Promise<unknown>) | null = null,
) {
  const calls: { url: string; body: { contents: GeminiContent[] } }[] = [];
  const queue = [...responses];
  globalThis.fetch = (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return queue.shift()!;
  }) as unknown as typeof fetch;
  const events: ChatEvent[] = [];
  await runChatRounds({
    apiKey: "k",
    systemPrompt: "sys",
    contents: [{ role: "user", parts: [{ text: "salom" }] }],
    functionDeclarations: [],
    runTool,
    emit: (e) => events.push(e),
  });
  return { calls, events };
}

describe("AI chat rounds", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("streams text deltas as they arrive, then done", async () => {
    const { calls, events } = await run([sse([textChunk("Assalomu "), textChunk("alaykum!")])]);
    expect(calls[0]!.url).toContain(":streamGenerateContent?alt=sse&key=k");
    expect(events).toEqual([
      { t: "delta", text: "Assalomu " },
      { t: "delta", text: "alaykum!" },
      { t: "done" },
    ]);
  });

  it("runs tools between rounds and sends the call back with its signature", async () => {
    const call = {
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: "list_tasks", args: {} }, thoughtSignature: "sig" }],
          },
        },
      ],
    };
    const { calls, events } = await run(
      [sse([call]), sse([textChunk("3 ta vazifa bor.")])],
      async () => ({ count: 3 }),
    );
    expect(events.map((e) => e.t)).toEqual(["status", "delta", "done"]);
    const second = calls[1]!.body.contents;
    expect(second[1]).toEqual({ role: "model", parts: call.candidates[0]!.content.parts });
    expect(second[2]).toEqual({
      role: "user",
      parts: [{ functionResponse: { name: "list_tasks", response: { count: 3 } } }],
    });
  });

  it("asks again without the thinking setting when a model rejects it", async () => {
    const rejected = new Response('{"error":{"message":"Unknown name \\"thinkingLevel\\""}}', {
      status: 400,
    });
    const { calls, events } = await run([rejected, sse([textChunk("ok")])]);
    expect(calls[0]!.body).toHaveProperty("generationConfig.thinkingConfig");
    expect(calls[1]!.body).not.toHaveProperty("generationConfig.thinkingConfig");
    expect(events.at(-1)).toEqual({ t: "done" });
  });

  it("reports an empty or blocked answer instead of a blank bubble", async () => {
    const { events } = await run([sse([{ promptFeedback: { blockReason: "SAFETY" } }])]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ t: "error" });
    expect((events[0] as { error: string }).error).toContain("SAFETY");
  });

  it("does not stream thought summaries", async () => {
    const { events } = await run([
      sse([
        { candidates: [{ content: { parts: [{ text: "reasoning…", thought: true }] } }] },
        textChunk("Javob"),
      ]),
    ]);
    expect(events).toEqual([{ t: "delta", text: "Javob" }, { t: "done" }]);
  });
});
