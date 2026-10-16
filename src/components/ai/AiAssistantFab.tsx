import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Brain, Headset, Maximize2, Send, X } from "lucide-react";
import { renderMessageContent } from "@/components/ai/MessageContent";
import { AiOrbIcon } from "@/components/ai/AiOrbIcon";
import { SupportChat } from "@/components/ai/SupportChat";
import {
  useAiAssistantChat,
  useMySupportMessages,
  usePermission,
  useSupportRealtime,
  useSupportUnread,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; error?: boolean };

// The AI assistant on every page: a button (bottom right until the user
// drags it elsewhere) that opens a small chat. It sends the page you're on, so "how do I…" is answered from
// that page's guide. The full chat with history stays at /ai-assistant.
// Its "Operator" tab is live support with the SalesIQ team (SupportChat);
// people without the AI permission get only that tab. A red dot on the
// button means the team answered; "Yordam" in the user menu opens the tab.

/** Window event that opens the assistant on its Operator tab. */
export const OPEN_SUPPORT_EVENT = "salesiq:open-support";

type Tab = "ai" | "operator";
export function AiAssistantFab() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const allowed = usePermission("Use AI assistant");
  const chat = useAiAssistantChat();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("ai");
  const activeTab: Tab = allowed ? tab : "operator";
  const support = useMySupportMessages(open && activeTab === "operator");
  const { unread, markSeen } = useSupportUnread(support.data);
  useSupportRealtime();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  // The answer while it streams in, and whether the assistant is looking
  // something up with its tools meanwhile.
  const [draft, setDraft] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Where the user parked the button: its distance from the right and
  // bottom edges. It never moves on its own; dragging it (mouse or finger)
  // moves it, and the spot is remembered on this device.
  const [spot, setSpot] = useState<FabSpot>(() => loadSpot());
  const drag = useRef<{ x: number; y: number; start: FabSpot; moved: boolean } | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, start: spot, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // A few pixels of jitter is still a click, not a drag.
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    setSpot(clampSpot({ right: d.start.right - dx, bottom: d.start.bottom - dy }));
  }
  function onPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (d?.moved) saveSpot(spot);
    else setOpen((o) => !o);
  }

  // Keep it on screen when the window shrinks.
  useEffect(() => {
    const onResize = () => setSpot((s) => clampSpot(s));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, chat.isPending, draft]);

  useEffect(() => {
    const openSupport = () => {
      setTab("operator");
      setOpen(true);
    };
    window.addEventListener(OPEN_SUPPORT_EVENT, openSupport);
    // A support answer's notification opens "?support=1": show the chat
    // and drop the flag so a reload doesn't reopen it.
    const url = new URL(window.location.href);
    if (url.searchParams.get("support") === "1") {
      openSupport();
      url.searchParams.delete("support");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    return () => window.removeEventListener(OPEN_SUPPORT_EVENT, openSupport);
  }, []);

  // The full-page assistant has its own chat; only live support opens here.
  if (pathname.startsWith("/ai-assistant") && !(open && activeTab === "operator")) return null;
  // On a phone the lead card's composer sits where the button would; the
  // assistant stays one tap away in Menyu.
  if (pathname.startsWith("/crm/leads/") && onPhone() && !open) return null;

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
  // The chat opens on whichever side of the button has more room, and is
  // never taller than that room.
  const roomAbove = typeof window !== "undefined" ? topOf(spot) - EDGE - 12 : 560;
  const roomBelow =
    typeof window !== "undefined" ? window.innerHeight - topOf(spot) - FAB_SIZE - EDGE - 12 : 0;
  const panelBelow = open && roomBelow > roomAbove;
  const panelHeight = Math.max(260, Math.min(560, panelBelow ? roomBelow : roomAbove));
  // Parked near the left edge, the chat opens to the button's right.
  const panelRight =
    open && typeof window !== "undefined" && spot.right + PANEL_WIDTH > window.innerWidth - EDGE;

  return (
    <div
      className={cn(
        "fixed z-40 flex gap-3",
        panelBelow ? "flex-col-reverse" : "flex-col",
        panelRight ? "items-start" : "items-end",
      )}
      style={{
        right: panelRight ? undefined : spot.right,
        left: panelRight ? window.innerWidth - spot.right - FAB_SIZE : undefined,
        bottom: panelBelow ? undefined : spot.bottom,
        top: panelBelow ? topOf(spot) : undefined,
      }}
    >
      {open && (
        <div
          style={{ height: panelHeight }}
          className="flex w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-[0_18px_50px_rgba(0,0,0,0.22)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0">
              {activeTab === "ai" ? (
                <>
                  <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    <AiOrbIcon className="h-4 w-4 text-primary" /> {t("fab.title")}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{t("fab.subtitle")}</p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    <Headset className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />{" "}
                    {t("support.title")}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{t("support.subtitle")}</p>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              {activeTab === "ai" && (
                <Link
                  to="/ai-assistant"
                  aria-label={t("fab.fullscreen")}
                  title={t("fab.fullscreen")}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Maximize2 className="h-4 w-4" />
                </Link>
              )}
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

          {allowed && (
            <div role="tablist" className="flex gap-1 border-b border-border px-3 py-2">
              {(["ai", "operator"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors",
                    activeTab === id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  {id === "ai" ? (
                    <AiOrbIcon className="h-3.5 w-3.5" />
                  ) : (
                    <Headset className="h-3.5 w-3.5" />
                  )}
                  {id === "ai" ? t("support.tabAi") : t("support.tabOperator")}
                  {id === "operator" && unread && activeTab !== "operator" && (
                    <span
                      className="h-2 w-2 rounded-full bg-rose-500"
                      aria-label={t("support.newAnswer")}
                    />
                  )}
                </button>
              ))}
            </div>
          )}

          {activeTab === "operator" ? (
            <SupportChat page={pathname} onSeen={markSeen} />
          ) : (
            <>
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

              <form
                onSubmit={onSubmit}
                className="flex items-center gap-2 border-t border-border p-3"
              >
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
            </>
          )}
        </div>
      )}

      <button
        type="button"
        data-tour="ai"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        aria-label={open ? t("common.close") : t("fab.title")}
        title={open ? undefined : t("fab.dragHint")}
        aria-expanded={open}
        className="relative grid h-12 w-12 touch-none cursor-grab select-none place-items-center rounded-full bg-primary text-primary-foreground shadow-elevated transition-transform duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : allowed ? (
          <AiOrbIcon className="h-7 w-7" />
        ) : (
          <Headset className="h-6 w-6" />
        )}
        {unread && !(open && activeTab === "operator") && (
          <span
            aria-label={t("support.newAnswer")}
            className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-rose-500"
          />
        )}
      </button>
    </div>
  );
}

