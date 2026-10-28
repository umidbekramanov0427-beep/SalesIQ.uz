import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import {
  FileAudio,
  FileVideo,
  Mic,
  Video,
  FileText,
  Loader2,
  Mail,
  MessageSquareText,
  Paperclip,
  Plus,
  Send,
  Square,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StagePickButton } from "@/components/crm/StagePickButton";
import { readFile, useTelegramLinked } from "@/components/crm/bulk-message-shared";
import { VoiceRecorder } from "@/components/lead/VoiceRecorder";
import { VideoRecorder } from "@/components/lead/VideoRecorder";
import { sendAsOf, tagSendAs } from "@/lib/telegram/send-as";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  STEP_PICKS,
  sortLikeBoard,
  stepRange,
  type BoardSortBy,
  type StepPick,
} from "@/lib/lead-distribution";
import {
  removeBulkFiles,
  uploadBulkFile,
  useSendBulkMessage,
  type BulkFileInput,
  type BulkMessageChannel,
  type CrmLeadView,
  type StageRow,
} from "@/hooks/use-crm-data";

// "Lidlarga xabar yuborish" (the funnel's "..." menu): one message, with any
// files (pictures, documents, audio, a screenshot pasted with Cmd+V), to
// slices of several stages at once. Each step is a stage and which of its
// leads -- the first N, or the 1st / 2nd / 3rd / any group of N in the
// column's order -- and "Keyingi etap" adds the next one, so a whole round
// of messages goes out from one window with one "YUBORISH".

type Step = {
  key: number;
  stageId: string | null;
  pick: StepPick;
  sizes: Record<StepPick, number>;
  groupN: number;
};
type PickedFile = { id: number; file: File; url: string | null };

const CHANNELS: { key: BulkMessageChannel; icon: typeof Send }[] = [
  { key: "telegram", icon: Send },
  { key: "sms", icon: MessageSquareText },
  { key: "email", icon: Mail },
];
const MAX_CHARS: Record<BulkMessageChannel, number> = { telegram: 4096, sms: 1000, email: 20000 };
const MAX_FILES = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Up to this much in total the files go inline with every request. */
const INLINE_BYTES = 3 * 1024 * 1024;
const BATCH = 100;

const newStep = (key: number, stageId: string | null): Step => ({
  key,
  stageId,
  pick: "first",
  sizes: { first: 10, g1: 10, g2: 10, g3: 10, gN: 10 },
  groupN: 4,
});

const kb = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

