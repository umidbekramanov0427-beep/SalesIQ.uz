import { useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Pause, Play, SmilePlus, UserRound } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useChatFileUrl, useLeadAvatarUrl } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { CHAT_REACTIONS } from "@/lib/telegram/reactions";
import {
  claimPlayback,
  playNextAfter,
  registerChainPlayer,
  releasePlayback,
} from "@/lib/audio/playback";
import { cn } from "@/lib/utils";

// Pieces of a lead's Telegram chat shared by the lead card's feed and the
// funnel board: the client's photo, a file in a message, the reaction picker.

/** The client's Telegram photo, or their initial (or a blank circle) when there is none. */
export function ClientAvatar({
  leadId,
  name,
  hasPhoto,
  blank = false,
  className,
  fallbackClassName = "bg-primary/12 text-primary",
}: {
  leadId: string;
  name: string;
  /** Known to have a Telegram photo (skips the lookup otherwise). */
  hasPhoto: boolean;
  /** No photo: an empty circle with a person outline, not the initial. */
  blank?: boolean;
  className?: string;
  /** Colours of the initial when there is no photo. */
  fallbackClassName?: string;
}) {
  const photo = useLeadAvatarUrl(leadId, hasPhoto);
  const initial = (name.match(/\p{L}/u)?.[0] ?? "?").toUpperCase();
  return photo.data ? (
    <img
      src={photo.data}
      alt=""
      className={cn("shrink-0 rounded-full object-cover", className)}
      draggable={false}
    />
  ) : blank ? (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-border bg-foreground/[0.05] text-foreground/30",
        className,
      )}
    >
      <UserRound className="h-1/2 w-1/2" strokeWidth={1.75} />
    </span>
  ) : (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold",
        fallbackClassName,
        className,
      )}
    >
      {initial}
    </span>
  );
}

const FILE_ICON: Record<string, string> = {
  audio: "🎵",
  voice: "🎤",
  video: "🎬",
  video_note: "🎬",
  animation: "🎞",
  document: "📎",
  photo: "🖼",
};

/** One line for a file where there is no room to show it (board bubble). */
export function chatFileLabel(
  kind: string | null,
  name: string | null,
  t: (k: string) => string,
): string {
  if (!kind) return "";
  if (kind === "sticker") return name || "🙂";
  return `${FILE_ICON[kind] ?? "📎"} ${name || t(`chat.file.${kind}`)}`;
}

