import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { mmss } from "@/components/lead/ChatParts";
import { claimPlayback, releasePlayback } from "@/lib/audio/playback";
import { webmToOgg } from "@/lib/audio/webm-to-ogg";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The chat composer's voice message, as in amoCRM: recording starts at
// once (the sound's line grows, the timer runs, the button is a red
// square); the square stops it; then the recording can be played back
// (play / pause, click the line to jump) and sent -- as a voice message or
// as a file -- or thrown away.

const SAMPLE_MS = 100;
const BAR = 3; // px
const GAP = 2; // px

type Phase = "recording" | "ready";

/** The recorded chunks as a file Telegram takes as a voice message. */
async function voiceFile(chunks: Blob[], mimeType: string): Promise<File> {
  const type = mimeType || chunks[0]?.type || "audio/webm";
  const raw = new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
  const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
  if (type.includes("mp4")) return new File([raw], `voice-${stamp}.m4a`, { type: "audio/mp4" });
  // Chrome records WebM; Telegram wants the same Opus sound in OGG.
  const ogg = type.includes("webm") ? new Uint8Array(webmToOgg(raw)) : raw;
  return new File([ogg], `voice-${stamp}.ogg`, { type: "audio/ogg" });
}

/** `levels` squeezed (or stretched) to `n` bars, loudest of each stretch. */
function resample(levels: number[], n: number): number[] {
  if (n <= 0 || levels.length === 0) return [];
  return Array.from({ length: n }, (_, i) => {
    const from = Math.floor((i * levels.length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / n));
    return Math.max(...levels.slice(from, to));
  });
}

