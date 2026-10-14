import { useState } from "react";
import { Download, FileText, Loader2, SmilePlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useChatFileUrl, useLeadAvatarUrl } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { CHAT_REACTIONS } from "@/lib/telegram/reactions";
import { cn } from "@/lib/utils";

// Pieces of a lead's Telegram chat shared by the lead card's feed and the
// funnel board: the client's photo, a file in a message, the reaction picker.

/** The client's Telegram photo, or their initial when there is none. */
export function ClientAvatar({
  leadId,
  name,
  hasPhoto,
  className,
  fallbackClassName = "bg-primary/12 text-primary",
}: {
  leadId: string;
  name: string;
  /** Known to have a Telegram photo (skips the lookup otherwise). */
  hasPhoto: boolean;
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
    return (
      <div className="min-w-[240px]">
        {name && (
          <p className="mb-1 truncate text-[12.5px] font-semibold">
            {FILE_ICON[kind]} {name}
          </p>
        )}
        {url ? (
          <audio controls src={url} className="h-9 w-full" preload="metadata" />
        ) : (
          <FilePlaceholder loading={file.isLoading} kind={kind} name={null} />
        )}
      </div>
    );
  }
  if (kind === "video" || kind === "video_note") {
    return url ? (
      <video
        controls
        src={url}
        className={cn("max-h-64 rounded-xl", kind === "video_note" && "w-48 rounded-full")}
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
