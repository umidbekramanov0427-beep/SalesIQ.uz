import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  AudioWaveform,
  Clock,
  ListChecks,
  Loader2,
  MessageSquareQuote,
  Smile,
  Sparkles,
  Target,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CallAnalysisDetail, scoreTone } from "@/components/audio/CallAnalysisDetail";
import { normalizeCallAnalysis, usePbxCallAnalysis } from "@/hooks/use-crm-data";
import { gradeOf } from "@/lib/call-grade";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// «Audio tahlil» from the phone's call log: a talked call's AI analysis in
// a centred window -- first the short version (grade, outcome, summary,
// next step), then «To'liq tahlil» opens the same report card Audio tahlil
// shows, and «Audio tahlil bo'limida» goes there.

export type CallReviewTarget = {
  id: string;
  name: string;
  phone: string;
  at: string;
  durationSeconds: number;
};

const TONE: Record<"success" | "warning" | "danger", string> = {
  success: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  danger: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
};

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function CallReviewDialog({
  call,
  onClose,
}: {
  call: CallReviewTarget | null;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const [full, setFull] = useState(false);
  const { data, isLoading } = usePbxCallAnalysis(call?.id ?? null);
  const a = normalizeCallAnalysis(data?.analysis ?? null);
  const ready = !!data?.analyzedAt && (data.score != null || !!data.aiSummary || !!a);
  const at = call ? new Date(call.at) : null;
  const two = (n: number) => String(n).padStart(2, "0");
  const when = at
    ? `${two(at.getDate())}.${two(at.getMonth() + 1)}, ${two(at.getHours())}:${two(at.getMinutes())}`
    : "";
  const tone = data?.score != null ? scoreTone(data.score) : null;
  const nextStep = a?.nextStepDetail?.action || data?.nextStep || null;
  const outcome = a?.callOutcome ?? null;
  const prob = a?.dealProbability?.value ?? null;

  return (
    <Dialog
      open={!!call}
      onOpenChange={(o) => {
        if (!o) {
          setFull(false);
          onClose();
        }
      }}
    >
      <DialogContent
        overlayClassName="z-[80]"
        className={cn(
          "z-[80] gap-0 overflow-hidden p-0 [&>button]:hidden",
          full ? "max-h-[92vh] max-w-[1100px]" : "max-w-[560px]",
        )}
      >
        {/* Head: who, when, how long */}
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-rose-500/12 text-rose-600 dark:text-rose-400">
            <AudioWaveform className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[16px] font-bold text-foreground">
              {t("callReview.title")}
            </DialogTitle>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted-foreground">
              <span className="font-medium text-foreground">
                {call?.name || t("phone.unknown")}
              </span>
              <span>·</span>
              <span className="tabular-nums">{call?.phone}</span>
              <span>·</span>
              <span>{when}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock className="h-3.5 w-3.5" />
                {mmss(call?.durationSeconds ?? 0)}
              </span>
            </p>
          </div>
          {full && (
            <button
              type="button"
              onClick={() => setFull(false)}
              className="ctl-soft inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[12.5px] font-semibold"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("callReview.short")}
            </button>
          )}
          <button
            type="button"
            aria-label={t("phone.close")}
            onClick={() => {
              setFull(false);
              onClose();
            }}
            className="grid h-9 w-9 place-items-center rounded-[8px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : !ready ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-muted-foreground">
              {data && !data.error ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <AudioWaveform className="h-5 w-5" />
              )}
            </span>
            <p className="text-[14px] font-semibold text-foreground">
              {data?.error
                ? t("callReview.failed")
                : data
                  ? t("callReview.pending")
                  : t("callReview.none")}
            </p>
            <p className="max-w-sm text-[12.5px] leading-snug text-muted-foreground">
              {data?.error
                ? data.error
                : data
                  ? t("callReview.pendingHint")
                  : t("callReview.noneHint")}
            </p>
          </div>
        ) : full && data ? (
          <div className="max-h-[calc(92vh-74px)] overflow-y-auto p-5">
            <CallAnalysisDetail
              call={{
                score: data.score,
                mood: data.mood,
                talkRatio: data.talkRatio,
                nextStep: data.nextStep,
                aiSummary: data.aiSummary,
                transcript: data.transcript,
                recordingUrl: data.recordingUrl,
                analysis: data.analysis,
                leadId: data.leadId,
                durationSeconds: data.durationSeconds,
              }}
            />
          </div>
        ) : (
          data && (
            <div className="space-y-4 p-5">
              {/* The verdict: grade, outcome, chance of a deal */}
              <div className="grid grid-cols-3 gap-2.5">
                <Fact
                  icon={Target}
                  label={t("callReview.score")}
                  value={
                    data.score != null ? (
                      <span className="inline-flex items-baseline gap-1.5">
                        {data.score}
                        <span className="text-[13px] font-semibold text-muted-foreground">
                          /100
                        </span>
                        {tone && (
                          <span
                            className={cn("rounded-md px-1.5 text-[12px] font-bold", TONE[tone])}
                          >
                            {gradeOf(data.score)}
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
                <Fact
                  icon={TrendingUp}
                  label={t("callReview.deal")}
                  value={prob != null ? `${prob}%` : "—"}
                />
                <Fact icon={Smile} label={t("callReview.mood")} value={data.mood || "—"} small />
              </div>

              {outcome && (
                <p
                  className={cn(
                    "rounded-[10px] px-3 py-2 text-[13px] font-semibold",
                    outcome.tone === "positive"
                      ? TONE.success
                      : outcome.tone === "negative"
                        ? TONE.danger
                        : "bg-surface text-foreground",
                  )}
                >
                  {outcome.label}
                </p>
              )}

              {data.aiSummary && (
                <Block icon={Sparkles} title={t("callReview.summary")}>
                  <p className="line-clamp-5 text-[13px] leading-relaxed text-foreground">
                    {data.aiSummary}
                  </p>
                </Block>
              )}

              {nextStep && (
                <Block icon={ListChecks} title={t("callReview.next")}>
                  <p className="text-[13px] leading-relaxed text-foreground">{nextStep}</p>
                </Block>
              )}

              {a?.coachingTip && (
                <Block icon={MessageSquareQuote} title={t("callReview.tip")}>
                  <p className="text-[13px] leading-relaxed text-foreground">{a.coachingTip}</p>
                </Block>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
                <Link
                  to="/audio-analytics"
                  onClick={onClose}
                  className="ctl-soft inline-flex h-10 items-center gap-1.5 rounded-[8px] px-4 text-[13px] font-semibold"
                >
                  <AudioWaveform className="h-4 w-4" />
                  {t("callReview.openSection")}
                </Link>
                <button
                  type="button"
                  onClick={() => setFull(true)}
                  className="ctl-lit inline-flex h-10 items-center gap-1.5 rounded-[8px] px-4 text-[13px] font-semibold"
                >
                  {t("callReview.full")}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  small,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-3">
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate font-display font-bold tabular-nums text-foreground",
          small ? "text-[15px]" : "text-[22px] leading-tight",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Block({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </p>
      {children}
    </section>
  );
}
