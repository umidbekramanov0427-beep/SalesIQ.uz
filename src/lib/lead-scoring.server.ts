import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callGemini } from "@/lib/gemini.server";
import { orgHasFeature } from "@/lib/org-access";
import { loadOrgAccess } from "@/lib/org-access.server";
import {
  chatTranscript,
  heuristicScore,
  parseAiScore,
  type ChatMessage,
  type Heuristic,
} from "@/lib/lead-scoring";

// Scores a lead from its Telegram chat: the rules in lead-scoring.ts, and
// for companies with AI analytics in their plan, Gemini reading the chat
// with the rules' result as a hint. Writes leads.score / temperature and
// why (ai_score_reason, ai_next_action). Run for leads whose client wrote
// something new (5-minute cron) and on "Qayta baholash" in the lead card.
// A call analysed after the last chat message keeps its own score.

const PER_TICK = 12;

async function aiScore(
  transcript: string,
  hint: Heuristic,
  budget: number,
): Promise<Heuristic | null> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey || !transcript.trim()) return null;
  const prompt =
    `Sen savdo bo'limi uchun lidlarni baholovchi tahlilchisan. Quyida mijoz bilan Telegram yozishmasi.\n` +
    `Mijoz xarid qilish ehtimolini 0-100 ball bilan bahola (70+ issiq, 40-69 iliq, <40 sovuq).\n` +
    `Qoidalarga asoslangan dastlabki baho: ${hint.score} (${hint.reasons.join("; ") || "sabab yo'q"}).\n` +
    (budget > 0 ? `Lid byudjeti: ${budget} so'm.\n` : "") +
    `Faqat JSON qaytar: {"score": son, "reasons": ["qisqa sabab", ...ko'pi bilan 3 ta, o'zbek tilida], "next_action": "menejer hozir nima qilishi kerak, bitta qisqa jumla, o'zbek tilida"}.\n\n` +
    `Yozishma:\n${transcript}`;
  try {
    const res = await callGemini(
      apiKey,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      },
      20_000,
      { retryDelaysMs: [800], fallbackRetryDelaysMs: [] },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return parseAiScore(JSON.parse(text));
  } catch {
    return null;
  }
}

export type ScoreResult = Heuristic & { source: "ai" | "rules" };

/** Scores one lead now and saves it; null when the lead isn't found. */
export async function scoreLead(leadId: string, orgId: string): Promise<ScoreResult | null> {
  const [{ data: lead }, { data: msgs }, { data: lastCall }] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .select("id, organization_id, budget, stage_id")
      .eq("id", leadId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabaseAdmin
      .from("lead_telegram_messages")
      .select("direction, text, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabaseAdmin
      .from("amocrm_calls")
      .select("analyzed_at")
      .eq("lead_id", leadId)
      .not("analyzed_at", "is", null)
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!lead) return null;
  const messages = ((msgs ?? []) as ChatMessage[]).reverse();
  const { data: stage } = lead.stage_id
    ? await supabaseAdmin
        .from("pipeline_stages")
        .select("probability")
        .eq("id", lead.stage_id)
        .maybeSingle()
    : { data: null };
  const hint = heuristicScore({
    messages,
    budget: Number(lead.budget) || 0,
    stageProbability: stage?.probability ?? null,
  });

  const access = await loadOrgAccess(orgId);
  const ai =
    access && orgHasFeature(access, "analytics")
      ? await aiScore(chatTranscript(messages), hint, Number(lead.budget) || 0)
      : null;
  const result: ScoreResult = ai
    ? {
        ...ai,
        reasons: ai.reasons.length ? ai.reasons : hint.reasons,
        nextAction: ai.nextAction || hint.nextAction,
        source: "ai",
      }
    : { ...hint, source: "rules" };

  // An analysed call newer than the chat already set a fresher score.
  const lastMsgAt = messages.at(-1)?.created_at;
  const callIsFresher = !!lastCall?.analyzed_at && (!lastMsgAt || lastCall.analyzed_at > lastMsgAt);
  await supabaseAdmin
    .from("leads")
    .update({
      ...(callIsFresher ? {} : { score: result.score, temperature: result.temperature }),
      ai_score_reason: result.reasons.join("\n") || null,
      ai_next_action: result.nextAction || null,
      ai_scored_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  return result;
}

/** Called by the 5-minute cron: scores leads whose client wrote something new. */
export async function runLeadScoring(): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("leads_to_score", { p_limit: PER_TICK });
  if (error || !data?.length) return 0;
  let done = 0;
  for (const row of data as { lead_id: string; organization_id: string }[]) {
    const r = await scoreLead(row.lead_id, row.organization_id).catch(() => null);
    if (r) done++;
  }
  return done;
}
