import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Flag,
  Handshake,
  HelpCircle,
  Layers,
  Lightbulb,
  MessageSquare,
  MessageSquareQuote,
  Pause,
  Play,
  Quote,
  RotateCcw,
  RotateCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Swords,
  Target,
  ThumbsUp,
  TrendingUp,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { normalizeCallAnalysis } from "@/hooks/use-crm-data";
import type {
  CallAgreement,
  CallAnalysis,
  CallChecklistItem,
  CallImprovement,
  CallQuote,
} from "@/hooks/use-crm-data";

const CallAnalyticsCharts = lazy(() => import("@/components/audio/CallAnalyticsCharts"));

// A call analyzed before timestamped transcripts shipped stored agreements/
// key_quotes as plain strings -- normalize both shapes here so old and new
// data render the same way, just without a timestamp badge on the old ones.
function asAgreement(item: string | CallAgreement): CallAgreement {
  return typeof item === "string" ? { text: item, timestamp: null } : item;
}
function asQuote(item: string | CallQuote): CallQuote {
  return typeof item === "string" ? { text: item, speaker: null, timestamp: null } : item;
}
function asImprovement(item: string | CallImprovement): CallImprovement {
  return typeof item === "string" ? { title: item, description: "", suggestion: "" } : item;
}

export type TranscriptLine = { speaker: string; timestamp: string; text: string };

// transcribeAudio() (audio-analytics.analyze.ts) writes "[mm:ss] Speaker:
// ..." lines -- split on that marker rather than requiring real newlines,
// since a differently-behaving model response could run them together. A
// call transcribed before that format shipped won't match anything here;
// the caller falls back to rendering it as a single block in that case.
const TRANSCRIPT_LINE_RE = /\[(\d{1,2}:\d{2})\]\s*([^:\n]{1,40}):\s*/g;

function parseTranscript(transcript: string): TranscriptLine[] {
  const matches = [...transcript.matchAll(TRANSCRIPT_LINE_RE)];
  if (matches.length === 0) return [];
  return matches
    .map((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < matches.length ? matches[i + 1]!.index! : transcript.length;
      return { timestamp: m[1]!, speaker: m[2]!.trim(), text: transcript.slice(start, end).trim() };
    })
    .filter((line) => line.text !== "");
}

function TimestampBadge({ timestamp }: { timestamp: string | null | undefined }) {
  if (!timestamp) return null;
  return (
    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
      {timestamp}
    </span>
  );
}

// The full "to'liq tahlil" view for one analyzed call -- shared by the Audio
// tahlil table's row-expand and a lead's own workspace page, so opening the
// same call from either place looks identical. All of this renders fields
// the AI scoring pass (audio-analytics.analyze.ts) already computes and
// saves on amocrm_calls; nothing here calls out to AI itself.
export type CallAnalysisDetailData = {
  score: number | null;
  mood: string | null;
  talkRatio: number | null;
  nextStep: string | null;
  aiSummary: string | null;
  transcript: string | null;
  recordingUrl: string | null;
  analysis: CallAnalysis | null;
  amocrmTaskId?: number | null;
  aiNoteId?: number | null;
};

export function scoreTone(score: number): "success" | "warning" | "danger" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

// The checklist comes back flat (one row per rubric step, already in stage
// order from the rubric) -- grouped here into per-stage sections with a
// points-weighted score, matching the "Sotuv bosqichlari" breakdown from
// the reference tool rather than one long undifferentiated list.
function groupChecklistByStage(checklist: CallChecklistItem[]): {
  stage: string;
  items: CallChecklistItem[];
  metCount: number;
  pct: number;
}[] {
  const order: string[] = [];
  const byStage = new Map<string, CallChecklistItem[]>();
  for (const item of checklist) {
    // An item the AI returned without a stage still gets a group.
    const stage = item.stage || "—";
    if (!byStage.has(stage)) {
      byStage.set(stage, []);
      order.push(stage);
    }
    byStage.get(stage)!.push(item);
  }
  return order.map((stage) => {
    const items = byStage.get(stage)!;
    const totalPoints = items.reduce((s, i) => s + (Number(i.points) || 0), 0);
    const metPoints = items.reduce((s, i) => s + (i.met ? Number(i.points) || 0 : 0), 0);
    return {
      stage,
      items,
      metCount: items.filter((i) => i.met).length,
      pct: totalPoints > 0 ? Math.round((metPoints / totalPoints) * 100) : 0,
    };
  });
}

