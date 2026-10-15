import { useEffect, useRef, useState, type FormEvent } from "react";
import { Headset, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useMySupportMessages, useSendSupportMessage } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import type { SupportMessage } from "@/lib/support";
import { cn } from "@/lib/utils";

// The assistant's "Operator" tab: a chat with the SalesIQ team. Questions
// go to the team's Telegram; their answers appear here (polled while open)
// and in the person's own Telegram when the bot is linked.
export function SupportChat({ page, onSeen }: { page: string; onSeen: () => void }) {
  const { t } = useI18n();
  const messages = useMySupportMessages(true);
  const send = useSendSupportMessage();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const list = messages.data ?? [];

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    onSeen();
  }, [list.length, onSeen]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || send.isPending) return;
    try {
      await send.mutateAsync({ text, page });
      setInput("");
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      toast.error(
        code === "RATE_LIMIT"
          ? t("support.rateLimit")
          : code === "SUPPORT_NOT_READY"
            ? t("support.notReady")
            : t("support.sendFailed"),
      );
    }
  }

  return (
    <>
      <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto p-4">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Headset className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-bold text-foreground">{t("support.teamName")}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
              {t("support.intro")}
            </p>
          </div>
        </div>
        {messages.isLoading && (
          <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </p>
        )}
        {list.map((m, i) => (
          <Bubble
            key={m.id}
            msg={m}
            showName={m.direction === "out" && list[i - 1]?.direction !== "out"}
          />
        ))}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          id="support-input"
          value={input}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={t("support.placeholder")}
          maxLength={4000}
          className="max-h-28 min-h-10 min-w-0 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary/50"
        />
        <button
          type="submit"
          disabled={send.isPending || !input.trim()}
          aria-label={t("ai.send")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {send.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>
    </>
  );
}

function Bubble({ msg, showName }: { msg: SupportMessage; showName: boolean }) {
  const { t } = useI18n();
  const mine = msg.direction === "in";
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      {showName && (
        <span className="mb-0.5 ml-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          {t("support.teamName")}
        </span>
      )}
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
          mine
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border border-border bg-card text-foreground",
        )}
      >
        {msg.text}
      </div>
      <span className="mx-1 mt-0.5 text-[10.5px] tabular-nums text-muted-foreground">
        {stamp(msg.created_at)}
      </span>
    </div>
  );
}

function stamp(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? time
    : `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })} ${time}`;
}
