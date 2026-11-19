import { useEffect, useRef, useState } from "react";
import { Brain, History, Plus, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AiOrbIcon } from "@/components/ai/AiOrbIcon";
import { renderMessageContent } from "@/components/ai/MessageContent";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  marketingAiPost,
  useMarketingAiQuery,
  useWebinars,
  type AiScope,
} from "@/hooks/use-crm-data";
import type { Metrics } from "@/lib/marketing-ai/metrics";
import { tashkentDay } from "@/components/marketing/ai/shared";

// AI tahlilchi -> Chat: the marketing assistant, in the same window as the
// platform's own AI yordamchi (AiAssistantFab): a header with the orb, the
// same bubbles and suggestions, the input at the bottom. It answers only
// from the company's own figures for the chosen period, campaign, webinar
// and project, says when data is missing, and every answer shows the period
// it used. Past conversations (per person) are under the clock.

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  meta?: { period?: { from: string; to: string } } | null;
};

const SUGGEST = ["ai.chat.s1", "ai.chat.s2", "ai.chat.s3", "ai.chat.s4"];

const periodText = (p: { from: string; to: string }) =>
  `${tashkentDay(p.from)} – ${tashkentDay(new Date(Date.parse(p.to) - 1000).toISOString())}`;

export function AiChatTab({ scope, m }: { scope: AiScope; m: Metrics }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: wd } = useWebinars();
  const [chatId, setChatId] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<string>("");
  const [webinar, setWebinar] = useState<string>("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<Msg[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const list = useMarketingAiQuery<{ chats: { id: string; title: string; updated_at: string }[] }>(
    "chats",
    { action: "chats" },
  );
  const msgs = useMarketingAiQuery<{ messages: Msg[] }>(
    `messages:${chatId}`,
    { action: "messages", chatId },
    !!chatId,
  );
  const shown = chatId ? [...(msgs.data?.messages ?? []), ...local] : local;
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length, busy]);

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setBusy(true);
    setText("");
    setLocal((l) => [...l, { id: `u${Date.now()}`, role: "user", content: message }]);
    try {
      const r = await marketingAiPost<{ chatId: string }>({
        action: "chat",
        chatId,
        message,
        scope: { ...scope, campaign: campaign || null, webinar: webinar || null },
      });
      if (!chatId) setChatId(r.chatId);
      await qc.invalidateQueries({ queryKey: ["marketing_ai_post"] });
      setLocal([]);
    } catch (e) {
      setLocal((l) => [
        ...l,
        {
          id: `e${Date.now()}`,
          role: "assistant",
          content: describeError(e, t("ai.failed")),
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const select =
    "h-8 min-w-0 max-w-[220px] rounded-lg border border-border bg-surface px-2 text-[12.5px] text-foreground outline-none focus:border-primary/50";
  const iconBtn =
    "grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <div className="mx-auto flex h-[calc(100dvh-300px)] min-h-[520px] w-full max-w-[860px] flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-[0_18px_50px_rgba(0,0,0,0.12)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            <AiOrbIcon className="h-4 w-4 text-primary" /> {t("ai.chat.title")}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {t("ai.chat.subtitle", { p: periodText(scope) })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={iconBtn} aria-label={t("ai.chat.history")}>
                <History className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-1.5">
              <p className="px-2 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-subtle">
                {t("ai.chat.history")}
              </p>
              {(list.data?.chats ?? []).length === 0 ? (
                <p className="px-2 py-3 text-[13px] text-muted-foreground">
                  {t("ai.chat.noHistory")}
                </p>
              ) : (
                <ul className="max-h-72 overflow-y-auto">
                  {(list.data?.chats ?? []).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setChatId(c.id);
                          setLocal([]);
                          setHistoryOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-baseline gap-2 rounded-lg px-2 py-2 text-left text-[13px] hover:bg-accent",
                          chatId === c.id && "bg-accent font-semibold",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {c.title || t("ai.chat.untitled")}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {tashkentDay(c.updated_at)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>
          <button
            type="button"
            className={iconBtn}
            aria-label={t("ai.chat.new")}
            title={t("ai.chat.new")}
            onClick={() => {
              setChatId(null);
              setLocal([]);
            }}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-[12px] text-muted-foreground">
        <span>{t("ai.chat.scope")}</span>
        <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={select}>
          <option value="">{t("ai.chat.allCampaigns")}</option>
          {m.campaigns.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={webinar} onChange={(e) => setWebinar(e.target.value)} className={select}>
          <option value="">{t("ai.chat.allWebinars")}</option>
          {(wd?.rows ?? [])
            .filter((w) => !w.archived_at)
            .slice(0, 50)
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
        </select>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {shown.length === 0 && !busy && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("ai.chat.empty")}</p>
            {SUGGEST.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => void send(t(k))}
                className="block w-full rounded-xl border border-border bg-card px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-accent/50"
              >
                {t(k)}
              </button>
            ))}
          </div>
        )}
        {shown.map((x) => (
          <div
            key={x.id}
            className={cn(
              "whitespace-pre-wrap text-sm",
              x.role === "user"
                ? "ml-auto w-fit max-w-[85%] rounded-2xl bg-primary px-3.5 py-2 text-primary-foreground"
                : x.error
                  ? "max-w-[92%] rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-destructive"
                  : "max-w-[92%] rounded-xl border border-border bg-card px-3.5 py-2.5 text-foreground",
            )}
          >
            {x.role === "assistant" && !x.error ? (
              <div className="space-y-1.5">
                {renderMessageContent(x.content, t("ai.chat.open"))}
              </div>
            ) : (
              x.content
            )}
            {x.role === "assistant" && x.meta?.period && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {t("ai.chat.used", { p: periodText(x.meta.period) })}
              </p>
            )}
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <Brain className="h-4 w-4 animate-pulse" /> {t("ai.thinking")}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          placeholder={t("ai.chat.ph")}
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/50"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label={t("ai.chat.send")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
