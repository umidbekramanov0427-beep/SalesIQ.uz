import { useEffect, useState } from "react";
import { AlarmClock, Check, Copy, Loader2, Send, Settings2, Users } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { refundMessage, type RefundRules } from "@/lib/refunds";
import type { Json } from "@/integrations/supabase/types";
import {
  useLinkTelegramGroup,
  useRefundRules,
  useTelegramBoundChats,
  useUpdateOrgGeneralSettings,
} from "@/hooks/use-crm-data";

// Pul qaytarish -> Sozlash: the Telegram group or channel that gets every
// receipt (with the client's name, phone and a link into the CRM), whether
// the client gets it from the bot, and the client's message.

export function RefundSettingsButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Settings2 className="h-4 w-4" />
        {t("secset.button")}
      </Button>
      {open && <RefundSettingsSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function RefundSettingsSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const saved = useRefundRules();
  const [d, setD] = useState<RefundRules>(saved);
  useEffect(() => setD(saved), [saved]);
  const update = useUpdateOrgGeneralSettings();
  const { data: chats = [], refetch } = useTelegramBoundChats();
  const link = useLinkTelegramGroup();
  const [code, setCode] = useState<{ code: string; bot: string | null } | null>(null);

  // While a code is shown, look for the newly bound group every few seconds.
  useEffect(() => {
    if (!code) return;
    const id = setInterval(() => void refetch(), 4000);
    return () => clearInterval(id);
  }, [code, refetch]);

  async function save() {
    try {
      await update.mutateAsync({ refund_rules: d as unknown as Json });
      toast.success(t("refund.settingsSaved"));
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error && /refund_rules/.test(err.message)
          ? t("refund.migrationPending")
          : describeError(err, t("refund.saveFailed")),
      );
    }
  }

  async function newGroup() {
    try {
      const r = await link.mutateAsync();
      setCode({ code: r.code, bot: r.botUsername });
    } catch (err) {
      toast.error(describeError(err, t("refund.saveFailed")));
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            {t("refund.settingsTitle")}
          </SheetTitle>
          <p className="text-[13px] text-muted-foreground">{t("refund.settingsDesc")}</p>
        </SheetHeader>
        <div className="mt-5 space-y-5">
          {/* Deadlines: how many days to pay back, and the reminders. */}
          <section>
            <p className="console-caption mb-2 flex items-center gap-1.5">
              <AlarmClock className="h-3.5 w-3.5" />
              {t("refund.deadlineTitle")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["beforeDays", "afterDays"] as const).map((k) => (
                <label key={k} className="rounded-xl border border-border px-3.5 py-3">
                  <span className="block text-[12px] text-muted-foreground">
                    {t(k === "beforeDays" ? "refund.stage.before" : "refund.stage.after")}
                  </span>
                  <span className="mt-1 flex items-baseline gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={d[k]}
                      onChange={(e) =>
                        setD((x) => ({
                          ...x,
                          [k]: Math.min(60, Math.max(1, Number(e.target.value) || 1)),
                        }))
                      }
                      className="w-16 rounded-lg border border-border bg-input px-2 py-1 text-[18px] font-bold tabular-nums outline-none focus:border-primary"
                    />
                    <span className="text-[13px] text-muted-foreground">{t("refund.days")}</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-3">
              <span>
                <span className="block text-[13.5px] font-semibold text-foreground">
                  {t("refund.remindOn")}
                </span>
                <span className="block text-[12px] text-muted-foreground">
                  {t("refund.remindHint")}
                </span>
              </span>
              <Switch
                checked={d.remind}
                onCheckedChange={(v) => setD((x) => ({ ...x, remind: v }))}
              />
            </label>
          </section>

          <section>
            <p className="console-caption mb-2 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {t("refund.groupTitle")}
            </p>
            <label className="mb-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-3">
              <span>
                <span className="block text-[13.5px] font-semibold text-foreground">
                  {t("refund.groupOn")}
                </span>
                <span className="block text-[12px] text-muted-foreground">
                  {t("refund.groupHint")}
                </span>
              </span>
              <Switch
                checked={d.notifyGroup}
                onCheckedChange={(v) => setD((x) => ({ ...x, notifyGroup: v }))}
              />
            </label>
            <ul className="space-y-1.5">
              {chats.map((c) => {
                const on = d.chatId === c.chat_id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setD((x) => ({ ...x, chatId: on ? null : c.chat_id }))}
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
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-foreground">
                          {c.title || String(c.chat_id)}
                        </span>
                        <span className="block text-[11.5px] text-muted-foreground">
                          {t(c.chat_type === "channel" ? "refund.kindChannel" : "refund.kindGroup")}
                        </span>
                      </span>
                      {on && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {code ? (
              <div className="mt-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 text-[12.5px] text-foreground">
                <p>{t("refund.bindSteps", { bot: code.bot ? `@${code.bot}` : "bot" })}</p>
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
                className="mt-2"
                onClick={() => void newGroup()}
                disabled={link.isPending}
              >
                {link.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t("refund.bindNew")}
              </Button>
            )}
          </section>

          <section>
            <p className="console-caption mb-2">{t("refund.clientTitle")}</p>
            <label className="mb-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-3">
              <span>
                <span className="block text-[13.5px] font-semibold text-foreground">
                  {t("refund.clientOn")}
                </span>
                <span className="block text-[12px] text-muted-foreground">
                  {t("refund.clientHint")}
                </span>
              </span>
              <Switch
                checked={d.notifyClient}
                onCheckedChange={(v) => setD((x) => ({ ...x, notifyClient: v }))}
              />
            </label>
            <textarea
              value={d.clientText}
              disabled={!d.notifyClient}
              onChange={(e) => setD((x) => ({ ...x, clientText: e.target.value }))}
              rows={5}
              maxLength={1000}
              placeholder={refundMessage("{name}", "{amount}")}
              className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-[13.5px] outline-none focus:border-primary disabled:opacity-50"
            />
            <p className="mt-1 text-[11.5px] text-muted-foreground">{t("refund.clientVars")}</p>
          </section>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void save()} disabled={update.isPending}>
              {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
