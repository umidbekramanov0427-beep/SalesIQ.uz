import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import { CheckCheck, Loader2, RefreshCw, Search, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { ResizeHandle, useResizableWidth } from "@/components/ui/resize-handle";
import {
  useLoadGroupHistory,
  useProfilesRaw,
  useSendWorkGroupMessage,
  useWorkGroupMessages,
  useWorkGroups,
  type WorkGroup,
  type WorkGroupMessage,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Inbox → «Guruhlar»: the Telegram groups salespeople picked from their work
// accounts (Sozlamalar → «Telegram akkauntim» → Ish guruhlari). The owner of
// the account writes to the group from here; admins and heads of sales read
// every group of the company.

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export function WorkGroupsInbox({
  header,
  openId,
  onOpen,
}: {
  /** The list's head (title, the Mijozlar / Guruhlar switch). */
  header: ReactNode;
  openId: string | undefined;
  onOpen: (id: string | undefined) => void;
}) {
  const { t } = useI18n();
  const { data: groups = [], isLoading } = useWorkGroups();
  const { data: profiles = [] } = useProfilesRaw();
  const [q, setQ] = useState("");
  const listSize = useResizableWidth("inbox-list", 360, 280, 560);
  const nameOf = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p.full_name || p.email || ""]));
    return (id: string) => m.get(id) ?? "";
  }, [profiles]);
  const shown = groups.filter((g) => g.title.toLowerCase().includes(q.trim().toLowerCase()));
  const open = groups.find((g) => g.id === openId) ?? null;

  return (
    <div className="-mx-4 -mb-20 -mt-4 flex h-[calc(100%+2rem)] md:-mx-6 md:-mb-[104px] md:h-[calc(100%+2.5rem)] phone:-mx-3 phone:-mb-4 phone:-mt-3 phone:h-[calc(100%+0.75rem)]">
      <aside
        className={cn(
          "flex w-[var(--inbox-list-w,360px)] shrink-0 flex-col border-r border-border bg-card phone:w-full phone:border-r-0",
          open && "phone:hidden",
        )}
        style={{ "--inbox-list-w": `${listSize.width}px` } as CSSProperties}
      >
        <div className="border-b border-border px-4 pb-3 pt-4">
          {header}
          <label className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-2.5 focus-within:border-primary">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("tgg.searchGroups")}
              className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-subtle"
            />
          </label>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {isLoading ? (
            <li className="grid place-items-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </li>
          ) : shown.length === 0 ? (
            <li className="px-6 py-16 text-center text-[13px] text-muted-foreground">
              {t("tgg.empty")}
              <Link
                to="/settings"
                search={{ section: "tgAccount" } as never}
                className="mt-2 block font-semibold text-primary hover:underline"
              >
                {t("tgu.title")}
              </Link>
            </li>
          ) : (
            shown.map((g) => (
              <GroupRow
                key={g.id}
                group={g}
                owner={nameOf(g.profile_id)}
                active={g.id === openId}
                onOpen={() => onOpen(g.id)}
              />
            ))
          )}
        </ul>
      </aside>

      <ResizeHandle label={t("amo.resize")} {...listSize.handle} />

      <section className={cn("min-w-0 flex-1 bg-background", !open && "phone:hidden")}>
        {open ? (
          <GroupChat
            key={open.id}
            group={open}
            owner={nameOf(open.profile_id)}
            ownerName={nameOf}
            onBack={() => onOpen(undefined)}
          />
        ) : (
          <div className="grid h-full place-items-center p-8 text-center">
            <div>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Users className="h-7 w-7" />
              </span>
              <p className="mt-3 text-[15px] font-semibold text-foreground">{t("tgg.pickHint")}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function GroupRow({
  group,
  owner,
  active,
  onOpen,
}: {
  group: WorkGroup;
  owner: string;
  active: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
          active ? "bg-primary/[0.07]" : "hover:bg-accent/50",
        )}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-500/15 text-[14px] font-bold text-sky-700 dark:text-sky-300">
          {(group.title || "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">
              {group.title || "—"}
            </span>
            {group.last_message_at && (
              <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                {hm(group.last_message_at)}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
            {group.last_text || t("tgg.noMessages")}
          </span>
          {owner && (
            <span className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-sky-700 dark:text-sky-300">
              <Send className="h-3 w-3" />
              {t("tgg.via", { name: owner })}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

// Telegram's own colours for people in a group (by their id), so the same
// person keeps the same colour as in Telegram.
const PEER_COLORS = ["#e17076", "#7bc862", "#e5ca77", "#65aadd", "#a695e7", "#ee7aae", "#6ec9cb"];
const peerColor = (id: number | null, name: string) => {
  const n = id ?? [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return PEER_COLORS[Math.abs(n) % PEER_COLORS.length]!;
};
const initials = (name: string) =>
  name
    .replace(/^@/, "")
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

function GroupChat({
  group,
  owner,
  ownerName,
  onBack,
}: {
  group: WorkGroup;
  owner: string;
  ownerName: (id: string) => string;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [limit, setLimit] = useState(300);
  const { data: messages = [], isLoading } = useWorkGroupMessages(group.id, limit);
  const send = useSendWorkGroupMessage();
  const history = useLoadGroupHistory();
  const [text, setText] = useState("");
  const [more, setMore] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const keepFromBottom = useRef<number | null>(null);
  const mine = user?.id === group.profile_id;

  // On open: the group's latest messages from Telegram itself, so the chat
  // reads as it does there -- not only what came after it was picked.
  const loadRef = useRef(history.mutate);
  loadRef.current = history.mutate;
  useEffect(() => {
    loadRef.current(
      { groupId: group.id },
      { onSuccess: (r) => setMore(r.more), onError: (e) => toast.error(e.message) },
    );
  }, [group.id]);

  function loadOlder() {
    if (history.isPending || !more) return;
    const el = scrollRef.current;
    keepFromBottom.current = el ? el.scrollHeight - el.scrollTop : null;
    history.mutate(
      { groupId: group.id, older: true },
      {
        onSuccess: (r) => {
          setMore(r.more && r.added > 0);
          setLimit((n) => n + r.added);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  // New messages at the bottom keep the view at the bottom; older ones added
  // at the top keep the reader where they were.
  const lastId = messages[messages.length - 1]?.id;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (keepFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - keepFromBottom.current;
      keepFromBottom.current = null;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [lastId, messages.length]);

  function submit() {
    const v = text.trim();
    if (!v || send.isPending) return;
    send.mutate(
      { groupId: group.id, text: v },
      { onSuccess: () => setText(""), onError: (e) => toast.error(e.message) },
    );
  }

  const authorOf = (m: WorkGroupMessage) =>
    m.is_out
      ? m.sent_by
        ? m.sent_by === user?.id
          ? t("tgg.you")
          : ownerName(m.sent_by)
        : owner
      : m.sender_name || "—";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-card px-5 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="hidden text-[13px] font-semibold text-primary phone:block"
        >
          ←
        </button>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-sky-600 text-[15px] font-bold text-white">
          {initials(group.title || "?")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{group.title || "—"}</p>
          <p className="truncate text-[12.5px] text-muted-foreground">
            {owner ? t("tgg.via", { name: owner }) : ""}
            {history.isPending && ` · ${t("tgg.syncing")}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            history.mutate({ groupId: group.id }, { onError: (e) => toast.error(e.message) })
          }
          disabled={history.isPending}
          title={t("tgg.refresh")}
          aria-label={t("tgg.refresh")}
          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", history.isPending && "animate-spin")} />
        </button>
      </header>

      {/* The chat's screen, Telegram-like: its wallpaper, people's colours
          and avatars, bubbles with the time inside, day pills. */}
      <div
        ref={scrollRef}
        onScroll={(e) => e.currentTarget.scrollTop < 60 && loadOlder()}
        className="tg-wallpaper min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-8"
      >
        {more && messages.length > 0 && (
          <div className="mb-2 flex justify-center">
            <button
              type="button"
              onClick={loadOlder}
              disabled={history.isPending}
              className="rounded-full bg-black/25 px-3 py-1 text-[12px] font-medium text-white backdrop-blur-sm hover:bg-black/35 disabled:opacity-70"
            >
              {history.isPending ? t("tgg.loading") : t("tgg.older")}
            </button>
          </div>
        )}
        {isLoading || (history.isPending && messages.length === 0) ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-white/80" />
          </div>
        ) : messages.length === 0 ? (
          <p className="mx-auto mt-16 w-fit rounded-full bg-black/25 px-3 py-1 text-center text-[12.5px] text-white">
            {t("tgg.noMessages")}
          </p>
        ) : (
          messages.map((m, k) => {
            const prev = messages[k - 1];
            const next = messages[k + 1];
            const day = dayLabel(m.created_at);
            const showDay = !prev || dayLabel(prev.created_at) !== day;
            const same = (a?: WorkGroupMessage) =>
              !!a &&
              a.is_out === m.is_out &&
              (a.sender_tg_id ?? a.sender_name) === (m.sender_tg_id ?? m.sender_name) &&
              Math.abs(Date.parse(a.created_at) - Date.parse(m.created_at)) < 5 * 60_000 &&
              dayLabel(a.created_at) === day;
            const first = showDay || !same(prev);
            const last = !same(next) || (!!next && dayLabel(next.created_at) !== day);
            const author = authorOf(m);
            const color = peerColor(m.sender_tg_id, author);
            return (
              <div key={m.id}>
                {showDay && (
                  <p className="my-3 flex justify-center">
                    <span className="rounded-full bg-black/25 px-3 py-0.5 text-[12px] font-medium text-white backdrop-blur-sm">
                      {day}
                    </span>
                  </p>
                )}
                <div
                  className={cn(
                    "flex items-end gap-2",
                    m.is_out ? "justify-end" : "justify-start",
                    last ? "mb-2" : "mb-0.5",
                  )}
                >
                  {!m.is_out && (
                    <span className="w-8 shrink-0">
                      {last && (
                        <span
                          className="grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold text-white"
                          style={{ background: color }}
                          title={author}
                        >
                          {initials(author)}
                        </span>
                      )}
                    </span>
                  )}
                  <div
                    className={cn(
                      "relative max-w-[min(72%,520px)] rounded-[14px] px-3 pb-1.5 pt-1.5 text-[14px] leading-snug shadow-[0_1px_1px_rgb(0_0_0/0.13)]",
                      m.is_out
                        ? "bg-[#effdde] text-[#0f1419] dark:bg-[#2b5278] dark:text-white"
                        : "bg-white text-[#0f1419] dark:bg-[#182533] dark:text-white",
                      last && (m.is_out ? "rounded-br-[4px]" : "rounded-bl-[4px]"),
                    )}
                  >
                    {first && !m.is_out && (
                      <p className="mb-0.5 text-[13px] font-semibold" style={{ color }}>
                        {author}
                      </p>
                    )}
                    {first && m.is_out && m.sent_by && m.sent_by !== user?.id && (
                      <p className="mb-0.5 text-[13px] font-semibold text-[#4fae4e] dark:text-[#8ec6ff]">
                        {author}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">
                      {m.text}
                      {/* room for the time on the last line */}
                      <span className="inline-block w-14" />
                    </p>
                    <span
                      className={cn(
                        "absolute bottom-1 right-2 flex items-center gap-0.5 text-[11px] tabular-nums",
                        m.is_out
                          ? "text-[#5dbb5d] dark:text-[#7da8d3]"
                          : "text-[#a0acb6] dark:text-[#6d7f8f]",
                      )}
                    >
                      {hm(m.created_at)}
                      {m.is_out && <CheckCheck className="h-3.5 w-3.5" />}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <footer className="border-t border-border bg-card py-2.5 pl-4 pr-[84px] phone:pr-4">
        {mine ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={t("tgg.placeholder")}
              className="max-h-40 min-h-10 min-w-0 flex-1 resize-none rounded-[20px] border border-border bg-background px-4 py-2.5 text-[14px] outline-none focus:border-primary phone:text-base"
            />
            <button
              type="submit"
              disabled={!text.trim() || send.isPending}
              aria-label={t("tgg.send")}
              title={t("tgg.send")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#3390ec] text-white transition-colors hover:bg-[#2a7fd4] disabled:opacity-50"
            >
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
        ) : (
          <p className="text-center text-[12.5px] text-muted-foreground">
            {t("tgg.ownerOnly", { name: owner || "—" })}
          </p>
        )}
      </footer>
    </div>
  );
}
