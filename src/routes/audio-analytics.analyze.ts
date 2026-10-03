import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createAmoNote, createAmoTask, hasHumanNoteSince } from "@/lib/amocrm/client.server";
import { callGemini, describeGeminiFailure } from "@/lib/gemini.server";
import { dispatchOutgoingWebhooks } from "@/lib/webhooks/outgoing-webhooks.server";
import { canRunAiAnalysis, loadOrgAccess } from "@/lib/org-access.server";
import { SUBSCRIPTION_EXPIRED_MESSAGE, TRIAL_AI_LIMIT_MESSAGE } from "@/lib/org-access";
import {
  mergeCustomerProfile,
  type CustomerProfileExtract,
  type StoredCustomerProfile,
} from "@/lib/ai-customer-profile";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `Environment o'zgaruvchisi topilmadi: ${name}. Uni Vercel loyihasi -> Settings -> Environment Variables bo'limiga qo'shing.`,
    );
  return value;
}

// None of this route's three outbound calls (recording download, Whisper,
// Gemini) had a timeout -- a stalled connection to any of them left the
// "Tahlil qilish" button spinning forever with no error, the same failure
// mode found and fixed for AmoCRM. Audio transcription genuinely needs more
// headroom than a typical API call, hence the longer default here.
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Maps a downloaded recording's Content-Type to one of the exact mime
// types Gemini's inline audio input accepts -- telephony hosts commonly
// answer with "audio/mpeg" for an mp3 file (the IANA-registered type),
// which isn't the literal string Gemini's docs list ("audio/mp3"), so a
// pass-through would get silently rejected by the API for the single most
// common recording format on this platform.
function toGeminiAudioMimeType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("wav")) return "audio/wav";
  if (ct.includes("ogg")) return "audio/ogg";
  if (ct.includes("aac")) return "audio/aac";
  if (ct.includes("flac")) return "audio/flac";
  if (ct.includes("aiff")) return "audio/aiff";
  return "audio/mp3";
}

