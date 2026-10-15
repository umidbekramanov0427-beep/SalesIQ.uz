// How likely a lead is to buy, from its chat: a 0-100 score, Hot / Warm /
// Cold, the reasons and the next step. This is the rule-based part -- the
// AI (lead-scoring.server.ts) refines it when available, and it stands on
// its own when the AI is off or fails. Pure, so it is tested.

export type Temperature = "Hot" | "Warm" | "Cold";

export type ChatMessage = { direction: "in" | "out"; text: string; created_at: string };

export type LeadSignals = {
  messages: ChatMessage[];
  budget?: number | null;
  /** The stage's win probability, 0-100 (pipeline_stages.probability). */
  stageProbability?: number | null;
  now?: number;
};

// Words that show buying intent / pushback, Uzbek (Latin and Cyrillic) and Russian.
const BUY = [
  /narx|narh|qancha|nechpul|necha pul|summa|to'lov|tolov|to‘lov|buyurtma|zakaz|olaman|olmoqchi|sotib ol|manzil|qayerda|yetkaz|dostav|shartnoma|hisob[- ]?faktura|kartaga|click|payme|chegirma|skidka|qachon|bugun|ertaga/i,
  /цен|сколько|стоим|оплат|заказ|куп|адрес|доставк|договор|счет|счёт|скидк|когда|сегодня|завтра|нарх|қанча|тўлов|буюртма/i,
];
const NEGATIVE = [
  /qimmat|kerak emas|keyinroq|o'ylab ko'raman|oylab koraman|qiziq emas|rahmat kerakmas|boshqa joydan|olmadim|olmayman|bekor/i,
  /дорого|не нужно|не надо|позже|подумаю|не интерес|отказ|уже купил|қиммат|керак эмас/i,
];

const HOUR = 3_600_000;

export type Heuristic = {
  score: number;
  temperature: Temperature;
  reasons: string[];
  nextAction: string;
};

export function temperatureOf(score: number): Temperature {
  return score >= 70 ? "Hot" : score >= 40 ? "Warm" : "Cold";
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** The rule-based score and its reasons (in Uzbek, as shown to the team). */
export function heuristicScore(s: LeadSignals): Heuristic {
  const now = s.now ?? Date.now();
  const incoming = s.messages.filter((m) => m.direction === "in");
  const outgoing = s.messages.filter((m) => m.direction === "out");
  const text = incoming.map((m) => m.text).join("\n");
  const reasons: string[] = [];
  let score = 30;

  const buyHits = BUY.reduce((n, re) => n + (text.match(new RegExp(re, "gi"))?.length ?? 0), 0);
  const negHits = NEGATIVE.reduce(
    (n, re) => n + (text.match(new RegExp(re, "gi"))?.length ?? 0),
    0,
  );
  if (buyHits) {
    score += Math.min(30, buyHits * 10);
    reasons.push("Narx, to'lov yoki buyurtma haqida so'radi");
  }
  if (negHits) {
    score -= Math.min(30, negHits * 12);
    reasons.push("E'tiroz bildirdi (qimmat / keyinroq / kerak emas)");
  }

  if (incoming.length >= 5) {
    score += 12;
    reasons.push(`Faol yozishyapti (${incoming.length} ta xabar)`);
  } else if (incoming.length >= 2) {
    score += 6;
  } else if (incoming.length === 0) {
    score -= 15;
    reasons.push("Hali birorta xabar yozmagan");
  }

  const lastIn = incoming.map((m) => Date.parse(m.created_at)).sort((a, b) => b - a)[0];
  if (lastIn !== undefined) {
    const ago = now - lastIn;
    if (ago < 2 * HOUR) {
      score += 10;
      reasons.push("Oxirgi 2 soatda yozdi");
    } else if (ago > 72 * HOUR) {
      score -= 15;
      reasons.push("3 kundan beri javob yo'q");
    }
  }

  // Answered our last message vs left it unanswered.
  const lastOut = outgoing.map((m) => Date.parse(m.created_at)).sort((a, b) => b - a)[0];
  if (
    lastOut !== undefined &&
    (lastIn === undefined || lastOut > lastIn) &&
    now - lastOut > 24 * HOUR
  ) {
    score -= 8;
    reasons.push("Oxirgi xabarimizga javob bermagan");
  }

  if ((s.budget ?? 0) > 0) {
    score += 5;
    reasons.push("Byudjet ko'rsatilgan");
  }
  if (s.stageProbability != null) score += (s.stageProbability - 50) / 5;

  const final = clamp(score);
  const temperature = temperatureOf(final);
  const nextAction =
    temperature === "Hot"
      ? "Hoziroq qo'ng'iroq qiling yoki to'lov havolasini yuboring"
      : temperature === "Warm"
        ? negHits
          ? "E'tirozga javob bering: foyda va chegirmani ayting"
          : "Aniq taklif yuboring va qo'ng'iroq vaqtini kelishing"
        : incoming.length === 0
          ? "Qo'ng'iroq qilib, ehtiyojini aniqlang"
          : "Eslatma yuboring yoki foydali ma'lumot ulashing";
  return { score: final, temperature, reasons: reasons.slice(0, 4), nextAction };
}

/** The chat as plain lines for the AI prompt, newest last, trimmed. */
export function chatTranscript(messages: ChatMessage[], max = 40): string {
  return messages
    .slice(-max)
    .map(
      (m) =>
        `${m.direction === "in" ? "Mijoz" : "Biz"}: ${m.text.replace(/\s+/g, " ").slice(0, 400)}`,
    )
    .join("\n");
}

/** Reads the AI's JSON answer; null when it's unusable. */
export function parseAiScore(raw: unknown): Heuristic | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const score = Number(r["score"]);
  if (!Number.isFinite(score)) return null;
  const reasons = Array.isArray(r["reasons"])
    ? r["reasons"].filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 4)
    : [];
  const nextAction = typeof r["next_action"] === "string" ? r["next_action"].trim() : "";
  const final = clamp(score);
  return { score: final, temperature: temperatureOf(final), reasons, nextAction };
}