type FabSpot = { right: number; bottom: number };
const FAB_SIZE = 48;
const PANEL_WIDTH = 380;
const EDGE = 12;
const SPOT_KEY = "salesiq.aiFab.spot";

// On a phone the button stays above the bottom tab bar (MobileNav).
const PHONE_TAB_BAR = 84;
const onPhone = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("phone");

function clampSpot(s: FabSpot): FabSpot {
  if (typeof window === "undefined") return s;
  const minBottom = onPhone() ? PHONE_TAB_BAR : EDGE;
  const maxRight = window.innerWidth - FAB_SIZE - EDGE;
  const maxBottom = window.innerHeight - FAB_SIZE - EDGE;
  return {
    right: Math.round(Math.min(Math.max(s.right, EDGE), maxRight)),
    bottom: Math.round(Math.min(Math.max(s.bottom, minBottom), maxBottom)),
  };
}

function loadSpot(): FabSpot {
  const fallback = onPhone() ? { right: 14, bottom: PHONE_TAB_BAR + 8 } : { right: 20, bottom: 20 };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = JSON.parse(window.localStorage.getItem(SPOT_KEY) ?? "null") as FabSpot | null;
    return raw && Number.isFinite(raw.right) && Number.isFinite(raw.bottom)
      ? clampSpot(raw)
      : fallback;
  } catch {
    return fallback;
  }
}

function saveSpot(s: FabSpot) {
  try {
    window.localStorage.setItem(SPOT_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: the spot just isn't remembered.
  }
}

/** The button's top edge, in px from the top of the window. */
function topOf(s: FabSpot): number {
  return window.innerHeight - s.bottom - FAB_SIZE;
}
