import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callGemini } from "@/lib/gemini.server";

// The Telegram interview that drives the AI setup proposal — separate from
// business_profile's own onboarding questions (telegram_onboarding_step),
// which personalize the AI assistant's tone rather than the CRM's actual
// pipeline/quality-stage configuration.
export const AI_SETUP_QUESTIONS: { field: string; text: string }[] = [
  {
    field: "product",
    text: "Kompaniyangiz qanday mahsulot yoki xizmat sotadi? Qisqacha yozing.",
  },
  {
    field: "funnel",
    text: "Sotuv jarayoningiz odatda qanday bosqichlardan o'tadi? (masalan: Lid → Aloqa → Taklif → Kelishuv → Yopilgan). Bosqichlarni vergul bilan ajratib yozing.",
  },
  {
    field: "team",
    text: "Jamoangizda nechta sotuvchi/menejer bor va ular qanday taqsimlangan (hudud, mahsulot turi, yoki boshqa)?",
  },
  {
    field: "sourceCrm",
    text: "Hozir qaysi CRM yoki vositadan foydalanasiz (agar bo'lsa)? Masalan: AmoCRM, Bitrix24, Excel. Bo'lmasa \"yo'q\" deb yozing.",
  },
  {
    field: "goal",
    text: "SalesIQ'ga o'tishdan asosiy maqsadingiz nima? Qaysi muammoni hal qilmoqchisiz?",
  },
];

export type OnboardingAnswers = Record<string, string>;

export type OnboardingProposal = {
  pipelineName: string;
  pipelineStages: { name: string; probability: number; isWon?: boolean; isLost?: boolean }[];
  leadQualityStages: { title: string; qualified: boolean; conditions: string[] }[];
  summary: string;
  migrationRecommendation: string;
};

function detectSourceCrm(answer: string | undefined): string | null {
  if (!answer) return null;
  const lower = answer.toLowerCase();
  if (lower.includes("amocrm") || lower.includes("амо")) return "amocrm";
  if (lower.includes("bitrix") || lower.includes("битрикс")) return "bitrix24";
  if (lower.includes("excel") || lower.includes("эксель") || lower.includes("jadval"))
    return "excel";
  if (
    lower.includes("yo'q") ||
    lower.includes("yoq") ||
    lower.includes("нет") ||
    lower.includes("no")
  )
    return "none";
  return "other";
}