export function VoiceRecorder({
  onSend,
  onClose,
  onRecordingChange,
  sendLabel,
}: {
  /** Sends the recording as a voice message or a file; resolves once it went. */
  onSend: (file: File, as: "voice" | "document") => Promise<void>;
  onClose: () => void;
  onRecordingChange?: (recording: boolean) => void;
  /** The send button's word ("Biriktirish" where the recording only joins a message). */
  sendLabel?: string;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("recording");
  const [levels, setLevels] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0); // ms recorded
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState<"voice" | "document">("voice");
  const [width, setWidth] = useState(0);
  const waveRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<() => void>(() => {});
  const stoppingRef = useRef(false);

  useLayoutEffect(() => {
    const el = waveRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Start recording as soon as the panel opens (the mic button's click).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        toast.error(t("chat.voice.unsupported"));
        onClose();
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        toast.error(t("chat.voice.denied"));
        onClose();
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      // Telegram plays OGG/Opus or M4A as a voice note; Chrome only records
      // WebM, which is re-wrapped as OGG (webmToOgg).
      const mimeType = [
        "audio/ogg;codecs=opus",
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        if (!stoppingRef.current) return; // cancelled
        void voiceFile(chunks, rec.mimeType).then((f) => {
          if (cancelled) return;
          setFile(f);
          setUrl(URL.createObjectURL(f));
          setPhase("ready");
        });
      };

      // How loud the microphone is, for the growing line.
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const ctx = Ctx ? new Ctx() : null;
      const analyser = ctx?.createAnalyser() ?? null;
      if (ctx && analyser) {
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        void ctx.resume().catch(() => {});
      }
      const buf = new Uint8Array(analyser?.fftSize ?? 0);
      const started = Date.now();
      const tick = setInterval(() => {
        setElapsed(Date.now() - started);
        let level = 0;
        if (analyser) {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        }
        setLevels((prev) => [...prev, level]);
      }, SAMPLE_MS);

      cleanupRef.current = () => {
        clearInterval(tick);
        if (rec.state !== "inactive") rec.stop();
        stream.getTracks().forEach((tr) => tr.stop());
        void ctx?.close().catch(() => {});
      };
      rec.start(250);
      recRef.current = rec;
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
  useEffect(() => {
    const a = audioRef.current;
    return () => {
      if (a) {
        a.pause();
        releasePlayback(a);
      }
    };
  }, [url]);

  function stop() {
    stoppingRef.current = true;
    cleanupRef.current();
    cleanupRef.current = () => {};
    onRecordingChange?.(false);
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }

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
  const fits = Math.max(1, Math.floor((width + GAP) / (BAR + GAP)));
  // While recording the line grows (the newest end stays in view); after
  // that the whole recording fills the width.
  const bars = phase === "recording" ? levels.slice(-fits) : resample(levels, fits);
  const progress = phase === "ready" && seconds > 0 ? time / seconds : 0;
  const shown = phase === "recording" ? seconds : playing || time > 0 ? time : seconds;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3 px-4 pt-1">
        <div
          ref={waveRef}
          role={phase === "ready" ? "slider" : undefined}
          aria-label={phase === "ready" ? t("chat.voice.position") : undefined}
          aria-valuemin={phase === "ready" ? 0 : undefined}
          aria-valuemax={phase === "ready" ? Math.round(seconds) : undefined}
          aria-valuenow={phase === "ready" ? Math.round(time) : undefined}
          tabIndex={phase === "ready" ? 0 : undefined}
          onClick={(e) => {
            const a = audioRef.current;
            if (phase !== "ready" || !a || !seconds) return;
            const r = e.currentTarget.getBoundingClientRect();
            a.currentTime = Math.min(seconds, ((e.clientX - r.left) / r.width) * seconds);
            setTime(a.currentTime);
          }}
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center overflow-hidden",
            phase === "ready" && "cursor-pointer",
          )}
          style={{ gap: GAP }}
        >
          {bars.map((h, i) => (
            <span
              key={i}
              className={cn(
                "shrink-0 rounded-full",
                phase === "recording"
                  ? "bg-foreground/45"
                  : i / bars.length < progress
                    ? "bg-sky-500"
                    : "bg-sky-500/35",
              )}
              style={{ width: BAR, height: `${Math.max(8, Math.round(h * 100))}%` }}
            />
          ))}
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold tabular-nums text-foreground">
          {phase === "recording" && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          )}
          {mmss(shown)}
        </span>
      </div>

      <div className="flex items-center gap-3 px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={phase !== "ready" || sending}
          className="inline-flex h-9 min-w-[104px] items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
        >
          {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {sendLabel ?? t("amo.send")}
        </button>
        <button
          type="button"
          onClick={phase === "recording" ? stop : togglePlay}
          disabled={sending}
          title={
            phase === "recording"
              ? t("chat.voice.stop")
              : playing
                ? t("chat.voice.pause")
                : t("chat.voice.play")
          }
          aria-label={
            phase === "recording"
              ? t("chat.voice.stop")
              : playing
                ? t("chat.voice.pause")
                : t("chat.voice.play")
          }
          className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-background/40 transition-colors hover:bg-accent disabled:opacity-50"
        >
          {phase === "recording" ? (
            <Square className="h-3.5 w-3.5 fill-red-500 text-red-500" />
          ) : playing ? (
            <Pause className="h-4 w-4 fill-sky-500 text-sky-500" />
          ) : (
            <Play className="ml-0.5 h-4 w-4 fill-sky-500 text-sky-500" />
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={sending}
          className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {t("amo.cancel")}
        </button>
        {phase === "recording" && (
          <span className="text-[12.5px] text-muted-foreground">{t("chat.voice.recording")}</span>
        )}
        {phase === "ready" && (
          <div className="ml-auto flex gap-1 rounded-full bg-muted p-0.5">
            {(["voice", "document"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setForm(f)}
                aria-pressed={form === f}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
                  form === f
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`chat.sendAs.${f}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="auto"
          onPlay={(e) => {
            claimPlayback(e.currentTarget);
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onEnded={() => {
            setPlaying(false);
            setTime(0);
          }}
          className="hidden"
        />
      )}
    </div>
  );
}
