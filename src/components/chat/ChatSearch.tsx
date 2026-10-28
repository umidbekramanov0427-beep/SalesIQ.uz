import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { chatMatches, splitMatches } from "@/lib/chat-search";
import { useI18n } from "@/lib/i18n";

// Search inside an open chat, as in Telegram: the words are marked yellow
// in every message, "2/4" counts the hits and ↑ ↓ (or Enter / Shift+Enter)
// walk between them, newest first. Each message element carries
// data-chat-msg={id} so the current hit can be scrolled into view.

export function useChatSearch(messages: { id: string; text: string | null }[]) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const hits = useMemo(() => (open ? chatMatches(messages, query) : []), [messages, query, open]);
  // Index into hits; starts at the newest one.
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(Math.max(0, hits.length - 1)), [hits.length, query]);
  const current = hits[index] ?? null;

  useEffect(() => {
    if (!current) return;
    document
      .querySelector(`[data-chat-msg="${CSS.escape(current)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current]);

  return {
    open,
    query: open ? query : "",
    hits,
    index,
    current,
    toggle: () => {
      setOpen((v) => !v);
      setQuery("");
    },
    setQuery,
    prev: () => setIndex((i) => (hits.length ? (i - 1 + hits.length) % hits.length : 0)),
    next: () => setIndex((i) => (hits.length ? (i + 1) % hits.length : 0)),
    close: () => {
      setOpen(false);
      setQuery("");
    },
  };
}

export type ChatSearchState = ReturnType<typeof useChatSearch>;

export function ChatSearchBar({ search }: { search: ChatSearchState }) {
  const { t } = useI18n();
  if (!search.open) return null;
  const { hits, index } = search;
  return (
    <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        autoFocus
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) search.next();
            else search.prev();
          }
          if (e.key === "Escape") search.close();
        }}
        placeholder={t("chatSearch.placeholder")}
        className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-subtle"
      />
      {search.query.trim() && (
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">
          {hits.length ? `${hits.length - index}/${hits.length}` : t("chatSearch.none")}
        </span>
      )}
      <button
        type="button"
        onClick={search.prev}
        disabled={hits.length < 2}
        aria-label={t("chatSearch.older")}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={search.next}
        disabled={hits.length < 2}
        aria-label={t("chatSearch.newer")}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={search.close}
        aria-label={t("common.close")}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** A message's text with the searched words marked; the current hit brighter. */
export function Highlight({
  text,
  query,
  current = false,
}: {
  text: string;
  query: string;
  current?: boolean;
}) {
  if (!query.trim()) return <>{text}</>;
  return (
    <>
      {splitMatches(text, query).map((p, i) =>
        p.hit ? (
          <mark
            key={i}
            className={
              current
                ? "rounded-sm bg-amber-400 px-0.5 text-black"
                : "rounded-sm bg-yellow-200/90 px-0.5 text-black"
            }
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
