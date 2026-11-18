// Server-only. The AI tahlilchi's one door to a model. By default the
// platform's Gemini (GEMINI_API_KEY); a company may choose Claude or OpenAI
// with its own key (Marketing -> Sozlash -> AI -> Qo'shimcha), sealed on the
// server. Every call's tokens and cost go to marketing_ai_usage; the
// company's daily / monthly limit stops calls once spent. Plain fetch --
// no SDK packages (bun.lock).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callGemini } from "@/lib/gemini.server";
import { openSecret, sealSecret } from "@/lib/secret-box.server";

export type Provider = "gemini" | "anthropic" | "openai";
export type Feature = "analysis" | "chat" | "forecast" | "webinar" | "vision";

export const DEFAULT_MODEL: Record<Provider, string> = {
  gemini: "gemini-3.6-flash",
  anthropic: "claude-opus-5-5",
  openai: "gpt-5-mini",
};

/** USD per 1M tokens (input, output). Unknown models use the provider's row. */
const PRICES: Record<string, [number, number]> = {
  "gemini-3.6-flash": [0.3, 2.5],
  "gemini-flash-latest": [0.3, 2.5],
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-opus-4-8": [5, 25],
  "gpt-5-mini": [0.25, 2],
};
const PROVIDER_PRICE: Record<Provider, [number, number]> = {
  gemini: [0.3, 2.5],
  anthropic: [4, 20],
  openai: [1.25, 10],
};

export function costUsd(provider: Provider, model: string, input: number, output: number) {
  const [i, o] = PRICES[model] ?? PROVIDER_PRICE[provider];
  return (input * i + output * o) / 1_000_000;
}

export type AiSettings = {
  enabled: boolean;
  provider: Provider;
  model: string | null;
  keyLast4: string | null;
  hasKey: boolean;
  dailyLimitUsd: number | null;
  monthlyLimitUsd: number | null;
  frequency: "manual" | "daily" | "after_webinar";
  ready: boolean;
};

const DEFAULTS: AiSettings = {
  enabled: true,
  provider: "gemini",
  model: null,
  keyLast4: null,
  hasKey: false,
  dailyLimitUsd: null,
  monthlyLimitUsd: null,
  frequency: "manual",
  ready: true,
};

export async function aiSettings(orgId: string): Promise<AiSettings & { key: string | null }> {
  const { data, error } = await supabaseAdmin
    .from("marketing_ai_settings")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) return { ...DEFAULTS, ready: false, key: null };
  if (!data) return { ...DEFAULTS, key: null };
  return {
    enabled: data.enabled,
    provider: (data.provider as Provider) ?? "gemini",
    model: data.model,
    keyLast4: data.key_last4,
    hasKey: !!data.key_sealed,
    dailyLimitUsd: data.daily_limit_usd != null ? Number(data.daily_limit_usd) : null,
    monthlyLimitUsd: data.monthly_limit_usd != null ? Number(data.monthly_limit_usd) : null,
    frequency: (data.frequency as AiSettings["frequency"]) ?? "manual",
    ready: true,
    key: data.key_sealed ? openSecret(data.key_sealed) : null,
  };
}

export async function saveAiSettings(
  orgId: string,
  by: string,
  input: {
    enabled?: boolean;
    provider?: Provider;
    model?: string | null;
    key?: string | null;
    clearKey?: boolean;
    dailyLimitUsd?: number | null;
    monthlyLimitUsd?: number | null;
    frequency?: AiSettings["frequency"];
  },
): Promise<void> {
  const provider =
    input.provider && ["gemini", "anthropic", "openai"].includes(input.provider)
      ? input.provider
      : undefined;
  const limit = (v: number | null | undefined) =>
    v === undefined
      ? undefined
      : v == null || !Number.isFinite(v) || v <= 0
        ? null
        : Math.round(v * 100) / 100;
  const key = input.key?.trim();
  const patch: Record<string, unknown> = {
    organization_id: orgId,
    updated_by: by,
    updated_at: new Date().toISOString(),
  };
  if (input.enabled !== undefined) patch["enabled"] = !!input.enabled;
  if (provider) patch["provider"] = provider;
  if (input.model !== undefined) patch["model"] = input.model?.trim().slice(0, 80) || null;
  if (key) {
    patch["key_sealed"] = sealSecret(key);
    patch["key_last4"] = key.slice(-4);
  } else if (input.clearKey) {
    patch["key_sealed"] = null;
    patch["key_last4"] = null;
  }
  const d = limit(input.dailyLimitUsd);
  const m = limit(input.monthlyLimitUsd);
  if (d !== undefined) patch["daily_limit_usd"] = d;
  if (m !== undefined) patch["monthly_limit_usd"] = m;
  if (input.frequency && ["manual", "daily", "after_webinar"].includes(input.frequency))
    patch["frequency"] = input.frequency;
  const { error } = await supabaseAdmin
    .from("marketing_ai_settings")
    .upsert(patch as never, { onConflict: "organization_id" });
  if (error) throw error;
}

/** Spent today and this month (Tashkent), USD. */
export async function spentUsd(orgId: string, now = new Date()) {
  const local = new Date(now.getTime() + 5 * 3_600_000);
  const day = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 5 * 3_600_000,
  );
  const month = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 5 * 3_600_000);
  const { data } = await supabaseAdmin
    .from("marketing_ai_usage")
    .select("at, cost_usd, input_tokens, output_tokens, feature, ok")
    .eq("organization_id", orgId)
    .gte("at", month.toISOString())
    .limit(20_000);
  let today = 0;
  let monthUsd = 0;
  let tokens = 0;
  let calls = 0;
  let errors = 0;
  for (const r of data ?? []) {
    const c = Number(r.cost_usd || 0);
    monthUsd += c;
    if (r.at >= day.toISOString()) today += c;
    tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
    calls++;
    if (!r.ok) errors++;
  }
  return { today, month: monthUsd, tokens, calls, errors };
}

