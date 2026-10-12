import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Brain,
  CornerDownLeft,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Send,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { LogoLoader } from "@/components/LogoLoader";
import { useI18n } from "@/lib/i18n";
import { BackButton } from "@/components/layout/BackButton";
import { useAuth } from "@/lib/auth";
import {
  useAiAssistantChat,
  useAiConversationMessages,
  useAiConversations,
  useCreateAiConversation,
  useSaveAiMessage,
  type AiChatConversationRow,
} from "@/hooks/use-crm-data";
import { cn } from "@/lib/utils";
import { PermissionGate } from "@/components/PermissionGate";
import { renderMessageContent } from "@/components/ai/MessageContent";

export const Route = createFileRoute("/ai-assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant — SalesIQ" },
      {
        name: "description",
        content: "Ask the AI assistant about your leads, deals and pipeline.",
      },
    ],
  }),
  component: AiAssistantPageGated,
});

function AiAssistantPageGated() {
  return (
    <PermissionGate action="Use AI assistant">
      <AiAssistantPage />
    </PermissionGate>
  );
}

type Msg = { role: "user" | "assistant"; content: string; error?: boolean };

function PromptCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="kpi-sheen flex h-full flex-col items-start gap-1.5 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-primary/40 hover:bg-accent"
    >
      <span className="text-[14px] font-semibold text-foreground">{title}</span>
      <span className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
        {description}
      </span>
    </button>
  );
}

function EmptyState({ inputSlot, children }: { inputSlot: ReactNode; children: ReactNode }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const firstName = (user?.name ?? "").split(" ")[0] || t("ai.friend");

  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 pb-10 pt-16 text-center">
      <Logo className="h-10 w-10" />
      <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
        {t("ai.helloName", { name: firstName })}
      </h2>
      <p className="mt-1.5 text-base text-muted-foreground">{t("ai.helpQuestion")}</p>
      <div className="mt-6 w-full max-w-2xl">{inputSlot}</div>
      <div className="mt-6 grid w-full max-w-2xl gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function dateLabel(iso: string, lang: string, t: (k: string) => string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return t("lb.presetToday");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return t("lb.presetYesterday");
  return d.toLocaleDateString(lang, { day: "numeric", month: "short" });
}

