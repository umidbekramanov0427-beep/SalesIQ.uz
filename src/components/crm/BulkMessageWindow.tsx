import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Mail,
  MessageSquareText,
  Paperclip,
  Send,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { readFile, useTelegramLinked, type Attachment } from "@/components/crm/bulk-message-shared";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, stageColorProps } from "@/lib/utils";
import {
  useSendBulkMessage,
  type BulkMessageChannel,
  type CrmLeadView,
  type StageRow,
} from "@/hooks/use-crm-data";

// "Ommaviy xabar": one message to many leads of a funnel. Who receives it
// is picked here -- the ticked leads, everything the filters found, or
// whole stages -- and the window counts, before anything is sent, how many
// of them the chosen channel can actually reach (a Telegram-linked chat, a
// phone, an email), with a few names as a sample. Sending needs the typed
// confirmation "YUBORISH N" and goes out in a queue of small batches.

type Recipients = "selected" | "all" | "stages";

const CHANNELS: { key: BulkMessageChannel; icon: typeof Send }[] = [
  { key: "telegram", icon: Send },
  { key: "sms", icon: MessageSquareText },
  { key: "email", icon: Mail },
];
const MAX_CHARS: Record<BulkMessageChannel, number> = { telegram: 4096, sms: 1000, email: 20000 };
const MAX_FILE_BYTES = 3 * 1024 * 1024;
/** Leads per request: keeps every request well inside the server's time limit. */
const BATCH = 100;