export class AiUnavailable extends Error {
  constructor(
    public code: "disabled" | "limit_day" | "limit_month" | "no_key" | "migration",
    msg: string,
  ) {
    super(msg);
  }
}

export type AiReply = {
  text: string;
  provider: Provider;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

type Msg = { role: "user" | "assistant"; content: string };

async function callProvider(
  provider: Provider,
  model: string,
  key: string,
  system: string,
  messages: Msg[],
  json: boolean,
  image?: { data: string; type: string },
): Promise<AiReply> {
  if (provider === "gemini") {
    const contents = messages.map((m, i) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        ...(image && i === messages.length - 1
          ? [{ inline_data: { mime_type: image.type, data: image.data } }]
          : []),
        { text: m.content },
      ],
    }));
    const res = await callGemini(
      key,
      {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          temperature: 0.3,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      },
      60_000,
      { retryDelaysMs: [1500], fallbackRetryDelaysMs: [1500] },
    );
    const j = (await res.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
      };
      modelVersion?: string;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(j.error?.message || `Gemini ${res.status}`);
    const text = (j.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    return {
      text,
      provider,
      model: j.modelVersion || model,
      inputTokens: j.usageMetadata?.promptTokenCount ?? 0,
      outputTokens:
        (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0),
    };
  }
  if (provider === "anthropic") {
    const content = (m: Msg, last: boolean) =>
      image && last
        ? [
            { type: "image", source: { type: "base64", media_type: image.type, data: image.data } },
            { type: "text", text: m.content },
          ]
        : m.content;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        // A policy decline is re-run on another model inside the same call.
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16_000,
        system,
        output_config: { effort: "medium" },
        fallbacks: "default",
        messages: messages.map((m, i) => ({
          role: m.role,
          content: content(m, i === messages.length - 1),
        })),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const j = (await res.json().catch(() => ({}))) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
      stop_reason?: string;
      model?: string;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(j.error?.message || `Claude ${res.status}`);
    if (j.stop_reason === "refusal") throw new Error("Model so'rovni rad etdi");
    const text = (j.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    return {
      text,
      provider,
      model: j.model || model,
      inputTokens: (j.usage?.input_tokens ?? 0) + (j.usage?.cache_read_input_tokens ?? 0),
      outputTokens: j.usage?.output_tokens ?? 0,
    };
  }
  // OpenAI chat completions.
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        ...messages.map((m, i) =>
          image && i === messages.length - 1
            ? {
                role: m.role,
                content: [
                  {
                    type: "image_url",
                    image_url: { url: `data:${image.type};base64,${image.data}` },
                  },
                  { type: "text", text: m.content },
                ],
              }
            : m,
        ),
      ],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const j = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(j.error?.message || `OpenAI ${res.status}`);
  return {
    text: j.choices?.[0]?.message?.content?.trim() ?? "",
    provider,
    model: j.model || model,
    inputTokens: j.usage?.prompt_tokens ?? 0,
    outputTokens: j.usage?.completion_tokens ?? 0,
  };
}

/**
 * One AI call for a company: checks it is on and within its limits, uses its
 * own provider/key (or the platform's Gemini), logs tokens and cost (also
 * a failure, with its error).
 */
export async function aiCall(
  orgId: string,
  feature: Feature,
  req: { system: string; messages: Msg[]; json?: boolean; image?: { data: string; type: string } },
  profileId: string | null = null,
): Promise<AiReply> {
  const s = await aiSettings(orgId);
  if (!s.ready)
    throw new AiUnavailable("migration", "AI uchun bazani yangilash kerak (migratsiya 20270128)");
  if (!s.enabled) throw new AiUnavailable("disabled", "AI tahlil o'chirilgan (Sozlash → AI)");
  if (s.dailyLimitUsd != null || s.monthlyLimitUsd != null) {
    const spent = await spentUsd(orgId);
    if (s.dailyLimitUsd != null && spent.today >= s.dailyLimitUsd)
      throw new AiUnavailable("limit_day", `Kunlik AI limiti tugadi ($${s.dailyLimitUsd})`);
    if (s.monthlyLimitUsd != null && spent.month >= s.monthlyLimitUsd)
      throw new AiUnavailable("limit_month", `Oylik AI limiti tugadi ($${s.monthlyLimitUsd})`);
  }
  const provider: Provider = s.key ? s.provider : "gemini";
  const key = s.key ?? process.env["GEMINI_API_KEY"] ?? null;
  if (!key) throw new AiUnavailable("no_key", "AI kaliti sozlanmagan");
  const model = (s.key && s.model) || DEFAULT_MODEL[provider];
  const log = (row: Record<string, unknown>) =>
    supabaseAdmin
      .from("marketing_ai_usage")
      .insert({ organization_id: orgId, feature, provider, profile_id: profileId, ...row } as never)
      .then(
        () => undefined,
        () => undefined,
      );
  try {
    const r = await callProvider(
      provider,
      model,
      key,
      req.system,
      req.messages,
      !!req.json,
      req.image,
    );
    await log({
      model: r.model,
      input_tokens: r.inputTokens,
      output_tokens: r.outputTokens,
      cost_usd: costUsd(provider, r.model, r.inputTokens, r.outputTokens),
      ok: true,
    });
    return r;
  } catch (err) {
    await log({
      model,
      ok: false,
      error: (err instanceof Error ? err.message : "error").slice(0, 500),
    });
    throw err;
  }
}

/** A JSON answer: the first {...} block of the reply, parsed. */
export function parseJsonReply<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