// Gemini's multimodal input transcribes audio directly, replacing the
// OpenAI Whisper call this used to make -- same provider ai-assistant.chat.ts
// already uses, and the org's existing GEMINI_API_KEY covers this for free
// (within its quota) instead of needing a separate paid OpenAI balance for
// the exact same "audio -> text" step Gemini can already do.
async function transcribeAudio(recordingUrl: string): Promise<string> {
  const apiKey = requireEnv("GEMINI_API_KEY");

  let audioRes: Response;
  try {
    audioRes = await fetchWithTimeout(recordingUrl, {}, 30_000);
  } catch (err) {
    // fetch() itself throwing (DNS failure, TLS error, connection refused,
    // our own 30s timeout aborting) never reaches the status-code check
    // below -- surface which of those it actually was instead of falling
    // through to the generic "ishlamayapti" message every single time,
    // which is exactly what every prior report of this error looked like
    // (same text, no way to tell timeout from 403 from a dead host).
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Ovoz yozuvini yuklab bo'lmadi -- ulanish xatosi: ${reason}`);
  }
  if (!audioRes.ok) {
    let bodySnippet = "";
    try {
      bodySnippet = (await audioRes.text()).slice(0, 300);
    } catch {
      // best-effort -- the status code alone is still useful without this
    }
    throw new Error(
      `Ovoz yozuvini yuklab bo'lmadi (HTTP ${audioRes.status}${audioRes.statusText ? " " + audioRes.statusText : ""})${bodySnippet ? `: ${bodySnippet}` : ""}`,
    );
  }
  const audioBlob = await audioRes.blob();

  // recording_url is captured once, at sync time, and never refreshed --
  // many telephony providers behind AmoCRM issue signed links that expire
  // after some retention window. An expired link commonly still answers
  // with HTTP 200 (so the !audioRes.ok check above doesn't catch it), just
  // with an HTML "link expired"/placeholder page or an empty body instead
  // of actual audio. Whisper then "transcribes" that garbage instead of
  // failing outright, which is indistinguishable from a real transcription
  // gone wrong -- exactly the kind of silent inaccuracy reported on old
  // (2024-2025) recordings specifically, since recent ones are still fresh.
  // Catch it here with a clear, honest error instead of letting it through.
  const contentType = audioRes.headers.get("content-type") ?? "";
  if (contentType.includes("text/html") || contentType.includes("application/json")) {
    throw new Error(
      "Bu qo'ng'iroq yozuvi havolasi endi ishlamaydi (eskirgan/muddati o'tgan bo'lishi mumkin).",
    );
  }
  if (audioBlob.size < 2000) {
    throw new Error(
      "Ovoz yozuvi juda kichik yoki bo'sh -- havola eskirgan yoki yozuv saqlanmagan bo'lishi mumkin.",
    );
  }

  const mimeType = toGeminiAudioMimeType(contentType);
  const base64Audio = Buffer.from(await audioBlob.arrayBuffer()).toString("base64");

  const res = await callGemini(
    apiKey,
    {
      contents: [
        {
          role: "user",
          parts: [
            {
              // Most calls on this platform are in Uzbek; naming it
              // explicitly (instead of leaving it to auto-detect)
              // measurably improves accuracy for lower-resource
              // languages like Uzbek, same reasoning Whisper's own
              // `language` param used to cover here.
              //
              // [mm:ss] Speaker: lines (real audio timestamps, since Gemini
              // hears the actual audio here) let the scoring pass below
              // attach a genuine timestamp to a checklist item, quote or
              // agreement instead of inventing one -- and the speaker label
              // is what makes "Asosiy iqtiboslar" attributable to the
              // customer specifically, not just "someone said this".
              text: 'Transcribe this audio recording of a phone call verbatim, in Uzbek. Format every line as "[mm:ss] Operator: ..." or "[mm:ss] Mijoz: ..." using the real elapsed time in the recording and your best judgement of who is speaking. Return only the transcript lines, no other commentary.',
            },
            { inline_data: { mime_type: mimeType, data: base64Audio } },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    },
    60_000,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(describeGeminiFailure(res.status, text));
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

type RubricStep = {
  n: number;
  stageId: string;
  stageWeight: number;
  stage: string;
  step: string;
  code: string | null;
  skill: string | null;
  points: number;
  level0: string;
  level1: string;
  level2: string;
  level3: string;
};

// A fixed baseline set of conduct rules every call is checked against,
// separate from the org's own configurable stage/step rubric above -- these
// don't vary funnel to funnel or org to org the way sales technique does,
// so they aren't backed by a settings table like call_stages is.
const SERVICE_STANDARDS = [
  "Vakolatdan tashqari va'da bermaslik",
  "Mijozni bo'lmaslik",
  "Mijozga ismi bilan murojaat qilish",
  "Hurmatli va xushmuomala ohang",
  "Mijoz bilan bahslashmaslik",
];

async function loadRubric(organizationId: string): Promise<RubricStep[]> {
  const { data: stages } = await supabaseAdmin
    .from("call_stages")
    .select("id, name, position, weight_percent")
    .eq("organization_id", organizationId)
    .order("position", { ascending: true });
  if (!stages || stages.length === 0) return [];

  const { data: steps } = await supabaseAdmin
    .from("call_stage_steps")
    .select(
      "stage_id, name, code, skill_id, points, position, level_0_desc, level_1_desc, level_2_desc, level_3_desc",
    )
    .eq("organization_id", organizationId)
    .order("position", { ascending: true });

  const { data: skills } = await supabaseAdmin
    .from("call_skills")
    .select("id, name")
    .eq("organization_id", organizationId);
  const skillNameById = new Map((skills ?? []).map((s) => [s.id, s.name]));

  const rubric: RubricStep[] = [];
  let n = 1;
  for (const stage of stages) {
    const stageSteps = (steps ?? []).filter((s) => s.stage_id === stage.id);
    for (const step of stageSteps) {
      rubric.push({
        n: n++,
        stageId: stage.id,
        stageWeight: Number(stage.weight_percent) || 0,
        stage: stage.name,
        step: step.name,
        code: step.code,
        skill: step.skill_id ? (skillNameById.get(step.skill_id) ?? null) : null,
        points: Number(step.points) || 0,
        level0: step.level_0_desc,
        level1: step.level_1_desc,
        level2: step.level_2_desc,
        level3: step.level_3_desc,
      });
    }
  }
  return rubric;
}

// A configured weighted rubric (call_stages.weight_percent) always beats the
// simple flat point ratio -- each stage's met/unmet ratio is scaled by that
// stage's own weight, then normalized by however the weights actually sum
// (so an org that hasn't finished balancing them to exactly 100 still gets a
// sane score instead of a silently wrong one). Returns null when no stage
// has a weight configured yet, so the caller can fall back to the old flat
// points formula for orgs that haven't set weights up.
function computeWeightedScore(rubric: RubricStep[], metByN: Map<number, boolean>): number | null {
  const stageWeight = new Map<string, number>();
  const stageTotalPoints = new Map<string, number>();
  const stageEarnedPoints = new Map<string, number>();
  for (const r of rubric) {
    stageWeight.set(r.stageId, r.stageWeight);
    stageTotalPoints.set(r.stageId, (stageTotalPoints.get(r.stageId) ?? 0) + r.points);
    if (metByN.get(r.n)) {
      stageEarnedPoints.set(r.stageId, (stageEarnedPoints.get(r.stageId) ?? 0) + r.points);
    }
  }
  const totalWeight = [...stageWeight.values()].reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) return null;

  let weightedScore = 0;
  for (const [stageId, weight] of stageWeight) {
    const total = stageTotalPoints.get(stageId) ?? 0;
    const earned = stageEarnedPoints.get(stageId) ?? 0;
    const ratio = total > 0 ? earned / total : 0;
    weightedScore += ratio * weight;
  }
  return Math.round((weightedScore / totalWeight) * 100);
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function asStringArrayLoose(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// Structured "AI ko'rsatmalari" + "Lid analitikasi" fields configured on
// Baholash mezoni -- rendered into plain instruction text and appended to
// the agent's freeform system_prompt, same idea as the fixed rubric/service
// standards below, just admin-configurable instead of hardcoded.
function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function buildCallInstructionsBlock(callInstructions: unknown): string {
  const root = asRecord(callInstructions);
  const ai = asRecord(root["aiInstructions"]);
  const leadAnalytics = asRecord(root["leadAnalytics"]);

  const transcriptTerms = asStringArrayLoose(ai["transcriptTerms"]);
  const transcriptGuidance = asStr(ai["transcriptGuidance"]);
  const companyContext = asStr(ai["companyContext"]);
  const extractionGuidance = asStr(ai["extractionGuidance"]);
  const taskCreationGuidance = asStr(ai["taskCreationGuidance"]);
  const violationGuidance = asStr(ai["violationGuidance"]);
  const coachingGuidance = asStr(ai["coachingGuidance"]);
  const scoringFocusGuidance = asStr(ai["scoringFocusGuidance"]);
  const qualifiedLeadGuidance = asStr(ai["qualifiedLeadGuidance"]);

  const businessContext = asStr(leadAnalytics["businessContext"]);
  const lossAnalysisGuidance = asStr(leadAnalytics["lossAnalysisGuidance"]);
  const recommendationGuidance = asStr(leadAnalytics["recommendationGuidance"]);

  const parts: string[] = [];
  if (transcriptTerms.length > 0) {
    parts.push(
      "Quyidagi atamalarni transkripsiyada aynan shu ko'rinishda yozing: " +
        transcriptTerms.join(", "),
    );
  }
  if (transcriptGuidance) parts.push(`Transkripsiya bo'yicha ko'rsatma: ${transcriptGuidance}`);
  if (companyContext) parts.push(`Kompaniya haqida: ${companyContext}`);
  if (extractionGuidance)
    parts.push(`Qo'ng'iroqdan ajratib olinadigan ma'lumotlar: ${extractionGuidance}`);
  if (taskCreationGuidance) parts.push(`Vazifa yaratish qoidasi: ${taskCreationGuidance}`);
  if (violationGuidance)
    parts.push(`Qoida buzilishi hisoblanadigan holatlar: ${violationGuidance}`);
  if (coachingGuidance) parts.push(`Menejerga tavsiyalar berishda: ${coachingGuidance}`);
  if (scoringFocusGuidance) parts.push(`Baholashda e'tibor: ${scoringFocusGuidance}`);
  if (qualifiedLeadGuidance) parts.push(`Sifatli lid ta'rifi: ${qualifiedLeadGuidance}`);
  if (businessContext) parts.push(`Biznes konteksti: ${businessContext}`);
  if (lossAnalysisGuidance)
    parts.push(`Yo'qotilgan lidni tahlil qilishda: ${lossAnalysisGuidance}`);
  if (recommendationGuidance) parts.push(`Menejer uchun tavsiyalarda: ${recommendationGuidance}`);

  return parts.length > 0 ? "\n\n" + parts.join("\n\n") : "";
}

type PlaybookOption = { id: string; label: string };
type CallFamilyOption = PlaybookOption & { scored: boolean; exclusionReason: string | null };

// "Xizmat yo'nalishlari" (service_lines), "Lid sifati bosqichlari"
// (lead_quality_stages), "Anketa savollari" (intake_questions) and
// "Qo'ng'iroq oilalari" (call_categories) configured on Baholash mezoni --
// gives the model the business's own product lines, qualification ladder,
// intake questions and call taxonomy so it reasons in those terms instead
// of generic categories, AND (via the returned id-indexed lists) lets the
// caller ask for a plain 1-based index back and resolve it to a real row
// id afterwards -- never trust an LLM to echo a UUID correctly.
async function buildPlaybookBlock(organizationId: string): Promise<{
  text: string;
  serviceLines: PlaybookOption[];
  leadQualityStages: PlaybookOption[];
  intakeQuestions: PlaybookOption[];
  callFamilies: CallFamilyOption[];
}> {
  const [{ data: lines }, { data: stages }, { data: questions }, { data: families }] =
    await Promise.all([
      supabaseAdmin
        .from("service_lines")
        .select("id, name, description")
        .eq("organization_id", organizationId)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("lead_quality_stages")
        .select("id, title, conditions, qualified")
        .eq("organization_id", organizationId)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("intake_questions")
        .select("id, label")
        .eq("organization_id", organizationId)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("call_categories")
        .select("id, name, description, scored, exclusion_reason, workflow_family")
        .eq("organization_id", organizationId)
        .order("position", { ascending: true }),
    ]);

  const serviceLines: PlaybookOption[] = (lines ?? []).map((l) => ({ id: l.id, label: l.name }));
  const leadQualityStages: PlaybookOption[] = (stages ?? []).map((s) => ({
    id: s.id,
    label: s.title,
  }));
  const intakeQuestions: PlaybookOption[] = (questions ?? []).map((q) => ({
    id: q.id,
    label: q.label,
  }));
  const callFamilies: CallFamilyOption[] = (families ?? []).map((f) => ({
    id: f.id,
    label: f.name,
    scored: f.scored,
    exclusionReason: f.exclusion_reason,
  }));

  const parts: string[] = [];
  if (lines && lines.length > 0) {
    parts.push(
      "Kompaniyaning xizmat yo'nalishlari (raqami bilan, mijoz qaysi biri haqida gapirayotganini aniqlang):\n" +
        lines
          .map((l, i) => `${i + 1}. ${l.name}${l.description ? `: ${l.description}` : ""}`)
          .join("\n"),
    );
  }
  if (stages && stages.length > 0) {
    parts.push(
      "Lid sifati bosqichlari (raqami bilan, mos kelganini aniqlashga harakat qiling):\n" +
        stages
          .map(
            (s, i) =>
              `${i + 1}. ${s.title} (${s.qualified ? "sifatli" : "sifatsiz"})${s.conditions.length > 0 ? `: ${s.conditions.join("; ")}` : ""}`,
          )
          .join("\n"),
    );
  }
  if (questions && questions.length > 0) {
    parts.push(
      "Anketa savollari (raqami bilan, suhbatdan javob topa olsangiz ajratib bering):\n" +
        questions.map((q, i) => `${i + 1}. ${q.label}`).join("\n"),
    );
  }
  if (families && families.length > 0) {
    parts.push(
      "Qo'ng'iroq oilalari (raqami bilan, bu qo'ng'iroq qaysi turga mos kelishini aniqlang):\n" +
        families
          .map(
            (f, i) =>
              `${i + 1}. ${f.name}${f.description ? `: ${f.description}` : ""} (${f.scored ? "baholash mezoni bilan baholanadi" : "baholanmaydi — operatsion/boshqa oqim"})`,
          )
          .join("\n"),
    );
  }
  return {
    text: parts.length > 0 ? "\n\n" + parts.join("\n\n") : "",
    serviceLines,
    leadQualityStages,
    intakeQuestions,
    callFamilies,
  };
}

const TRAINING_ERROR_CATEGORIES = [
  "objection_handling",
  "pricing",
  "call_to_action",
  "discovery",
  "follow_up",
  "other",
] as const;

function buildJsonInstruction(
  rubric: RubricStep[],
  serviceLines: PlaybookOption[],
  leadQualityStages: PlaybookOption[],
  intakeQuestions: PlaybookOption[],
  callFamilies: CallFamilyOption[],
  isLostLead: boolean,
): string {
  const base =
    '{"summary": "qo\'ng\'iroq mavzusi va mijoz kayfiyati haqida qisqa xulosa", ' +
    '"next_step": "menejer keyin aniq nima qilishi kerak — bitta lo\'nda jumla", ' +
    '"mood": "mijozning umumiy kayfiyati — bir-ikki so\'z (masalan: qiziqgan, betaraf, norozi)", ' +
    '"talk_ratio": "menejerning gapirish vaqti foizda taxminiy baho, 0 dan 100 gacha butun son", ' +
    '"strengths": ["menejer yaxshi qilgan narsalar ro\'yxati"], ' +
    '"improvements": [{"title": "yaxshilash kerak bo\'lgan narsa, qisqa sarlavha (3-6 so\'z)", "description": "menejer aynan nima qilgani/qilmaganini tushuntiruvchi 1 jumla", "suggestion": "menejer buning o\'rniga aynan qanday gapirishi kerak edi — tayyor jumla"}, ...] — bo\'lmasa bo\'sh ro\'yxat, ' +
    "\"warnings\": [\"ogohlantirishga arziydigan holatlar ro'yxati, bo'lmasa bo'sh ro'yxat\"], " +
    "\"risks\": [\"bitim yo'qolish xavfi bilan bog'liq holatlar, bo'lmasa bo'sh ro'yxat\"], " +
    '"agreements": [{"text": "tomonlar kelishib olgan narsa", "timestamp": "transkriptdagi eng yaqin [mm:ss] belgisi, topilmasa null"}, ...] — bo\'lmasa bo\'sh ro\'yxat, ' +
    '"key_quotes": [{"text": "suhbatdan so\'zma-so\'z iqtibos", "speaker": "Operator yoki Mijoz", "timestamp": "transkriptdagi [mm:ss] belgisi"}, ...] — 2-4 ta eng muhimi, ' +
    "\"top_objections\": [\"mijoz bildirgan e'tirozlar, bo'lmasa bo'sh ro'yxat\"], " +
    '"service_standards": [{"n": 1, "violated": false, "evidence": "buzilgan bo\'lsa qisqa dalil/iqtibos, aks holda bo\'sh matn"}, ...], ' +
    '"sentiment_timeline": [{"timestamp": "[mm:ss]", "sentiment": "ijobiy, neytral yoki salbiy"}, ...] — suhbat davomida mijoz kayfiyati qanday o\'zgarganini 3 dan 6 gacha nuqta bilan ko\'rsat, ' +
    '"key_topics": [{"topic": "suhbatda ko\'p tilga olingan mavzu yoki kalit so\'z, 1-3 so\'z", "count": "necha marta tilga olingani, butun son"}, ...] — eng ko\'p uchragan 5 tagacha mavzu, ' +
    '"customer_profile": {"interest_level": "past/o\'rta/yuqori — mijozning qiziqish darajasi, aniqlab bo\'lmasa null", ' +
    '"budget": "mijoz aytgan byudjet yoki narx haqida gap, aniqlab bo\'lmasa null", ' +
    '"location": "mijozning joylashuvi (hudud/tuman), aniqlab bo\'lmasa null", ' +
    '"occupation": "mijozning kasbi yoki faoliyati, aniqlab bo\'lmasa null", ' +
    '"current_status": "mijozning hozirgi holati (masalan tarif, band bo\'lganligi), aniqlab bo\'lmasa null", ' +
    '"needs": ["mijoz aytgan aniq ehtiyoj yoki so\'rov", ...], ' +
    '"preferences": ["mijozning afzal ko\'rgan narsasi (masalan tarif turi, to\'lov sharti)", ...], ' +
    "\"other_notes\": \"boshqa hech qaysi maydonga sig'maydigan, lekin foydali shaxsiy/kontekst ma'lumot, bo'lmasa bo'sh matn\"}, " +
    // Deep-analysis block (Audio tahlil page): outcome, qualification,
    // objection handling, buying signals and ready-to-use follow-ups.
    '"call_outcome": {"label": "qo\'ng\'iroq natijasi 1-3 so\'zda (masalan: Rad etdi, Qiziqdi, Keyinroq gaplashamiz, Uchrashuv belgilandi, To\'lovga rozi, Javob bermadi)", "tone": "positive, neutral yoki negative"}, ' +
    '"outcome_analysis": {"why": "nima uchun aynan shu natija chiqqani, 1-3 jumla", "key_factors": ["natijaga eng ko\'p ta\'sir qilgan omillar, 2-4 ta"], "recontact": {"recommended": true yoki false, "reason": "qayta bog\'lanish kerakmi va nima uchun, 1 jumla", "when": "qachon qayta bog\'lanish ma\'qul (masalan: 2 kundan keyin, keyingi hafta), kerak bo\'lmasa null"}}, ' +
    '"next_step_detail": {"action": "menejer keyingi qiladigan aniq ish", "reason": "nima uchun aynan shu qadam, 1 jumla", "priority": "past, o\'rta yoki yuqori"}, ' +
    '"deal_probability": {"value": "bitim yopilish ehtimoli foizda, 0 dan 100 gacha butun son", "reason": "shu baho asosi, 1 jumla"}, ' +
    '"analysis_confidence": "tahlil ishonchliligi — past, o\'rta yoki yuqori (transkript qisqa/noaniq bo\'lsa past)", ' +
    '"qualification": [{"key": "budget, authority, need yoki timeline", "question": "shu mezon bo\'yicha mijozga beriladigan savol", "status": "answered, partial yoki unanswered", "answer": "mijozning javobi yoki iqtibos, aniqlanmagan bo\'lsa bo\'sh matn", "timestamp": "[mm:ss] yoki null"}] — BANT bo\'yicha aynan 4 ta yozuv: budget (byudjet), authority (qaror qabul qiluvchi), need (ehtiyoj), timeline (muddat), ' +
    '"objection_handling": [{"objection": "mijoz e\'tirozi", "manager_response": "menejer qanday javob berdi, qisqa", "handled": true yoki false, "better_response": "yaxshiroq javob — tayyor jumla", "timestamp": "[mm:ss] yoki null"}] — bo\'lmasa bo\'sh ro\'yxat, ' +
    '"customer_questions": [{"question": "mijoz bergan savol", "answered": true yoki false, "timestamp": "[mm:ss] yoki null"}] — bo\'lmasa bo\'sh ro\'yxat, ' +
    '"buying_signals": [{"text": "mijozning sotib olishga qiziqishini ko\'rsatgan gapi yoki harakati", "timestamp": "[mm:ss] yoki null"}] — bo\'lmasa bo\'sh ro\'yxat, ' +
    "\"pain_points\": [\"mijozning muammosi yoki og'riqli nuqtasi\"] — bo'lmasa bo'sh ro'yxat, " +
    '"competitors": ["tilga olingan raqobatchi yoki muqobil variant nomi"] — bo\'lmasa bo\'sh ro\'yxat, ' +
    '"price_discussion": {"discussed": true yoki false, "details": "narx/to\'lov haqida nima gaplashildi va mijoz qanday qabul qildi, gaplashilmagan bo\'lsa bo\'sh matn"}, ' +
    '"coaching_tip": "menejer uchun shu qo\'ng\'iroqdan eng muhim bitta saboq, 1-2 jumla", ' +
    '"follow_up_message": "mijozga Telegram/SMS orqali yuborish uchun tayyor, samimiy va qisqa xabar matni (3-5 jumla), suhbat mazmuniga mos"}';

  const standardsLines = SERVICE_STANDARDS.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const standardsInstruction =
    "\n\nQuyidagi xizmat standartlari ro'yxatini ham tekshir — har biri buzilganmi yoki yo'qmi (violated: true/false) va buzilgan bo'lsa qisqa dalil (evidence):\n" +
    standardsLines +
    '\n\n"service_standards" massivida yuqoridagi RO\'YXATDAGI HAR BIR band uchun aynan bitta yozuv bo\'lishi kerak, "n" band raqamiga mos kelishi kerak.';

  // Reports (Kunlik hisobot) aggregate calls by service line / lead quality /
  // intake-question answer -- ask the model for a plain 1-based index into
  // the lists buildPlaybookBlock already put in the system prompt, never a
  // UUID it would have to copy (and could get wrong).
  const extraFields: string[] = [];
  let extraInstruction = "";
  if (serviceLines.length > 0) {
    extraFields.push(
      '"service_line_n": "yuqoridagi xizmat yo\'nalishlari ro\'yxatidan mos kelgan raqam, aniqlab bo\'lmasa null"',
    );
  }
  if (leadQualityStages.length > 0) {
    extraFields.push(
      '"lead_quality_stage_n": "yuqoridagi lid sifati bosqichlari ro\'yxatidan mos kelgan raqam, aniqlab bo\'lmasa null"',
    );
  }
  if (callFamilies.length > 0) {
    extraFields.push(
      "\"family_n\": \"yuqoridagi qo'ng'iroq oilalari ro'yxatidan bu qo'ng'iroqqa eng mos kelgan raqam — albatta bitta raqam tanlang, hech biri mos kelmasa ham eng yaqinini tanlang\"",
    );
  }
  if (intakeQuestions.length > 0) {
    extraFields.push(
      '"intake_answers": [{"n": "yuqoridagi anketa savollari ro\'yxatidagi savol raqami", "answer": "suhbatdan topilgan javob, topilmasa bo\'sh matn"}, ...]',
    );
    extraInstruction =
      '\n\n"intake_answers" massivida yuqoridagi anketa savollari RO\'YXATIDAGI HAR BIR savol uchun aynan bitta yozuv bo\'lishi kerak (javob topilmasa ham, "answer" bo\'sh matn bilan).';
  }
  if (isLostLead) {
    extraFields.push(
      '"training_recommendation": {"error_category": "quyidagi ro\'yxatdan bittasi — ' +
        TRAINING_ERROR_CATEGORIES.join(", ") +
        '", "title": "menejer uchun trening mavzusi, qisqa (3-6 so\'z)", "description": "menejer aynan nima xato qilgani va buni qanday tuzatish kerakligi, 1-2 jumla"} — bu lid YO\'QOTILGAN, shu qo\'ng\'iroqda menejerning eng katta xatosini toping va shu formatda ber; agar aniq xato topilmasa (menejer tomonidan hech narsa yo\'qotilishga sabab bo\'lmagan bo\'lsa) shu maydonni null qiling"',
    );
    extraFields.push(
      "\"recoverable\": {\"is_recoverable\": true yoki false, \"reason\": \"qisqa asos, 1 jumla\"} — bu lid YO'QOTILGAN, transkriptga qarab xolis baholang: mijozning voz kechish sababi VAQTINCHALIK/TUZATSA BO'LADIGAN narsami (masalan: narx bahonasi, hozir vaqti yo'q, byudjet keyinroq ochiladi, hali qandaydir qiziqishi bor, boshqa qaror qabul qiluvchi bilan gaplashishi kerak) — shunda is_recoverable true; yoki sabab QATʼIY/TUZATIB BO'LMAYDIGAN narsami (masalan: raqibga o'tib ketgan/shartnoma tuzgan, ehtiyoji umuman yo'q, mahsulot/xizmat mos emas, aloqa butunlay uzilgan, mijoz aniq va qatʼiy rad etdi) — shunda is_recoverable false. Xolis va real bo'ling, faqat haqiqatan ham qaytadan sotib bo'ladigan holatlargina true bo'lsin\"",
    );
  }
  const extra = extraFields.length > 0 ? ", " + extraFields.join(", ") : "";

  if (rubric.length === 0) {
    return (
      standardsInstruction +
      extraInstruction +
      "\n\nJavobni faqat quyidagi JSON formatida qaytar, boshqa hech qanday matn yozma:\n{" +
      base.slice(1) +
      ', "score": "qo\'ng\'iroqqa umumiy baho, 0 dan 100 gacha butun son"' +
      extra +
      "}"
    );
  }

  const checklistLines = rubric
    .map((r) => {
      const label = `${r.n}. [${r.stage}]${r.code ? ` (${r.code})` : ""} ${r.step}${r.skill ? ` (ko'nikma: ${r.skill})` : ""}`;
      const rubricHints = [
        r.level3 && `to'liq bajarilgan: ${r.level3}`,
        r.level0 && `bajarilmagan: ${r.level0}`,
      ].filter(Boolean);
      return rubricHints.length > 0 ? `${label} — ${rubricHints.join("; ")}` : label;
    })
    .join("\n");

  return (
    standardsInstruction +
    extraInstruction +
    "\n\nQuyidagi tekshiruv ro'yxati (checklist) asosida qo'ng'iroqni bahola. Har bir band uchun menejer buni bajarganmi yoki yo'qmi (met: true/false), qisqa izoh (note) va shu holat transkriptda qayerda sodir bo'lganini ko'rsatuvchi [mm:ss] belgisi (timestamp, topilmasa null) ber:\n" +
    checklistLines +
    "\n\nJavobni faqat quyidagi JSON formatida qaytar, boshqa hech qanday matn yozma:\n{" +
    base.slice(1) +
    ', "checklist": [{"n": 1, "met": true, "note": "qisqa izoh", "timestamp": "mm:ss yoki null"}, ...] — checklist massivida yuqoridagi RO\'YXATDAGI HAR BIR band uchun aynan bitta yozuv bo\'lishi kerak, "n" band raqamiga mos kelishi kerak' +
    extra +
    "}"
  );
}

// The "chuqur tahlil" fields stored under amocrm_calls.analysis next to the
// rubric/standards results. Every field is optional on read (calls
// analyzed before these existed simply don't have them) and parsed
// leniently here so a model that skips or reshapes one field never costs
// the rest of the analysis.
type DeepCallAnalysis = {
  callOutcome: { label: string; tone: "positive" | "neutral" | "negative" } | null;
  outcomeAnalysis: {
    why: string;
    keyFactors: string[];
    recontact: { recommended: boolean; reason: string; when: string | null } | null;
  } | null;
  nextStepDetail: { action: string; reason: string; priority: "low" | "medium" | "high" } | null;
  dealProbability: { value: number; reason: string } | null;
  analysisConfidence: "low" | "medium" | "high" | null;
  qualification: {
    key: "budget" | "authority" | "need" | "timeline";
    question: string;
    status: "answered" | "partial" | "unanswered";
    answer: string;
    timestamp: string | null;
  }[];
  objectionHandling: {
    objection: string;
    managerResponse: string;
    handled: boolean;
    betterResponse: string;
    timestamp: string | null;
  }[];
  customerQuestions: { question: string; answered: boolean; timestamp: string | null }[];
  buyingSignals: { text: string; timestamp: string | null }[];
  painPoints: string[];
  competitors: string[];
  priceDiscussion: { discussed: boolean; details: string } | null;
  coachingTip: string | null;
  followUpMessage: string | null;
};

const EMPTY_DEEP: DeepCallAnalysis = {
  callOutcome: null,
  outcomeAnalysis: null,
  nextStepDetail: null,
  dealProbability: null,
  analysisConfidence: null,
  qualification: [],
  objectionHandling: [],
  customerQuestions: [],
  buyingSignals: [],
  painPoints: [],
  competitors: [],
  priceDiscussion: null,
  coachingTip: null,
  followUpMessage: null,
};

// Uzbek or English level words -> one canonical scale.
function asLevel(v: unknown): "low" | "medium" | "high" | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!s) return null;
  if (/^(yuqori|high|baland)/.test(s)) return "high";
  if (/^(o.?rta|medium|mid)/.test(s)) return "medium";
  if (/^(past|low)/.test(s)) return "low";
  return null;
}

function parseDeepAnalysis(raw: Record<string, unknown>): DeepCallAnalysis {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => str(v) || null;
  const ts = (v: unknown) => strOrNull(v);
  const arr = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v)
      ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      : [];
  const strArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim())
      : [];
  const obj = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

  const outcome = obj(raw["call_outcome"]);
  const outcomeTone = str(outcome?.["tone"]).toLowerCase();
  const oa = obj(raw["outcome_analysis"]);
  const recontact = obj(oa?.["recontact"]);
  const nsd = obj(raw["next_step_detail"]);
  const dp = obj(raw["deal_probability"]);
  const dpValue = Number(dp?.["value"]);
  const price = obj(raw["price_discussion"]);
  const QUAL_KEYS = ["budget", "authority", "need", "timeline"] as const;
  const QUAL_STATUS = ["answered", "partial", "unanswered"] as const;

  return {
    callOutcome: str(outcome?.["label"])
      ? {
          label: str(outcome?.["label"]),
          tone: outcomeTone === "positive" || outcomeTone === "negative" ? outcomeTone : "neutral",
        }
      : null,
    outcomeAnalysis: str(oa?.["why"])
      ? {
          why: str(oa?.["why"]),
          keyFactors: strArr(oa?.["key_factors"]),
          recontact:
            recontact && typeof recontact["recommended"] === "boolean"
              ? {
                  recommended: recontact["recommended"],
                  reason: str(recontact["reason"]),
                  when: strOrNull(recontact["when"]),
                }
              : null,
        }
      : null,
    nextStepDetail: str(nsd?.["action"])
      ? {
          action: str(nsd?.["action"]),
          reason: str(nsd?.["reason"]),
          priority: asLevel(nsd?.["priority"]) ?? "medium",
        }
      : null,
    dealProbability: Number.isFinite(dpValue)
      ? { value: Math.min(100, Math.max(0, Math.round(dpValue))), reason: str(dp?.["reason"]) }
      : null,
    analysisConfidence: asLevel(raw["analysis_confidence"]),
    qualification: arr(raw["qualification"])
      .map((q) => {
        const key = str(q["key"]).toLowerCase();
        const status = str(q["status"]).toLowerCase();
        return {
          key: (QUAL_KEYS as readonly string[]).includes(key)
            ? (key as (typeof QUAL_KEYS)[number])
            : null,
          question: str(q["question"]),
          status: (QUAL_STATUS as readonly string[]).includes(status)
            ? (status as (typeof QUAL_STATUS)[number])
            : "unanswered",
          answer: str(q["answer"]),
          timestamp: ts(q["timestamp"]),
        };
      })
      .filter(
        (q): q is DeepCallAnalysis["qualification"][number] =>
          q["key"] !== null && q["question"] !== "",
      ),
    objectionHandling: arr(raw["objection_handling"])
      .map((o) => ({
        objection: str(o["objection"]),
        managerResponse: str(o["manager_response"]),
        handled: o["handled"] === true,
        betterResponse: str(o["better_response"]),
        timestamp: ts(o["timestamp"]),
      }))
      .filter((o) => o["objection"] !== ""),
    customerQuestions: arr(raw["customer_questions"])
      .map((q) => ({
        question: str(q["question"]),
        answered: q["answered"] === true,
        timestamp: ts(q["timestamp"]),
      }))
      .filter((q) => q["question"] !== ""),
    buyingSignals: (Array.isArray(raw["buying_signals"]) ? raw["buying_signals"] : [])
      .map((b: unknown) =>
        typeof b === "string"
          ? { text: b.trim(), timestamp: null }
          : { text: str(obj(b)?.["text"]), timestamp: ts(obj(b)?.["timestamp"]) },
      )
      .filter((b: { text: string }) => b.text !== ""),
    painPoints: strArr(raw["pain_points"]),
    competitors: strArr(raw["competitors"]),
    priceDiscussion:
      price && typeof price["discussed"] === "boolean"
        ? { discussed: price["discussed"], details: str(price["details"]) }
        : null,
    coachingTip: strOrNull(raw["coaching_tip"]),
    followUpMessage: strOrNull(raw["follow_up_message"]),
  };
}

async function analyzeTranscript(
  transcript: string,
  systemPrompt: string,
  rubric: RubricStep[],
  serviceLines: PlaybookOption[],
  leadQualityStages: PlaybookOption[],
  intakeQuestions: PlaybookOption[],
  callFamilies: CallFamilyOption[],
  isLostLead: boolean,
): Promise<{
  summary: string;
  nextStep: string | null;
  mood: string | null;
  talkRatio: number | null;
  score: number | null;
  checklist: { n: number; met: boolean; note: string; timestamp: string | null }[];
  strengths: string[];
  improvements: { title: string; description: string; suggestion: string }[];
  warnings: string[];
  risks: string[];
  agreements: { text: string; timestamp: string | null }[];
  trainingRecommendation: { errorCategory: string; title: string; description: string } | null;
  recoverable: { isRecoverable: boolean; reason: string } | null;
  keyQuotes: { text: string; speaker: string | null; timestamp: string | null }[];
  topObjections: string[];
  serviceStandards: { n: number; violated: boolean; evidence: string }[];
  sentimentTimeline: { timestamp: string; sentiment: string }[];
  keyTopics: { topic: string; count: number }[];
  serviceLineN: number | null;
  leadQualityStageN: number | null;
  familyN: number | null;
  intakeAnswers: { n: number; answer: string }[];
  customerProfile: CustomerProfileExtract;
  deep: DeepCallAnalysis;
}> {
  const apiKey = requireEnv("GEMINI_API_KEY");

  const res = await callGemini(
    apiKey,
    {
      systemInstruction: {
        parts: [
          {
            text:
              systemPrompt +
              buildJsonInstruction(
                rubric,
                serviceLines,
                leadQualityStages,
                intakeQuestions,
                callFamilies,
                isLostLead,
              ),
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: transcript }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    },
    // Longer than transcription: the deep-analysis block makes the JSON
    // answer roughly twice as long to generate.
    50_000,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(describeGeminiFailure(res.status, text));
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

  // The model was asked for {text, timestamp} objects, but a differently
  // configured agent prompt (or the model just not following instructions)
  // could still hand back plain strings -- accept both rather than losing
  // the whole field to a JSON shape mismatch.
  const asTimestampedText = (v: unknown): { text: string; timestamp: string | null }[] =>
    Array.isArray(v)
      ? v
          .map((item) =>
            typeof item === "string"
              ? { text: item.trim(), timestamp: null }
              : {
                  text: typeof item?.text === "string" ? item.text.trim() : "",
                  timestamp: typeof item?.timestamp === "string" ? item.timestamp.trim() : null,
                },
          )
          .filter((item) => item.text !== "")
      : [];

  const asQuotes = (
    v: unknown,
  ): { text: string; speaker: string | null; timestamp: string | null }[] =>
    Array.isArray(v)
      ? v
          .map((item) =>
            typeof item === "string"
              ? { text: item.trim(), speaker: null, timestamp: null }
              : {
                  text: typeof item?.text === "string" ? item.text.trim() : "",
                  speaker: typeof item?.speaker === "string" ? item.speaker.trim() : null,
                  timestamp: typeof item?.timestamp === "string" ? item.timestamp.trim() : null,
                },
          )
          .filter((item) => item.text !== "")
      : [];

  // Older agent prompts (or a model just not following instructions) can
  // still hand back plain strings for "improvements" -- accept both rather
  // than losing the whole field, same pattern as agreements/key_quotes.
  const asImprovements = (
    v: unknown,
  ): { title: string; description: string; suggestion: string }[] =>
    Array.isArray(v)
      ? v
          .map((item) =>
            typeof item === "string"
              ? { title: item.trim(), description: "", suggestion: "" }
              : {
                  title: typeof item?.title === "string" ? item.title.trim() : "",
                  description: typeof item?.description === "string" ? item.description.trim() : "",
                  suggestion: typeof item?.suggestion === "string" ? item.suggestion.trim() : "",
                },
          )
          .filter((item) => item.title !== "")
      : [];

  const asKeyTopics = (v: unknown): { topic: string; count: number }[] =>
    Array.isArray(v)
      ? v
          .map((item) => ({
            topic: typeof item?.topic === "string" ? item.topic.trim() : "",
            count: Number(item?.count),
          }))
          .filter((item) => item.topic !== "" && Number.isFinite(item.count) && item.count > 0)
      : [];

  const asSentimentTimeline = (v: unknown): { timestamp: string; sentiment: string }[] =>
    Array.isArray(v)
      ? v
          .map((item) => ({
            timestamp: typeof item?.timestamp === "string" ? item.timestamp.trim() : "",
            sentiment: typeof item?.sentiment === "string" ? item.sentiment.trim() : "",
          }))
          .filter((item) => item.timestamp !== "" && item.sentiment !== "")
      : [];

  try {
    const parsed = JSON.parse(content) as {
      summary?: string;
      next_step?: string;
      mood?: string;
      talk_ratio?: number | string;
      score?: number | string;
      checklist?: { n?: number; met?: boolean; note?: string; timestamp?: string | null }[];
      strengths?: string[];
      improvements?: (string | { title?: string; description?: string; suggestion?: string })[];
      warnings?: string[];
      risks?: string[];
      agreements?: (string | { text?: string; timestamp?: string | null })[];
      key_quotes?: (
        string | { text?: string; speaker?: string | null; timestamp?: string | null }
      )[];
      top_objections?: string[];
      service_standards?: { n?: number; violated?: boolean; evidence?: string }[];
      sentiment_timeline?: { timestamp?: string; sentiment?: string }[];
      key_topics?: { topic?: string; count?: number | string }[];
      service_line_n?: number | string | null;
      lead_quality_stage_n?: number | string | null;
      family_n?: number | string | null;
      intake_answers?: { n?: number; answer?: string }[];
      training_recommendation?: {
        error_category?: string;
        title?: string;
        description?: string;
      } | null;
      customer_profile?: {
        interest_level?: string | null;
        budget?: string | null;
        location?: string | null;
        occupation?: string | null;
        current_status?: string | null;
        needs?: string[];
        preferences?: string[];
        other_notes?: string;
      } | null;
      recoverable?: {
        is_recoverable?: boolean;
        reason?: string;
      } | null;
    };
    if (!parsed.summary) throw new Error("no summary");

    const rawTrainingRec = parsed.training_recommendation;
    const trainingRecommendation =
      rawTrainingRec &&
      typeof rawTrainingRec.title === "string" &&
      rawTrainingRec.title.trim() &&
      typeof rawTrainingRec.description === "string" &&
      rawTrainingRec.description.trim()
        ? {
            errorCategory: TRAINING_ERROR_CATEGORIES.includes(
              rawTrainingRec.error_category as (typeof TRAINING_ERROR_CATEGORIES)[number],
            )
              ? rawTrainingRec.error_category!
              : "other",
            title: rawTrainingRec.title.trim(),
            description: rawTrainingRec.description.trim(),
          }
        : null;

    const rawRecoverable = parsed.recoverable;
    const recoverable =
      rawRecoverable && typeof rawRecoverable.is_recoverable === "boolean"
        ? {
            isRecoverable: rawRecoverable.is_recoverable,
            reason: typeof rawRecoverable.reason === "string" ? rawRecoverable.reason.trim() : "",
          }
        : null;

    const serviceLineN = Number(parsed.service_line_n);
    const leadQualityStageN = Number(parsed.lead_quality_stage_n);
    const familyN = Number(parsed.family_n);

    const talkRatioNum = Number(parsed.talk_ratio);
    const scoreNum = Number(parsed.score);

    return {
      summary: parsed.summary.trim(),
      nextStep: parsed.next_step?.trim() || null,
      mood: parsed.mood?.trim() || null,
      talkRatio: Number.isFinite(talkRatioNum)
        ? Math.min(100, Math.max(0, Math.round(talkRatioNum)))
        : null,
      score: Number.isFinite(scoreNum) ? Math.min(100, Math.max(0, Math.round(scoreNum))) : null,
      checklist: Array.isArray(parsed.checklist)
        ? parsed.checklist
            .filter(
              (c): c is { n: number; met: boolean; note?: string; timestamp?: string | null } =>
                typeof c.n === "number" && typeof c.met === "boolean",
            )
            .map((c) => ({
              n: c.n,
              met: c.met,
              note: c.note ?? "",
              timestamp: typeof c.timestamp === "string" ? c.timestamp.trim() : null,
            }))
        : [],
      strengths: asStringArray(parsed.strengths),
      improvements: asImprovements(parsed.improvements),
      warnings: asStringArray(parsed.warnings),
      risks: asStringArray(parsed.risks),
      agreements: asTimestampedText(parsed.agreements),
      keyQuotes: asQuotes(parsed.key_quotes),
      topObjections: asStringArray(parsed.top_objections),
      serviceStandards: Array.isArray(parsed.service_standards)
        ? parsed.service_standards.filter(
            (s): s is { n: number; violated: boolean; evidence: string } =>
              typeof s.n === "number" && typeof s.violated === "boolean",
          )
        : [],
      sentimentTimeline: asSentimentTimeline(parsed.sentiment_timeline),
      keyTopics: asKeyTopics(parsed.key_topics),
      serviceLineN: Number.isFinite(serviceLineN) ? serviceLineN : null,
      leadQualityStageN: Number.isFinite(leadQualityStageN) ? leadQualityStageN : null,
      familyN: Number.isFinite(familyN) ? familyN : null,
      intakeAnswers: Array.isArray(parsed.intake_answers)
        ? parsed.intake_answers
            .filter((a): a is { n: number; answer: string } => typeof a.n === "number")
            .map((a) => ({ n: a.n, answer: (a.answer ?? "").trim() }))
        : [],
      trainingRecommendation,
      recoverable,
      customerProfile: {
        interestLevel: parsed.customer_profile?.interest_level?.trim() || null,
        budget: parsed.customer_profile?.budget?.trim() || null,
        location: parsed.customer_profile?.location?.trim() || null,
        occupation: parsed.customer_profile?.occupation?.trim() || null,
        currentStatus: parsed.customer_profile?.current_status?.trim() || null,
        needs: asStringArray(parsed.customer_profile?.needs),
        preferences: asStringArray(parsed.customer_profile?.preferences),
        otherNotes: parsed.customer_profile?.other_notes?.trim() || "",
      },
      deep: parseDeepAnalysis(parsed as unknown as Record<string, unknown>),
    };
  } catch {
    // Model didn't return valid JSON (can happen with a heavily customized
    // agent prompt) — fall back to treating the raw text as the summary and
    // leaving every structured field empty rather than failing the whole
    // analysis outright.
    return {
      summary: content,
      nextStep: null,
      mood: null,
      talkRatio: null,
      score: null,
      checklist: [],
      strengths: [],
      improvements: [],
      warnings: [],
      risks: [],
      agreements: [],
      keyQuotes: [],
      topObjections: [],
      serviceStandards: [],
      sentimentTimeline: [],
      keyTopics: [],
      serviceLineN: null,
      leadQualityStageN: null,
      familyN: null,
      intakeAnswers: [],
      trainingRecommendation: null,
      recoverable: null,
      customerProfile: {
        interestLevel: null,
        budget: null,
        location: null,
        occupation: null,
        currentStatus: null,
        needs: [],
        preferences: [],
        otherNotes: "",
      },
      deep: EMPTY_DEEP,
    };
  }
}

// AmoCRM has no real "lead temperature" concept -- this is the only place a
// lead's score/temperature ever gets set to something other than the
// column defaults (score=50, temperature='Warm'), rolling up whatever the
// AI call-analysis engine just found for its most recent call.
function temperatureFromScore(score: number): "Cold" | "Warm" | "Hot" | "VeryHot" {
  if (score >= 76) return "VeryHot";
  if (score >= 51) return "Hot";
  if (score >= 26) return "Warm";
  return "Cold";
}

export type AnalyzeCallResult = {
  transcript: string;
  summary: string;
  nextStep: string | null;
  score: number | null;
  mood: string | null;
  talkRatio: number | null;
  analysis: Record<string, unknown>;
  taskWarning: string | null;
};

/**
 * The actual "listen to the call and score it" work, extracted out of the
 * route handler so both the manual "Tahlil qilish" button (below) and the
 * automatic /audio-analytics/analyze-pending cron job can call the exact
 * same logic instead of drifting apart. Throws on any failure -- callers
 * decide how to surface that (a 500 response for the manual button, a
 * per-call failure count for the batch job).
 */
export async function analyzeCallById(
  organizationId: string,
  callId: string,
): Promise<AnalyzeCallResult> {
  // Enforced here rather than in each caller -- the manual button, the
  // auto-analysis cron and the one-off re-analysis backfill all funnel
  // through this one function, so none of them can spend an expired org's
  // or an over-quota trial's AI budget.
  const access = await loadOrgAccess(organizationId);
  if (access) {
    const verdict = await canRunAiAnalysis(access, callId);
    if (verdict === "expired") throw new Error(SUBSCRIPTION_EXPIRED_MESSAGE);
    if (verdict === "trial_limit") throw new Error(TRIAL_AI_LIMIT_MESSAGE);
  }

  const { data: call } = await supabaseAdmin
    .from("amocrm_calls")
    .select(
      "id, lead_id, recording_url, source, amocrm_task_id, occurred_at, leads:lead_id(amocrm_id, owner_id, stage_id, ai_customer_profile)",
    )
    .eq("id", callId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!call) throw new Error("Call not found.");
  if (!call.recording_url) {
    throw new Error("Bu qo'ng'iroqda ovoz yozuvi yo'q.");
  }

  const { data: agent } = await supabaseAdmin
    .from("ai_agents")
    .select("system_prompt, active, call_instructions")
    .eq("organization_id", organizationId)
    .eq("kind", "call")
    .maybeSingle();
  if (agent && agent.active === false) {
    throw new Error("Qo'ng'iroq tahlili AI agenti o'chirilgan. Admin panelidan yoqing.");
  }
  const baseSystemPrompt =
    agent?.system_prompt?.trim() ||
    "Siz qo'ng'iroq yozuvini tahlil qiluvchi tajribali sotuv nazoratchisisiz. Asosiy mavzuni, mijoz kayfiyatini, menejerning kuchli va zaif tomonlarini xolisona baholang.";

  const transcript = await transcribeAudio(call.recording_url);
  if (!transcript) {
    throw new Error("Ovozdan matn chiqmadi (bo'sh yozuv).");
  }

  const [rubric, playbook] = await Promise.all([
    loadRubric(organizationId),
    buildPlaybookBlock(organizationId),
  ]);
  // Leads have no status column of their own -- "lost" is whichever
  // pipeline stage has is_lost = true (same check used by ai-assistant.chat.ts
  // and the leaderboard MCP tool).
  let isLostLead = false;
  if (call.leads?.stage_id) {
    const { data: stage } = await supabaseAdmin
      .from("pipeline_stages")
      .select("is_lost")
      .eq("id", call.leads.stage_id)
      .maybeSingle();
    isLostLead = stage?.is_lost ?? false;
  }
  const systemPrompt =
    baseSystemPrompt + buildCallInstructionsBlock(agent?.call_instructions) + playbook.text;
  const result = await analyzeTranscript(
    transcript,
    systemPrompt,
    rubric,
    playbook.serviceLines,
    playbook.leadQualityStages,
    playbook.intakeQuestions,
    playbook.callFamilies,
    isLostLead,
  );

  // "Qo'ng'iroq oilalari" (call_categories) lets an org mark a whole class
  // of calls -- e.g. "Ulanmagan aloqa" (never connected) or "To'lov
  // bo'yicha aloqa" (a payment follow-up, not a sales conversation) -- as
  // excluded from the sales rubric entirely (scored: false). Applying the
  // checklist score to one of those anyway would silently drag a manager's
  // average down for a call that was never a sales pitch to begin with.
  const callFamily =
    result.familyN != null ? (playbook.callFamilies[result.familyN - 1] ?? null) : null;

  // A configured rubric always wins over the AI's own holistic
  // guess — it's a fixed, auditable formula instead of a number the
  // model invented, so the score stays consistent across calls and
  // can't silently drift as the underlying model changes. A stage
  // weight (Baholash mezonlari) takes priority when configured;
  // otherwise fall back to the flat matched-points ratio.
  let score = result.score;
  const totalPoints = rubric.reduce((s, r) => s + r.points, 0);
  if (rubric.length > 0 && totalPoints > 0) {
    const metByN = new Map(result.checklist.map((c) => [c.n, c.met]));
    const weighted = computeWeightedScore(rubric, metByN);
    if (weighted !== null) {
      score = weighted;
    } else {
      const matchedPoints = rubric.reduce((s, r) => s + (metByN.get(r.n) ? r.points : 0), 0);
      score = Math.round((matchedPoints / totalPoints) * 100);
    }
  }
  if (callFamily && !callFamily.scored) score = null;

  const noteByN = new Map(result.checklist.map((c) => [c.n, c.note ?? ""]));
  const timestampByN = new Map(result.checklist.map((c) => [c.n, c.timestamp]));
  const metByN = new Map(result.checklist.map((c) => [c.n, c.met]));
  const standardByN = new Map(
    result.serviceStandards.map((s) => [s.n, { violated: s.violated, evidence: s.evidence ?? "" }]),
  );
  const analysis = {
    checklist: rubric.map((r) => ({
      stage: r.stage,
      step: r.step,
      skill: r.skill,
      points: r.points,
      met: metByN.get(r.n) ?? false,
      note: noteByN.get(r.n) ?? "",
      timestamp: timestampByN.get(r.n) ?? null,
    })),
    strengths: result.strengths,
    improvements: result.improvements,
    warnings: result.warnings,
    risks: result.risks,
    agreements: result.agreements,
    keyQuotes: result.keyQuotes,
    topObjections: result.topObjections,
    sentimentTimeline: result.sentimentTimeline,
    keyTopics: result.keyTopics,
    serviceStandards: SERVICE_STANDARDS.map((name, i) => ({
      name,
      violated: standardByN.get(i + 1)?.violated ?? false,
      evidence: standardByN.get(i + 1)?.evidence ?? "",
    })),
    ...result.deep,
    callFamily: callFamily
      ? {
          name: callFamily.label,
          scored: callFamily.scored,
          exclusionReason: callFamily.exclusionReason,
        }
      : null,
  };

  // "n" is a 1-based index into the same lists buildPlaybookBlock put
  // in the prompt -- resolve back to a real row id here rather than
  // trusting the model with a UUID (see buildJsonInstruction).
  const serviceLineId =
    result.serviceLineN != null
      ? (playbook.serviceLines[result.serviceLineN - 1]?.id ?? null)
      : null;
  const leadQualityStageId =
    result.leadQualityStageN != null
      ? (playbook.leadQualityStages[result.leadQualityStageN - 1]?.id ?? null)
      : null;
  const intakeAnswers: Record<string, string> = {};
  for (const a of result.intakeAnswers) {
    const question = playbook.intakeQuestions[a.n - 1];
    if (question && a.answer) intakeAnswers[question.id] = a.answer;
  }

  await supabaseAdmin
    .from("amocrm_calls")
    .update({
      transcript,
      ai_summary: result.summary,
      next_step: result.nextStep,
      score,
      mood: result.mood,
      talk_ratio: result.talkRatio,
      analysis,
      analyzed_at: new Date().toISOString(),
      service_line_id: serviceLineId,
      intake_answers: intakeAnswers,
    })
    .eq("id", call.id);

  void dispatchOutgoingWebhooks(organizationId, "ai_analysis_done", {
    call_id: call.id,
    lead_id: call.lead_id,
    score,
    mood: result.mood,
    summary: result.summary,
  });

  if (call.lead_id) {
    const existingProfile = (call.leads?.ai_customer_profile ??
      null) as StoredCustomerProfile | null;
    const mergedProfile = mergeCustomerProfile(
      existingProfile,
      result.customerProfile,
      call.occurred_at,
    );
    await supabaseAdmin
      .from("leads")
      .update({
        ...(score != null ? { score, temperature: temperatureFromScore(score) } : {}),
        ...(leadQualityStageId ? { lead_quality_stage_id: leadQualityStageId } : {}),
        // Only ever set for a lost-lead call, and only when the model gave a
        // real verdict -- never write `false` here from a call that wasn't
        // on a lost lead, which would wrongly mark it "not recoverable"
        // instead of leaving it null ("not yet AI-assessed").
        ...(isLostLead && result.recoverable
          ? {
              recoverable: result.recoverable.isRecoverable,
              recoverable_reason: result.recoverable.reason || null,
            }
          : {}),
        ai_customer_profile: mergedProfile,
      })
      .eq("id", call.lead_id);
  }

  // Training module: a lost-lead call the AI flagged a concrete mistake in
  // becomes one row a ROP can see ranked against the rest of the team's
  // repeat mistakes (Training / Tavsiyalar). Best-effort -- a failure here
  // must never undo the call analysis that's already saved above.
  if (isLostLead && result.trainingRecommendation && call.leads?.owner_id) {
    try {
      const { data: matchingLesson } = await supabaseAdmin
        .from("lessons")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("category", result.trainingRecommendation.errorCategory)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();

      await supabaseAdmin.from("training_recommendations").insert({
        organization_id: organizationId,
        manager_id: call.leads.owner_id,
        lead_id: call.lead_id,
        call_id: call.id,
        error_category: result.trainingRecommendation.errorCategory,
        title: result.trainingRecommendation.title,
        description: result.trainingRecommendation.description,
        recommended_lesson_id: matchingLesson?.id ?? null,
      });
    } catch {
      // Non-fatal -- the Training panel will simply be missing this one
      // recommendation.
    }
  }

  // Hand the AI-suggested next step to the responsible manager as a
  // reminder inside AmoCRM, and log the AI's own summary as a note --
  // but only as a backstop for whatever the rep didn't already do
  // themselves. Best-effort throughout: a failure here shouldn't undo
  // the analysis that's already saved. Skipped for manually uploaded
  // calls (no AmoCRM lead to attach anything to).
  let taskWarning: string | null = null;
  const leadAmoId = call.leads?.amocrm_id ?? null;
  const callStartedAt = call.occurred_at ? new Date(call.occurred_at) : null;

  if (result.nextStep && call.source === "amocrm" && leadAmoId && !call.amocrm_task_id) {
    try {
      // A task the rep created themselves (in AmoCRM directly) syncs down
      // into public.tasks within 5 minutes -- if one already exists for
      // this lead since the call started, the rep is already on it and
      // the AI doesn't need to add its own.
      let repAlreadyCreatedTask = false;
      if (call.lead_id && callStartedAt) {
        const { data: existingTask } = await supabaseAdmin
          .from("tasks")
          .select("id")
          .eq("lead_id", call.lead_id)
          .gte("created_at", callStartedAt.toISOString())
          .limit(1)
          .maybeSingle();
        repAlreadyCreatedTask = !!existingTask;
      }
      if (!repAlreadyCreatedTask) {
        let responsibleAmoUserId: number | null = null;
        if (call.leads?.owner_id) {
          const { data: owner } = await supabaseAdmin
            .from("profiles")
            .select("amocrm_user_id")
            .eq("id", call.leads.owner_id)
            .maybeSingle();
          responsibleAmoUserId = owner?.amocrm_user_id ?? null;
        }
        const completeTill = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
        const taskId = await createAmoTask(
          organizationId,
          leadAmoId,
          result.nextStep,
          completeTill,
          responsibleAmoUserId,
        );
        if (taskId) {
          await supabaseAdmin
            .from("amocrm_calls")
            .update({ amocrm_task_id: taskId, task_created_at: new Date().toISOString() })
            .eq("id", call.id);
        }
      }
    } catch (taskErr) {
      taskWarning =
        taskErr instanceof Error ? taskErr.message : "AmoCRM'da vazifa yaratib bo'lmadi.";
    }
  }

  if (leadAmoId && call.source === "amocrm" && callStartedAt) {
    try {
      const sinceUnix = Math.floor(callStartedAt.getTime() / 1000);
      const repAlreadyWroteNote = await hasHumanNoteSince(organizationId, leadAmoId, sinceUnix);
      if (!repAlreadyWroteNote) {
        const noteLines = [`🤖 AI xulosa: ${result.summary}`];
        if (result.nextStep) noteLines.push(`Kelishuv/keyingi qadam: ${result.nextStep}`);
        const noteId = await createAmoNote(organizationId, leadAmoId, noteLines.join("\n"));
        if (noteId) {
          await supabaseAdmin
            .from("amocrm_calls")
            .update({ ai_note_id: noteId, ai_note_created_at: new Date().toISOString() })
            .eq("id", call.id);
        }
      }
    } catch {
      // A note failing to write must never fail the whole analysis --
      // the task warning above already surfaces AmoCRM write problems.
    }
  }

  // Module 8 (AI automation): the app's own Timeline tab has no record of
  // any analyzed call at all otherwise -- the AmoCRM note above only ever
  // shows up inside AmoCRM itself. Logged for every call with a lead,
  // AmoCRM-sourced or native, so "Lid paneli" always has the AI's finding
  // regardless of which telephony source produced the call.
  if (call.lead_id) {
    try {
      const noteLines = [`🤖 AI xulosa: ${result.summary}`];
      if (result.nextStep) noteLines.push(`Keyingi qadam: ${result.nextStep}`);
      await supabaseAdmin.from("lead_activities").insert({
        organization_id: organizationId,
        lead_id: call.lead_id,
        type: "ai_note",
        content: noteLines.join("\n"),
      });
    } catch {
      // Best-effort, same as every other side-effect in this pipeline.
    }
  }

  // Native task auto-creation -- gated by org_general_settings
  // .ai_task_creation_enabled ("Create AI tasks from calls" in Settings,
  // previously a dead switch with no logic reading it). Skipped whenever
  // the AmoCRM branch above already handles it: an AmoCRM task created via
  // createAmoTask syncs back down into this same `tasks` table within the
  // sync job's own window, so creating a second, separate native task here
  // too would double it.
  const alreadyHandledByAmoCrm = call.source === "amocrm" && !!leadAmoId;
  if (result.nextStep && call.lead_id && !alreadyHandledByAmoCrm) {
    try {
      const { data: settings } = await supabaseAdmin
        .from("org_general_settings")
        .select("ai_task_creation_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      // A task the rep already created for this lead since the call
      // started means they're already on it -- same "don't duplicate what
      // a human already did" rule the AmoCRM branch above applies.
      let repAlreadyCreatedTask = false;
      if (callStartedAt) {
        const { data: existingTask } = await supabaseAdmin
          .from("tasks")
          .select("id")
          .eq("lead_id", call.lead_id)
          .gte("created_at", callStartedAt.toISOString())
          .limit(1)
          .maybeSingle();
        repAlreadyCreatedTask = !!existingTask;
      }
      if (settings?.ai_task_creation_enabled && !repAlreadyCreatedTask) {
        await supabaseAdmin.from("tasks").insert({
          organization_id: organizationId,
          lead_id: call.lead_id,
          title: result.nextStep,
          assignee_id: call.leads?.owner_id ?? null,
          created_by: null,
          due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    } catch {
      // Best-effort -- a failed task insert must never undo the analysis.
    }
  }

  return {
    transcript,
    summary: result.summary,
    nextStep: result.nextStep,
    score,
    mood: result.mood,
    talkRatio: result.talkRatio,
    analysis,
    taskWarning,
  };
}

export const Route = createFileRoute("/audio-analytics/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: caller } = await supabaseAdmin
          .from("profiles")
          .select("organization_id")
          .eq("id", userId)
          .maybeSingle();
        if (!caller?.organization_id)
          return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as { callId?: string };
        if (!body.callId) return Response.json({ error: "callId is required." }, { status: 400 });

        try {
          const result = await analyzeCallById(caller.organization_id, body.callId);
          return Response.json(result);
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Tahlil qilishda xatolik yuz berdi." },
            { status: 500 },
          );
        }
      },
    },
  },
});
