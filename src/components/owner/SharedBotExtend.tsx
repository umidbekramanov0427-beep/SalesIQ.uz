import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { sharedBotDaysLeft, SHARED_BOT_DAYS } from "@/lib/telegram/shared-bot";
import { cn } from "@/lib/utils";

/** Company card (owner): how long the shared trial bot still takes new clients, +14 days. */
export function SharedBotExtend({
  orgId,
  until,
}: {
  orgId: string;
  until: string | null | undefined;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (until === undefined) return null;
  const days = sharedBotDaysLeft(until);
  const over = days != null && days <= 0;

  async function extend() {
    setBusy(true);
    try {
      const res = await apiFetch("/platform/shared-bot-extend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId, days: SHARED_BOT_DAYS }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast.success(t("obot.extended"));
      await qc.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-500/12 text-sky-700 dark:text-sky-300">
        <Bot className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground">{t("obot.ownerTitle")}</p>
        <p className={cn("text-[12px]", over ? "text-rose-600" : "text-muted-foreground")}>
          {until
            ? over
              ? t("obot.ownerOver", { date: until.slice(0, 10) })
              : t("obot.ownerUntil", { date: until.slice(0, 10), n: days ?? 0 })
            : t("obot.ownerNone")}
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void extend()}
        className="ctl-soft inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold disabled:opacity-60"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {t("obot.ownerExtend", { n: SHARED_BOT_DAYS })}
      </button>
    </div>
  );
}
