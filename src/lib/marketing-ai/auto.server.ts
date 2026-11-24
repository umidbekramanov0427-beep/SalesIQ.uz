// Server-only. The AI tahlilchi working by itself (Sozlash -> AI -> Avtomatik
// tahlil), from the 5-minute /telegram/send-daily-report cron:
//   * "Har kuni": once a day after 09:00 Tashkent, the last 7 days;
//   * "Vebinardan keyin": once per webinar, 10+ minutes after it ended (its
//     last counts are in), the last 7 days with that webinar.
// The findings are kept like a pressed "Tahlil qilish" (the page shows the
// last one) and sent through the company's marketing bot to the marketing
// people who opened it. Each run is claimed once in marketing_bot_log, so a
// failed AI call (limit reached, provider down) is not retried every tick.
//
// Also: the AI's guess of what a stream frame shows (Kuzatuv -> "AI
// taxmini"), saved as an unconfirmed moment until someone confirms it.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { analyze } from "@/lib/marketing-ai/analyst.server";
import {
  dailyRunKey,
  findingsText,
  guessIsNew,
  lastDays,
  parseVisionGuess,
  VISION_SYSTEM,
} from "@/lib/marketing-ai/auto";
import { aiCall, AiUnavailable, parseJsonReply } from "@/lib/marketing-ai/provider.server";
import { notifyMarketingStaff } from "@/lib/marketing-bot/bot.server";
import { marketingRulesFor, rulesOf } from "@/lib/marketing-rules.server";
import { nextSeq, type EventKind } from "@/lib/webinar-timeline";

/** At most this many AI runs per tick (each one is an AI call). */
const MAX_RUNS = 5;

async function claim(orgId: string, key: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("marketing_bot_log")
    .insert({ organization_id: orgId, key });
  return !error;
}

async function runOne(
  orgId: string,
  scope: { from: string; to: string; webinarId?: string },
  title: string,
): Promise<void> {
  try {
    const res = await analyze(orgId, scope, null);
    const text = findingsText(res.findings, res.period, { title });
    if (text) await notifyMarketingStaff(orgId, text);
  } catch (err) {
    if (err instanceof AiUnavailable) {
      console.warn("[marketing-ai] auto skipped", orgId, err.code);
      return;
    }
    console.error("[marketing-ai] auto run failed", orgId, err);
  }
}

export async function runMarketingAiAuto(now = new Date()): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("marketing_ai_settings")
    .select("organization_id, frequency")
    .eq("enabled", true)
    .in("frequency", ["daily", "after_webinar"]);
  if (error || !data?.length) return 0; // before migration 20270128, or nobody asked
  let runs = 0;
  const daily = dailyRunKey(now);
  const afterWebinar = data.filter((s) => s.frequency === "after_webinar");
  for (const s of data) {
    if (runs >= MAX_RUNS) break;
    if (s.frequency !== "daily" || !daily) continue;
    if (!(await claim(s.organization_id, daily))) continue;
    runs++;
    await runOne(s.organization_id, lastDays(now), "Kunlik AI tahlil");
  }
  if (afterWebinar.length && runs < MAX_RUNS) {
    const { data: ended } = await supabaseAdmin
      .from("marketing_webinars")
      .select("id, organization_id, title")
      .in(
        "organization_id",
        afterWebinar.map((s) => s.organization_id),
      )
      .eq("status", "ended")
      .is("archived_at", null)
      .gte("ended_at", new Date(now.getTime() - 6 * 3_600_000).toISOString())
      .lte("ended_at", new Date(now.getTime() - 10 * 60_000).toISOString())
      .limit(50);
    for (const w of ended ?? []) {
      if (runs >= MAX_RUNS) break;
      if (!(await claim(w.organization_id, `ai:webinar:${w.id}`))) continue;
      runs++;
      await runOne(
        w.organization_id,
        { ...lastDays(now), webinarId: w.id },
        `AI tahlil: ${w.title}`,
      );
    }
  }
  return runs;
}

/* ---- What a stream frame shows ------------------------------------------ */

function toBase64(data: Uint8Array | ArrayBuffer): string {
  return Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data).toString("base64");
}

/**
 * A new frame of a live webinar: when the company turned on "AI taxmini",
 * the AI says which moment it shows (prices, timer, presentation, Q&A,
 * lesson). A sure, new guess goes onto the webinar's console by itself
 * (marked as found by AI; a wrong one is deleted there). Returns the kind
 * added, if any.
 */
export async function guessFromShot(input: {
  orgId: string;
  webinarId: string;
  shotId: string;
  at: Date;
  image: { data: Uint8Array | ArrayBuffer; type: string };
}): Promise<EventKind | null> {
  const rules = rulesOf(await marketingRulesFor([input.orgId]), input.orgId);
  if (!rules.shots.aiGuess) return null;
  let reply;
  try {
    reply = await aiCall(input.orgId, "vision", {
      system: VISION_SYSTEM,
      messages: [{ role: "user", content: "Vebinar efiridan kadr:" }],
      json: true,
      image: { data: toBase64(input.image.data), type: input.image.type },
    });
  } catch (err) {
    if (err instanceof AiUnavailable) return null;
    throw err;
  }
  const guess = parseVisionGuess(parseJsonReply(reply.text));
  if (!guess) return null;
  const { data: marks } = await supabaseAdmin
    .from("marketing_webinar_marks")
    .select("id, kind, seq, at")
    .eq("webinar_id", input.webinarId);
  const rows = marks ?? [];
  const at = input.at.toISOString();
  if (!guessIsNew({ kind: guess.kind, seq: guess.seq, at }, rows)) return null;
  const seq =
    guess.kind === "timer"
      ? (guess.seq ??
        nextSeq(
          rows.map((r) => ({
            id: r.id,
            at: r.at,
            kind: r.kind as EventKind,
            seq: r.seq,
            label: null,
          })),
          "timer",
        ))
      : null;
  const { error } = await supabaseAdmin.from("marketing_webinar_marks").insert({
    webinar_id: input.webinarId,
    organization_id: input.orgId,
    kind: guess.kind,
    at,
    seq,
    auto: true,
    ai_guess: true,
    confirmed: true,
    shot_id: input.shotId,
    meta: { confidence: guess.confidence, note: guess.note } as never,
  });
  if (error) {
    console.error("[marketing-ai] guess mark", error.message);
    return null;
  }
  return guess.kind;
}
