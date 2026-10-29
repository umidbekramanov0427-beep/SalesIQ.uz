import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ExternalLink,
  Link2,
  Loader2,
  MoreHorizontal,
  Pause,
  PhoneIncoming,
  PhoneOutgoing,
  Play,
  RotateCcw,
  Sparkles,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAnalyzeCall, type AudioCallView, type CallCardDetail } from "@/hooks/use-crm-data";
import { useRecordingUrl } from "@/hooks/use-recording-url";
import { enqueueCallAnalysis, type AutoAnalyzeState } from "@/lib/auto-analyze";
import { gradeOf, stageMarks } from "@/lib/call-grade";
import { copyText } from "@/lib/clipboard";
import { useI18n, type Lang } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { GradeLetter, Stamp } from "./ReportControls";
import { formatClock, formatWhen } from "./report-utils";

const MAX_STAGE_ROWS = 6;

/**
 * One call as a report card: who, when, the grade letter, a mark out of 5
 * for each sales stage, the AI's summary and the outcome as a stamp. A call
 * the AI hasn't graded yet shows where it is instead (queued, AI busy,
 * failed) with the button that starts or retries it.
 */
export function ReportCard({
  call,
  detail,
  queueState,
  amoLink,
  lang,
  onOpen,
}: {
  call: AudioCallView;
  detail: CallCardDetail | undefined;
  queueState: AutoAnalyzeState | undefined;
  amoLink: string | null;
  lang: Lang;
  onOpen: (call: AudioCallView) => void;
}) {
  const { t } = useI18n();
  const marks = useMemo(() => stageMarks(detail?.checklist), [detail?.checklist]);
  const grade = call.score != null ? gradeOf(call.score) : null;
  const title = call.leadName || call.company || call.phone || t("audio.noLead");
  const analyzing = queueState?.status === "queued" || queueState?.status === "running";
  const waiting = queueState?.status === "waiting";
  const summary = detail?.summary ?? null;
  const outcome = detail?.outcome ?? null;
  const when = formatWhen(call.occurredAtRaw, lang, {
    today: t("rp.today"),
    yesterday: t("rp.yesterday"),
  });

  return (
    <article
      className="rp-sheet group flex flex-col p-[18px] pb-3.5 transition-transform hover:-translate-y-0.5"
      aria-label={title}
    >
      <header className="rp-rule flex items-start justify-between gap-3 pb-2.5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpen(call)}
              className="rp-link min-w-0 truncate text-left text-[16px] font-bold hover:underline"
            >
              {title}
            </button>
            {amoLink && (
              <a
                href={amoLink}
                target="_blank"
                rel="noreferrer"
                title={t("leadFilter.openInAmoCrm")}
                className="rp-mute shrink-0 hover:opacity-80"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <p className="rp-mute mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px]">
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3 w-3" />
              {call.owner || "—"}
            </span>
            <span>·</span>
            <span className="tabular-nums">{when}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              {call.direction === "in" ? (
                <PhoneIncoming className="h-3 w-3" />
              ) : (
                <PhoneOutgoing className="h-3 w-3" />
              )}
              {call.durationSeconds > 0 ? formatClock(call.durationSeconds) : "—"}
            </span>
          </p>
          {(call.stage || (call.phone && call.phone !== title)) && (
            <p className="rp-mute mt-0.5 truncate text-[12px]">
              {[call.stage, call.phone !== title ? call.phone : null].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <GradeLetter grade={grade} className="shrink-0 text-[46px]" />
      </header>

      {call.analyzed ? (
        <>
          <table className="mt-2 w-full border-collapse text-[13px]">
            <tbody>
              {marks.length > 0 ? (
                marks.slice(0, MAX_STAGE_ROWS).map((m) => (
                  <tr key={m.stage} className="rp-dash">
                    <td className="py-[5px] pr-2">{m.stage}</td>
                    <td
                      className={cn(
                        "py-[5px] text-right font-mono font-semibold tabular-nums",
                        m.mark <= 2 && "rp-D",
                      )}
                    >
                      {m.mark}/5
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  <tr className="rp-dash">
                    <td className="py-[5px] pr-2">{t("audio.mood")}</td>
                    <td className="py-[5px] text-right font-semibold capitalize">
                      {call.mood || "—"}
                    </td>
                  </tr>
                  <tr className="rp-dash">
                    <td className="py-[5px] pr-2">{t("ca.talkRatio")}</td>
                    <td className="py-[5px] text-right font-mono font-semibold tabular-nums">
                      {call.talkRatio != null ? `${call.talkRatio}%` : "—"}
                    </td>
                  </tr>
                  <tr className="rp-dash">
                    <td className="py-[5px] pr-2">{t("ca.score")}</td>
                    <td className="py-[5px] text-right font-mono font-semibold tabular-nums">
                      {call.score ?? "—"}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
          <div className="mt-2.5 flex-1 text-[13.5px] leading-snug">
            <b className="rp-mute block text-[11px] font-bold uppercase tracking-[0.1em]">
              {t("rp.summary")}
            </b>
            {summary ? (
              <p className="line-clamp-3">{summary}</p>
            ) : (
              <p className="rp-mute italic">{t("rp.summaryLoading")}</p>
            )}
          </div>
          <div className="mt-2.5">
            {outcome ? (
              <Stamp tone={outcome.tone}>{outcome.label}</Stamp>
            ) : (
              <Stamp tone={call.connected ? "info" : "neutral"}>
                {call.connected ? t("audio.connected") : t("audio.notConnected")}
              </Stamp>
            )}
          </div>
        </>
      ) : (
        <PendingBlock call={call} analyzing={analyzing} waiting={waiting} />
      )}

      <footer className="rp-mute mt-2.5 flex items-center justify-between gap-2 text-[12px]">
        <span className="truncate">
          {detail?.deal != null
            ? t("rp.dealChance", { n: detail.deal })
            : call.connected
              ? t("audio.connected")
              : t("audio.notConnected")}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {call.recordingUrl && <MiniPlay url={call.recordingUrl} />}
          <CardMenu call={call} amoLink={amoLink} onOpen={onOpen} />
          {(call.analyzed || call.leadId) && (
            <button
              type="button"
              onClick={() => onOpen(call)}
              className="rp-link rounded px-1.5 py-1 font-semibold hover:underline"
              style={{ color: "var(--rp-ink)" }}
            >
              {t("rp.open")} →
            </button>
          )}
        </span>
      </footer>
    </article>
  );
}

function PendingBlock({
  call,
  analyzing,
  waiting,
}: {
  call: AudioCallView;
  analyzing: boolean;
  waiting: boolean;
}) {
  const { t } = useI18n();
  let body: React.ReactNode;
  if (analyzing || waiting) {
    body = (
      <p className="flex items-center gap-2 text-[13.5px]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {waiting ? t("audio.aiBusyRetry") : t("audio.analyzing")}
      </p>
    );
  } else if (call.analysisError) {
    body = (
      <>
        <p className="rp-D flex items-start gap-2 text-[13px]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="line-clamp-3">{call.analysisError}</span>
        </p>
        {call.recordingUrl && (
          <button
            type="button"
            className="rp-pill mt-3"
            onClick={() => {
              enqueueCallAnalysis(call.id);
              toast.info(t("audio.analysisStarted"));
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> {t("rp.retry")}
          </button>
        )}
      </>
    );
  } else if (call.recordingUrl) {
    body = (
      <>
        <p className="rp-mute text-[13px]">{t("rp.notGradedYet")}</p>
        <button
          type="button"
          className="rp-pill mt-3"
          data-on="true"
          onClick={() => {
            enqueueCallAnalysis(call.id);
            toast.info(t("audio.analysisStarted"));
          }}
        >
          <Sparkles className="h-3.5 w-3.5" /> {t("rp.gradeNow")}
        </button>
      </>
    );
  } else {
    body = <p className="rp-mute text-[13px]">{t("rp.noRecording")}</p>;
  }
  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      {body}
      <div className="mt-3">
        <Stamp tone={call.connected ? "info" : "neutral"}>
          {call.connected ? t("audio.connected") : t("audio.notConnected")}
        </Stamp>
      </div>
    </div>
  );
}

/** Listen without opening the call; the recording link is made only on the first press. */
function MiniPlay({ url }: { url: string }) {
  const { t } = useI18n();
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        title={t("rp.listen")}
        aria-label={t("rp.listen")}
        className="grid h-7 w-7 place-items-center rounded-full border"
        style={{ borderColor: "var(--rp-ink)", color: "var(--rp-ink)" }}
      >
        <Play className="ml-0.5 h-3 w-3" />
      </button>
    );
  }
  return <MiniPlayer url={url} />;
}

function MiniPlayer({ url }: { url: string }) {
  const { t } = useI18n();
  const src = useRecordingUrl(url);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (src && ref.current) void ref.current.play().catch(() => undefined);
  }, [src]);
  return (
    <>
      <audio
        ref={ref}
        src={src ?? undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        onClick={() => {
          const a = ref.current;
          if (!a) return;
          if (a.paused) void a.play();
          else a.pause();
        }}
        title={t("rp.listen")}
        aria-label={t("rp.listen")}
        className="grid h-7 w-7 place-items-center rounded-full"
        style={{ background: "var(--rp-ink)", color: "var(--rp-paper)" }}
      >
        {!src ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : playing ? (
          <Pause className="h-3 w-3" />
        ) : (
          <Play className="ml-0.5 h-3 w-3" />
        )}
      </button>
    </>
  );
}

function CardMenu({
  call,
  amoLink,
  onOpen,
}: {
  call: AudioCallView;
  amoLink: string | null;
  onOpen: (call: AudioCallView) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const reanalyze = useAnalyzeCall();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("rp.more")}
          className="grid h-7 w-7 place-items-center rounded-full hover:opacity-70"
        >
          {reanalyze.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {(call.analyzed || call.leadId) && (
          <DropdownMenuItem onSelect={() => onOpen(call)}>{t("rp.openSheet")}</DropdownMenuItem>
        )}
        {call.leadId && (
          <DropdownMenuItem
            onSelect={() =>
              void navigate({
                to: "/crm/leads/$leadId",
                params: { leadId: call.leadId! },
                search: { from: "funnels" },
              })
            }
          >
            {t("rp.openLeadCard")}
          </DropdownMenuItem>
        )}
        {amoLink && (
          <DropdownMenuItem onSelect={() => window.open(amoLink, "_blank", "noopener")}>
            {t("leadFilter.openInAmoCrm")}
          </DropdownMenuItem>
        )}
        {call.recordingUrl && (
          <DropdownMenuItem
            disabled={reanalyze.isPending}
            onSelect={() =>
              reanalyze.mutate(call.id, {
                onSuccess: () => toast.success(t("rp.regraded")),
                onError: (err) => toast.error(describeError(err, t("audio.analysisFailedShort"))),
              })
            }
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {call.analyzed ? t("rp.regrade") : t("rp.gradeNow")}
          </DropdownMenuItem>
        )}
        {call.leadId && (
          <DropdownMenuItem
            onSelect={() => {
              const url = `${window.location.origin}/crm/leads/${call.leadId}?from=audio&audio=${call.id}`;
              void copyText(url).then(
                () => toast.success(t("ca.copied")),
                () => toast.error(t("common.copyFailed")),
              );
            }}
          >
            <Link2 className="mr-2 h-4 w-4" />
            {t("rp.copyLink")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
