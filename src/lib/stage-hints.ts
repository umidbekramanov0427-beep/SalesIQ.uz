// Stage hints by experience (5CRM's «bosqich uchun maslahatlar»): each stage
// can carry three texts -- for new people («Yangi boshlovchi»), for those
// with some experience («Tajribali xodim») and for everyone else («Usta»,
// the original `hint` column). Who gets which is worked out from the person:
// a trainee or someone in their first 30 days is new, up to 6 months is
// experienced, the rest -- and admins / heads of sales -- are masters.

export type HintLevel = "novice" | "experienced" | "master";
export const HINT_LEVELS: readonly HintLevel[] = ["novice", "experienced", "master"];

const DAY = 86_400_000;

export function hintLevelOf(
  person: { role?: string | null; isIntern?: boolean; joinedAt?: string | null },
  now = Date.now(),
): HintLevel {
  if (person.role && person.role !== "sotuv_menejeri") return "master";
  if (person.isIntern) return "novice";
  const joined = person.joinedAt ? new Date(person.joinedAt).getTime() : NaN;
  if (!Number.isFinite(joined)) return "master";
  const days = (now - joined) / DAY;
  if (days < 30) return "novice";
  if (days < 183) return "experienced";
  return "master";
}

type HintCols = {
  hint?: string | null;
  hint_novice?: string | null;
  hint_experienced?: string | null;
};

/** The stored text of one level (`hint` is the «Usta» level). */
export function hintOfLevel(s: HintCols, level: HintLevel): string {
  const v =
    level === "novice" ? s.hint_novice : level === "experienced" ? s.hint_experienced : s.hint;
  return (v ?? "").trim();
}

/**
 * The hint a person of `level` sees: their own level's text, else the next
 * more experienced one that is filled (a new person rather sees the
 * experienced text than nothing), else the first filled one at all.
 */
export function stageHintFor(s: HintCols, level: HintLevel): string {
  const from = HINT_LEVELS.indexOf(level);
  const order = [...HINT_LEVELS.slice(from), ...HINT_LEVELS.slice(0, from).reverse()];
  for (const l of order) {
    const v = hintOfLevel(s, l);
    if (v) return v;
  }
  return "";
}

/** The column holding each level. */
export const HINT_COLUMN: Record<HintLevel, "hint_novice" | "hint_experienced" | "hint"> = {
  novice: "hint_novice",
  experienced: "hint_experienced",
  master: "hint",
};

/** The ready-made texts of a default stage (its i18n short key), or null. */
export const DEFAULT_HINT_STAGES = [
  "unsorted",
  "firstContact",
  "negotiation",
  "decision",
  "contract",
] as const;

export function defaultHints(
  stageKey: string,
  t: (key: string) => string,
): Record<HintLevel, string> | null {
  if (!(DEFAULT_HINT_STAGES as readonly string[]).includes(stageKey)) return null;
  return {
    novice: t(`fs.hint.${stageKey}.novice`),
    experienced: t(`fs.hint.${stageKey}.experienced`),
    master: t(`fs.hint.${stageKey}.master`),
  };
}

/**
 * Which default stage an existing stage is, for «Standart matnni qo'yish»:
 * by its name in the current language, else by its kind (stage_value) and
 * place among the open stages.
 */
export function guessDefaultStage(
  stage: { name: string; stage_value?: string | null; position?: number | null },
  t: (key: string) => string,
): string | null {
  const name = stage.name.trim().toLowerCase();
  for (const k of DEFAULT_HINT_STAGES) if (t(`fs.def.${k}`).trim().toLowerCase() === name) return k;
  switch (stage.stage_value) {
    case "new":
      return "unsorted";
    case "in_work":
      return (stage.position ?? 0) <= 1 ? "firstContact" : "negotiation";
    case "expected":
      return /to'lov|shartnoma|оплат|договор|payment|contract/i.test(stage.name)
        ? "contract"
        : "decision";
    default:
      return null;
  }
}
