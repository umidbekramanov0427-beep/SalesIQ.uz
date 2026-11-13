import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Search, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { ResizeHandle, useResizableWidth } from "@/components/ui/resize-handle";
import {
  useProfilesRaw,
  useSendWorkGroupMessage,
  useWorkGroupMessages,
  useWorkGroups,
  type WorkGroup,
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
  const { data: messages = [], isLoading } = useWorkGroupMessages(group.id);
  const send = useSendWorkGroupMessage();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const mine = user?.id === group.profile_id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function submit() {
    const v = text.trim();
    if (!v || send.isPending) return;
    send.mutate(
      { groupId: group.id, text: v },
      { onSuccess: () => setText(""), onError: (e) => toast.error(e.message) },
    );
  }

  let lastDay = "";
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-card px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="hidden text-[13px] font-semibold text-primary phone:block"
        >
          ←
        </button>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-500 text-white">
          <Users className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{group.title || "—"}</p>
          {owner && (
            <p className="truncate text-[12.5px] text-muted-foreground">
              {t("tgg.via", { name: owner })}
            </p>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-muted-foreground">
            {t("tgg.noMessages")}
          </p>
        ) : (
          messages.map((m) => {
            const day = dayLabel(m.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            const author = m.is_out
              ? m.sent_by
                ? m.sent_by === user?.id
                  ? t("tgg.you")
                  : ownerName(m.sent_by)
                : owner
              : m.sender_name || "—";
            return (
              <div key={m.id}>
                {showDay && (
                  <p className="my-3 text-center text-[11.5px] font-semibold text-muted-foreground">
                    {day}
                  </p>
                )}
                <div className={cn("flex", m.is_out ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug shadow-sm",
                      m.is_out
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md border border-border bg-card text-foreground",
                    )}
                  >
                    <p
                      className={cn(
                        "mb-0.5 text-[11.5px] font-semibold",
                        m.is_out ? "text-primary-foreground/80" : "text-sky-700 dark:text-sky-300",
                      )}
                    >
                      {author}
                    </p>
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    <p
                      className={cn(
                        "mt-0.5 text-right text-[10.5px] tabular-nums",
                        m.is_out ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {hm(m.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <footer className="border-t border-border bg-card py-3 pl-4 pr-[84px] phone:pr-4">
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
              className="max-h-40 min-h-10 min-w-0 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] outline-none focus:border-primary phone:text-base"
            />
            <button
              type="submit"
              disabled={!text.trim() || send.isPending}
              className="ctl-lit inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold disabled:opacity-50"
            >
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t("tgg.send")}
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