// ---- shared building blocks -------------------------------------------------

type Tone = "primary" | "success" | "warning" | "danger" | "neutral" | "violet";

const TONE_TILE: Record<Tone, string> = {
  primary: "bg-primary/12 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/12 text-destructive",
  neutral: "bg-muted text-muted-foreground",
  violet: "bg-violet-500/12 text-violet-500",
};

const TONE_TEXT: Record<Tone, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  neutral: "text-muted-foreground",
  violet: "text-violet-500",
};

// One analysis block: icon tile + bold uppercase title, an optional count or
// badge on the right, then its content -- the same card chrome for every
// section so a long analysis reads as one consistent column.
export function AnalysisPanel({
  icon: Icon,
  title,
  tone = "neutral",
  right,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  tone?: Tone;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      <header className="flex items-center gap-3">
        <span
          className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", TONE_TILE[tone])}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-extrabold uppercase tracking-wide text-foreground">
          {title}
        </h3>
        {right}
      </header>
      {children !== undefined && <div className="mt-3.5">{children}</div>}
    </section>
  );
}

function CountBadge({ value, tone = "neutral" }: { value: ReactNode; tone?: Tone }) {
  return <span className={cn("text-sm font-bold tabular-nums", TONE_TEXT[tone])}>{value}</span>;
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-sm italic text-subtle">{children}</p>;
}

function DotList({ items, tone }: { items: string[]; tone: Tone }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] text-foreground">
          <span
            className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", {
              "bg-success": tone === "success",
              "bg-destructive": tone === "danger",
              "bg-warning": tone === "warning",
              "bg-primary": tone === "primary",
              "bg-subtle": tone === "neutral" || tone === "violet",
            })}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// Mood text -> card tint. The model answers in free Uzbek/Russian/English