function fallbackProposal(answers: OnboardingAnswers): OnboardingProposal {
  const rawStages = (answers["funnel"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const stageNames =
    rawStages.length > 0 ? rawStages : ["Yangi lid", "Aloqa", "Taklif", "Kelishuv", "Yopilgan"];
  const step = Math.max(1, Math.floor(90 / stageNames.length));
  return {
    pipelineName: "AI tavsiya qilingan voronka",
    pipelineStages: stageNames.map((name, i) => ({
      name,
      probability: Math.min(100, (i + 1) * step),
      isWon: i === stageNames.length - 1,
    })),
    leadQualityStages: [
      { title: "Issiq", qualified: true, conditions: ["Tez orada sotib olishga tayyor"] },
      { title: "Iliq", qualified: true, conditions: ["Qiziqish bildirgan, lekin qaror qilmagan"] },
      {
        title: "Sovuq",
        qualified: false,
        conditions: ["Hozircha ehtiyoj yo'q yoki javob bermayapti"],
      },
    ],
    summary:
      "AI javob bera olmadi — bu andozaviy (standart) taklif, uni istalgan vaqt tahrirlashingiz mumkin.",
    migrationRecommendation:
      "Avvalgi tizimingizdagi ma'lumotlarni Excel/CSV fayl sifatida eksport qiling va Integratsiyalar → Ma'lumot import qilish bo'limidan yuklang.",
  };
}

export async function generateOnboardingProposal(
  answers: OnboardingAnswers,
): Promise<OnboardingProposal> {
  const apiKey = process.env["GEMINI_API_KEY"];
  const fallback = fallbackProposal(answers);
  if (!apiKey) return fallback;

  const prompt =
    "Siz B2B CRM platformasi uchun onboarding bo'yicha maslahatchisiz. Quyidagi mijoz javoblariga asoslanib, unga mos sotuv voronkasi (pipeline) bosqichlarini va lid sifati (issiq/iliq/sovuq kabi) bosqichlarini taklif qiling. FAQAT quyidagi JSON formatida javob ber, boshqa hech qanday matn yozma:\n" +
    '{"pipelineName": "voronka nomi", ' +
    '"pipelineStages": [{"name": "bosqich nomi", "probability": <0-100 son>, "isWon": <true faqat oxirgi g\'olib bosqich uchun>, "isLost": <true faqat yo\'qotilgan bosqich uchun>}, ...], ' +
    '"leadQualityStages": [{"title": "nomi", "qualified": <true/false>, "conditions": ["qisqa shart", ...]}, ...3 ta], ' +
    '"summary": "2-3 jumlali xulosa, nega shu tuzilma tavsiya etilgani", ' +
    '"migrationRecommendation": "avvalgi CRM/vositadan ko\'chirish bo\'yicha 1-2 jumlali aniq tavsiya"}\n\n' +
    "Mijoz javoblari:\n" +
    `Mahsulot/xizmat: ${answers["product"] ?? "—"}\n` +
    `Sotuv bosqichlari (o'zi aytgan): ${answers["funnel"] ?? "—"}\n` +
    `Jamoa tuzilishi: ${answers["team"] ?? "—"}\n` +
    `Hozirgi CRM: ${answers["sourceCrm"] ?? "—"}\n` +
    `Maqsad: ${answers["goal"] ?? "—"}\n`;

  try {
    const res = await callGemini(
      apiKey,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
      },
      25_000,
    );
    if (!res.ok) return fallback;
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const parsed = JSON.parse(content) as Partial<OnboardingProposal>;
    if (!Array.isArray(parsed.pipelineStages) || parsed.pipelineStages.length === 0)
      return fallback;
    return {
      pipelineName:
        typeof parsed.pipelineName === "string" && parsed.pipelineName.trim()
          ? parsed.pipelineName
          : fallback.pipelineName,
      pipelineStages: parsed.pipelineStages
        .filter((s): s is { name: string; probability: number } => typeof s?.name === "string")
        .map((s, i, arr) => ({
          name: s.name,
          probability:
            typeof s.probability === "number" ? Math.max(0, Math.min(100, s.probability)) : 0,
          isWon: (s as { isWon?: boolean }).isWon === true || i === arr.length - 1,
          isLost: (s as { isLost?: boolean }).isLost === true,
        })),
      leadQualityStages: Array.isArray(parsed.leadQualityStages)
        ? parsed.leadQualityStages
            .filter(
              (q: unknown): q is Record<string, unknown> => typeof q === "object" && q !== null,
            )
            .filter((q) => typeof q["title"] === "string")
            .map((q) => ({
              title: q["title"] as string,
              qualified: q["qualified"] !== false,
              conditions: Array.isArray(q["conditions"])
                ? (q["conditions"] as unknown[]).filter((c) => typeof c === "string")
                : [],
            }))
        : fallback.leadQualityStages,
      summary: typeof parsed.summary === "string" ? parsed.summary : fallback.summary,
      migrationRecommendation:
        typeof parsed.migrationRecommendation === "string"
          ? parsed.migrationRecommendation
          : fallback.migrationRecommendation,
    };
  } catch {
    return fallback;
  }
}

/** Runs the interview → proposal step and saves it, called once the last AI_SETUP_QUESTIONS answer comes in. */
export async function finishOnboardingInterview(
  organizationId: string,
  answers: OnboardingAnswers,
): Promise<void> {
  const proposal = await generateOnboardingProposal(answers);
  await supabaseAdmin
    .from("org_ai_onboarding")
    .update({
      status: "proposal_ready",
      answers,
      proposal,
      source_crm: detectSourceCrm(answers["sourceCrm"]),
      proposal_generated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Writes an approved proposal into real pipeline_stages / lead_quality_stages rows, as a new pipeline appended after any existing ones (never overwrites what's already there). */
export async function applyOnboardingProposal(
  organizationId: string,
  proposal: OnboardingProposal,
  appliedBy: string,
): Promise<void> {
  const { data: lastStage } = await supabaseAdmin
    .from("pipeline_stages")
    .select("position")
    .eq("organization_id", organizationId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let position = (lastStage?.position ?? 0) + 1;

  for (const stage of proposal.pipelineStages) {
    await supabaseAdmin.from("pipeline_stages").insert({
      organization_id: organizationId,
      key: `ai-${randomSuffix()}`,
      name: stage.name,
      pipeline_name: proposal.pipelineName,
      position: position++,
      probability: stage.probability,
      is_won: !!stage.isWon,
      is_lost: !!stage.isLost,
    });
  }

  const { data: lastQuality } = await supabaseAdmin
    .from("lead_quality_stages")
    .select("position")
    .eq("organization_id", organizationId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let qPosition = (lastQuality?.position ?? 0) + 1;

  for (const q of proposal.leadQualityStages) {
    await supabaseAdmin.from("lead_quality_stages").insert({
      organization_id: organizationId,
      title: q.title,
      position: qPosition++,
      qualified: q.qualified,
      conditions: q.conditions,
    });
  }

  await supabaseAdmin
    .from("org_ai_onboarding")
    .update({ status: "applied", applied_at: new Date().toISOString(), applied_by: appliedBy })
    .eq("organization_id", organizationId);
}
