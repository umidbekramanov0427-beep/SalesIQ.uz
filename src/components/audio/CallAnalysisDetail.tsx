import { lazy, Suspense, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  MessageSquareQuote,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
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
    if (!byStage.has(item.stage)) {
      byStage.set(item.stage, []);
      order.push(item.stage);
    }
    byStage.get(item.stage)!.push(item);
  }
  return order.map((stage) => {
    const items = byStage.get(stage)!;
    const totalPoints = items.reduce((s, i) => s + i.points, 0);
    const metPoints = items.reduce((s, i) => s + (i.met ? i.points : 0), 0);
    return {
      stage,
      items,
      metCount: items.filter((i) => i.met).length,
      pct: totalPoints > 0 ? Math.round((metPoints / totalPoints) * 100) : 0,
    };
  });
}

// Unlike the old BulletList this replaces, a section always renders --
// hiding it entirely on an empty analysis result reads as "still loading"
// rather than "the AI genuinely found nothing here", which is itself a
// useful, honest signal (e.g. "Risklar: Ma'lumot yo'q").
export function CountedList({
  icon: Icon,
  label,
  items,
  tone,
  emptyLabel,
}: {
  icon: typeof ThumbsUp;
  label: string;
  items: string[];
  tone: "success" | "warning" | "danger" | "neutral";
  emptyLabel: string;
}) {
  const toneClass = {
    success: "border-success/20 bg-success/5 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning-foreground",
    danger: "border-destructive/20 bg-destructive/5 text-destructive",
    neutral: "border-border bg-surface text-foreground",
  }[tone];
  return (
    <div className={cn("rounded-lg border p-2.5", toneClass)}>
      <p className="flex items-center justify-between gap-1.5 text-xs font-semibold uppercase tracking-wide">
        <span className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" /> {label}
        </span>
        <span className="rounded-md bg-background/60 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
          {items.length}
        </span>
      </p>
      {items.length === 0 ? (
        <p className="mt-1.5 text-sm text-subtle">{emptyLabel}</p>
      ) : (
        <ul className="mt-1.5 space-y-1 text-sm text-foreground">
          {items.map((item, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-subtle">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImprovementsSection({ items }: { items: (string | CallImprovement)[] }) {
  const { t } = useI18n();
  const normalized = items.map(asImprovement);
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-warning-foreground">
      <p className="flex items-center justify-between gap-1.5 text-xs font-semibold uppercase tracking-wide">
        <span className="flex items-center gap-1.5">
          <ThumbsDown className="h-3.5 w-3.5" /> {t("audio.improvements")}
        </span>
        <span className="rounded-md bg-background/60 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
          {normalized.length}
        </span>
      </p>
      {normalized.length === 0 ? (
        <p className="mt-1.5 text-sm text-subtle">{t("audio.noImprovements")}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {normalized.map((item, i) => (
            <li key={i} className="rounded-lg border border-border bg-surface p-2.5 text-sm">
              <p className="font-semibold text-foreground">{item.title}</p>
              {item.description && (
                <p className="mt-0.5 text-muted-foreground">{item.description}</p>
              )}
              {item.suggestion && (
                <div className="mt-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
                  <span className="font-semibold uppercase tracking-wide text-subtle">
                    {t("audio.sayItLikeThis")}:{" "}
                  </span>
                  <span className="italic text-foreground">{item.suggestion}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const RING_RADIUS = 30;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ScoreRing({ score }: { score: number }) {
  const { t } = useI18n();
  const tone = scoreTone(score);
  const strokeColor =
    tone === "success"
      ? "var(--color-success)"
      : tone === "warning"
        ? "var(--color-warning)"
        : "var(--color-destructive)";
  const label =
    tone === "success"
      ? t("audio.scoreExcellent")
      : tone === "warning"
        ? t("audio.scoreGood")
        : t("audio.scoreLow");
  const offset = RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <div className="surface-card flex flex-col items-center gap-1.5 p-4">
      <div className="relative h-[76px] w-[76px]">
        <svg width={76} height={76} viewBox="0 0 76 76" className="-rotate-90">
          <circle
            cx={38}
            cy={38}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth={6}
          />
          <circle
            cx={38}
            cy={38}
            r={RING_RADIUS}
            fill="none"
            stroke={strokeColor}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-foreground">{score}</span>
          <span className="text-[10px] text-subtle">/100</span>
        </div>
      </div>
      <span
        className={cn(
          "text-xs font-semibold",
          tone === "success"
            ? "text-success"
            : tone === "warning"
              ? "text-warning-foreground"
              : "text-destructive",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function MoodCard({ mood }: { mood: string }) {
  const { t } = useI18n();
  return (
    <div className="surface-card flex flex-col justify-center gap-1.5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{t("audio.mood")}</p>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
        <span className="text-base font-semibold text-foreground">{mood}</span>
      </div>
    </div>
  );
}

function NextStepCard({ hasNextStep }: { hasNextStep: boolean }) {
  const { t } = useI18n();
  return (
    <div className="surface-card flex flex-col justify-center gap-1.5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
        {t("audio.nextStep")}
      </p>
      <div className="flex items-center gap-2">
        <CheckCircle2
          className={cn("h-4 w-4 shrink-0", hasNextStep ? "text-success" : "text-subtle")}
        />
        <span className="text-base font-semibold text-foreground">
          {hasNextStep ? t("audio.hasNextStep") : t("audio.noNextStep")}
        </span>
      </div>
      <p className="text-xs text-subtle">
        {hasNextStep ? t("audio.hasNextStepInfo") : t("audio.noNextStepInfo")}
      </p>
    </div>
  );
}

function TalkRatioCard({ ratio }: { ratio: number }) {
  const { t } = useI18n();
  return (
    <div className="surface-card flex flex-col justify-center gap-2 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
        {t("audio.talkRatio")}
      </p>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-primary" style={{ width: `${ratio}%` }} />
        <div className="flex-1 bg-mint-border" />
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {t("audio.chart.rep")} {ratio}%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-mint-border" /> {t("audio.chart.customer")}{" "}
          {100 - ratio}%
        </span>
      </div>
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
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
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
const TAB_LABEL_KEY: Record<Tab, string> = {
  overview: "audio.tabOverview",
  transcript: "audio.tabTranscript",
  analytics: "audio.tabAnalytics",
};

export function CallAnalysisDetail({ call }: { call: CallAnalysisDetailData }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("overview");

  const stageGroups = useMemo(
    () => (call.analysis ? groupChecklistByStage(call.analysis.checklist) : []),
    [call.analysis],
  );
  const transcriptLines = useMemo(
    () => (call.transcript ? parseTranscript(call.transcript) : []),
    [call.transcript],
  );
  // "" means "explicitly closed by the user"; null means "no interaction
  // yet", which defaults to the first stage open -- distinct from "" so a
  // user closing the default-open stage doesn't just reopen it next render.
  const [openStage, setOpenStage] = useState<string | null>(null);
  const effectiveOpenStage = openStage ?? stageGroups[0]?.stage ?? null;

  return (
    <div className="space-y-4">
      {call.recordingUrl && <CallAudioPlayer url={call.recordingUrl} />}

      <div className="flex w-fit gap-1 rounded-xl border border-border bg-surface p-1">
        {TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === tb
                ? "bg-background text-foreground shadow-soft"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {t(TAB_LABEL_KEY[tb])}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          {call.analysis?.callFamily &&
            (call.analysis.callFamily.scored ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-subtle">
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground">
                  {call.analysis.callFamily.name}
                </span>
              </p>
            ) : (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
                <p className="font-semibold text-warning-foreground">
                  {t("audio.excludedFamily", { name: call.analysis.callFamily.name })}
                </p>
                {call.analysis.callFamily.exclusionReason && (
                  <p className="mt-0.5 text-muted-foreground">
                    {call.analysis.callFamily.exclusionReason}
                  </p>
                )}
              </div>
            ))}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {call.score != null && <ScoreRing score={call.score} />}
            {call.mood && <MoodCard mood={call.mood} />}
            <NextStepCard hasNextStep={!!call.nextStep} />
            {call.talkRatio != null && <TalkRatioCard ratio={call.talkRatio} />}
          </div>

          {(call.nextStep || call.amocrmTaskId || call.aiNoteId) && (
            <div className="rounded-lg border border-mint/30 bg-mint/10 p-3">
              {call.nextStep && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-mint-foreground">
                    {t("audio.nextStep")}
                  </p>
                  <p className="mt-1 text-sm text-foreground">{call.nextStep}</p>
                </>
              )}
              {call.amocrmTaskId && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-mint-foreground" />
                  {t("audio.taskCreated")}
                </p>
              )}
              {call.aiNoteId && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-mint-foreground" />
                  {t("audio.noteCreated")}
                </p>
              )}
            </div>
          )}

          {call.aiSummary && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {t("audio.aiSummary")}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{call.aiSummary}</p>
            </div>
          )}

          {call.analysis && (
            <>
              <div className="rounded-lg border border-border bg-surface p-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                  {t("audio.warnings")}
                </p>
                {call.analysis.warnings.length === 0 ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" /> {t("audio.noWarnings")}
                  </p>
                ) : (
                  <ul className="mt-1.5 space-y-1 text-sm text-destructive">
                    {call.analysis.warnings.map((w, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span>·</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <ImprovementsSection items={call.analysis.improvements} />

              <div className="grid gap-2 sm:grid-cols-2">
                <CountedList
                  icon={ThumbsUp}
                  label={t("audio.strengths")}
                  items={call.analysis.strengths}
                  tone="success"
                  emptyLabel={t("audio.noStrengths")}
                />
                <CountedList
                  icon={ShieldAlert}
                  label={t("audio.risks")}
                  items={call.analysis.risks}
                  tone="danger"
                  emptyLabel={t("audio.noRisks")}
                />
              </div>
            </>
          )}
        </div>
      )}

      {tab === "transcript" && (
        <div className="rounded-lg border border-border bg-surface p-3">
          {!call.transcript ? (
            <p className="text-sm text-subtle">{t("audio.noTranscript")}</p>
          ) : transcriptLines.length > 0 ? (
            <div className="space-y-3">
              {transcriptLines.map((line, i) => {
                const isOperator = /operator|menejer|op\b/i.test(line.speaker);
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

      {tab === "analytics" && call.analysis && (
        <div className="space-y-4">
          {stageGroups.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
                {t("audio.salesStages")}
              </p>
              <div className="mt-1.5 space-y-2">
                {stageGroups.map((group) => {
                  const isOpen = effectiveOpenStage === group.stage;
                  return (
                    <div key={group.stage} className="rounded-lg border border-border/60">
                      <button
                        type="button"
                        onClick={() => setOpenStage(isOpen ? "" : group.stage)}
                        className="flex w-full items-center justify-between gap-2 p-2 text-left"
                      >
                        <span className="text-sm font-semibold text-foreground">{group.stage}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[11px] font-bold",
                              group.pct >= 70
                                ? "bg-success/15 text-success"
                                : group.pct > 0
                                  ? "bg-warning/15 text-warning-foreground"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            {group.metCount}/{group.items.length} · {group.pct}%
                          </span>
                          <ChevronDown
                            className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
                          />
                        </span>
                      </button>
                      {isOpen && (
                        <ul className="space-y-1.5 border-t border-border/60 p-2">
                          {group.items.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <CheckCircle2
                                className={cn(
                                  "mt-0.5 h-4 w-4 shrink-0",
                                  item.met ? "text-success" : "text-subtle",
                                )}
                              />
                              <span className={cn("flex-1", !item.met && "text-muted-foreground")}>
                                {item.step}
                                {item.note && (
                                  <span className="block text-xs text-subtle">{item.note}</span>
                                )}
                              </span>
                              <TimestampBadge timestamp={item.timestamp} />
                              <span className="shrink-0 text-xs text-subtle">
                                {item.points} {t("audio.pts")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {call.analysis.serviceStandards.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-2.5">
              <p className="flex items-center justify-between gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                <span>{t("audio.serviceStandards")}</span>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-foreground">
                  {call.analysis.serviceStandards.filter((s) => !s.violated).length}/
                  {call.analysis.serviceStandards.length}
                </span>
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {call.analysis.serviceStandards.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {s.violated ? (
                      <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    )}
                    <span className="flex-1">
                      {s.name}
                      {s.violated && s.evidence && (
                        <span className="block text-xs text-destructive/80">{s.evidence}</span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase",
                        s.violated
                          ? "bg-destructive/15 text-destructive"
                          : "bg-success/15 text-success",
                      )}
                    >
                      {s.violated ? t("audio.violated") : t("audio.notViolated")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {call.analysis.agreements.length > 0 && (
              <div className="rounded-lg border border-border bg-surface p-2.5 text-foreground">
                <p className="flex items-center justify-between gap-1.5 text-xs font-semibold uppercase tracking-wide">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t("audio.agreements")}
                  </span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
                    {call.analysis.agreements.length}
                  </span>
                </p>
                <ul className="mt-1.5 space-y-1.5 text-sm">
                  {call.analysis.agreements.map(asAgreement).map((a, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-subtle">·</span>
                      <span className="flex-1">{a.text}</span>
                      <TimestampBadge timestamp={a.timestamp} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <CountedList
              icon={MessageSquareQuote}
              label={t("audio.topObjections")}
              items={call.analysis.topObjections}
              tone="neutral"
              emptyLabel={t("audio.noObjections")}
            />
          </div>

          {call.analysis.keyQuotes.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                <MessageSquareQuote className="h-3.5 w-3.5" /> {t("audio.keyQuotes")}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {call.analysis.keyQuotes.map(asQuote).map((q, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-2 border-l-2 border-primary/30 pl-2 text-sm italic text-foreground"
                  >
                    <span>
                      "{q.text}"
                      {q.speaker && (
                        <span className="ml-1.5 not-italic text-xs text-subtle">— {q.speaker}</span>
                      )}
                    </span>
                    <TimestampBadge timestamp={q.timestamp} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Suspense fallback={null}>
            <CallAnalyticsCharts
              talkRatio={call.talkRatio}
              transcriptLines={transcriptLines}
              analysis={call.analysis}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
