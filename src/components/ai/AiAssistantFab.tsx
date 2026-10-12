import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Brain, Maximize2, Send, Sparkles, X } from "lucide-react";
import { renderMessageContent } from "@/components/ai/MessageContent";
import { useAiAssistantChat, usePermission } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; error?: boolean };

// The AI assistant on every page: a button at the bottom right that opens a
// small chat. It sends the page you're on, so "how do I…" is answered from
// that page's guide. The full chat with history stays at /ai-assistant.
export function AiAssistantFab() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const allowed = usePermission("Use AI assistant");
  const chat = useAiAssistantChat();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  // The answer while it streams in, and whether the assistant is looking
  // something up with its tools meanwhile.
  const [draft, setDraft] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, chat.isPending, draft]);

  if (!allowed || pathname.startsWith("/ai-assistant")) return null;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || chat.isPending) return;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    try {
      const reply = await chat.mutateAsync({
        messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
        page: pathname,
        onText: (text) => {
          setWorking(false);
          setDraft(text);
        },
        onWorking: () => setWorking(true),
      });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === "TIMEOUT";
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: isTimeout
            ? t("ai.timeoutError")
            : err instanceof Error
              ? err.message
              : t("ai.genericError"),
          error: true,
        },
      ]);
    } finally {
      setDraft(null);
      setWorking(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  const suggestions = [t("fab.q1"), t("fab.q2"), t("fab.q3")];

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[min(560px,calc(100dvh-120px))] w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" /> {t("fab.title")}
              </p>
              <p className="truncate text-xs text-muted-foreground">{t("fab.subtitle")}</p>
            </div>
            <div className="flex items-center gap-1">
              <Link
                to="/ai-assistant"
                aria-label={t("fab.fullscreen")}
                title={t("fab.fullscreen")}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Maximize2 className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("common.close")}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t("fab.hello")}</p>
                {suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    className="block w-full rounded-xl border border-border bg-card px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-accent/50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap text-sm",
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-2xl bg-primary px-3.5 py-2 text-primary-foreground"
                    : m.error
                      ? "max-w-[92%] rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-destructive"
                      : "max-w-[92%] rounded-xl border border-border bg-card px-3.5 py-2.5 text-foreground",
                )}
              >
                {m.role === "assistant"
                  ? renderMessageContent(m.content, t("inbox.open"))
                  : m.content}
              </div>
            ))}
            {draft && (
              <div className="max-w-[92%] whitespace-pre-wrap rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground">
                {renderMessageContent(draft, t("inbox.open"))}
              </div>
            )}
            {chat.isPending && (!draft || working) && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
                <Brain className="h-4 w-4 animate-pulse" />{" "}
                {working ? t("ai.lookingUp") : t("ai.thinking")}
              </p>
            )}
          </div>

          <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-border p-3">
            <input
              id="ai-fab-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("ai.placeholder")}
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/50"
            />
            <button
              type="submit"
              disabled={chat.isPending || !input.trim()}
              aria-label={t("ai.send")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        data-tour="ai"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? t("common.close") : t("fab.title")}
        aria-expanded={open}
        className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-elevated transition-transform duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>
    </div>
  );
}
