// Files in a chat composer, the same way everywhere: pick with the paper
// clip, paste with Cmd/Ctrl+V (a copied screenshot or file), or drop onto
// the composer; each waits as a small preview until sent. Used by the CRM
// lead composer, the owner's support inbox and the Operator tab.
import { useCallback, useEffect, useState, type ClipboardEvent, type DragEvent } from "react";
import { Download, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { RoundVideo, VoicePlayer } from "@/components/lead/ChatParts";
import { useAuthedBlobUrl } from "@/hooks/crm/integrations";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Storage uploads (and so chat files) are capped at 20 MB. */
export const CHAT_MAX_FILE = 20 * 1024 * 1024;
export const CHAT_MAX_FILES = 10;

/** A pasted screenshot has no real name: give it one with the time. */
export function namedChatFile(raw: File): File {
  if (raw.name && raw.name !== "image.png") return raw;
  const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
  return new File([raw], `screenshot-${stamp}.png`, { type: raw.type || "image/png" });
}

/** The files waiting in a composer: add (checked for size), remove, clear. */
export function useAttachments(onAdded?: () => void) {
  const { t } = useI18n();
  const [files, setFiles] = useState<File[]>([]);
  const addFiles = useCallback(
    (list: File[] | FileList | null | undefined) => {
      const ok: File[] = [];
      for (const raw of Array.from(list ?? [])) {
        if (raw.size > CHAT_MAX_FILE) {
          toast.error(t("smsg.fileTooBig", { name: raw.name }));
          continue;
        }
        ok.push(namedChatFile(raw));
      }
      if (!ok.length) return;
      setFiles((prev) => [...prev, ...ok].slice(0, CHAT_MAX_FILES));
      onAdded?.();
    },
    [t, onAdded],
  );
  const remove = (i: number) => setFiles((prev) => prev.filter((_, j) => j !== i));
  const clear = () => setFiles([]);
  /** For a textarea's onPaste: files on the clipboard become attachments. */
  const onPaste = (e: ClipboardEvent) => {
    if (e.clipboardData?.files?.length) {
      e.preventDefault();
      addFiles(e.clipboardData.files);
    }
  };
  return { files, addFiles, remove, clear, onPaste };
}

/** Drag-and-drop onto an area: `dragging` lights it while files hover. */
export function useFileDrop(addFiles: (list: FileList) => void) {
  const [dragging, setDragging] = useState(false);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  return {
    dragging,
    dropProps: {
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        if (!dragging) setDragging(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (e.currentTarget === e.target) setDragging(false);
      },
      onDrop: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      },
    },
  };
}

/** The "drop files here" layer shown over a composer while dragging. */
export function DropOverlay({ show }: { show: boolean }) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-[inherit] border-2 border-dashed border-primary bg-primary/10 text-[13px] font-semibold text-primary backdrop-blur-[1px]">
      {t("attach.dropHere")}
    </div>
  );
}

export function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A file waiting in the composer: a thumbnail for pictures, else its name. */
export function PendingFile({
  file,
  onRemove,
  className,
}: {
  file: File;
  onRemove: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <span
      className={cn(
        "relative flex max-w-[220px] items-center gap-2 rounded-lg border border-border bg-card p-1.5 pr-7",
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-[16px]">
          {file.type.startsWith("audio/") ? "🎵" : file.type.startsWith("video/") ? "🎬" : "📎"}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold text-foreground">
          {file.name}
        </span>
        <span className="block text-[11px] text-muted-foreground">{fileSize(file.size)}</span>
      </span>
      <button
        type="button"
        aria-label={t("smsg.removeFile")}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/**
 * A support message's file (/support/file): a picture, a player, a video,
 * or a download chip. `kind` is how it was sent (photo, voice, video ...).
 */
export function SupportFile({
  messageId,
  file,
}: {
  messageId: string;
  file: { name: string | null; type: string | null; size?: number | null; kind: string | null };
}) {
  const kind = file.kind ?? "document";
  const pending = messageId.startsWith("pending-") || kind === "uploading";
  const inline = ["photo", "animation", "audio", "voice", "video", "video_note"].includes(kind);
  const [wanted, setWanted] = useState(inline);
  const [saveWhenReady, setSaveWhenReady] = useState(false);
  const blob = useAuthedBlobUrl(
    ["support_file", messageId],
    !pending && wanted ? `/support/file?id=${encodeURIComponent(messageId)}` : null,
  );
  const url = blob.data ?? null;
  const save = useCallback(
    (u: string) => {
      const a = document.createElement("a");
      a.href = u;
      a.download = file.name ?? "file";
      a.click();
    },
    [file.name],
  );
  useEffect(() => {
    if (saveWhenReady && url) {
      setSaveWhenReady(false);
      save(url);
    }
  }, [saveWhenReady, url, save]);
  if (pending)
    return (
      <span className="flex items-center gap-2 text-[12.5px] opacity-80">
        <Loader2 className="h-4 w-4 animate-spin" /> {file.name}
      </span>
    );
  if ((kind === "photo" || kind === "animation") && url)
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt={file.name ?? ""}
          className="max-h-64 max-w-full rounded-xl object-contain"
        />
      </a>
    );
  if ((kind === "voice" || kind === "audio") && url)
    return <VoicePlayer url={url} title={kind === "audio" ? file.name : null} />;
  if (kind === "video_note" && url) return <RoundVideo url={url} />;
  if (kind === "video" && url)
    return <video src={url} controls className="max-h-72 max-w-full rounded-xl" />;
  return (
    <button
      type="button"
      onClick={() => {
        if (url) save(url);
        else {
          setWanted(true);
          setSaveWhenReady(true);
        }
      }}
      className="flex max-w-[260px] items-center gap-2 rounded-xl border border-current/20 bg-background/40 px-3 py-2 text-left"
    >
      {blob.isLoading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        <Download className="h-4 w-4 shrink-0" />
      )}
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-semibold">{file.name ?? "file"}</span>
        {file.size ? (
          <span className="block text-[11px] opacity-70">{fileSize(file.size)}</span>
        ) : null}
      </span>
    </button>
  );
}
