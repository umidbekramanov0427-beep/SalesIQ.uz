import { useEffect, useRef, useState } from "react";
import { Copy, Loader2, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { renderMessageContent } from "@/components/ai/MessageContent";
import { useAiAssistantChat, useSendLeadTelegramMessage } from "@/hooks/use-crm-data";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";

// "AI dan so'rang · shu mijoz haqida": a side panel on the lead card. The
// assistant gets the lead's details, its analysed calls and its chat (see
// ai-assistant.chat.ts, leadId) and answers as a sales coach for this one
// client. A ready message it writes in quotes can be copied or sent to the
// client's Telegram in one click.

type Msg = { role: "user" | "assistant"; content: string };

/** The longest «…» or "…" quote in an answer: the ready-to-send message. */
export function readyMessage(text: string): string | null {
  const quotes = [...text.matchAll(/«([^»]{25,})»|"([^"]{25,})"|“([^”]{25,})”/g)].map((m) =>
    (m[1] ?? m[2] ?? m[3] ?? "").trim(),
  );
  return quotes.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function LeadAskAiPanel({
  leadId,
  canSendTelegram,
  onClose,
}: {
  leadId: string;
  canSendTelegram: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const chat = useAiAssistantChat();
  const send = useSendLeadTelegramMessage();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.add("lead-ai-open");
    return () => document.documentElement.classList.remove("lead-ai-open");
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || chat.isPending) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setDraft("");
    setStreaming("");
    try {
      const reply = await chat.mutateAsync({
        messages: next,
        leadId,
        page: `/crm/leads/${leadId}`,
        onText: (soFar) => setStreaming(soFar),
      });
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (err) {
      toast.error(describeError(err, t("leadAi.failed")));
      setMessages(next.slice(0, -1));
      setDraft(q);
    } finally {
      setStreaming(null);
    }
  }

  const suggestions = [t("leadAi.q1"), t("leadAi.q2"), t("leadAi.q3")];

  return (
    <aside className="flex h-full w-[400px] max-w-full shrink-0 flex-col border-l border-border bg-card phone:fixed phone:inset-0 phone:z-50 phone:w-full">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3.5">
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#3570ee,#5b55e6)] text-white">
          <Sparkles className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground">{t("leadAi.title")}</p>
          <p className="text-xs text-subtle">{t("leadAi.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-accent hover:text-foreground"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 text-[13.5px]">
        {messages.length === 0 && streaming == null && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("leadAi.intro")}</p>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                className="block w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-[13px] font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div
              key={i}
              className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-[14px] rounded-br-[4px] bg-[linear-gradient(90deg,#3570ee,#5b55e6)] px-3.5 py-2.5 text-white"
            >
              {m.content}
            </div>
          ) : (
            <AnswerBubble
              key={i}
              text={m.content}
              canSend={canSendTelegram}
              sending={send.isPending}
              onSend={(text) =>
                send.mutate(
                  { leadId, text },
                  {
                    onSuccess: () => toast.success(t("leadAi.sent")),
                    onError: (e) => toast.error(describeError(e, t("leadAi.sendFailed"))),
                  },
                )
              }
            />
          ),
        )}
        {streaming != null && (
          <div className="max-w-[95%] rounded-[14px] rounded-bl-[4px] border border-border bg-surface px-3.5 py-3 leading-relaxed">
            {streaming ? (
              renderMessageContent(streaming, t("inbox.open"))
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("leadAi.thinking")}
              </span>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-border px-3.5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface pl-3.5 pr-1.5 focus-within:border-primary">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("leadAi.placeholder")}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle"
          />
          <button
            type="submit"
            disabled={!draft.trim() || chat.isPending}
            aria-label={t("leadAi.send")}
            className="grid h-8 w-8 place-items-center rounded-lg bg-[linear-gradient(90deg,#3570ee,#5b55e6)] text-white disabled:opacity-40"
          >
            {chat.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-subtle">{t("leadAi.disclaimer")}</p>
      </form>
    </aside>
  );
}

function AnswerBubble({
  text,
  canSend,
  sending,
  onSend,
}: {
  text: string;
  canSend: boolean;
  sending: boolean;
  onSend: (text: string) => void;
}) {
  const { t } = useI18n();
  const ready = readyMessage(text);
  return (
    <div className="max-w-[95%] rounded-[14px] rounded-bl-[4px] border border-border bg-surface px-3.5 py-3 leading-relaxed">
      <div className="space-y-1">{renderMessageContent(text, t("inbox.open"))}</div>
      {ready && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              void copyText(ready).then(
                () => toast.success(t("ca.copied")),
                () => toast.error(t("common.copyFailed")),
              )
            }
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[12.5px] font-semibold text-foreground hover:bg-accent",
            )}
          >
            <Copy className="h-3.5 w-3.5" /> {t("leadAi.copyMessage")}
          </button>
          {canSend && (
            <button
              type="button"
              disabled={sending}
              onClick={() => onSend(ready)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[12.5px] font-semibold text-foreground hover:bg-accent disabled:opacity-60"
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {t("leadAi.sendTelegram")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