// words, so this is a keyword match, defaulting to "neutral".
function moodTone(mood: string): "positive" | "neutral" | "negative" {
  const m = mood.toLowerCase();
  if (/(norozi|salbiy|jahl|asab|g'azab|negativ|rad|недов|негат|angry|upset)/.test(m))
    return "negative";
  if (/(ijobiy|qiziq|xursand|mamnun|samimiy|iliq|позит|довол|positive|interested|happy)/.test(m))
    return "positive";
  return "neutral";
}

const OUTCOME_TONE: Record<"positive" | "neutral" | "negative", string> = {
  positive: "border-success/30 bg-success/10 text-success",
  neutral: "border-warning/30 bg-warning/10 text-warning",
  negative: "border-destructive/30 bg-destructive/10 text-destructive",
};

const PRIORITY_KEY = {
  low: "ca.priorityLow",
  medium: "ca.priorityMedium",
  high: "ca.priorityHigh",
};

// ---- the four headline cards ------------------------------------------------

const RING_RADIUS = 34;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ScoreCard({ score }: { score: number }) {
  const { t } = useI18n();
  const tone = scoreTone(score);
  const color =
    tone === "success"
      ? "var(--color-success)"
      : tone === "warning"
        ? "var(--color-warning)"
        : "var(--color-destructive)";
  const offset = RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="relative h-[84px] w-[84px] shrink-0">
        <svg width={84} height={84} viewBox="0 0 84 84" className="-rotate-90">
          <circle
            cx={42}
            cy={42}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth={7}
          />
          <circle
            cx={42}
            cy={42}
            r={RING_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold tabular-nums leading-none text-foreground">
            {score}
          </span>
          <span className="mt-0.5 font-mono text-[10px] text-subtle">/100</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">
          {t("ca.score")}
        </p>
        <span
          className={cn(
            "mt-1.5 inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold",
            tone === "success"
              ? "bg-success/12 text-success"
              : tone === "warning"
                ? "bg-warning/15 text-warning"
                : "bg-destructive/12 text-destructive",
          )}
        >
          {tone === "success"
            ? t("ca.scoreSuccess")
            : tone === "warning"
              ? t("ca.scoreAverage")
              : t("ca.scoreFail")}
        </span>
      </div>
    </div>
  );
}

function MoodCard({ mood }: { mood: string }) {
  const { t } = useI18n();
  const tone = moodTone(mood);
  const tint =
    tone === "positive"
      ? "border-success/30 bg-success/8"
      : tone === "negative"
        ? "border-destructive/30 bg-destructive/8"
        : "border-warning/30 bg-warning/8";
  const accent =
    tone === "positive"
      ? "text-success"
      : tone === "negative"
        ? "text-destructive"
        : "text-warning";
  const dot =
    tone === "positive" ? "bg-success" : tone === "negative" ? "bg-destructive" : "bg-warning";
  return (
    <div className={cn("flex flex-col justify-center rounded-2xl border p-4", tint)}>
      <p className={cn("text-[11px] font-bold uppercase tracking-wider", accent)}>
        {t("audio.mood")}
      </p>
      <p className={cn("mt-2 flex items-center gap-2 text-xl font-extrabold capitalize", accent)}>
        <span className={cn("h-3 w-3 shrink-0 rounded-full", dot)} />
        <span className="min-w-0 truncate">{mood}</span>
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{t("ca.moodSub", { mood })}</p>
    </div>
  );
}

function NextStepCard({ hasNextStep }: { hasNextStep: boolean }) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "flex flex-col justify-center rounded-2xl border p-4",
        hasNextStep ? "border-success/30 bg-success/8" : "border-destructive/30 bg-destructive/8",
      )}
    >
      <p
        className={cn(
          "text-[11px] font-bold uppercase tracking-wider",
          hasNextStep ? "text-success" : "text-destructive",
        )}
      >
        {t("audio.nextStep")}
      </p>
      <p
        className={cn(
          "mt-2 flex items-center gap-2 text-xl font-extrabold",
          hasNextStep ? "text-success" : "text-destructive",
        )}
      >
        <span
          className={cn(
            "grid h-7 w-7 place-items-center rounded-lg",
            hasNextStep ? "bg-success text-white" : "bg-destructive text-white",
          )}
        >
          {hasNextStep ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        </span>
        {hasNextStep ? t("audio.hasNextStep") : t("audio.noNextStep")}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {hasNextStep ? t("audio.hasNextStepInfo") : t("audio.noNextStepInfo")}
      </p>
    </div>
  );
}

const DONUT_R = 30;
const DONUT_C = 2 * Math.PI * DONUT_R;

