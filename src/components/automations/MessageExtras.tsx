import { useRef, useState } from "react";
import {
  FileAudio,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Loader2,
  MousePointerClick,
  Paperclip,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { uploadBulkFile } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import type { MessageButton, MessageFile } from "@/lib/automation-types";

// The rest of an automatic message after its text: files sent with it (an
// offer PDF, a video, an audio) and Telegram buttons the client presses,
// each with the answer the bot sends back and a tag it puts on the lead --
// e.g. "O'qib chiqdim, roziman" / "E'tirozim bor" under an offer.

// Same field look as ActionEditor's inputCls (kept here: ActionEditor imports this file).
const inputCls =
  "h-9 w-full min-w-0 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/50";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BUTTONS = 6;

function FileIcon({ type }: { type: string }) {
  const cls = "h-4 w-4 shrink-0";
  if (type.startsWith("image/")) return <ImageIcon className={`${cls} text-sky-500`} />;
  if (type.startsWith("video/")) return <FileVideo className={`${cls} text-violet-500`} />;
  if (type.startsWith("audio/")) return <FileAudio className={`${cls} text-emerald-500`} />;
  return <FileText className={`${cls} text-rose-500`} />;
}

export function MessageExtras({
  files,
  buttons,
  onFiles,
  onButtons,
}: {
  files: MessageFile[];
  buttons: MessageButton[];
  onFiles: (files: MessageFile[]) => void;
  onButtons: (buttons: MessageButton[]) => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  async function attach(list: FileList | null) {
    if (!list?.length) return;
    const picked = [...list];
    const tooBig = picked.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      toast.error(t("dp.fileTooBig", { name: tooBig.name }));
      return;
    }
    setUploading((n) => n + picked.length);
    const added: MessageFile[] = [];
    for (const f of picked) {
      try {
        const path = await uploadBulkFile(f);
        added.push({ path, name: f.name, type: f.type || "application/octet-stream" });
      } catch (err) {
        toast.error(describeError(err, t("dp.fileUploadFailed")));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (added.length) onFiles([...files, ...added]);
  }

  const setButton = (i: number, patch: Partial<MessageButton>) =>
    onButtons(buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  return (
    <div className="space-y-3">
      {/* Files */}
      <div className="space-y-1.5">
        {files.map((f, i) => (
          <div
            key={f.path}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5"
          >
            <FileIcon type={f.type} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{f.name}</span>
            <button
              type="button"
              aria-label={t("dp.removeFile")}
              onClick={() => onFiles(files.filter((_, j) => j !== i))}
              className="rounded p-0.5 text-subtle hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void attach(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading > 0}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-60"
        >
          {uploading > 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Paperclip className="h-3.5 w-3.5" />
          )}
          {t("dp.attachFile")}
        </button>
      </div>

      {/* Buttons */}
      <div className="rounded-xl border border-border bg-background/60 p-2.5">
        <div className="mb-2 flex items-center gap-2">
          <MousePointerClick className="h-4 w-4 text-primary" />
          <span className="flex-1 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("dp.buttonsTitle")}
          </span>
          {buttons.length === 0 && (
            <button
              type="button"
              onClick={() =>
                onButtons([
                  {
                    label: t("dp.sample.agree"),
                    reply: t("dp.sample.agreeReply"),
                    tag: "oferta_rozi",
                  },
                  {
                    label: t("dp.sample.object"),
                    reply: t("dp.sample.objectReply"),
                    tag: "oferta_etiroz",
                  },
                ])
              }
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold text-primary hover:bg-primary/10"
            >
              <Sparkles className="h-3 w-3" /> {t("dp.sample.offer")}
            </button>
          )}
        </div>
        <div className="space-y-2">
          {buttons.map((b, i) => (
            <div key={i} className="space-y-1.5 rounded-lg border border-border bg-card p-2">
              <div className="flex items-center gap-1.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
                  {i + 1}
                </span>
                <input
                  value={b.label}
                  onChange={(e) => setButton(i, { label: e.target.value.slice(0, 60) })}
                  placeholder={t("dp.buttonLabel")}
                  className={`${inputCls} h-8 font-semibold`}
                />
                <button
                  type="button"
                  aria-label={t("dp.removeButton")}
                  onClick={() => onButtons(buttons.filter((_, j) => j !== i))}
                  className="rounded-md p-1 text-subtle hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                value={b.reply ?? ""}
                onChange={(e) => setButton(i, { reply: e.target.value })}
                rows={2}
                placeholder={t("dp.buttonReply")}
                className={`${inputCls} h-auto py-1.5 text-[13px]`}
              />
              <input
                value={b.tag ?? ""}
                onChange={(e) => setButton(i, { tag: e.target.value.slice(0, 40) })}
                placeholder={t("dp.buttonTag")}
                className={`${inputCls} h-8 text-[13px]`}
              />
            </div>
          ))}
        </div>
        {buttons.length < MAX_BUTTONS && (
          <button
            type="button"
            onClick={() => onButtons([...buttons, { label: "", reply: "", tag: "" }])}
            className="mt-2 inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] font-semibold text-primary hover:bg-primary/10"
          >
            <Plus className="h-3.5 w-3.5" /> {t("dp.addButton")}
          </button>
        )}
        <p className="mt-1.5 text-[11px] leading-relaxed text-subtle">{t("dp.buttonsHint")}</p>
      </div>
    </div>
  );
}
