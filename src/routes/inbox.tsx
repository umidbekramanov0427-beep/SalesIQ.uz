import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Inbox, Instagram, Search, Send } from "lucide-react";
import { Composer, type ComposeMode } from "@/components/lead/AmoComposer";
import { ChatFile, ClientAvatar, chatFileLabel } from "@/components/lead/ChatParts";
import { ChatSearchBar, Highlight, useChatSearch } from "@/components/chat/ChatSearch";
import { PageLoader } from "@/components/layout/Primitives";
import {
  useInboxConversations,
  useLeadById,
  useLeadTelegramMessages,
  usePipelineStagesRaw,
  type InboxConversation,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { useCrmEnabled } from "@/lib/use-org-access";
import { cn } from "@/lib/utils";

// Inbox: every client chat (Telegram and Instagram) in one place, newest
// first, those waiting for an answer marked. The open chat shows the
// photos, videos, round videos and voice notes as themselves, searches
// inside itself, and answers with the same composer as the lead card.
// Only for companies that use the CRM.

type Filter = "all" | "waiting" | "telegram" | "instagram";
const FILTERS: Filter[] = ["all", "waiting", "telegram", "instagram"];

export const Route = createFileRoute("/inbox")({
  validateSearch: (s: Record<string, unknown>): { lead?: string | undefined } => ({
    lead: typeof s["lead"] === "string" ? s["lead"] : undefined,
  }),
  head: () => ({ meta: [{ title: "Inbox — SalesIQ" }] }),
  component: InboxPage,
});

const pad = (n: number) => String(n).padStart(2, "0");

/** "14:05" today, "Kecha" yesterday, else "05.11". */
function shortTime(iso: string, t: (k: string) => string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff === 1) return t("chats.yesterday");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

function InboxPage() {
  const { t } = useI18n();
  const crmEnabled = useCrmEnabled();
  const { lead: openId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: chats = [], isLoading } = useInboxConversations();
  const { data: stages = [] } = usePipelineStagesRaw();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const stageName = useMemo(() => new Map(stages.map((s) => [s.id, s.name])), [stages]);
  const waiting = chats.filter((c) => c.last?.direction === "in").length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats.filter((c) => {
      if (filter === "waiting" && c.last?.direction !== "in") return false;
      if ((filter === "telegram" || filter === "instagram") && c.channel !== filter) return false;
      if (q && !`${c.name} ${c.handle ?? ""} ${c.last?.text ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [chats, filter, query]);
  const open = chats.find((c) => c.leadId === openId) ?? null;

  if (!crmEnabled) return null;
  if (isLoading) return <PageLoader />;

  const pick = (id: string | undefined) =>
    void navigate({ to: "/inbox", search: id ? { lead: id } : {}, replace: true });

  return (
    // Full-bleed under the top bar, like the lead card.
    <div className="-mx-4 -mb-20 -mt-4 flex h-[calc(100%+2rem)] md:-mx-6 md:-mb-[104px] md:h-[calc(100%+2.5rem)] phone:-mx-3 phone:-mb-4 phone:-mt-3 phone:h-[calc(100%+0.75rem)]">
      {/* Conversations */}
      <aside
        className={cn(
          "flex w-[360px] shrink-0 flex-col border-r border-border bg-card phone:w-full phone:border-r-0",
          open && "phone:hidden",
        )}
      >
        <div className="px-4 pb-3 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400">
              <Inbox className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[17px] font-bold leading-tight text-foreground">
                {t("chats.title")}
              </h1>
              <p className="text-[12px] text-muted-foreground">
                {t("chats.summary", { n: chats.length, w: waiting })}
              </p>
            </div>
          </div>
          <label className="mt-3 flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-primary">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("chats.search")}
              className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-subtle"
            />
          </label>
          <div className="mt-2.5 flex gap-1.5 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`chats.filter.${f}`)}
                {f === "waiting" && waiting > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      filter === f ? "bg-primary-foreground/20" : "bg-destructive text-white",
                    )}
                  >
                    {waiting}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto border-t border-border">
          {shown.length === 0 ? (
            <li className="px-6 py-16 text-center text-[13px] text-muted-foreground">
              {chats.length === 0 ? t("chats.empty") : t("chats.noneFound")}
            </li>
          ) : (
            shown.map((c) => (
              <ConversationRow
                key={c.leadId}
                chat={c}
                active={c.leadId === openId}
                stage={c.stageId ? (stageName.get(c.stageId) ?? "") : ""}
                onOpen={() => pick(c.leadId)}
              />
            ))
          )}
        </ul>
      </aside>

      {/* The open chat */}
      <section className={cn("flex min-w-0 flex-1 flex-col bg-surface", !open && "phone:hidden")}>
        {open ? (
          <ChatPane
            key={open.leadId}
            chat={open}
            stage={open.stageId ? (stageName.get(open.stageId) ?? "") : ""}
            onBack={() => pick(undefined)}
          />
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Inbox className="h-7 w-7" />
              </span>
              <p className="mt-3 text-[15px] font-semibold text-foreground">{t("chats.pick")}</p>
              <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
                {t("chats.pickHint")}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  return channel === "instagram" ? (
    <Instagram className={cn("text-pink-500", className)} />
  ) : (
    <Send className={cn("text-sky-500", className)} />
  );
}

function ConversationRow({
  chat,
  active,
  stage,
  onOpen,
}: {
  chat: InboxConversation;
  active: boolean;
  stage: string;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const last = chat.last;
  const waiting = last?.direction === "in";
  const preview = last
    ? last.fileKind
      ? chatFileLabel(last.fileKind, last.fileName, t)
      : last.text
    : t("chats.noMessages");
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors",
          active ? "bg-primary/[0.08]" : "hover:bg-accent/50",
        )}
      >
        <span className="relative shrink-0">
          <ClientAvatar
            leadId={chat.leadId}
            name={chat.name}
            hasPhoto={chat.hasPhoto}
            className="h-11 w-11 text-[15px]"
          />
          <span className="absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-card ring-2 ring-card">
            <ChannelIcon channel={chat.channel} className="h-3 w-3" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">
              {chat.name}
            </span>
            {last && (
              <span
                className={cn(
                  "shrink-0 text-[11.5px] tabular-nums",
                  waiting ? "font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                {shortTime(last.at, t)}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[12.5px]",
                waiting ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {last && last.direction === "out" && `${t("chats.you")}: `}
              {preview}
            </span>
            {waiting && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-subtle">
            {chat.funnel}
            {stage && ` · ${stage}`}
          </span>
        </span>
      </button>
    </li>
  );
}

function ChatPane({
  chat,
  stage,
  onBack,
}: {
  chat: InboxConversation;
  stage: string;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const { lead } = useLeadById(chat.leadId);
  const { data: rows = [] } = useLeadTelegramMessages(chat.leadId);
  const [mode, setMode] = useState<ComposeMode>("chat");
  const search = useChatSearch(rows);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // New messages scroll into view while not searching.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && !search.open) el.scrollTop = el.scrollHeight;
  }, [rows.length, search.open]);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("common.back")}
          className="hidden h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent phone:grid"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <ClientAvatar
          leadId={chat.leadId}
          name={chat.name}
          hasPhoto={chat.hasPhoto}
          className="h-10 w-10 text-[14px]"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold text-foreground">{chat.name}</p>
          <p className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
            <ChannelIcon channel={chat.channel} className="h-3 w-3 shrink-0" />
            {chat.handle && <span className="truncate">{chat.handle}</span>}
            <span className="truncate text-subtle">
              · {chat.funnel}
              {stage && ` · ${stage}`}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={search.toggle}
          aria-pressed={search.open}
          title={t("chatSearch.open")}
          aria-label={t("chatSearch.open")}
          className={cn(
            "grid h-9 w-9 place-items-center rounded-lg transition-colors",
            search.open
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Search className="h-4 w-4" />
        </button>
        <Link
          to="/crm/leads/$leadId"
          params={{ leadId: chat.leadId }}
          search={{ from: "funnels" }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary phone:px-2.5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="phone:hidden">{t("chats.openLead")}</span>
        </Link>
      </header>
      <ChatSearchBar search={search} />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 phone:px-3">
        <div className="mx-auto max-w-3xl space-y-1.5">
          {rows.map((m, i) => {
            const prev = rows[i - 1];
            const day = new Date(m.created_at).toDateString();
            const newDay = !prev || new Date(prev.created_at).toDateString() !== day;
            const out = m.direction === "out";
            const kind = m.file_id ? (m.file_kind ?? "document") : null;
            const bare = (kind === "video_note" || kind === "sticker") && !m.text;
            const at = new Date(m.created_at);
            return (
              <div key={m.id}>
                {newDay && (
                  <p className="my-3 text-center">
                    <span className="rounded-full bg-card px-3 py-1 text-[11.5px] font-medium text-muted-foreground shadow-soft">
                      {at.toLocaleDateString("ru-RU")}
                    </span>
                  </p>
                )}
                <div
                  data-chat-msg={m.id}
                  className={cn("flex", out ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "relative max-w-[78%]",
                      !bare &&
                        (out
                          ? "rounded-2xl rounded-br-md bg-primary px-3 py-2 text-primary-foreground"
                          : "rounded-2xl rounded-bl-md border border-border bg-card px-3 py-2 text-foreground"),
                    )}
                  >
                    {kind && (
                      <div className={cn(m.text && "mb-1.5")}>
                        <ChatFile messageId={m.id} kind={kind} name={m.file_name} />
                      </div>
                    )}
                    {m.text && (
                      <p className="whitespace-pre-wrap break-words text-[14px] leading-snug">
                        <Highlight
                          text={m.text}
                          query={search.query}
                          current={search.current === m.id}
                        />
                      </p>
                    )}
                    <p
                      className={cn(
                        "mt-0.5 text-right text-[10.5px] tabular-nums",
                        bare
                          ? "text-muted-foreground"
                          : out
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground",
                      )}
                    >
                      {pad(at.getHours())}:{pad(at.getMinutes())}
                      {m.reaction && ` · ${m.reaction}`}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="py-16 text-center text-[13px] text-muted-foreground">
              {t("chats.noMessages")}
            </p>
          )}
        </div>
      </div>

      {lead && (
        <div className="amo-skin border-t border-border bg-card">
          <Composer
            lead={lead}
            mode={mode}
            setMode={setMode}
            channel={chat.channel}
            focusKey={0}
            onOpenTelegramLink={() =>
              void navigate({
                to: "/crm/leads/$leadId",
                params: { leadId: chat.leadId },
                search: { from: "funnels" },
              })
            }
          />
        </div>
      )}
    </>
  );
}
