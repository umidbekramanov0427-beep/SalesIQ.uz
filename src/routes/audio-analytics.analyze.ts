import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createAmoNote, createAmoTask, hasHumanNoteSince } from "@/lib/amocrm/client.server";
import { callGemini } from "@/lib/gemini.server";

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
              text: "Transcribe this audio recording of a phone call verbatim, in Uzbek. Return only the transcript text, no commentary, no speaker labels, no timestamps.",
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
    throw new Error(`Gemini transcription error (${res.status}): ${text}`);
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

// "Xizmat yo'nalishlari" (service_lines), "Lid sifati bosqichlari"
// (lead_quality_stages) and "Anketa savollari" (intake_questions) configured
// on Baholash mezoni -- gives the model the business's own product lines,
// qualification ladder and intake questions so it reasons in those terms
// instead of generic categories, AND (via the returned id-indexed lists)
// lets the caller ask for a plain 1-based index back and resolve it to a
// real row id afterwards -- never trust an LLM to echo a UUID correctly.
async function buildPlaybookBlock(organizationId: string): Promise<{
  text: string;
  serviceLines: PlaybookOption[];
  leadQualityStages: PlaybookOption[];
  intakeQuestions: PlaybookOption[];
}> {
  const [{ data: lines }, { data: stages }, { data: questions }] = await Promise.all([
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
  return {
    text: parts.length > 0 ? "\n\n" + parts.join("\n\n") : "",
    serviceLines,
    leadQualityStages,
    intakeQuestions,
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
  isLostLead: boolean,
): string {
  const base =
    '{"summary": "qo\'ng\'iroq mavzusi va mijoz kayfiyati haqida qisqa xulosa", ' +
    '"next_step": "menejer keyin aniq nima qilishi kerak — bitta lo\'nda jumla", ' +
    '"mood": "mijozning umumiy kayfiyati — bir-ikki so\'z (masalan: qiziqgan, betaraf, norozi)", ' +
    '"talk_ratio": "menejerning gapirish vaqti foizda taxminiy baho, 0 dan 100 gacha butun son", ' +
    '"strengths": ["menejer yaxshi qilgan narsalar ro\'yxati"], ' +
    '"improvements": ["yaxshilash kerak bo\'lgan narsalar ro\'yxati"], ' +
    "\"warnings\": [\"ogohlantirishga arziydigan holatlar ro'yxati, bo'lmasa bo'sh ro'yxat\"], " +
    "\"risks\": [\"bitim yo'qolish xavfi bilan bog'liq holatlar, bo'lmasa bo'sh ro'yxat\"], " +
    '"agreements": ["tomonlar kelishib olgan narsalar, bo\'lmasa bo\'sh ro\'yxat"], ' +
    '"key_quotes": ["suhbatdan 2-4 ta muhim, so\'zma-so\'z iqtibos"], ' +
    "\"top_objections\": [\"mijoz bildirgan e'tirozlar, bo'lmasa bo'sh ro'yxat\"], " +
    '"service_standards": [{"n": 1, "violated": false, "evidence": "buzilgan bo\'lsa qisqa dalil/iqtibos, aks holda bo\'sh matn"}, ...]';

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
    "\n\nQuyidagi tekshiruv ro'yxati (checklist) asosida qo'ng'iroqni bahola. Har bir band uchun menejer buni bajarganmi yoki yo'qmi (met: true/false) va qisqa izoh (note) ber:\n" +
    checklistLines +
    "\n\nJavobni faqat quyidagi JSON formatida qaytar, boshqa hech qanday matn yozma:\n{" +
    base.slice(1) +
    ', "checklist": [{"n": 1, "met": true, "note": "qisqa izoh"}, ...] — checklist massivida yuqoridagi RO\'YXATDAGI HAR BIR band uchun aynan bitta yozuv bo\'lishi kerak, "n" band raqamiga mos kelishi kerak' +
    extra +
    "}"
  );
}

async function analyzeTranscript(
  transcript: string,
  systemPrompt: string,
  rubric: RubricStep[],
  serviceLines: PlaybookOption[],
  leadQualityStages: PlaybookOption[],
  intakeQuestions: PlaybookOption[],
  isLostLead: boolean,
): Promise<{
  summary: string;
  nextStep: string | null;
  mood: string | null;
  talkRatio: number | null;
  score: number | null;
  checklist: { n: number; met: boolean; note: string }[];
  strengths: string[];
  improvements: string[];
  warnings: string[];
  risks: string[];
  agreements: string[];
  trainingRecommendation: { errorCategory: string; title: string; description: string } | null;
  recoverable: { isRecoverable: boolean; reason: string } | null;
  keyQuotes: string[];
  topObjections: string[];
  serviceStandards: { n: number; violated: boolean; evidence: string }[];
  serviceLineN: number | null;
  leadQualityStageN: number | null;
  intakeAnswers: { n: number; answer: string }[];
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
                isLostLead,
              ),
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: transcript }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    },
    30_000,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

  try {
    const parsed = JSON.parse(content) as {
      summary?: string;
      next_step?: string;
      mood?: string;
      talk_ratio?: number | string;
      score?: number | string;
      checklist?: { n?: number; met?: boolean; note?: string }[];
      strengths?: string[];
      improvements?: string[];
      warnings?: string[];
      risks?: string[];
      agreements?: string[];
      key_quotes?: string[];
      top_objections?: string[];
      service_standards?: { n?: number; violated?: boolean; evidence?: string }[];
      service_line_n?: number | string | null;
      lead_quality_stage_n?: number | string | null;
      intake_answers?: { n?: number; answer?: string }[];
      training_recommendation?: {
        error_category?: string;
        title?: string;
        description?: string;
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
        ? parsed.checklist.filter(
            (c): c is { n: number; met: boolean; note: string } =>
              typeof c.n === "number" && typeof c.met === "boolean",
          )
        : [],
      strengths: asStringArray(parsed.strengths),
      improvements: asStringArray(parsed.improvements),
      warnings: asStringArray(parsed.warnings),
      risks: asStringArray(parsed.risks),
      agreements: asStringArray(parsed.agreements),
      keyQuotes: asStringArray(parsed.key_quotes),
      topObjections: asStringArray(parsed.top_objections),
      serviceStandards: Array.isArray(parsed.service_standards)
        ? parsed.service_standards.filter(
            (s): s is { n: number; violated: boolean; evidence: string } =>
              typeof s.n === "number" && typeof s.violated === "boolean",
          )
        : [],
      serviceLineN: Number.isFinite(serviceLineN) ? serviceLineN : null,
      leadQualityStageN: Number.isFinite(leadQualityStageN) ? leadQualityStageN : null,
      intakeAnswers: Array.isArray(parsed.intake_answers)
        ? parsed.intake_answers
            .filter((a): a is { n: number; answer: string } => typeof a.n === "number")
            .map((a) => ({ n: a.n, answer: (a.answer ?? "").trim() }))
        : [],
      trainingRecommendation,
      recoverable,
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
      serviceLineN: null,
      leadQualityStageN: null,
      intakeAnswers: [],
      trainingRecommendation: null,
      recoverable: null,
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
  const { data: call } = await supabaseAdmin
    .from("amocrm_calls")
    .select(
      "id, lead_id, recording_url, source, amocrm_task_id, occurred_at, leads:lead_id(amocrm_id, owner_id, stage_id)",
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
    isLostLead,
  );

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

  const noteByN = new Map(result.checklist.map((c) => [c.n, c.note ?? ""]));
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
    })),
    strengths: result.strengths,
    improvements: result.improvements,
    warnings: result.warnings,
    risks: result.risks,
    agreements: result.agreements,
    keyQuotes: result.keyQuotes,
    topObjections: result.topObjections,
    serviceStandards: SERVICE_STANDARDS.map((name, i) => ({
      name,
      violated: standardByN.get(i + 1)?.violated ?? false,
      evidence: standardByN.get(i + 1)?.evidence ?? "",
    })),
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

  if (call.lead_id && (score != null || leadQualityStageId || (isLostLead && result.recoverable))) {
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
