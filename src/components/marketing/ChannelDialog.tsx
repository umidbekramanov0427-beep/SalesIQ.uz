import { useEffect, useState } from "react";
import { Check, Copy, Globe, Loader2, Lock, Radio, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { PROJECT_DOT } from "@/lib/marketing-projects";
import {
  useChannelMutations,
  useLinkTelegramGroup,
  useTelegramBoundChats,
  useTgAccount,
  type ChannelRow,
} from "@/hooks/use-crm-data";
import { useMarketingFilters } from "@/components/marketing/MarketingFilters";

// Kanal qo'shish / tahrirlash: a public channel by @name or link, or a
// private one bound to the bot with /bind; its project; what it is for
// (main / ads / webinar); an invite link; whether its live streams are
// followed through the Telegram account; a note.

type Purpose = "main" | "ads" | "webinar";

export function ChannelDialog({
  initial,
  onClose,
}: {
  initial?: ChannelRow | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { projects, projectId } = useMarketingFilters();
  const { add, update } = useChannelMutations();
  const { data: tg } = useTgAccount();
  const { data: bound = [], refetch } = useTelegramBoundChats();
  const link = useLinkTelegramGroup();
  const [kind, setKind] = useState<"public" | "private">("public");
  const [handle, setHandle] = useState("");
  const [chatId, setChatId] = useState<number | null>(null);
  const [code, setCode] = useState<{ code: string; bot: string | null } | null>(null);
  const [project, setProject] = useState<string | null>(initial ? initial.project_id : projectId);
  const [purpose, setPurpose] = useState<Purpose>((initial?.purpose as Purpose) ?? "main");
  const [invite, setInvite] = useState(initial?.invite_link ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [track, setTrack] = useState(initial?.track_live ?? false);
  const accountReady = !!tg?.account && tg.account.status === "ok";
  const channels = bound.filter((c) => c.chat_type === "channel" || c.chat_type === "supergroup");

  // While a /bind code is shown, look for the newly bound channel.
  useEffect(() => {
    if (!code) return;
    const id = setInterval(() => void refetch(), 4000);
    return () => clearInterval(id);
  }, [code, refetch]);

  async function save() {
    try {
      if (initial) {
        await update.mutateAsync({
          id: initial.id,
          patch: {
            project_id: project,
            purpose,
            invite_link: invite.trim() || null,
            note: note.trim() || null,
            track_live: track,
          },
        });
        toast.success(t("mkt.ch.saved"));
      } else {
        const r = (await add.mutateAsync({
          ...(kind === "public" ? { channel: handle.trim() } : chatId != null ? { chatId } : {}),
          projectId: project,
          purpose,
          inviteLink: invite.trim() || null,
          note: note.trim() || null,
          trackLive: track,
        })) as { title?: string; members?: number };
        toast.success(t("mkt.ch.added", { title: r.title ?? "", n: r.members ?? 0 }));
      }
      onClose();
    } catch (err) {
      toast.error(describeError(err, t("mkt.ch.addFailed")));
    }
  }

  const busy = add.isPending || update.isPending;
  const canSave = initial || (kind === "public" ? !!handle.trim() : chatId != null);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <img src="/brand/telegram.svg" alt="" className="h-8 w-8" />
            {initial ? t("mkt.ch.editTitle", { title: initial.title }) : t("mkt.ch.addTitle")}
          </DialogTitle>
          <p className="text-[13px] text-muted-foreground">{t("mkt.ch.addDesc2")}</p>
        </DialogHeader>

        <div className="space-y-4">
          {!initial && (
            <>
              <Segmented
                value={kind}
                onChange={setKind}
                options={[
                  { value: "public", label: t("mkt.ch.public"), icon: Globe },
                  { value: "private", label: t("mkt.ch.private"), icon: Lock },
                ]}
              />
              {kind === "public" ? (
                <label className="block">
                  <span className="mb-1 block text-[12.5px] font-semibold text-muted-foreground">
                    {t("mkt.ch.handle")}
                  </span>
                  <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    autoFocus
                    placeholder="@kanal_nomi yoki https://t.me/kanal_nomi"
                    className="h-11 w-full rounded-xl border border-border bg-input px-3 text-[14.5px] outline-none focus:border-primary"
                  />
                  <span className="mt-1 block text-[11.5px] text-subtle">
                    {t("mkt.ch.handleHint")}
                  </span>
                </label>
              ) : (
                <div className="space-y-2">
                  <p className="text-[12.5px] text-muted-foreground">{t("mkt.ch.privateHint")}</p>
                  <ul className="space-y-1.5">
                    {channels.map((c) => {
                      const on = chatId === c.chat_id;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setChatId(on ? null : c.chat_id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                              on
                                ? "border-primary/50 bg-primary/8"
                                : "border-border hover:border-primary/30",
                            )}
                          >
                            <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500/12 text-sky-700 dark:text-sky-300">
                              <Send className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">
                              {c.title || String(c.chat_id)}
                            </span>
                            {on && <Check className="h-4 w-4 text-primary" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {code ? (
                    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 text-[12.5px] text-foreground">
                      <p>{t("mkt.ch.bindSteps", { bot: code.bot ? `@${code.bot}` : "bot" })}</p>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(`/bind ${code.code}`);
                          toast.success(t("mkt.copied"));
                        }}
                        className="mt-2 inline-flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 font-mono text-[14px] font-bold"
                      >
                        /bind {code.code} <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={link.isPending}
                      onClick={() =>
                        void link
                          .mutateAsync()
                          .then((r) => setCode({ code: r.code, bot: r.botUsername }))
                          .catch((e) => toast.error(describeError(e, t("mkt.ch.addFailed"))))
                      }
                    >
                      {link.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {t("mkt.ch.bindNew")}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}

          <div>
            <span className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
              {t("mkt.p.filter")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[null, ...projects].map((p) => {
                const on = (p?.id ?? null) === project;
                return (
                  <button
                    key={p?.id ?? "none"}
                    type="button"
                    onClick={() => setProject(p?.id ?? null)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    {p && (
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          PROJECT_DOT[p.color] ?? "bg-sky-500",
                        )}
                      />
                    )}
                    {p?.name ?? t("mkt.p.none")}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
              {t("mkt.ch.purposeTitle")}
            </span>
            <Segmented
              value={purpose}
              onChange={setPurpose}
              options={(["main", "ads", "webinar"] as const).map((p) => ({
                value: p,
                label: t(`mkt.ch.purpose.${p}`),
              }))}
            />
          </div>

          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-muted-foreground">
              {t("mkt.ch.invite")}
            </span>
            <input
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="https://t.me/+AbCdEf…"
              className="h-10 w-full rounded-xl border border-border bg-input px-3 font-mono text-[13px] outline-none focus:border-primary"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-3">
            <span className="flex items-start gap-2.5">
              <Radio className="mt-0.5 h-4 w-4 text-rose-500" />
              <span>
                <span className="block text-[13.5px] font-semibold text-foreground">
                  {t("mkt.ch.trackLive")}
                </span>
                <span className="block text-[12px] text-muted-foreground">
                  {accountReady ? t("mkt.ch.trackLiveHint") : t("mkt.ch.trackLiveNeedsAccount")}
                </span>
              </span>
            </span>
            <Switch checked={track} onCheckedChange={setTrack} disabled={!accountReady && !track} />
          </label>

          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-muted-foreground">
              {t("mkt.p.note")}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full rounded-xl border border-border bg-input px-3 py-2 text-[13.5px] outline-none focus:border-primary"
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={busy || !canSave}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {initial ? t("common.save") : t("mkt.ch.addButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
