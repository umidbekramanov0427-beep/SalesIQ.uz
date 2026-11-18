import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquarePlus, SendHorizontal, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { renderMessageContent } from "@/components/ai/MessageContent";
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

// AI tahlilchi -> Chat: the marketing assistant. It answers only from the
// company's own figures for the chosen period, campaign, webinar and
// project (product), says when the data is missing, and every answer shows
// the period it used. Conversations are kept per person.

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: { period?: { from: string; to: string } } | null;
};

const SUGGEST = ["ai.chat.s1", "ai.chat.s2", "ai.chat.s3", "ai.chat.s4"];

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
  const [err, setErr] = useState<string | null>(null);
  const list = useMarketingAiQuery<{ chats: { id: string; title: string; updated_at: string }[] }>(
    "chats",
    {
      action: "chats",
    },
  );
  const msgs = useMarketingAiQuery<{ messages: Msg[] }>(
    `messages:${chatId}`,
    { action: "messages", chatId },
    !!chatId,
  );
  const shown = chatId ? [...(msgs.data?.messages ?? []), ...local] : local;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [shown.length, busy]);

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setBusy(true);
    setErr(null);
    setText("");
    setLocal((l) => [...l, { id: `u${Date.now()}`, role: "user", content: message }]);
    try {
      const r = await marketingAiPost<{
        chatId: string;
        reply: string;
        period: { from: string; to: string };
      }>({
        action: "chat",
        chatId,
        message,
        scope: { ...scope, campaign: campaign || null, webinar: webinar || null },
      });
      if (!chatId) setChatId(r.chatId);
      await qc.invalidateQueries({ queryKey: ["marketing_ai_post"] });
      setLocal([]);
    } catch (e) {
      setErr(describeError(e, t("ai.failed")));
    } finally {
      setBusy(false);
    }
  }

  const select = "h-9 rounded-lg border border-border bg-card px-2.5 text-[13px]";
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setChatId(null);
            setLocal([]);
          }}
        >
          <MessageSquarePlus className="h-4 w-4" /> {t("ai.chat.new")}
        </Button>
        <ul className="space-y-1">
          {(list.data?.chats ?? []).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setChatId(c.id);
                  setLocal([]);
                }}
                className={cn(
                  "w-full truncate rounded-lg px-3 py-2 text-left text-[13px]",
                  chatId === c.id
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-foreground hover:bg-accent",
                )}
              >
                {c.title || t("ai.chat.untitled")}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="flex min-h-[560px] flex-col rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 text-[12.5px] text-muted-foreground">
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
          <span className="ml-auto">
            {t("ai.basis", {
              from: tashkentDay(scope.from),
              to: tashkentDay(new Date(Date.parse(scope.to) - 1000).toISOString()),
            })}
          </span>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {shown.length === 0 && !busy && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/12 text-violet-600 dark:text-violet-300">
                <Sparkles className="h-6 w-6" />
              </span>
              <p className="max-w-[440px] text-[13px] text-muted-foreground">
                {t("ai.chat.empty")}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGEST.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => void send(t(k))}
                    className="ctl-soft rounded-full px-3 py-1.5 text-[12.5px] font-medium text-foreground"
                  >
                    {t(k)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {shown.map((x) => (
            <div
              key={x.id}
              className={cn("flex", x.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px]",
                  x.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-foreground",
                )}
              >
                {x.role === "assistant" ? (
                  <div className="space-y-1.5">
                    {renderMessageContent(x.content, t("ai.chat.open"))}
                  </div>
                ) : (
                  x.content
                )}
                {x.role === "assistant" && x.meta?.period && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {t("ai.basis", {
                      from: tashkentDay(x.meta.period.from),
                      to: tashkentDay(new Date(Date.parse(x.meta.period.to) - 1000).toISOString()),
                    })}
                  </p>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("ai.thinking")}
            </p>
          )}
          {err && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[13px] text-rose-700 dark:text-rose-300">
              {err}
            </p>
          )}
          <div ref={end} />
        </div>
        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder={t("ai.chat.ph")}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-input px-3 py-2 text-[14px] outline-none focus:border-primary"
          />
          <Button type="submit" disabled={!text.trim() || busy} aria-label={t("ai.chat.send")}>
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </form>
      </section>
    </div>
  );
}
