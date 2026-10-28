import { useEffect, useRef, useState } from "react";
import { Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { mmss } from "@/components/lead/ChatParts";
import type { SendAs } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { ROUND_VIDEO_MAX_SECONDS } from "@/lib/telegram/send-as";
import { cn } from "@/lib/utils";

// The chat composer's camera, as in Telegram: it asks for the camera, then
// records a round video (the centre square of the picture, up to a minute,
// with a ring filling up as time runs). Afterwards the recording plays in
// the circle and the manager picks how it goes out -- a round video, an
// ordinary video or a file -- and sends it or throws it away.

type Phase = "waiting" | "recording" | "ready";
type VideoForm = Extract<SendAs, "video_note" | "video" | "document">;

const SIDE = 480; // px of the recorded square
const FORMS: VideoForm[] = ["video_note", "video", "document"];

// MP4 first: Telegram takes only MP4 as a round video.
const MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,opus",
  "video/mp4",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function VideoRecorder({
  onSend,
  onClose,
  onRecordingChange,
  sendLabel,
}: {
  /** Sends the recording as the picked form; resolves once it went. */
  onSend: (file: File, as: VideoForm) => Promise<void>;
  onClose: () => void;
  onRecordingChange?: (recording: boolean) => void;
  /** The send button's word ("Biriktirish" where the recording only joins a message). */
  sendLabel?: string;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("waiting");
  const [elapsed, setElapsed] = useState(0); // ms
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [form, setForm] = useState<VideoForm>("video_note");
  const [sending, setSending] = useState(false);
  const liveRef = useRef<HTMLVideoElement>(null);
  const cleanupRef = useRef<() => void>(() => {});
  const stoppingRef = useRef(false);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        toast.error(t("chat.video.unsupported"));
        onClose();
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
          audio: true,
        });
      } catch {
        toast.error(t("chat.video.denied"));
        onClose();
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      const live = liveRef.current;
      if (live) {
        live.srcObject = stream;
        void live.play().catch(() => {});
      }

      // The centre square of the camera, drawn on a canvas that is what
      // gets recorded -- a round video has to be square.
      const canvas = document.createElement("canvas");
      canvas.width = SIDE;
      canvas.height = SIDE;
      const g = canvas.getContext("2d");
      let raf = 0;
      const draw = () => {
        const v = liveRef.current;
        if (g && v && v.videoWidth) {
          const side = Math.min(v.videoWidth, v.videoHeight);
          g.drawImage(
            v,
            (v.videoWidth - side) / 2,
            (v.videoHeight - side) / 2,
            side,
            side,
            0,
            0,
            SIDE,
            SIDE,
          );
        }
        raf = requestAnimationFrame(draw);
      };
      draw();
      const recorded = canvas.captureStream(30);
      for (const track of stream.getAudioTracks()) recorded.addTrack(track);

      const mimeType = MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(recorded, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 1_000_000,
      });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        if (!stoppingRef.current || cancelled) return; // cancelled
        const type = (rec.mimeType || "video/webm").split(";")[0]!;
        const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
        const f = new File(chunks, `video-${stamp}.${type.includes("mp4") ? "mp4" : "webm"}`, {
          type,
        });
        setFile(f);
        setUrl(URL.createObjectURL(f));
        setPhase("ready");
      };

      const started = Date.now();
      const tick = setInterval(() => {
        const ms = Date.now() - started;
        setElapsed(ms);
        if (ms >= ROUND_VIDEO_MAX_SECONDS * 1000) stopRef.current();
      }, 100);
      cleanupRef.current = () => {
        clearInterval(tick);
        cancelAnimationFrame(raf);
        if (rec.state !== "inactive") rec.stop();
        stream.getTracks().forEach((tr) => tr.stop());
        recorded.getTracks().forEach((tr) => tr.stop());
      };
      rec.start(250);
      setPhase("recording");
      onRecordingChange?.(true);
    })();
    return () => {
      cancelled = true;
      cleanupRef.current();
      onRecordingChange?.(false);
    };
    // Runs once, when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  function stop() {
    stoppingRef.current = true;
    cleanupRef.current();
    cleanupRef.current = () => {};
    onRecordingChange?.(false);
  }
  stopRef.current = stop;

  async function send() {
    if (!file) return;
    setSending(true);
    try {
      await onSend(file, form);
      onClose();
    } catch {
      // onSend has said what went wrong; the recording stays to retry.
    } finally {
      setSending(false);
    }
  }

  const seconds = elapsed / 1000;
  const share = Math.min(1, seconds / ROUND_VIDEO_MAX_SECONDS);
  const R = 47;
  const C = 2 * Math.PI * R;

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-4 px-4 pb-3 pt-2">
      <div className="relative h-[132px] w-[132px] shrink-0">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="3" className="stroke-border" />
          {phase === "recording" && (
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - share)}
              className="stroke-red-500 transition-[stroke-dashoffset] duration-100"
            />
          )}
        </svg>
        <div className="absolute inset-[6px] overflow-hidden rounded-full bg-muted">
          {phase !== "ready" && (
            <video
              ref={liveRef}
              muted
              playsInline
              // The camera shows mirrored, like every selfie preview.
              className={cn(
                "h-full w-full -scale-x-100 object-cover",
                phase === "waiting" && "opacity-0",
              )}
            />
          )}
          {phase === "ready" && url && <RoundPreview url={url} />}
          {phase === "waiting" && (
            <span className="absolute inset-0 grid place-items-center px-3 text-center text-[11.5px] font-medium text-muted-foreground">
              {t("chat.video.waiting")}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {phase === "ready" ? (
          <div className="flex flex-wrap gap-1.5">
            {FORMS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setForm(f)}
                aria-pressed={form === f}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  form === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:border-primary/40",
                )}
              >
                {t(`chat.sendAs.${f}`)}
              </button>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-[13px] font-semibold tabular-nums text-foreground">
            {phase === "recording" && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            )}
            {phase === "recording"
              ? `${t("chat.video.recording")} · ${mmss(seconds)}`
              : t("chat.video.waiting")}
            <span className="font-normal text-muted-foreground">
              / {mmss(ROUND_VIDEO_MAX_SECONDS)}
            </span>
          </p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void send()}
            disabled={phase !== "ready" || sending}
            className="inline-flex h-9 min-w-[104px] items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
          >
            {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {sendLabel ?? t("amo.send")}
          </button>
          {phase === "recording" && (
            <button
              type="button"
              onClick={stop}
              title={t("chat.voice.stop")}
              aria-label={t("chat.voice.stop")}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-background/40 transition-colors hover:bg-accent"
            >
              <Square className="h-3.5 w-3.5 fill-red-500 text-red-500" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {t("amo.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The finished recording in its circle: click to play or pause. */
function RoundPreview({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        const v = ref.current;
        if (!v) return;
        if (v.paused) void v.play().catch(() => {});
        else v.pause();
      }}
      className="relative block h-full w-full"
    >
      <video
        ref={ref}
        src={url}
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="h-full w-full object-cover"
      />
      {!playing && (
        <span className="absolute inset-0 grid place-items-center bg-black/25 text-[26px] text-white">
          ▶
        </span>
      )}
    </button>
  );
}