export function StageMessageWindow({
  leads,
  stages,
  sortBy,
  onClose,
}: {
  /** Every lead of the funnel. */
  leads: CrmLeadView[];
  /** The funnel's stages in board order. */
  stages: StageRow[];
  sortBy: BoardSortBy;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const send = useSendBulkMessage();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) m.set(l.stageId, (m.get(l.stageId) ?? 0) + 1);
    return m;
  }, [leads]);
  const columns = useMemo(() => {
    const m = new Map<string, CrmLeadView[]>();
    for (const s of stages)
      m.set(
        s.id,
        sortLikeBoard(
          leads.filter((l) => l.stageId === s.id),
          sortBy,
        ),
      );
    return m;
  }, [leads, stages, sortBy]);

  const [steps, setSteps] = useState<Step[]>(() => [newStep(1, null)]);
  const [channel, setChannel] = useState<BulkMessageChannel>("telegram");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  // A voice message or a round video recorded right here for the blast.
  const [recorder, setRecorder] = useState<"voice" | "video" | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "sending">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const busy = phase !== "idle";

  // Object URLs of image previews are released with the window.
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(
    () => () => {
      for (const f of filesRef.current) if (f.url) URL.revokeObjectURL(f.url);
    },
    [],
  );

  const sliceOf = (s: Step) => {
    const column = s.stageId ? (columns.get(s.stageId) ?? []) : [];
    const r = stepRange(column.length, s.pick, s.sizes[s.pick], s.groupN);
    return { column, ...r, leads: column.slice(r.start, r.end) };
  };
  // Every step's leads, each lead once.
  const { targets, repeats } = useMemo(() => {
    const seen = new Set<string>();
    let dup = 0;
    for (const s of steps) {
      for (const l of sliceOf(s).leads) {
        if (seen.has(l.id)) dup += 1;
        else seen.add(l.id);
      }
    }
    return { targets: [...seen], repeats: dup };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sliceOf reads columns
  }, [steps, columns]);

  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const linked = useTelegramLinked(targets, channel === "telegram");
  const reachable = useMemo(
    () =>
      targets.filter((id) => {
        const l = leadsById.get(id);
        if (!l) return false;
        if (channel === "sms") return !!l.phone;
        if (channel === "email") return !!l.email;
        return !!linked.data?.has(id);
      }),
    [targets, leadsById, channel, linked.data],
  );
  const counting = channel === "telegram" && linked.isLoading && targets.length > 0;
  const limit = MAX_CHARS[channel];
  const withFiles = channel !== "sms" && files.length > 0;
  const canSend =
    !busy &&
    !counting &&
    reachable.length > 0 &&
    (text.trim().length > 0 || withFiles) &&
    text.length <= limit;

  function patchStep(key: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function addFiles(list: File[]) {
    const room = MAX_FILES - files.length;
    if (list.length > room) toast.error(t("smsg.tooManyFiles", { count: MAX_FILES }));
    const ok: PickedFile[] = [];
    for (const raw of list.slice(0, Math.max(0, room))) {
      if (raw.size > MAX_FILE_BYTES) {
        toast.error(t("smsg.fileTooBig", { name: raw.name }));
        continue;
      }
      // A pasted screenshot arrives as "image.png": give it a readable name.
      const file =
        raw.name === "image.png" || !raw.name
          ? new File(
              [raw],
              `screenshot-${new Date().toTimeString().slice(0, 8).replace(/:/g, "")}.png`,
              {
                type: raw.type || "image/png",
              },
            )
          : raw;
      ok.push({
        id: nextId.current++,
        file,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      });
    }
    if (ok.length) setFiles((prev) => [...prev, ...ok]);
  }

  function removeFile(id: number) {
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f?.url) URL.revokeObjectURL(f.url);
      return prev.filter((x) => x.id !== id);
    });
  }

  function onPaste(e: ClipboardEvent) {
    if (busy || channel === "sms") return;
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length === 0) return;
    e.preventDefault();
    addFiles(pasted);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (busy || channel === "sms") return;
    addFiles(Array.from(e.dataTransfer.files));
  }

  async function sendAll() {
    const queue = [...reachable];
    stopRef.current = false;
    const uploaded: string[] = [];
    let sent = 0;
    let firstReason = "";
    try {
      // Files: inline while small, otherwise straight to Storage first.
      let payloadFiles: BulkFileInput[] = [];
      if (withFiles) {
        const total = files.reduce((n, f) => n + f.file.size, 0);
        if (total <= INLINE_BYTES) {
          payloadFiles = await Promise.all(
            files.map(async ({ file }) => {
              const a = await readFile(file);
              const as = sendAsOf(file);
              return { name: a.name, type: a.type, base64: a.base64, ...(as ? { as } : {}) };
            }),
          );
        } else {
          setPhase("uploading");
          for (const { file } of files) {
            const path = await uploadBulkFile(file);
            uploaded.push(path);
            const as = sendAsOf(file);
            payloadFiles.push({
              name: file.name,
              type: file.type || "application/octet-stream",
              path,
              ...(as ? { as } : {}),
            });
          }
        }
      }
      setPhase("sending");
      setProgress({ done: 0, total: queue.length });
      for (let i = 0; i < queue.length; i += BATCH) {
        if (stopRef.current) break;
        const r = await send.mutateAsync({
          leadIds: queue.slice(i, i + BATCH),
          channel,
          text: text.trim(),
          ...(channel === "email" && subject.trim() ? { subject: subject.trim() } : {}),
          ...(payloadFiles.length > 0 ? { files: payloadFiles } : {}),
        });
        sent += r.sent;
        firstReason ||= r.results?.find((x) => !x.ok)?.skippedReason ?? "";
        setProgress({ done: Math.min(i + BATCH, queue.length), total: queue.length });
      }
      // Nothing went out: keep the window (and the typed message) open.
      if (sent === 0) {
        toast.error(t("bulkmsg.sentNone"), firstReason ? { description: firstReason } : {});
        return;
      }
      if (sent < queue.length)
        toast.warning(t("bulkmsg.sentPartly", { sent, total: queue.length }));
      else toast.success(t("bulkmsg.sent", { count: sent }));
      onClose();
    } catch (err) {
      toast.error(describeError(err, t("bulk.failed")));
      if (sent > 0) toast.info(t("bulkmsg.sentPartly", { sent, total: queue.length }));
    } finally {
      void removeBulkFiles(uploaded);
      setPhase("idle");
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent
        onPaste={onPaste}
        className="flex max-h-[92vh] max-w-[1080px] flex-col gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center gap-3 border-b border-border px-6 pb-4 pt-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
            <Send className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-[19px] font-bold">{t("smsg.title")}</DialogTitle>
            <p className="text-[12.5px] text-muted-foreground">{t("smsg.subtitle")}</p>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Steps: stage + which of its leads */}
          <div className="min-h-0 space-y-3 overflow-y-auto border-border px-5 py-5 lg:border-r">
            {steps.map((s, i) => {
              const slice = sliceOf(s);
              return (
                <section
                  key={s.key}
                  className="rounded-2xl border border-border bg-card p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]"
                >
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-extrabold text-primary-foreground">
                      {i + 1}
                    </span>
                    <p className="flex-1 text-[13px] font-extrabold text-foreground">
                      {i === 0 && !s.stageId
                        ? t("smsg.firstStage")
                        : t("smsg.nextStageN", { n: i + 1 })}
                    </p>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setSteps((prev) => prev.filter((x) => x.key !== s.key))}
                        aria-label={t("smsg.removeStep")}
                        title={t("smsg.removeStep")}
                        className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <StagePickButton
                    stages={stages}
                    value={s.stageId}
                    counts={counts}
                    onChange={(id) => patchStep(s.key, { stageId: id })}
                    disabled={busy}
                  />

                  <p className="mb-1.5 mt-3 text-[12px] font-bold text-muted-foreground">
                    {t("smsg.howMany")}
                  </p>
                  <div className="space-y-1.5">
                    {STEP_PICKS.map((p) => {
                      const on = s.pick === p;
                      const r = stepRange(slice.column.length, p, s.sizes[p], s.groupN);
                      const n = r.end - r.start;
                      const sizeInput = (
                        <NumberBox
                          value={s.sizes[p]}
                          disabled={busy}
                          label={t("smsg.size")}
                          onChange={(v) =>
                            patchStep(s.key, { pick: p, sizes: { ...s.sizes, [p]: v } })
                          }
                        />
                      );
                      return (
                        <div
                          key={p}
                          role="radio"
                          aria-checked={on}
                          tabIndex={0}
                          onClick={() => !busy && patchStep(s.key, { pick: p })}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && !busy)
                              patchStep(s.key, { pick: p });
                          }}
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors",
                            on
                              ? "border-primary bg-primary/[0.06]"
                              : "border-border hover:bg-accent",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-4 w-4 shrink-0 place-items-center rounded-full border-2",
                              on ? "border-primary" : "border-muted-foreground/40",
                            )}
                          >
                            {on && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[13px] font-semibold text-foreground">
                            {p === "first" ? (
                              <>
                                {t("smsg.firstN")} {sizeInput} {t("smsg.pcs")}
                              </>
                            ) : (
                              <>
                                {p === "gN" ? (
                                  <NumberBox
                                    value={s.groupN}
                                    disabled={busy}
                                    label={t("smsg.groupNo")}
                                    onChange={(v) => patchStep(s.key, { pick: p, groupN: v })}
                                  />
                                ) : (
                                  <span className="tabular-nums">{p.slice(1)}</span>
                                )}
                                <span className="text-muted-foreground">—</span>
                                {sizeInput} {t("smsg.perGroup")}
                              </>
                            )}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 text-right text-[11.5px] tabular-nums",
                              n > 0
                                ? "text-muted-foreground"
                                : "text-amber-700 dark:text-amber-400",
                            )}
                          >
                            {n > 0 ? (
                              <>
                                #{r.start + 1}–{r.end} ·
                                <span className="ml-1 font-bold text-foreground">
                                  {t("smsg.count", { count: n })}
                                </span>
                              </>
                            ) : (
                              t("smsg.none")
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* The stage's column, the step's slice marked. */}
                  {slice.column.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-[3px]" aria-hidden>
                      {slice.column.map((l, k) => (
                        <span
                          key={l.id}
                          className={cn(
                            "h-2 w-2 rounded-[2px]",
                            k >= slice.start && k < slice.end
                              ? "bg-primary"
                              : "bg-foreground/[0.12]",
                          )}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}

            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setSteps((prev) => [
                  ...prev,
                  newStep(Math.max(...prev.map((x) => x.key)) + 1, null),
                ])
              }
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-primary/35 py-3 text-[13.5px] font-bold text-primary transition-colors hover:border-primary/60 hover:bg-primary/[0.05]"
            >
              <Plus className="h-4 w-4" /> {t("smsg.addStage")}
            </button>
          </div>

          {/* Message */}
          <div className="min-h-0 space-y-3.5 overflow-y-auto px-5 py-5">
            <div className="grid grid-cols-3 gap-2">
              {CHANNELS.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  onClick={() => setChannel(key)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                    channel === key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-foreground hover:border-primary/40 hover:bg-accent",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(`bulk.channel.${key}`)}
                </button>
              ))}
            </div>

            {channel === "email" && (
              <input
                value={subject}
                disabled={busy}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("bulk.subject")}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-[13.5px] outline-none focus:border-primary"
              />
            )}

            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (channel !== "sms") setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "rounded-2xl border bg-background transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15",
                dragging ? "border-primary bg-primary/[0.04]" : "border-border",
              )}
            >
              <textarea
                autoFocus
                value={text}
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                placeholder={t("smsg.placeholder")}
                className="block w-full resize-y rounded-t-2xl bg-transparent px-3.5 py-3 text-[14px] outline-none placeholder:text-subtle"
              />
              {files.length > 0 && channel !== "sms" && (
                <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2.5">
                  {files.map((f) => (
                    <span
                      key={f.id}
                      className="group relative flex max-w-[220px] items-center gap-2 rounded-xl border border-border bg-card p-1.5 pr-7"
                    >
                      {f.url ? (
                        <img
                          src={f.url}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          {f.file.type.startsWith("audio/") ? (
                            <FileAudio className="h-5 w-5" />
                          ) : f.file.type.startsWith("video/") ? (
                            <FileVideo className="h-5 w-5" />
                          ) : (
                            <FileText className="h-5 w-5" />
                          )}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-semibold text-foreground">
                          {f.file.name}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {sendAsOf(f.file) ? `${t(`chat.sendAs.${sendAsOf(f.file)}`)} · ` : ""}
                          {kb(f.file.size)}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeFile(f.id)}
                        aria-label={t("smsg.removeFile")}
                        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {recorder && channel === "telegram" && (
                <div className="border-t border-border pt-2">
                  {recorder === "voice" ? (
                    <VoiceRecorder
                      sendLabel={t("smsg.attachRecording")}
                      onSend={async (file, as) => addFiles([tagSendAs(file, as)])}
                      onClose={() => setRecorder(null)}
                    />
                  ) : (
                    <VideoRecorder
                      sendLabel={t("smsg.attachRecording")}
                      onSend={async (file, as) => addFiles([tagSendAs(file, as)])}
                      onClose={() => setRecorder(null)}
                    />
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 border-t border-border px-2.5 py-2">
                <button
                  type="button"
                  disabled={busy || channel === "sms"}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
                >
                  <Paperclip className="h-4 w-4" /> {t("smsg.attach")}
                </button>
                {/* Recorded here: Telegram only (a voice note, a round video). */}
                {channel === "telegram" && (
                  <>
                    <button
                      type="button"
                      disabled={busy || recorder !== null}
                      onClick={() => setRecorder("voice")}
                      title={t("chat.voice.record")}
                      aria-label={t("chat.voice.record")}
                      className="grid h-8 w-8 place-items-center rounded-lg text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
                    >
                      <Mic className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busy || recorder !== null}
                      onClick={() => setRecorder("video")}
                      title={t("chat.video.record")}
                      aria-label={t("chat.video.record")}
                      className="grid h-8 w-8 place-items-center rounded-lg text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
                    >
                      <Video className="h-4 w-4" />
                    </button>
                  </>
                )}
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
                  {channel === "sms" ? t("smsg.smsNoFiles") : t("smsg.pasteHint")}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[11.5px] tabular-nums",
                    text.length > limit ? "font-bold text-destructive" : "text-muted-foreground",
                  )}
                >
                  {text.length}/{limit}
                </span>
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>

            {/* Who it reaches */}
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5",
                reachable.length > 0
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
              )}
            >
              <Users className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 text-[12.5px] font-medium">
                {counting ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("bulkmsg.counting")}
                  </span>
                ) : (
                  <>
                    <span className="text-[15px] font-extrabold tabular-nums">
                      {reachable.length}
                    </span>{" "}
                    {t("bulkmsg.willReach")}
                    <span className="mt-0.5 block opacity-80">
                      {t("smsg.picked", { count: targets.length, steps: steps.length })}
                      {repeats > 0 && ` · ${t("smsg.repeats", { count: repeats })}`}
                    </span>
                    {targets.length > reachable.length && (
                      <span className="mt-0.5 block opacity-80">
                        {t(`bulkmsg.skipped.${channel}`, {
                          count: targets.length - reachable.length,
                        })}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border bg-muted/30 px-6 py-3">
          <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-muted-foreground">
            {phase === "uploading"
              ? t("smsg.uploading")
              : phase === "sending"
                ? t("bulkmsg.sending", { done: progress.done, total: progress.total })
                : t("bulkmsg.hint." + channel)}
          </p>
          {phase === "sending" ? (
            <button
              type="button"
              onClick={() => {
                stopRef.current = true;
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-[13px] font-semibold text-foreground hover:bg-accent"
            >
              <Square className="h-3.5 w-3.5" /> {t("smsg.stop")}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="h-10 rounded-xl px-4 text-[13px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {t("amo.cancel")}
            </button>
          )}
          <button
            type="button"
            disabled={!canSend}
            onClick={() => void sendAll()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-6 text-[13.5px] font-extrabold tracking-wide text-primary-foreground shadow-sm transition-[filter,opacity] hover:brightness-110 disabled:opacity-45"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("smsg.send", { count: reachable.length })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A small number input inside an option row; clicks don't re-pick the row. */
function NumberBox({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={draft}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, "").slice(0, 4);
        setDraft(v);
        if (v && Number(v) > 0) onChange(Number(v));
      }}
      onBlur={() => setDraft(String(value))}
      className="h-7 w-12 rounded-md border border-border bg-background px-1 text-center text-[13px] font-bold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
    />
  );
}