function HistoryPanel({
  conversations,
  activeId,
  onSelect,
  onNew,
  onClose,
}: {
  conversations: AiChatConversationRow[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(search.trim().toLowerCase()))
    : conversations;

  return (
    <aside className="flex w-full max-w-[300px] shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border p-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">{t("ai.history")}</h3>
          <p className="text-xs text-subtle">
            {t("ai.historyCount", { count: conversations.length })}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onNew}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> {t("ai.newChat")}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("ai.closeHistory")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("ai.searchConversations")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-subtle"
          />
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-subtle">
            {search.trim() ? t("ai.noSearchResults") : t("ai.noConversations")}
          </p>
        )}
        {filtered.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
              c.id === activeId
                ? "bg-primary/10 font-semibold text-primary"
                : "text-foreground hover:bg-accent",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-subtle" />
              <span className="truncate">{c.title}</span>
            </span>
            <span className="shrink-0 text-[11px] text-subtle">
              {dateLabel(c.updated_at, lang, t)}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function AiAssistantPage() {
  const { t } = useI18n();
  const chat = useAiAssistantChat();
  const { data: conversations = [] } = useAiConversations();
  const createConversation = useCreateAiConversation();
  const saveMessage = useSaveAiMessage();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;
  const conversationMessages = useAiConversationMessages(activeConversationId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  // Covers the whole send() flow (create conversation -> save user message ->
  // ask the AI -> save its reply), not just the AI call itself -- with only
  // chat.isPending gating the spinner, a slow/hung createConversation or
  // saveMessage call left the screen showing nothing at all: the user's own
  // bubble sitting there with no spinner, no reply, no error, indistinguishable
  // from the app being broken.
  const [sending, setSending] = useState(false);

  // The answer while it streams in, and whether the assistant is looking
  // something up with its tools meanwhile.
  const [draft, setDraft] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // Loads a past conversation into the view when one is picked from the
  // history -- only then. A conversation this page is writing to itself is
  // never reloaded from the server: the saved copy can lag a moment behind
  // (the reply's save still in flight), and reloading it used to wipe the
  // reply off the screen and bring it back a second later. A slower first
  // load of a picked conversation may still grow the list, never shrink it.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (sending || !activeConversationId || !conversationMessages.data) return;
    const rows = conversationMessages.data;
    if (hydratedFor.current === activeConversationId && rows.length <= messages.length) return;
    hydratedFor.current = activeConversationId;
    setMessages(
      rows.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    );
    // messages.length is read, not reacted to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, conversationMessages.data, sending]);

  const promptCards = [
    { title: t("ai.card1Title"), description: t("ai.card1Desc"), prompt: t("ai.card1Prompt") },
    { title: t("ai.card2Title"), description: t("ai.card2Desc"), prompt: t("ai.card2Prompt") },
    { title: t("ai.card3Title"), description: t("ai.card3Desc"), prompt: t("ai.card3Prompt") },
    { title: t("ai.card4Title"), description: t("ai.card4Desc"), prompt: t("ai.card4Prompt") },
  ];

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      // Saving the conversation runs alongside the AI request instead of
      // before it, so the answer starts as soon as possible.
      const conversationId = activeConversationId
        ? Promise.resolve(activeConversationId)
        : createConversation.mutateAsync(trimmed).then((conv) => {
            hydratedFor.current = conv.id;
            setActiveConversationId(conv.id);
            return conv.id;
          });
      const userSaved = conversationId.then((id) =>
        saveMessage.mutateAsync({ conversationId: id, role: "user", content: trimmed }),
      );
      userSaved.catch(() => undefined);

      const reply = await chat.mutateAsync({
        messages: next,
        onText: (textSoFar) => {
          setWorking(false);
          setDraft(textSoFar);
        },
        onWorking: () => setWorking(true),
      });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      setDraft(null);
      // The answer is on screen; a failed history save only means this
      // exchange won't be in the history list, so it isn't shown as an error.
      try {
        await userSaved;
        await saveMessage.mutateAsync({
          conversationId: await conversationId,
          role: "assistant",
          content: reply,
        });
      } catch (saveErr) {
        console.warn("[ai-assistant] history not saved", saveErr);
      }
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
      setSending(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function onNewChat() {
    hydratedFor.current = null;
    setActiveConversationId(null);
    setMessages([]);
  }

  const inputForm = (
    <form
      onSubmit={onSubmit}
      className="flex h-14 w-full items-center gap-2 rounded-2xl border border-border bg-surface pl-5 pr-2 transition-colors focus-within:border-primary/50"
    >
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={t("ai.placeholder")}
        className="h-full flex-1 bg-transparent text-base outline-none"
      />
      <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-subtle sm:flex">
        <CornerDownLeft className="h-3.5 w-3.5" /> {t("ai.send")}
      </span>
      <button
        type="submit"
        disabled={sending || !input.trim()}
        aria-label={t("ai.send")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <Send className="h-4 w-4" />
      </button>
    </form>
  );

  return (
    // Full-bleed, full-height chat -- not a card floating inside <main>'s
    // padding. The negative margins cancel that padding so this is the
    // whole page below the app header, matching a real chat app instead
    // of a boxed widget nested inside another screen.
    <div className="-mx-4 flex h-full flex-col md:-mx-6 md:-mr-[84px] phone:-mr-4">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton />
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold text-foreground">
              {activeConversation?.title || t("nav.aiAssistant")}
            </h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{t("ai.liveStatus")}</p>
          </div>
        </div>
        {!historyOpen && (
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label={t("ai.toggleHistory")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:bg-accent"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {messages.length === 0 ? (
            <EmptyState inputSlot={inputForm}>
              {promptCards.map((c) => (
                <PromptCard
                  key={c.title}
                  title={c.title}
                  description={c.description}
                  onClick={() => void send(c.prompt)}
                />
              ))}
            </EmptyState>
          ) : (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto p-6">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "whitespace-pre-wrap text-[15px]",
                      m.role === "user"
                        ? "ml-auto max-w-[70%] rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground"
                        : m.error
                          ? "max-w-[85%] rounded-xl border border-l-[3px] border-destructive/30 border-l-destructive bg-destructive/10 px-4 py-3 text-destructive"
                          : "max-w-[85%] rounded-xl border border-l-[3px] border-border border-l-primary bg-card px-4 py-3 text-foreground",
                    )}
                  >
                    {m.role === "assistant"
                      ? renderMessageContent(m.content, t("inbox.open"))
                      : m.content}
                  </div>
                ))}

                {draft && (
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-xl border border-l-[3px] border-border border-l-primary bg-card px-4 py-3 text-[15px] text-foreground">
                    {renderMessageContent(draft, t("inbox.open"))}
                  </div>
                )}

                {sending && (!draft || working) && (
                  <div className="flex max-w-[85%] items-center gap-3 rounded-xl border border-l-[3px] border-border border-l-primary bg-card px-4 py-3">
                    <LogoLoader className="h-8 w-8 shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-foreground">
                        {t("nav.aiAssistant")}
                      </span>
                      <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
                        <Brain className="h-3.5 w-3.5" />
                        {working ? t("ai.lookingUp") : t("ai.thinking")}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border p-5">
                {inputForm}
                <p className="mt-2.5 text-center text-[11px] text-subtle">{t("ai.disclaimer")}</p>
              </div>
            </>
          )}
        </div>

        {historyOpen && (
          <HistoryPanel
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={setActiveConversationId}
            onNew={onNewChat}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
