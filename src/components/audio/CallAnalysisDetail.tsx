import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  MessageSquareText,
  Pause,
  Play,
  Printer,
  RotateCcw,
  RotateCw,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useRecordingUrl } from "@/hooks/use-recording-url";
import { normalizeCallAnalysis, useCreateTask } from "@/hooks/use-crm-data";
import type {
  CallAgreement,
  CallAnalysis,
  CallChecklistItem,
  CallImprovement,
  CallQuote,
} from "@/hooks/use-crm-data";
import { copyText } from "@/lib/clipboard";
import { gradeOf, stageMarks, timestampSeconds } from "@/lib/call-grade";
import { GradeLetter, Stamp } from "@/components/audio/report/ReportControls";
import { formatClock } from "@/components/audio/report/report-utils";

const CallAnalyticsCharts = lazy(() => import("@/components/audio/CallAnalyticsCharts"));

// One analysed call as a "baho varag'i" (report card): the verdict and the
// grade at the top, the recording with the call's key moments marked on it,
// the next step with its buttons, then three pages -- the card itself (stage
// marks, what to say instead, the client, objections...), the conversation
// with the AI's "red pen" notes in the margin, and the charts. Shared by
// Audio tahlil, a lead's analysis page and the lead card's AI tab. Nothing
// here calls the AI; it renders what audio-analytics.analyze.ts saved.

// A call analyzed before timestamped transcripts shipped stored agreements/
// key_quotes as plain strings -- normalize both shapes here so old and new
// data render the same way, just without a timestamp on the old ones.
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

const isOperatorSpeaker = (speaker: string) =>
  /operator|menejer|op\b|оператор|manager/i.test(speaker);

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
  /** Lets "Vazifa qilish" put the next step on the lead as a task. */
  leadId?: string | null;
  durationSeconds?: number;
  /** The lead's quality stage ("Sifatli lid ..."), when the company uses them. */
  leadQuality?: { title: string; qualified: boolean } | null;
};

export function scoreTone(score: number): "success" | "warning" | "danger" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

// ---- the panel the lead page's own sections still use ----------------------

type Tone = "primary" | "success" | "warning" | "danger" | "neutral" | "violet";

const TONE_TILE: Record<Tone, string> = {
  primary: "bg-primary/12 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/12 text-destructive",
  neutral: "bg-muted text-muted-foreground",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-300",
};

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

// ---- the recording, shared by the player, the moments and the transcript ----

type Player = {
  ref: React.RefObject<HTMLAudioElement | null>;
  playing: boolean;
  current: number;
  duration: number;
  seek: (seconds: number, play?: boolean) => void;
  toggle: () => void;
};

function usePlayer(fallbackDuration: number | undefined): Player & {
  bind: {
    onPlay: () => void;
    onPause: () => void;
    onEnded: () => void;
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
    onTimeUpdate: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  };
} {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(fallbackDuration ?? 0);
  return {
    ref,
    playing,
    current,
    duration,
    seek(seconds, play = true) {
      const a = ref.current;
      if (!a) return;
      a.currentTime = Math.max(0, seconds);
      setCurrent(a.currentTime);
      if (play) void a.play().catch(() => undefined);
    },
    toggle() {
      const a = ref.current;
      if (!a) return;
      if (a.paused) void a.play().catch(() => undefined);
      else a.pause();
    },
    bind: {
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: () => setPlaying(false),
      onLoadedMetadata: (e) => {
        const d = e.currentTarget.duration;
        if (Number.isFinite(d) && d > 0) setDuration(d);
      },
      onTimeUpdate: (e) => setCurrent(e.currentTarget.currentTime),
    },
  };
}

type Moment = {
  at: number;
  kind: "objection" | "agreement" | "signal" | "question";
  label: string;
};

const MOMENT_COLOR: Record<Moment["kind"], string> = {
  objection: "var(--rp-d)",
  agreement: "var(--rp-a)",
  signal: "var(--rp-c)",
  question: "var(--rp-mute)",
};

function collectMoments(a: CallAnalysis | null): Moment[] {
  if (!a) return [];
  const out: Moment[] = [];
  const add = (ts: string | null | undefined, kind: Moment["kind"], label: string) => {
    const at = timestampSeconds(ts);
    if (at != null) out.push({ at, kind, label });
  };
  for (const o of a.objectionHandling ?? []) add(o.timestamp, "objection", o.objection);
  for (const g of a.agreements.map(asAgreement)) add(g.timestamp, "agreement", g.text);
  for (const s of a.buyingSignals ?? []) add(s.timestamp, "signal", s.text);
  for (const q of a.customerQuestions ?? []) add(q.timestamp, "question", q.question);
  return out.sort((x, y) => x.at - y.at);
}

const PLAYBACK_RATES = [1, 1.5, 2] as const;