function TalkRatioCard({ ratio }: { ratio: number }) {
  const { t } = useI18n();
  const op = Math.max(0, Math.min(100, ratio));
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="relative h-[84px] w-[84px] shrink-0">
        <svg width={84} height={84} viewBox="0 0 84 84" className="-rotate-90">
          <circle
            cx={42}
            cy={42}
            r={DONUT_R}
            fill="none"
            stroke="var(--color-success)"
            strokeWidth={10}
          />
          <circle
            cx={42}
            cy={42}
            r={DONUT_R}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={10}
            strokeDasharray={`${(op / 100) * DONUT_C} ${DONUT_C}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-extrabold tabular-nums leading-none text-foreground">
            {op}
            <span className="text-[10px]">%</span>
          </span>
          <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-subtle">
            Talk
          </span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">
          {t("ca.talkRatio")}
        </p>
        <p className="flex items-center justify-between gap-2 text-sm text-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-primary" /> {t("ca.operator")}
          </span>
          <span className="font-bold tabular-nums">{op}%</span>
        </p>
        <p className="flex items-center justify-between gap-2 text-sm text-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-success" /> {t("ca.customer")}
          </span>
          <span className="font-bold tabular-nums">{100 - op}%</span>
        </p>
      </div>
    </div>
  );
}

// ---- overview sections ------------------------------------------------------

function ImprovementsPanel({
  items,
  violatedStandards,
}: {
  items: (string | CallImprovement)[];
  violatedStandards: string[];
}) {
  const { t } = useI18n();
  const normalized = items.map(asImprovement);
  const isStandard = (title: string) => {
    const x = title.toLowerCase();
    return violatedStandards.some((s) => {
      const y = s.toLowerCase();
      return x.includes(y) || y.includes(x);
    });
  };
  return (
    <AnalysisPanel
      icon={AlertTriangle}
      title={t("ca.improvements")}
      tone="warning"
      right={<CountBadge value={normalized.length} tone="warning" />}
    >
      {normalized.length === 0 ? (
        <EmptyLine>{t("audio.noImprovements")}</EmptyLine>
      ) : (
        <ul className="space-y-4">
          {normalized.map((item, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-foreground">
                  {item.title}
                  {isStandard(item.title) && (
                    <span className="rounded-md bg-destructive/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
                      {t("ca.standardTag")}
                    </span>
                  )}
                </p>
                {item.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                )}
                {item.suggestion && (
                  <div className="mt-2.5 rounded-xl border-l-[3px] border-warning bg-muted/60 px-3.5 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                      {t("ca.sayItLikeThis")}
                    </p>
                    <p className="mt-1 text-sm text-foreground">{item.suggestion}</p>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AnalysisPanel>
  );
}

function SalesStagesPanel({ checklist }: { checklist: CallChecklistItem[] }) {
  const { t } = useI18n();
  const groups = useMemo(() => groupChecklistByStage(checklist), [checklist]);
  // null = untouched (first stage open by default); "" = all closed.
  const [open, setOpen] = useState<string | null>(null);
  const openStage = open ?? groups[0]?.stage ?? "";
  if (groups.length === 0) return null;
  return (
    <AnalysisPanel icon={Layers} title={t("audio.salesStages")} tone="primary">
      <div className="space-y-2">
        {groups.map((g) => {
          const isOpen = openStage === g.stage;
          const tone =
            g.pct >= 70
              ? "success"
              : g.pct > 0
                ? "warning"
                : g.metCount === 0 && g.items.length > 0
                  ? "danger"
                  : "neutral";
          return (
            <div
              key={g.stage}
              className="overflow-hidden rounded-xl border border-border bg-surface/60"
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? "" : g.stage)}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-accent/50"
              >
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", {
                    "bg-success": tone === "success",
                    "bg-warning": tone === "warning",
                    "bg-destructive": tone === "danger",
                    "bg-subtle": tone === "neutral",
                  })}
                />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">
                  {g.stage}
                </span>
                <span className="font-mono text-xs text-subtle">
                  {g.metCount}/{g.items.length}
                </span>
                <span
                  className={cn(
                    "w-9 text-right text-base font-extrabold tabular-nums",
                    TONE_TEXT[tone],
                  )}
                >
                  {g.items.length ? g.pct : "—"}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-subtle transition-transform",
                    isOpen ? "rotate-0" : "-rotate-90",
                  )}
                />
              </button>
              {isOpen && (
                <ul
                  className={cn(
                    "mx-3 mb-3 space-y-2.5 rounded-xl border p-3",
                    g.pct >= 70
                      ? "border-success/20 bg-success/5"
                      : "border-destructive/20 bg-destructive/5",
                  )}
                >
                  {g.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      {item.met ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm",
                            item.met ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {item.step}
                        </p>
                        {item.note && <p className="mt-0.5 text-xs text-primary">{item.note}</p>}
                      </div>
                      <TimestampBadge timestamp={item.timestamp} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </AnalysisPanel>
  );
}

function ServiceStandardsPanel({ standards }: { standards: CallAnalysis["serviceStandards"] }) {
  const { t } = useI18n();
  if (standards.length === 0) return null;
  const ok = standards.filter((s) => !s.violated).length;
  return (
    <AnalysisPanel
      icon={ShieldCheck}
      title={t("audio.serviceStandards")}
      tone="danger"
      right={
        <CountBadge
          value={`${ok}/${standards.length}`}
          tone={ok === standards.length ? "success" : "danger"}
        />
      }
    >
      <ul className="space-y-2">
        {standards.map((s, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-xl border border-border bg-surface/60 px-3.5 py-3"
          >
            {s.violated ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-foreground">{s.name}</p>
              {s.violated && s.evidence && (
                <p className="mt-0.5 text-xs text-destructive/80">{s.evidence}</p>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 text-[11px] font-bold uppercase tracking-wide",
                s.violated ? "text-destructive" : "text-success",
              )}
            >
              {s.violated ? t("ca.violated") : t("ca.notViolated")}
            </span>
          </li>
        ))}
      </ul>
    </AnalysisPanel>
  );
}

function QuotesPanel({ quotes }: { quotes: (string | CallQuote)[] }) {
  const { t } = useI18n();
  const list = quotes.map(asQuote);
  return (
    <AnalysisPanel icon={Quote} title={t("ca.keyQuotes")} tone="violet">
      {list.length === 0 ? (
        <EmptyLine>{t("ca.noData")}</EmptyLine>
      ) : (
        <ul className="space-y-3">
          {list.map((q, i) => {
            const isCustomer = q.speaker
              ? !/operator|menejer|оператор|manager/i.test(q.speaker)
              : true;
            return (
              <li
                key={i}
                className={cn(
                  "border-l-2 pl-3.5",
                  isCustomer ? "border-success" : "border-primary",
                )}
              >
                <p className="text-[15px] text-primary">"{q.text}"</p>
                <p className="mt-1 flex items-center gap-2 text-[11px]">
                  <span
                    className={cn(
                      "font-bold uppercase tracking-wide",
                      isCustomer ? "text-success" : "text-primary",
                    )}
                  >
                    {isCustomer ? t("ca.customer") : t("ca.operator")}
                  </span>
                  {q.timestamp && <span className="font-mono text-subtle">{q.timestamp}</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </AnalysisPanel>
  );
}

// ---- deep analysis (Analitika tab) -----------------------------------------

function DeepAnalysisSections({ analysis }: { analysis: CallAnalysis }) {
  const { t } = useI18n();
  const dp = analysis.dealProbability ?? null;
  const objections = analysis.objectionHandling ?? [];
  const questions = analysis.customerQuestions ?? [];
  const signals = analysis.buyingSignals ?? [];
  const pains = analysis.painPoints ?? [];
  const competitors = analysis.competitors ?? [];
  const price = analysis.priceDiscussion ?? null;
  const hasDeep =
    !!dp ||
    objections.length > 0 ||
    questions.length > 0 ||
    signals.length > 0 ||
    pains.length > 0 ||
    competitors.length > 0 ||
    !!price ||
    !!analysis.coachingTip ||
    !!analysis.followUpMessage;

  if (!hasDeep) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/60 p-5 text-sm text-muted-foreground">
        {t("ca.deepMissing")}
      </div>
    );
  }

  const dpTone: Tone = !dp
    ? "neutral"
    : dp.value >= 60
      ? "success"
      : dp.value >= 30
        ? "warning"
        : "danger";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {dp && (
          <AnalysisPanel
            icon={TrendingUp}
            title={t("ca.dealProbability")}
            tone={dpTone}
            right={<CountBadge value={`${dp.value}%`} tone={dpTone} />}
          >
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", {
                  "bg-success": dpTone === "success",
                  "bg-warning": dpTone === "warning",
                  "bg-destructive": dpTone === "danger",
                })}
                style={{ width: `${dp.value}%` }}
              />
            </div>
            {dp.reason && <p className="mt-3 text-sm text-muted-foreground">{dp.reason}</p>}
          </AnalysisPanel>
        )}
        {analysis.coachingTip && (
          <AnalysisPanel icon={Lightbulb} title={t("ca.coachingTip")} tone="warning">
            <p className="text-[15px] text-foreground">{analysis.coachingTip}</p>
          </AnalysisPanel>
        )}
      </div>

      <AnalysisPanel
        icon={Swords}
        title={t("ca.objectionHandling")}
        tone="danger"
        right={<CountBadge value={objections.length} tone="danger" />}
      >
        {objections.length === 0 ? (
          <EmptyLine>{t("audio.noObjections")}</EmptyLine>
        ) : (
          <ul className="space-y-3">
            {objections.map((o, i) => (
              <li key={i} className="rounded-xl border border-border bg-surface/60 p-3.5">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-[15px] font-semibold text-foreground">
                    "{o.objection}"
                  </p>
                  <TimestampBadge timestamp={o.timestamp} />
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase",
                      o.handled
                        ? "bg-success/12 text-success"
                        : "bg-destructive/12 text-destructive",
                    )}
                  >
                    {o.handled ? t("ca.handled") : t("ca.notHandled")}
                  </span>
                </div>
                {o.managerResponse && (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{t("ca.managerSaid")}: </span>
                    {o.managerResponse}
                  </p>
                )}
                {o.betterResponse && (
                  <div className="mt-2.5 rounded-xl border-l-[3px] border-success bg-success/5 px-3.5 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-success">
                      {t("ca.betterAnswer")}
                    </p>
                    <p className="mt-1 text-sm text-foreground">{o.betterResponse}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </AnalysisPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <AnalysisPanel
          icon={HelpCircle}
          title={t("ca.customerQuestions")}
          tone="primary"
          right={<CountBadge value={questions.length} tone="primary" />}
        >
          {questions.length === 0 ? (
            <EmptyLine>{t("ca.noData")}</EmptyLine>
          ) : (
            <ul className="space-y-2">
              {questions.map((q, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  {q.answered ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span className="min-w-0 flex-1 text-foreground">{q.question}</span>
                  <TimestampBadge timestamp={q.timestamp} />
                </li>
              ))}
            </ul>
          )}
        </AnalysisPanel>
        <AnalysisPanel
          icon={Target}
          title={t("ca.buyingSignals")}
          tone="success"
          right={<CountBadge value={signals.length} tone="success" />}
        >
          {signals.length === 0 ? (
            <EmptyLine>{t("ca.noSignals")}</EmptyLine>
          ) : (
            <ul className="space-y-2">
              {signals.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                  <span className="min-w-0 flex-1">{b.text}</span>
                  <TimestampBadge timestamp={b.timestamp} />
                </li>
              ))}
            </ul>
          )}
        </AnalysisPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AnalysisPanel icon={Flag} title={t("ca.painPoints")} tone="warning">
          {pains.length === 0 ? (
            <EmptyLine>{t("ca.noData")}</EmptyLine>
          ) : (
            <DotList items={pains} tone="warning" />
          )}
        </AnalysisPanel>
        <AnalysisPanel icon={Swords} title={t("ca.competitors")} tone="violet">
          {competitors.length === 0 ? (
            <EmptyLine>{t("ca.noCompetitors")}</EmptyLine>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {competitors.map((c) => (
                <span
                  key={c}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-xs font-semibold text-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </AnalysisPanel>
        <AnalysisPanel icon={Wallet} title={t("ca.priceDiscussion")} tone="success">
          {!price || !price.discussed ? (
            <EmptyLine>{t("ca.priceNotDiscussed")}</EmptyLine>
          ) : (
            <p className="text-sm text-foreground">{price.details}</p>
          )}
        </AnalysisPanel>
      </div>

      {analysis.followUpMessage && (
        <AnalysisPanel
          icon={Send}
          title={t("ca.followUp")}
          tone="primary"
          right={
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(analysis.followUpMessage ?? "")
                  .then(() => toast.success(t("ca.copied")));
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40"
            >
              <Copy className="h-3.5 w-3.5" /> {t("ca.copy")}
            </button>
          }
        >
          <p className="whitespace-pre-wrap rounded-xl bg-muted/60 p-3.5 text-[15px] leading-relaxed text-foreground">
            {analysis.followUpMessage}
          </p>
        </AnalysisPanel>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const PLAYBACK_RATES = [1, 1.5, 2] as const;

function CallAudioPlayer({ url }: { url: string }) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rateIndex, setRateIndex] = useState(0);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      void audio.play();
    }
  }

  function skip(delta: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + delta));
  }

  function seekTo(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrent(value);
  }

  function cycleRate() {
    const nextIndex = (rateIndex + 1) % PLAYBACK_RATES.length;
    setRateIndex(nextIndex);
    if (audioRef.current) audioRef.current.playbackRate = PLAYBACK_RATES[nextIndex]!;
  }

  return (
    // sticky, not fixed -- keeps the scrubber reachable while scrolling
    // through a long transcript/analysis below it (this is a long-lived
    // audio player, not a one-off control), and un-sticks naturally once
    // its containing block (the table row / list item / dialog it's
    // embedded in) scrolls out of view, so it never floats somewhere it
    // no longer belongs.
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
      />
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={() => skip(-10)}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => skip(10)}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <RotateCw className="h-4 w-4" />
      </button>
      <span className="w-9 shrink-0 text-xs tabular-nums text-subtle">{formatTime(current)}</span>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={current}
        onChange={(e) => seekTo(Number(e.target.value))}
        className="h-1.5 flex-1 accent-primary"
      />
      <span className="w-9 shrink-0 text-xs tabular-nums text-subtle">{formatTime(duration)}</span>
      <button
        type="button"
        onClick={cycleRate}
        title={t("audio.speed")}
        className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
      >
        {PLAYBACK_RATES[rateIndex]}x
      </button>
      <a
        href={url}
        download
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  );
}

const TABS = ["overview", "transcript", "analytics"] as const;
type Tab = (typeof TABS)[number];
const TAB_META: Record<Tab, { key: string; icon: LucideIcon }> = {
  overview: { key: "audio.tabOverview", icon: Layers },
  transcript: { key: "audio.tabTranscript", icon: MessageSquare },
  analytics: { key: "audio.tabAnalytics", icon: BarChart3 },
};

export function CallAnalysisDetail({ call }: { call: CallAnalysisDetailData }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("overview");
  const transcriptLines = useMemo(
    () => (call.transcript ? parseTranscript(call.transcript) : []),
    [call.transcript],
  );
  const a = useMemo(() => normalizeCallAnalysis(call.analysis), [call.analysis]);
  const outcome = a?.callOutcome ?? null;
  const nsd = a?.nextStepDetail ?? null;
  const nextAction = nsd?.action || call.nextStep;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-fit gap-1 rounded-2xl border border-border bg-surface p-1">
          {TABS.map((tb) => {
            const Icon = TAB_META[tb].icon;
            return (
              <button
                key={tb}
                type="button"
                onClick={() => setTab(tb)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors",
                  tab === tb
                    ? "bg-background text-foreground shadow-soft"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                <Icon className="h-4 w-4" />
                {t(TAB_META[tb].key)}
              </button>
            );
          })}
        </div>
        {outcome && (
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold",
              OUTCOME_TONE[outcome.tone],
            )}
          >
            <TrendingUp className="h-4 w-4" />
            {t("ca.callOutcome")}: {outcome.label}
          </span>
        )}
      </div>

      {call.recordingUrl && <CallAudioPlayer url={call.recordingUrl} />}

      {tab === "overview" && (
        <div className="space-y-4">
          {a?.callFamily && !a.callFamily.scored && (
            <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
              <p className="font-semibold text-warning">
                {t("audio.excludedFamily", { name: a.callFamily.name })}
              </p>
              {a.callFamily.exclusionReason && (
                <p className="mt-0.5 text-muted-foreground">{a.callFamily.exclusionReason}</p>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {call.score != null && <ScoreCard score={call.score} />}
            {call.mood && <MoodCard mood={call.mood} />}
            {/* "Was a next step actually agreed with the customer" -- not the
                same as the AI's recommendation below, which always exists. */}
            <NextStepCard hasNextStep={a ? a.agreements.length > 0 : !!call.nextStep} />
            {call.talkRatio != null && <TalkRatioCard ratio={call.talkRatio} />}
          </div>

          {nextAction && (
            <AnalysisPanel
              icon={CalendarCheck}
              title={t("ca.managerNextStep")}
              tone="warning"
              right={
                nsd ? (
                  <span
                    className={cn(
                      "rounded-lg px-2 py-1 text-xs font-semibold",
                      nsd.priority === "high"
                        ? "bg-destructive/12 text-destructive"
                        : nsd.priority === "low"
                          ? "bg-muted text-muted-foreground"
                          : "bg-warning/15 text-warning",
                    )}
                  >
                    {t(PRIORITY_KEY[nsd.priority])}
                  </span>
                ) : undefined
              }
              className="border-warning/30"
            >
              <p className="text-[17px] font-medium leading-snug text-foreground">{nextAction}</p>
              {nsd?.reason && <p className="mt-2 text-sm text-muted-foreground">{nsd.reason}</p>}
              {(call.amocrmTaskId || call.aiNoteId) && (
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {call.amocrmTaskId && (
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {t("audio.taskCreated")}
                    </span>
                  )}
                  {call.aiNoteId && (
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {t("audio.noteCreated")}
                    </span>
                  )}
                </div>
              )}
            </AnalysisPanel>
          )}

          {call.aiSummary && (
            <AnalysisPanel icon={MessageSquare} title={t("ca.callSummary")}>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                {call.aiSummary}
              </p>
            </AnalysisPanel>
          )}

          {a && (
            <>
              <AnalysisPanel
                icon={Flag}
                title={`${t("ca.warnings")} (${a.warnings.length})`}
                tone="warning"
              >
                {a.warnings.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" /> {t("audio.noWarnings")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {a.warnings.map((w, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 px-3.5 py-3 text-[15px] font-medium text-foreground"
                      >
                        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </AnalysisPanel>

              <ImprovementsPanel
                items={a.improvements}
                violatedStandards={a.serviceStandards.filter((s) => s.violated).map((s) => s.name)}
              />

              <div className="grid gap-4 lg:grid-cols-2">
                <AnalysisPanel
                  icon={ThumbsUp}
                  title={t("ca.strengths")}
                  tone="success"
                  right={<CountBadge value={a.strengths.length} tone="success" />}
                >
                  {a.strengths.length === 0 ? (
                    <EmptyLine>{t("ca.noData")}</EmptyLine>
                  ) : (
                    <DotList items={a.strengths} tone="success" />
                  )}
                </AnalysisPanel>
                <AnalysisPanel
                  icon={ShieldAlert}
                  title={t("ca.risks")}
                  tone="warning"
                  right={<CountBadge value={a.risks.length} tone="warning" />}
                >
                  {a.risks.length === 0 ? (
                    <EmptyLine>{t("ca.noData")}</EmptyLine>
                  ) : (
                    <DotList items={a.risks} tone="danger" />
                  )}
                </AnalysisPanel>
              </div>

              <SalesStagesPanel checklist={a.checklist} />
              <ServiceStandardsPanel standards={a.serviceStandards} />

              <AnalysisPanel
                icon={Handshake}
                title={t("ca.agreements")}
                tone="success"
                right={<CountBadge value={a.agreements.length} tone="success" />}
              >
                {a.agreements.length === 0 ? (
                  <EmptyLine>{t("ca.noData")}</EmptyLine>
                ) : (
                  <ul className="space-y-2">
                    {a.agreements.map(asAgreement).map((g, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[15px] text-foreground">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        <span className="min-w-0 flex-1">{g.text}</span>
                        <TimestampBadge timestamp={g.timestamp} />
                      </li>
                    ))}
                  </ul>
                )}
              </AnalysisPanel>

              <QuotesPanel quotes={a.keyQuotes} />

              <AnalysisPanel icon={MessageSquareQuote} title={t("ca.objections")} tone="warning">
                {a.topObjections.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" /> {t("ca.noObjections")}
                  </p>
                ) : (
                  <DotList items={a.topObjections} tone="warning" />
                )}
              </AnalysisPanel>
            </>
          )}
        </div>
      )}

      {tab === "transcript" && (
        <div className="rounded-2xl border border-border bg-card p-4">
          {!call.transcript ? (
            <p className="text-sm text-subtle">{t("audio.noTranscript")}</p>
          ) : transcriptLines.length > 0 ? (
            <div className="space-y-3">
              {transcriptLines.map((line, i) => {
                const isOperator = /operator|menejer|op\b|оператор/i.test(line.speaker);
                return (
                  <div
                    key={i}
                    className={cn("flex items-end gap-2", isOperator && "flex-row-reverse")}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                        isOperator ? "bg-primary/15 text-primary" : "bg-success/15 text-success",
                      )}
                    >
                      {isOperator ? "OP" : "M"}
                    </span>
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3 py-2 text-sm text-foreground",
                        isOperator ? "rounded-br-sm bg-primary/10" : "rounded-bl-sm bg-success/10",
                      )}
                    >
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                        {line.speaker} · {line.timestamp}
                      </p>
                      <p>{line.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{call.transcript}</p>
          )}
        </div>
      )}

      {tab === "analytics" && a && (
        <div className="space-y-4">
          <DeepAnalysisSections analysis={a} />
          <Suspense fallback={null}>
            <CallAnalyticsCharts
              talkRatio={call.talkRatio}
              transcriptLines={transcriptLines}
              analysis={a}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