/** A file inside a chat bubble: a picture, a player, or a download chip. */
export function ChatFile({
  messageId,
  kind,
  name,
}: {
  messageId: string;
  kind: string;
  name: string | null;
}) {
  const { t } = useI18n();
  const inline = ["photo", "sticker", "animation", "audio", "voice", "video", "video_note"];
  const [wanted, setWanted] = useState(inline.includes(kind));
  const file = useChatFileUrl(messageId, wanted);
  const url = file.data ?? null;

  if (kind === "photo" || kind === "sticker" || kind === "animation") {
    if (!url) return <FilePlaceholder loading={file.isLoading} kind={kind} name={name} />;
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt={name ?? ""}
          className={cn(
            "max-h-64 rounded-xl object-contain",
            kind === "sticker" ? "w-28" : "max-w-full",
          )}
        />
      </a>
    );
  }
  if (kind === "audio" || kind === "voice") {
    return url ? (
      <VoicePlayer url={url} title={kind === "audio" ? name : null} />
    ) : (
      <FilePlaceholder loading={file.isLoading} kind={kind} name={name} />
    );
  }
  if (kind === "video_note") {
    return url ? (
      <RoundVideo url={url} />
    ) : (
      <FilePlaceholder loading={file.isLoading} kind={kind} name={name} />
    );
  }
  if (kind === "video") {
    return url ? (
      <video
        controls
        playsInline
        preload="metadata"
        src={url}
        className="max-h-80 w-[320px] max-w-full rounded-xl bg-black"
      />
    ) : (
      <FilePlaceholder loading={file.isLoading} kind={kind} name={name} />
    );
  }
  // A document: fetched only when asked for.
  return (
    <button
      type="button"
      onClick={() => {
        if (url) {
          const a = document.createElement("a");
          a.href = url;
          a.download = name || "file";
          a.click();
        } else setWanted(true);
      }}
      className="flex max-w-full items-center gap-2.5 rounded-xl border border-border bg-background/60 px-2.5 py-2 text-left transition-colors hover:border-primary/50"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
        {name || t("chat.file.document")}
      </span>
      {file.isLoading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

/**
 * Telegram's round video: it plays silently in a loop in its circle; a
 * click starts it from the top with sound and a ring shows how far it is,
 * another click pauses. Only one plays aloud at a time.
 */
export function RoundVideo({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [loud, setLoud] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [left, setLeft] = useState(0);

  function click() {
    const v = ref.current;
    if (!v) return;
    if (!loud) {
      v.muted = false;
      v.loop = false;
      v.currentTime = 0;
      setLoud(true);
      void v.play().catch(() => {});
    } else if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }

  const R = 48.5;
  const C = 2 * Math.PI * R;
  return (
    <button
      type="button"
      onClick={click}
      aria-label={loud && playing ? "Pause" : "Play"}
      className="relative block h-[220px] w-[220px] max-w-full shrink-0 rounded-full"
    >
      <video
        ref={ref}
        src={url}
        muted
        loop
        autoPlay
        playsInline
        preload="auto"
        onPlay={(e) => {
          setPlaying(true);
          if (!e.currentTarget.muted) claimPlayback(e.currentTarget);
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration > 0) {
            setProgress(v.currentTime / v.duration);
            setLeft(v.duration - v.currentTime);
          }
        }}
        onEnded={(e) => {
          // Back to the silent loop, like Telegram.
          const v = e.currentTarget;
          v.muted = true;
          v.loop = true;
          setLoud(false);
          setProgress(0);
          releasePlayback(v);
          void v.play().catch(() => {});
        }}
        className="h-full w-full rounded-full bg-muted object-cover"
      />
      {loud && (
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            className="stroke-white/90"
          />
        </svg>
      )}
      <span className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">
        {!loud ? "🔇" : playing ? "" : "⏸"} {mmss(left)}
      </span>
    </button>
  );
}

const BARS = 44;

/** Peaks of the sound, BARS of them between 0.12 and 1 (flat while it can't be read). */
function useWaveform(url: string): { bars: number[]; bytes: number | null; seconds: number } {
  const [state, setState] = useState<{ bars: number[]; bytes: number | null; seconds: number }>({
    bars: Array.from({ length: BARS }, () => 0.3),
    bytes: null,
    seconds: 0,
  });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const buf = await (await fetch(url)).arrayBuffer();
        const bytes = buf.byteLength;
        if (!cancelled) setState((s) => ({ ...s, bytes }));
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const audio = await ctx.decodeAudioData(buf);
        void ctx.close();
        const data = audio.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / BARS));
        const peaks = Array.from({ length: BARS }, (_, i) => {
          let max = 0;
          for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 16) {
            const v = Math.abs(data[j]!);
            if (v > max) max = v;
          }
          return max;
        });
        const top = Math.max(...peaks, 0.01);
        if (!cancelled)
          setState({
            bars: peaks.map((p) => Math.max(0.12, p / top)),
            bytes,
            seconds: audio.duration,
          });
      } catch {
        // Not decodable here (e.g. OGG/Opus in Safari): keep the flat bars.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

export const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const sizeText = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;

/**
 * Telegram's voice message: a round play button, the sound's waveform
 * (played part highlighted, click to jump), then time and size. Songs get
 * their title above. Only one plays at a time, and when one ends the next
 * one below it in the chat starts.
 */
export function VoicePlayer({ url, title }: { url: string; title: string | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { bars, bytes, seconds } = useWaveform(url);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const [time, setTime] = useState(0);
  const [metaDuration, setDuration] = useState(0);
  // Some formats report no length to <audio>; the decoded sound always does.
  const duration = Number.isFinite(metaDuration) && metaDuration > 0 ? metaDuration : seconds;
  const progress = duration > 0 ? time / duration : 0;

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }

  useEffect(() => {
    const el = rootRef.current;
    const a = audioRef.current;
    if (!el || !a) return;
    const off = registerChainPlayer({
      el,
      play: () => {
        if (a.ended) a.currentTime = 0;
        void a.play().catch(() => {});
      },
    });
    return () => {
      off();
      a.pause();
      releasePlayback(a);
    };
  }, []);

  return (
    <div ref={rootRef} className="w-[300px] max-w-full">
      {title && <p className="mb-1.5 truncate text-[12.5px] font-semibold">🎵 {title}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sky-500 text-white shadow-sm transition-transform hover:scale-105"
        >
          {playing ? (
            <Pause className="h-5 w-5 fill-current" />
          ) : (
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div
            role="slider"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            tabIndex={0}
            onClick={(e) => {
              const a = audioRef.current;
              if (!a || !duration) return;
              const r = e.currentTarget.getBoundingClientRect();
              a.currentTime = ((e.clientX - r.left) / r.width) * duration;
            }}
            className="flex h-8 cursor-pointer items-center gap-[2px]"
          >
            {bars.map((h, i) => (
              <span
                key={i}
                className={cn(
                  "w-[3px] shrink-0 rounded-full transition-colors",
                  i / bars.length < progress ? "bg-sky-500" : "bg-sky-500/35",
                )}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            ))}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12px] tabular-nums opacity-75">
            {mmss(playing || time > 0 ? time : duration)}
            {bytes !== null && `, ${sizeText(bytes)}`}
            {!played && <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />}
          </p>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={(e) => {
          claimPlayback(e.currentTarget);
          setPlaying(true);
          setPlayed(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTime(0);
          if (rootRef.current) playNextAfter(rootRef.current);
        }}
        className="hidden"
      />
    </div>
  );
}

function FilePlaceholder({
  loading,
  kind,
  name,
}: {
  loading: boolean;
  kind: string;
  name: string | null;
}) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-2 rounded-xl bg-background/50 px-3 py-2 text-[12.5px] text-muted-foreground">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (FILE_ICON[kind] ?? "📎")}
      {loading ? t("chat.file.loading") : name || t("chat.file.unavailable")}
    </span>
  );
}

/** The smile button next to a client's message and the emojis it offers. */
export function ReactionPicker({
  current,
  onPick,
  className,
}: {
  current: string | null;
  onPick: (emoji: string | null) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("chat.react")}
          aria-label={t("chat.react")}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            className,
          )}
        >
          <SmilePlus className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="flex w-auto gap-0.5 rounded-full p-1">
        {CHAT_REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              onPick(current === e ? null : e);
              setOpen(false);
            }}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full text-[18px] transition-transform hover:scale-125",
              current === e && "bg-primary/15",
            )}
          >
            {e}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