function PlayerStrip({
  url,
  player,
  bind,
  moments,
}: {
  url: string;
  player: Player;
  bind: ReturnType<typeof usePlayer>["bind"];
  moments: Moment[];
}) {
  const { t } = useI18n();
  const src = useRecordingUrl(url);
  const [rateIndex, setRateIndex] = useState(0);
  const { duration, current } = player;
  const pct = (s: number) => (duration > 0 ? Math.min(100, (s / duration) * 100) : 0);

  return (
    <div
      className="rp-noprint flex flex-wrap items-center gap-3 px-5 py-3 phone:px-3"
      style={{
        background: "var(--rp-paper-2)",
        borderTop: "2px solid var(--rp-strong)",
        borderBottom: "2px solid var(--rp-strong)",
      }}
    >
      <audio ref={player.ref} src={src ?? undefined} preload="metadata" {...bind} />
      <button
        type="button"
        onClick={player.toggle}
        aria-label={player.playing ? t("rp.pause") : t("rp.listen")}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
        style={{ background: "var(--rp-accent)", color: "var(--rp-accent-fg)" }}
      >
        {!src ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : player.playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="ml-0.5 h-4 w-4" />
        )}
      </button>
      <button
        type="button"
        onClick={() => player.seek(current - 10, player.playing)}
        aria-label="-10s"
        className="rp-mute hover:opacity-70"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => player.seek(current + 10, player.playing)}
        aria-label="+10s"
        className="rp-mute hover:opacity-70"
      >
        <RotateCw className="h-4 w-4" />
      </button>
      <div className="relative h-8 min-w-[180px] flex-1">
        <div
          className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{ background: "var(--rp-rule)" }}
        />
        <div
          className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{ width: `${pct(current)}%`, background: "var(--rp-accent)" }}
        />
        {moments.map((m, i) => (
          <button
            key={i}
            type="button"
            onClick={() => player.seek(m.at)}
            title={`${formatClock(m.at)} · ${t(`rp.moment.${m.kind}`)}: ${m.label}`}
            aria-label={`${t(`rp.moment.${m.kind}`)} ${formatClock(m.at)}`}
            className="absolute top-1/2 h-[18px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-sm transition-transform hover:scale-y-125"
            style={{ left: `${pct(m.at)}%`, background: MOMENT_COLOR[m.kind] }}
          />
        ))}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(current, duration || 0)}
          onChange={(e) => player.seek(Number(e.target.value), player.playing)}
          aria-label={t("rp.position")}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <span className="font-mono text-[12px] tabular-nums" style={{ color: "var(--rp-mute)" }}>
        {formatClock(current)} / {formatClock(duration)}
      </span>
      <button
        type="button"
        onClick={() => {
          const next = (rateIndex + 1) % PLAYBACK_RATES.length;
          setRateIndex(next);
          if (player.ref.current) player.ref.current.playbackRate = PLAYBACK_RATES[next]!;
        }}
        title={t("audio.speed")}
        className="rp-pill h-[30px] px-2.5 text-[12px]"
      >
        {PLAYBACK_RATES[rateIndex]}×
      </button>
      <a href={src ?? url} download title={t("rp.download")} className="rp-mute hover:opacity-70">
        <Download className="h-4 w-4" />
      </a>
    </div>
  );
}

// ---- small pieces -----------------------------------------------------------

function Lab({ children }: { children: ReactNode }) {
  return (
    <b className="rp-mute block text-[11px] font-bold uppercase tracking-[0.1em]">{children}</b>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rp-sheet break-inside-avoid">
      <div className="mx-[18px] flex items-baseline justify-between gap-3 pb-2 pt-3.5 rp-rule">
        <h3 className="rp-display text-[19px] leading-tight">{title}</h3>
        {right && <span className="rp-mute shrink-0 font-mono text-[12.5px]">{right}</span>}
      </div>
      <div className="px-[18px] pb-4 pt-2">{children}</div>
    </section>
  );
}