export function BulkMessageWindow({
  ids,
  allIds,
  leads,
  stages,
  onClose,
  onDone,
}: {
  /** Ticked leads. */
  ids: string[];
  /** Every lead the funnel's filters show. */
  allIds: string[];
  /** The funnel's (filtered) leads. */
  leads: CrmLeadView[];
  /** This funnel's stages, in order. */
  stages: StageRow[];
  onClose: () => void;
  onDone: (sent: number, total: number) => void;
}) {
  const { t } = useI18n();
  const send = useSendBulkMessage();
  const [channel, setChannel] = useState<BulkMessageChannel>("telegram");
  const [recipients, setRecipients] = useState<Recipients>(ids.length ? "selected" : "all");
  const [stageIds, setStageIds] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [file, setFile] = useState<Attachment | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) m.set(l.stageId, (m.get(l.stageId) ?? 0) + 1);
    return m;
  }, [leads]);

  const targetIds = useMemo(() => {
    if (recipients === "selected") return ids;
    if (recipients === "all") return allIds;
    return leads.filter((l) => stageIds.has(l.stageId)).map((l) => l.id);
  }, [recipients, ids, allIds, leads, stageIds]);

  const linked = useTelegramLinked(targetIds, channel === "telegram");
  // Who the channel can reach -- the rest would only be skipped by the server.
  const reachable = useMemo(() => {
    return targetIds.filter((id) => {
      const l = leadsById.get(id);
      if (!l) return false;
      if (channel === "sms") return !!(l.phone || l.whatsapp);
      if (channel === "email") return !!l.email;
      return !!linked.data?.has(id);
    });
  }, [targetIds, leadsById, channel, linked.data]);
  const counting = channel === "telegram" && linked.isLoading && targetIds.length > 0;
  const samples = reachable
    .slice(0, 3)
    .map((id) => {
      const l = leadsById.get(id);
      return l ? l.contactName || l.name : "";
    })
    .filter(Boolean);

  // The confirmation phrase follows the count, so it must be retyped when
  // the recipients change.
  const phrase = `${t("bulkmsg.confirmWord")} ${reachable.length}`;
  useEffect(() => setConfirmText(""), [reachable.length]);

  const limit = MAX_CHARS[channel];
  const noStage = recipients === "stages" && stageIds.size === 0;
  const canSend =
    !busy &&
    !counting &&
    reachable.length > 0 &&
    (text.trim().length > 0 || (!!file && channel !== "sms")) &&
    text.length <= limit &&
    confirmText.trim().toUpperCase() === phrase.toUpperCase();

  async function pickFile(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast.error(t("bulkmsg.fileTooBig"));
      return;
    }
    try {
      setFile(await readFile(f));
    } catch (err) {
      toast.error(describeError(err, t("bulk.failed")));
    }
  }

  async function sendAll() {
    const queue = [...reachable];
    setProgress({ done: 0, total: queue.length });
    let sent = 0;
    try {
      for (let i = 0; i < queue.length; i += BATCH) {
        const r = await send.mutateAsync({
          leadIds: queue.slice(i, i + BATCH),
          channel,
          text: text.trim(),
          ...(channel === "email" && subject.trim() ? { subject: subject.trim() } : {}),
          ...(file && channel !== "sms"
            ? { file: { name: file.name, type: file.type, base64: file.base64 } }
            : {}),
        });
        sent += r.sent;
        setProgress({ done: Math.min(i + BATCH, queue.length), total: queue.length });
      }
      onDone(sent, queue.length);
    } catch (err) {
      toast.error(describeError(err, t("bulk.failed")));
      if (sent > 0) onDone(sent, queue.length);
    } finally {
      setProgress(null);
    }
  }

  const channelHint = t(`bulkmsg.hint.${channel}`);

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="amo-skin flex max-h-[92vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <div className="border-b border-border px-6 pb-4 pt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
            {t(`bulk.channel.${channel}`)}
          </p>
          <DialogTitle className="mt-0.5 text-[19px] font-bold">{t("bulkmsg.title")}</DialogTitle>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 text-[13.5px]">
          {/* Channel */}
          <div className="grid grid-cols-3 gap-2">
            {CHANNELS.map(({ key, icon: Icon }) => (
              <button
                key={key}
                type="button"
                disabled={busy}
                onClick={() => {
                  setChannel(key);
                  if (key === "sms") setFile(null);
                }}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13.5px] font-semibold transition-colors",
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
          <p className="rounded-xl border border-primary/20 bg-primary/[0.06] px-3.5 py-2.5 text-[12.5px] font-medium text-foreground/80">
            {channelHint}
          </p>

          {/* Recipients */}
          <div>
            <label className="mb-1.5 block text-[12.5px] font-bold text-foreground">
              {t("bulkmsg.recipients")}
            </label>
            <select
              value={recipients}
              disabled={busy}
              onChange={(e) => setRecipients(e.target.value as Recipients)}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-[13.5px] font-semibold text-foreground outline-none focus:border-primary"
            >
              {ids.length > 0 && (
                <option value="selected">{t("bulkmsg.r.selected", { count: ids.length })}</option>
              )}
              <option value="all">{t("bulkmsg.r.all", { count: allIds.length })}</option>
              <option value="stages">{t("bulkmsg.r.stages")}</option>
            </select>
          </div>

          {recipients === "stages" && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {stages.map((s) => {
                const on = stageIds.has(s.id);
                const color = stageColorProps(s.color);
                return (
                  <label
                    key={s.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-[12.5px] font-semibold transition-colors",
                      on ? "border-primary bg-primary/[0.07]" : "border-border hover:bg-accent",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={busy}
                      onChange={() =>
                        setStageIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.add(s.id);
                          return next;
                        })
                      }
                      className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                    />
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        color.className ?? (color.style ? "" : "bg-muted-foreground/40"),
                      )}
                      style={color.style}
                    />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {stageCounts.get(s.id) ?? 0}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Who it reaches */}
          {noStage ? (
            <p className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t("bulkmsg.pickStage")}
            </p>
          ) : (
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
                      {reachable.length.toLocaleString()}
                    </span>{" "}
                    {t("bulkmsg.willReach")}
                    {samples.length > 0 && (
                      <span className="opacity-80">
                        {" "}
                        · {t("bulkmsg.forExample")} {samples.join(", ")}
                      </span>
                    )}
                    {targetIds.length > reachable.length && (
                      <span className="mt-0.5 block opacity-80">
                        {t(`bulkmsg.skipped.${channel}`, {
                          count: targetIds.length - reachable.length,
                        })}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Message */}
          <div>
            <label className="mb-1.5 block text-[12.5px] font-bold text-foreground">
              {t("bulkmsg.message")}
            </label>
            {channel === "email" && (
              <input
                value={subject}
                disabled={busy}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("bulk.subject")}
                className="mb-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-[13.5px] outline-none focus:border-primary"
              />
            )}
            <textarea
              autoFocus
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={t("bulkmsg.placeholder")}
              className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-[13.5px] outline-none placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <p
              className={cn(
                "mt-1 text-right text-[11.5px] tabular-nums",
                text.length > limit ? "font-bold text-destructive" : "text-muted-foreground",
              )}
            >
              {text.length} / {limit}
            </p>
          </div>

          {/* Attachment */}
          {channel !== "sms" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <Paperclip className="h-3.5 w-3.5" />
                {t("bulkmsg.attach")}
              </button>
              {file && (
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-[12px] font-medium">
                  <span className="max-w-[260px] truncate">{file.name}</span>
                  <span className="text-muted-foreground">
                    · {Math.max(1, Math.round(file.size / 1024))} KB
                  </span>
                  <button
                    type="button"
                    aria-label={t("amo.cancel")}
                    onClick={() => setFile(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  void pickFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* Warning + typed confirmation */}
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-[12.5px] font-medium text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {t("bulkmsg.warning")}
          </p>
          <div className="rounded-xl border border-border bg-muted/40 p-3.5">
            <p className="text-[12.5px] font-semibold text-foreground">
              {t("bulkmsg.typeToConfirm")}
            </p>
            <p className="mt-1.5 inline-block rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[12.5px] font-bold tracking-wide text-emerald-700 dark:text-emerald-300">
              {phrase}
            </p>
            <input
              value={confirmText}
              disabled={busy || reachable.length === 0}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={phrase}
              className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 font-mono text-[13.5px] uppercase outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-6 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-10 rounded-xl px-4 text-[13px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("amo.cancel")}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            disabled={!canSend}
            onClick={() => void sendAll()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-[13.5px] font-bold text-primary-foreground shadow-sm transition-[filter,opacity] hover:brightness-110 disabled:opacity-45"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {busy && progress
              ? t("bulkmsg.sending", { done: progress.done, total: progress.total })
              : t("bulkmsg.queue")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