function TimeLink({ ts, player }: { ts: string | null | undefined; player: Player | null }) {
  const at = timestampSeconds(ts);
  if (at == null) return null;
  return (
    <button
      type="button"
      onClick={() => player?.seek(at)}
      disabled={!player}
      className="rp-mute shrink-0 font-mono text-[11.5px] tabular-nums hover:underline disabled:no-underline"
    >
      {formatClock(at)}
    </button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rp-mute text-[13.5px] italic">{children}</p>;
}

function moodTone(mood: string): "positive" | "neutral" | "negative" {
  const m = mood.toLowerCase();
  if (/(norozi|salbiy|jahl|asab|g'azab|negativ|rad|недов|негат|angry|upset)/.test(m))
    return "negative";
  if (/(ijobiy|qiziq|xursand|mamnun|samimiy|iliq|позит|довол|positive|interested|happy)/.test(m))
    return "positive";
  return "neutral";
}

const PRIORITY_KEY = {
  low: "ca.priorityLow",
  medium: "ca.priorityMedium",
  high: "ca.priorityHigh",
};

const BANT_KEY = {
  budget: "rp.bant.budget",
  authority: "rp.bant.authority",
  need: "rp.bant.need",
  timeline: "rp.bant.timeline",
} as const;

// ---- the sheet --------------------------------------------------------------

const TABS = ["card", "talk", "charts"] as const;
type Tab = (typeof TABS)[number];
const TAB_KEY: Record<Tab, string> = {
  card: "rp.tabCard",
  talk: "rp.tabTalk",
  charts: "rp.tabCharts",
};

export function CallAnalysisDetail({
  call,
  aside,
}: {
  call: CallAnalysisDetailData;
  /** Shown beside the summary (the dialog's "Mijoz ma'lumotlari"). */
  aside?: ReactNode;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("card");
  const transcriptLines = useMemo(
    () => (call.transcript ? parseTranscript(call.transcript) : []),
    [call.transcript],
  );
  const a = useMemo(() => normalizeCallAnalysis(call.analysis), [call.analysis]);
  const moments = useMemo(() => collectMoments(a), [a]);
  const { bind, ...player } = usePlayer(call.durationSeconds);
  const hasAudio = !!call.recordingUrl;
  const grade = call.score != null ? gradeOf(call.score) : null;
  const outcome = a?.callOutcome ?? null;
  const dp = a?.dealProbability ?? null;
  const nsd = a?.nextStepDetail ?? null;
  const nextAction = nsd?.action || call.nextStep;
  const why = a?.outcomeAnalysis?.why || null;
  const agreed = a ? a.agreements.length > 0 : !!call.nextStep;
  const tone = call.score != null ? scoreTone(call.score) : null;

  function copySummary() {
    const parts = [
      outcome ? `${t("ca.callOutcome")}: ${outcome.label}` : null,
      call.score != null ? `${t("ca.score")}: ${call.score}/100 (${grade})` : null,
      call.aiSummary,
      nextAction ? `${t("ca.managerNextStep")}: ${nextAction}` : null,
    ].filter(Boolean);
    void copyText(parts.join("\n")).then(
      () => toast.success(t("ca.copied")),
      () => toast.error(t("common.copyFailed")),
    );
  }

  return (
    <div
      className="report-skin space-y-4 rounded-md p-3 sm:p-4"
      style={{ background: "var(--rp-bg)" }}
    >
      {/* The call at a glance: what kind of call, how good the lead is, how
          long, and who did the talking. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TopTile label={t("ca2.category")}>
          {a?.callFamily?.name || outcome ? (
            <span className="inline-flex max-w-full items-center truncate rounded-full bg-violet-500/14 px-2.5 py-0.5 text-[13px] font-semibold text-violet-600 dark:text-violet-300">
              {a?.callFamily?.name || outcome?.label}
            </span>
          ) : (
            "—"
          )}
        </TopTile>
        <TopTile label={t("ca2.leadQuality")}>
          {call.leadQuality ? (
            <span
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-0.5 text-[13px] font-semibold",
                call.leadQuality.qualified
                  ? "bg-success/12 text-success"
                  : "bg-destructive/12 text-destructive",
              )}
            >
              <i className="h-2 w-2 shrink-0 rounded-full bg-current" />
              {call.leadQuality.title}
            </span>
          ) : dp ? (
            <span className="text-[15px] font-bold">{t("ca2.dealChance", { n: dp.value })}</span>
          ) : (
            "—"
          )}
        </TopTile>
        <TopTile label={t("ca2.duration")}>
          <span className="font-mono text-[15px] font-bold tabular-nums">
            {call.durationSeconds ? formatClock(call.durationSeconds) : "—"}
          </span>
        </TopTile>
        <TopTile label={t("ca2.talkRatio")}>
          {call.talkRatio != null ? (
            <>
              <span className="text-[15px] font-bold tabular-nums">
                {call.talkRatio} / {100 - call.talkRatio}{" "}
                <span className="text-xs font-medium text-subtle">{t("ca2.managerClient")}</span>
              </span>
              <span className="mt-2 flex h-1.5 self-stretch overflow-hidden rounded-full">
                <i className="bg-amber-500" style={{ width: `${call.talkRatio}%` }} />
                <i className="flex-1 bg-[#5b8cff]" />
              </span>
            </>
          ) : (
            "—"
          )}
        </TopTile>
      </div>

      <div className={cn("grid gap-3.5", aside && "lg:grid-cols-[minmax(0,1fr)_300px]")}>
        <div className="min-w-0 space-y-3.5">
          {/* Summary */}
          <section className="rp-sheet p-5 phone:p-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="flex items-center gap-2 text-[15px] font-bold">
                <Sparkles className="h-4 w-4 text-violet-500" /> {t("ca2.summary")}
              </h3>
              {outcome && a?.callFamily?.name && (
                <Stamp tone={outcome.tone} className="text-[12px]">
                  {outcome.label}
                </Stamp>
              )}
              {a?.analysisConfidence && (
                <span className="rp-mute text-[12px]">
                  {t("rp.confidence")}: {t(`rp.level.${a.analysisConfidence}`)}
                </span>
              )}
            </div>
            {call.aiSummary ? (
              <p className="mt-2 max-w-[75ch] whitespace-pre-wrap text-[14px] leading-relaxed">
                {call.aiSummary}
              </p>
            ) : (
              <p className="rp-mute mt-2 text-sm">{t("ca.deepMissing")}</p>
            )}
            {why && why !== call.aiSummary && (
              <p className="rp-mute mt-2 max-w-[75ch] text-[13.5px] leading-relaxed">
                <b className="text-foreground">{t("rp.why")}:</b> {why}
              </p>
            )}
            {!!a?.outcomeAnalysis?.keyFactors.length && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {a.outcomeAnalysis.keyFactors.map((f) => (
                  <span
                    key={f}
                    className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[12px] font-semibold"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Next step and the buttons that act on it */}
          <section className="rp-sheet">
            <NextStepBar
              action={nextAction}
              reason={nsd?.reason ?? null}
              priority={nsd?.priority ?? null}
              recontact={a?.outcomeAnalysis?.recontact ?? null}
              followUp={a?.followUpMessage ?? null}
              leadId={call.leadId ?? null}
              amocrmTaskId={call.amocrmTaskId ?? null}
              aiNoteId={call.aiNoteId ?? null}
              onCopySummary={copySummary}
            />
          </section>

          {/* Criteria: each sales stage as a share of its points */}
          <CriteriaBars
            checklist={a?.checklist ?? []}
            score={call.score}
            grade={grade}
            tone={tone}
          />

          {a?.callFamily && !a.callFamily.scored && (
            <div className="rp-sheet px-5 py-3 text-[13.5px]">
              <p className="rp-C font-semibold">
                {t("audio.excludedFamily", { name: a.callFamily.name })}
              </p>
              {a.callFamily.exclusionReason && (
                <p className="rp-mute mt-0.5">{a.callFamily.exclusionReason}</p>
              )}
            </div>
          )}
        </div>
        {aside && <div className="min-w-0">{aside}</div>}
      </div>

      {hasAudio && (
        <div className="sticky bottom-0 z-10 overflow-hidden rounded-[14px] border border-border shadow-[0_-8px_24px_-12px_rgba(0,0,0,.45)]">
          <PlayerStrip url={call.recordingUrl!} player={player} bind={bind} moments={moments} />
        </div>
      )}

      {/* Notebook tabs */}
      <div className="rp-noprint flex gap-1" style={{ borderBottom: "2px solid var(--rp-strong)" }}>
        {TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className="rounded-t-md border border-b-0 px-4 py-2 text-[14px] font-semibold phone:px-3 phone:text-[13px]"
            style={
              tab === tb
                ? {
                    background: "var(--rp-accent)",
                    color: "var(--rp-accent-fg)",
                    borderColor: "var(--rp-accent)",
                  }
                : {
                    background: "var(--rp-paper-2)",
                    color: "var(--rp-mute)",
                    borderColor: "var(--rp-rule)",
                  }
            }
          >
            {t(TAB_KEY[tb])}
          </button>
        ))}
        <button
          type="button"
          onClick={() => window.print()}
          className="rp-mute ml-auto inline-flex items-center gap-1.5 self-center pb-1 text-[13px] hover:underline"
        >
          <Printer className="h-3.5 w-3.5" /> {t("rp.print")}
        </button>
      </div>

      {tab === "card" &&
        (a ? (
          <CardPage a={a} player={hasAudio ? player : null} />
        ) : (
          <div className="rp-sheet p-5">
            <Empty>{t("ca.deepMissing")}</Empty>
          </div>
        ))}

      {tab === "talk" && (
        <TalkPage
          transcript={call.transcript}
          lines={transcriptLines}
          a={a}
          player={hasAudio ? player : null}
        />
      )}

      {tab === "charts" && a && (
        <div className="rp-sheet p-4">
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

function TopTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-border bg-card px-4 py-3">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 flex min-w-0 flex-col items-start text-[14px] font-semibold text-foreground">
        {children}
      </div>
    </div>
  );
}

function CriteriaBars({
  checklist,
  score,
  grade,
  tone,
}: {
  checklist: CallChecklistItem[];
  score: number | null;
  grade: string | null;
  tone: "success" | "warning" | "danger" | null;
}) {
  const { t } = useI18n();
  const marks = useMemo(() => stageMarks(checklist), [checklist]);
  return (
    <section className="rp-sheet p-5 phone:p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold">{t("ca2.criteria")}</h3>
          {tone && (
            <p className={cn("mt-0.5 text-[12px] font-semibold", grade && `rp-${grade}`)}>
              {tone === "success"
                ? t("ca.scoreSuccess")
                : tone === "warning"
                  ? t("ca.scoreAverage")
                  : t("ca.scoreFail")}
            </p>
          )}
        </div>
        <p className="leading-none">
          <span className="font-display text-[32px] font-bold tabular-nums text-[var(--primary-ink)]">
            {score ?? "—"}
          </span>
          <span className="text-sm text-subtle"> / 100</span>
        </p>
      </div>
      {marks.length === 0 ? (
        <p className="rp-mute mt-3 text-sm">{t("ca2.noCriteria")}</p>
      ) : (
        <div className="mt-3">
          {marks.map((m) => {
            const good = m.pct >= 60;
            return (
              <div
                key={m.stage}
                className="grid grid-cols-[minmax(0,210px)_1fr_48px] items-center gap-3.5 py-[7px] phone:grid-cols-[minmax(0,1fr)_48px]"
              >
                <span className="truncate text-right text-[13.5px] text-muted-foreground phone:col-span-2 phone:text-left">
                  {m.stage}
                </span>
                <span className="h-3.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      good ? "bg-success" : "bg-destructive",
                    )}
                    style={{ width: `${Math.max(m.pct, 2)}%` }}
                  />
                </span>
                <b
                  className={cn(
                    "text-[13.5px] tabular-nums",
                    good ? "text-success" : "text-destructive",
                  )}
                >
                  {m.pct}%
                </b>
              </div>
            );
          })}
          <div className="ml-[224px] mr-[62px] mt-1 flex justify-between text-[11px] text-subtle phone:hidden">
            {[0, 20, 40, 60, 80, 100].map((x) => (
              <span key={x}>{x}%</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Fact({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="pr-3 pt-3" title={hint}>
      <dt>
        <Lab>{label}</Lab>
      </dt>
      <dd className="mt-0.5 text-[13.5px] font-semibold">{value}</dd>
    </div>
  );
}

function NextStepBar({
  action,
  reason,
  priority,
  recontact,
  followUp,
  leadId,
  amocrmTaskId,
  aiNoteId,
  onCopySummary,
}: {
  action: string | null;
  reason: string | null;
  priority: "low" | "medium" | "high" | null;
  recontact: { recommended: boolean; reason: string; when: string | null } | null;
  followUp: string | null;
  leadId: string | null;
  amocrmTaskId: number | null;
  aiNoteId: number | null;
  onCopySummary: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const createTask = useCreateTask();
  const [taskDone, setTaskDone] = useState(false);

  function makeTask() {
    if (!leadId || !action || !user?.organizationId) return;
    const due = new Date();
    due.setDate(due.getDate() + 1);
    due.setHours(10, 0, 0, 0);
    createTask.mutate(
      {
        title: action.slice(0, 200),
        description: reason,
        lead_id: leadId,
        due_date: due.toISOString(),
        assignee_id: user.id,
        created_by: user.id,
        organization_id: user.organizationId,
      },
      {
        onSuccess: () => {
          setTaskDone(true);
          toast.success(t("rp.taskMade"));
        },
        onError: () => toast.error(t("rp.taskFailed")),
      },
    );
  }

  return (
    <div className="space-y-3 px-6 py-4 phone:px-4">
      <div className="min-w-0">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.1em]"
          style={{ color: "var(--rp-c)" }}
        >
          {t("ca.managerNextStep")}
          {priority && ` · ${t(PRIORITY_KEY[priority])}`}
        </p>
        <p className="mt-0.5 text-[16px] font-semibold leading-snug">
          {action || t("rp.noNextStep")}
        </p>
        {reason && <p className="rp-mute mt-0.5 text-[13px]">{reason}</p>}
        {recontact?.recommended && (
          <p className="mt-1 text-[12.5px]">
            ↩ {t("rp.recontact")}
            {recontact.when ? `: ${recontact.when}` : ""} — {recontact.reason}
          </p>
        )}
        {(amocrmTaskId || aiNoteId) && (
          <p className="rp-mute mt-1 flex flex-wrap gap-3 text-[12px]">
            {amocrmTaskId && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="rp-A h-3.5 w-3.5" /> {t("audio.taskCreated")}
              </span>
            )}
            {aiNoteId && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="rp-A h-3.5 w-3.5" /> {t("audio.noteCreated")}
              </span>
            )}
          </p>
        )}
      </div>
      <div className="rp-noprint flex flex-wrap items-center gap-2">
        <button type="button" className="rp-pill" onClick={onCopySummary}>
          <Copy className="h-3.5 w-3.5" /> {t("rp.copySummary")}
        </button>
        {followUp && <FollowUpButton text={followUp} />}
        {leadId && action && (
          <button
            type="button"
            className="rp-pill rp-pill-primary"
            disabled={createTask.isPending || taskDone}
            onClick={makeTask}
          >
            {createTask.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : taskDone ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <CalendarPlus className="h-3.5 w-3.5" />
            )}
            {taskDone ? t("rp.taskMadeShort") : t("rp.makeTask")}
          </button>
        )}
      </div>
    </div>
  );
}

function FollowUpButton({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="rp-pill">
          <MessageSquareText className="h-3.5 w-3.5" /> {t("rp.readyMessage")}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(420px,92vw)] p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("ca.followUp")}
        </p>
        <p className="mt-2 whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-sm leading-relaxed text-foreground">
          {text}
        </p>
        <button
          type="button"
          onClick={() =>
            void copyText(text).then(
              () => toast.success(t("ca.copied")),
              () => toast.error(t("common.copyFailed")),
            )
          }
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground"
        >
          <Copy className="h-4 w-4" /> {t("ca.copy")}
        </button>
      </PopoverContent>
    </Popover>
  );
}

// ---- page 1: the card --------------------------------------------------------

function CardPage({ a, player }: { a: CallAnalysis; player: Player | null }) {
  const { t } = useI18n();
  const improvements = a.improvements.map(asImprovement);
  const violated = a.serviceStandards.filter((s) => s.violated).map((s) => s.name.toLowerCase());
  const isStandard = (title: string) => {
    const x = title.toLowerCase();
    return violated.some((y) => x.includes(y) || y.includes(x));
  };
  const objections = a.objectionHandling ?? [];
  const questions = a.customerQuestions ?? [];
  const signals = a.buyingSignals ?? [];
  const qualification = a.qualification ?? [];
  const pains = a.painPoints ?? [];
  const competitors = a.competitors ?? [];
  const price = a.priceDiscussion ?? null;
  const okStandards = a.serviceStandards.filter((s) => !s.violated).length;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <StagesSection checklist={a.checklist} player={player} />

        {a.serviceStandards.length > 0 && (
          <Section
            title={t("audio.serviceStandards")}
            right={`${okStandards}/${a.serviceStandards.length}`}
          >
            <ul>
              {a.serviceStandards.map((s, i) => (
                <li key={i} className="rp-dash flex items-start gap-2.5 py-2 text-[13.5px]">
                  <span className={s.violated ? "rp-D" : "rp-A"}>{s.violated ? "✗" : "✓"}</span>
                  <span className="min-w-0 flex-1">
                    {s.name}
                    {s.violated && s.evidence && (
                      <span className="rp-hand rp-pen block text-[17px] leading-tight">
                        {s.evidence}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-bold uppercase",
                      s.violated ? "rp-D" : "rp-A",
                    )}
                  >
                    {s.violated ? t("ca.violated") : t("ca.notViolated")}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={t("rp.client")}>
          {qualification.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-4">
              {qualification.map((q) => (
                <div key={q.key} className="rp-dash py-2 text-[13.5px]" title={q.question}>
                  <Lab>{t(BANT_KEY[q.key] ?? q.key)}</Lab>
                  <p
                    className={cn(
                      q.status === "answered" ? "" : q.status === "partial" ? "rp-C" : "rp-D",
                    )}
                  >
                    {q.answer || t(`rp.bant.${q.status}`)}
                  </p>
                  <TimeLink ts={q.timestamp} player={player} />
                </div>
              ))}
            </div>
          ) : (
            <Empty>{t("ca.noData")}</Empty>
          )}
          {pains.length > 0 && (
            <div className="mt-3">
              <Lab>{t("ca.painPoints")}</Lab>
              <ul className="mt-1 space-y-1 text-[13.5px]">
                {pains.map((p) => (
                  <li key={p}>— {p}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Lab>{t("ca.priceDiscussion")}</Lab>
              <p className="mt-0.5 text-[13.5px]">
                {!price || !price.discussed ? (
                  <span className="rp-mute">{t("ca.priceNotDiscussed")}</span>
                ) : (
                  price.details
                )}
              </p>
            </div>
            <div>
              <Lab>{t("ca.competitors")}</Lab>
              <p className="mt-0.5 text-[13.5px]">
                {competitors.length ? (
                  competitors.join(", ")
                ) : (
                  <span className="rp-mute">{t("ca.noCompetitors")}</span>
                )}
              </p>
            </div>
          </div>
        </Section>

        <Section title={t("ca.customerQuestions")} right={questions.length}>
          {questions.length === 0 ? (
            <Empty>{t("ca.noData")}</Empty>
          ) : (
            <ul>
              {questions.map((q, i) => (
                <li key={i} className="rp-dash flex items-start gap-2.5 py-2 text-[13.5px]">
                  <span className={q.answered ? "rp-A" : "rp-D"}>{q.answered ? "✓" : "✗"}</span>
                  <span className="min-w-0 flex-1">{q.question}</span>
                  <TimeLink ts={q.timestamp} player={player} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t("ca.keyQuotes")}>
          {a.keyQuotes.length === 0 ? (
            <Empty>{t("ca.noData")}</Empty>
          ) : (
            <ul className="space-y-2.5">
              {a.keyQuotes.map(asQuote).map((q, i) => {
                const customer = q.speaker ? !isOperatorSpeaker(q.speaker) : true;
                return (
                  <li
                    key={i}
                    className="pl-3 text-[14px]"
                    style={{
                      borderLeft: `2px solid ${customer ? "var(--rp-b)" : "var(--rp-ink)"}`,
                    }}
                  >
                    <p className="italic">«{q.text}»</p>
                    <p className="rp-mute mt-0.5 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide">
                      {customer ? t("ca.customer") : t("ca.operator")}
                      <TimeLink ts={q.timestamp} player={player} />
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <div className="space-y-4">
        {(a.warnings.length > 0 || a.risks.length > 0) && (
          <Section title={t("rp.attention")} right={a.warnings.length + a.risks.length}>
            <ul className="space-y-1.5">
              {a.warnings.map((w, i) => (
                <li key={`w${i}`} className="rp-hand rp-pen text-[19px] leading-tight">
                  ! {w}
                </li>
              ))}
              {a.risks.map((r, i) => (
                <li key={`r${i}`} className="text-[13.5px]">
                  <span className="rp-D font-semibold">{t("ca.risks")}:</span> {r}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={t("rp.sayInstead")} right={improvements.length}>
          {improvements.length === 0 ? (
            <Empty>{t("audio.noImprovements")}</Empty>
          ) : (
            <ul className="space-y-3.5">
              {improvements.map((item, i) => (
                <li key={i}>
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                    {item.title}
                    {isStandard(item.title) && (
                      <span className="rp-D text-[10px] font-bold uppercase tracking-wide">
                        [{t("ca.standardTag")}]
                      </span>
                    )}
                  </p>
                  {item.description && (
                    <p className="rp-mute mt-0.5 text-[13px]">{item.description}</p>
                  )}
                  {item.suggestion && (
                    <p className="rp-hand rp-pen mt-1 text-[20px] leading-tight">
                      → {item.suggestion}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={t("ca.objectionHandling")}
          right={objections.length || a.topObjections.length}
        >
          {objections.length > 0 ? (
            <ul className="space-y-3">
              {objections.map((o, i) => (
                <li key={i} className="rp-dash pb-3 text-[13.5px] last:border-0">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 font-semibold">«{o.objection}»</p>
                    <TimeLink ts={o.timestamp} player={player} />
                    <span
                      className={cn(
                        "shrink-0 text-[11px] font-bold uppercase",
                        o.handled ? "rp-A" : "rp-D",
                      )}
                    >
                      {o.handled ? t("ca.handled") : t("ca.notHandled")}
                    </span>
                  </div>
                  {o.managerResponse && (
                    <p className="rp-mute mt-1">
                      <b style={{ color: "var(--rp-ink)" }}>{t("ca.managerSaid")}:</b>{" "}
                      {o.managerResponse}
                    </p>
                  )}
                  {o.betterResponse && (
                    <p className="rp-hand rp-pen mt-1 text-[19px] leading-tight">
                      {t("rp.better")}: {o.betterResponse}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : a.topObjections.length > 0 ? (
            <ul className="space-y-1 text-[13.5px]">
              {a.topObjections.map((o) => (
                <li key={o}>— {o}</li>
              ))}
            </ul>
          ) : (
            <p className="rp-A text-[13.5px]">✓ {t("ca.noObjections")}</p>
          )}
        </Section>

        <Section title={t("ca.strengths")} right={a.strengths.length}>
          {a.strengths.length === 0 ? (
            <Empty>{t("ca.noData")}</Empty>
          ) : (
            <ul className="space-y-1">
              {a.strengths.map((s) => (
                <li key={s} className="rp-hand rp-A text-[19px] leading-tight">
                  ✓ {s}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {a.coachingTip && (
          <Section title={t("ca.coachingTip")}>
            <p className="text-[14.5px] leading-relaxed">{a.coachingTip}</p>
          </Section>
        )}

        <Section title={t("ca.agreements")} right={a.agreements.length}>
          {a.agreements.length === 0 ? (
            <Empty>{t("ca.noData")}</Empty>
          ) : (
            <ul>
              {a.agreements.map(asAgreement).map((g, i) => (
                <li key={i} className="rp-dash flex items-start gap-2.5 py-2 text-[13.5px]">
                  <span className="rp-A">✓</span>
                  <span className="min-w-0 flex-1">{g.text}</span>
                  <TimeLink ts={g.timestamp} player={player} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t("ca.buyingSignals")} right={signals.length}>
          {signals.length === 0 ? (
            <Empty>{t("ca.noSignals")}</Empty>
          ) : (
            <ul>
              {signals.map((b, i) => (
                <li key={i} className="rp-dash flex items-start gap-2.5 py-2 text-[13.5px]">
                  <span className="rp-C">●</span>
                  <span className="min-w-0 flex-1">{b.text}</span>
                  <TimeLink ts={b.timestamp} player={player} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {a.followUpMessage && (
          <Section
            title={t("ca.followUp")}
            right={
              <button
                type="button"
                className="rp-link font-sans text-[12.5px] font-semibold hover:underline"
                style={{ color: "var(--rp-ink)" }}
                onClick={() =>
                  void copyText(a.followUpMessage ?? "").then(
                    () => toast.success(t("ca.copied")),
                    () => toast.error(t("common.copyFailed")),
                  )
                }
              >
                <Copy className="mr-1 inline h-3.5 w-3.5" />
                {t("ca.copy")}
              </button>
            }
          >
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{a.followUpMessage}</p>
          </Section>
        )}
      </div>
    </div>
  );
}

function StagesSection({
  checklist,
  player,
}: {
  checklist: CallChecklistItem[];
  player: Player | null;
}) {
  const { t } = useI18n();
  const marks = useMemo(() => stageMarks(checklist), [checklist]);
  const [open, setOpen] = useState<string | null>(null);
  if (marks.length === 0) return null;
  return (
    <Section title={t("rp.stagesTitle")} right={t("rp.stagesHint")}>
      <ul>
        {marks.map((m) => {
          const items = checklist.filter((c) => (c.stage || "—") === m.stage);
          const isOpen = open === m.stage;
          return (
            <li key={m.stage} className="rp-dash">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : m.stage)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 py-2 text-left text-[14px]"
              >
                <span className={cn("min-w-0 flex-1", m.mark <= 2 && "rp-D")}>{m.stage}</span>
                <span className="rp-mute font-mono text-[11.5px]">
                  {m.met}/{m.total}
                </span>
                <span
                  className={cn(
                    "w-9 text-right font-mono text-[14px] font-semibold tabular-nums",
                    m.mark <= 2 && "rp-D",
                  )}
                >
                  {m.mark}/5
                </span>
                <ChevronDown
                  className={cn("rp-mute h-4 w-4 transition-transform", !isOpen && "-rotate-90")}
                />
              </button>
              {isOpen && (
                <ul className="mb-2.5 space-y-1.5 pl-1">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px]">
                      {item.met ? (
                        <Check className="rp-A mt-0.5 h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <X className="rp-D mt-0.5 h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1">
                        {item.step}
                        {item.note && (
                          <span
                            className={cn(
                              "rp-hand block text-[16.5px] leading-tight",
                              item.met ? "rp-A" : "rp-pen",
                            )}
                          >
                            {item.note}
                          </span>
                        )}
                      </span>
                      <TimeLink ts={item.timestamp} player={player} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ---- page 2: the conversation with the red pen ------------------------------

type MarginNote = { tone: "pen" | "ok"; text: string };

function marginNotes(a: CallAnalysis | null, lines: TranscriptLine[], t: (k: string) => string) {
  const notes = new Map<number, MarginNote[]>();
  if (!a || lines.length === 0) return notes;
  const starts = lines.map((l) => timestampSeconds(l.timestamp) ?? 0);
  const lineAt = (ts: string | null | undefined) => {
    const at = timestampSeconds(ts);
    if (at == null) return -1;
    let idx = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i]! <= at + 1) idx = i;
    return idx;
  };
  const add = (ts: string | null | undefined, note: MarginNote) => {
    const i = lineAt(ts);
    if (i < 0) return;
    notes.set(i, [...(notes.get(i) ?? []), note]);
  };
  for (const o of a.objectionHandling ?? []) {
    add(o.timestamp, {
      tone: "pen",
      text: o.betterResponse
        ? `${t("rp.moment.objection")}: ${t("rp.better")} — ${o.betterResponse}`
        : `${t("rp.moment.objection")}: «${o.objection}»`,
    });
  }
  for (const c of a.checklist) {
    if (!c.met && c.timestamp) add(c.timestamp, { tone: "pen", text: `✗ ${c.step}` });
  }
  for (const q of a.customerQuestions ?? []) {
    if (!q.answered) add(q.timestamp, { tone: "pen", text: t("rp.unanswered") });
  }
  for (const s of a.buyingSignals ?? []) {
    add(s.timestamp, { tone: "ok", text: `✓ ${t("rp.moment.signal")}` });
  }
  for (const g of a.agreements.map(asAgreement)) {
    add(g.timestamp, { tone: "ok", text: `✓ ${t("rp.moment.agreement")}` });
  }
  return notes;
}

function TalkPage({
  transcript,
  lines,
  a,
  player,
}: {
  transcript: string | null;
  lines: TranscriptLine[];
  a: CallAnalysis | null;
  player: Player | null;
}) {
  const { t } = useI18n();
  const notes = useMemo(() => marginNotes(a, lines, t), [a, lines, t]);
  const starts = useMemo(() => lines.map((l) => timestampSeconds(l.timestamp) ?? 0), [lines]);
  const [follow, setFollow] = useState(true);
  const cur = player?.current ?? 0;
  const playing = !!player?.playing;
  const activeIdx = useMemo(() => {
    if (!playing && !cur) return -1;
    let idx = -1;
    for (let i = 0; i < starts.length; i++) if (starts[i]! <= cur) idx = i;
    return idx;
  }, [cur, playing, starts]);
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (follow && playing && activeRef.current) {
      activeRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIdx, follow, playing]);

  if (!transcript) {
    return (
      <div className="rp-sheet p-5">
        <Empty>{t("audio.noTranscript")}</Empty>
      </div>
    );
  }
  if (lines.length === 0) {
    return (
      <div className="rp-sheet p-5">
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{transcript}</p>
      </div>
    );
  }
  return (
    <section className="rp-sheet">
      <div className="mx-[18px] flex flex-wrap items-baseline justify-between gap-3 pb-2 pt-3.5 rp-rule">
        <h3 className="rp-display text-[19px]">{t("rp.talkTitle")}</h3>
        <span className="rp-noprint flex items-center gap-3 text-[12.5px]">
          {player && (
            <label className="rp-mute inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={follow}
                onChange={(e) => setFollow(e.target.checked)}
              />
              {t("rp.followAudio")}
            </label>
          )}
          <button
            type="button"
            className="rp-mute hover:underline"
            onClick={() =>
              void copyText(transcript).then(
                () => toast.success(t("ca.copied")),
                () => toast.error(t("common.copyFailed")),
              )
            }
          >
            <Copy className="mr-1 inline h-3.5 w-3.5" />
            {t("rp.copyTranscript")}
          </button>
        </span>
      </div>
      <div className="px-[18px] pb-4">
        {lines.map((line, i) => {
          const op = isOperatorSpeaker(line.speaker);
          const lineNotes = notes.get(i) ?? [];
          const active = i === activeIdx;
          return (
            <div
              key={i}
              ref={active ? activeRef : undefined}
              className="rp-dash grid grid-cols-[48px_72px_minmax(0,1fr)] gap-x-2.5 py-2 text-[14.5px] leading-relaxed md:grid-cols-[48px_72px_minmax(0,1fr)_220px]"
              style={active ? { background: "var(--rp-paper-2)" } : undefined}
            >
              <button
                type="button"
                disabled={!player}
                onClick={() => player?.seek(starts[i] ?? 0)}
                className="rp-mute pt-0.5 text-left font-mono text-[11.5px] tabular-nums hover:underline disabled:no-underline"
              >
                {line.timestamp}
              </button>
              <span
                className={cn(
                  "truncate pt-0.5 text-[12px] font-bold uppercase tracking-wide",
                  !op && "rp-B",
                )}
              >
                {line.speaker}
              </span>
              <span
                className={cn(
                  lineNotes.some((n) => n.tone === "pen") &&
                    "underline decoration-wavy underline-offset-4",
                )}
                style={
                  lineNotes.some((n) => n.tone === "pen")
                    ? { textDecorationColor: "var(--rp-pen)" }
                    : undefined
                }
              >
                {line.text}
              </span>
              <span className="col-span-3 space-y-0.5 pl-[130px] md:col-span-1 md:pl-0">
                {lineNotes.map((n, j) => (
                  <span
                    key={j}
                    className={cn(
                      "rp-hand block -rotate-1 text-[18px] leading-[1.1]",
                      n.tone === "pen" ? "rp-pen" : "rp-A",
                    )}
                  >
                    {n.text}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
