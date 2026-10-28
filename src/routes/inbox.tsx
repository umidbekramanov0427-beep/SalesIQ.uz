import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Check,
  Inbox,
  Instagram,
  MessagesSquare,
  Pencil,
  Search,
  Send,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AmoLeadCard } from "@/components/lead/AmoLeadCard";
import { ClientAvatar, chatFileLabel } from "@/components/lead/ChatParts";
import { UploadCallDialog } from "@/components/audio/UploadCallDialog";
import { PageLoader } from "@/components/layout/Primitives";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  useInboxConversations,
  useInboxMarks,
  useLeadById,
  useMarkInboxRead,
  usePipelineStagesRaw,
  useProfilesRaw,
  useToggleInboxFavorite,
  type InboxConversation,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  activeCount,
  EMPTY_INBOX_FILTER,
  INBOX_PRESETS,
  matchesInbox,
  presetFilter,
  readState,
  type InboxFilter,
  type InboxPreset,
} from "@/lib/inbox-filter";
import { useCrmEnabled } from "@/lib/use-org-access";
import { cn, stageColorProps } from "@/lib/utils";

// Inbox, like amoCRM's imBox: every client chat (Telegram and Instagram)
// in a list on the left -- unread ones marked, read-but-unanswered ones
// flagged, favourites starred -- with ready presets and a full filter
// (number, date, funnels with their stages, channel, read and answer
// state, owner, who wrote last, open/closed) that can be saved under a
// name. The chosen chat opens as the full lead card, the same as in the
// CRM, so everything done there can be done here. Only for companies
// that use the CRM. Filter rules: src/lib/inbox-filter.ts.

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

/* ---------------------------------------------------------------- */
/* Saved filters: a person's named filters, kept in their browser like  */
/* the rest of the platform's saved filters (use-saved-filters.ts).     */
/* ---------------------------------------------------------------- */

type SavedInboxFilter = { id: string; name: string; filter: InboxFilter };

function useSavedInboxFilters(userId: string | undefined) {
  const key = userId ? `salesiq.inboxFilters.${userId}` : null;
  const [list, setList] = useState<SavedInboxFilter[]>([]);
  useEffect(() => {
    if (!key) return;
    try {
      const raw = window.localStorage.getItem(key);
      setList(raw ? (JSON.parse(raw) as SavedInboxFilter[]) : []);
    } catch {
      setList([]);
    }
  }, [key]);
  const write = (next: SavedInboxFilter[]) => {
    setList(next);
    if (!key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Private window: the list still works for this visit.
    }
  };
  return {
    list,
    add: (name: string, filter: InboxFilter) =>
      write([...list, { id: crypto.randomUUID(), name, filter }]),
    rename: (id: string, name: string) =>
      write(list.map((s) => (s.id === id ? { ...s, name } : s))),
    remove: (id: string) => write(list.filter((s) => s.id !== id)),
  };
}

function InboxPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const crmEnabled = useCrmEnabled();
  const { lead: openId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: chats = [], isLoading } = useInboxConversations();
  const { data: stages = [] } = usePipelineStagesRaw();
  const { data: marks } = useInboxMarks();
  const markRead = useMarkInboxRead();
  const saved = useSavedInboxFilters(user?.id);
  const [filter, setFilter] = useState<InboxFilter>(EMPTY_INBOX_FILTER);
  const [preset, setPreset] = useState<InboxPreset | string>("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const stageInfo = useMemo(() => {
    const m = new Map<string, { funnel: string; closed: boolean; name: string }>();
    for (const s of stages)
      m.set(s.id, {
        funnel: s.pipeline_name ?? "Direct Sales",
        closed: s.is_won || s.is_lost,
        name: s.name,
      });
    return m;
  }, [stages]);
  const ctxFor = (c: InboxConversation) => ({
    readAt: marks?.readAt.get(c.leadId) ?? null,
    favorite: !!marks?.favorites.has(c.leadId),
    stage: (id: string) => stageInfo.get(id),
  });
  const shown = chats.filter((c) => matchesInbox(c, filter, ctxFor(c)));
  const counts = useMemo(() => {
    let unread = 0;
    let waiting = 0;
    for (const c of chats) {
      if (c.last?.direction === "in") waiting++;
      if (readState(c, marks?.readAt.get(c.leadId)) === "unread") unread++;
    }
    return { unread, waiting };
  }, [chats, marks]);
  const open = chats.find((c) => c.leadId === openId) ?? null;

  // Opening a chat (and every new client message while it is open) marks it read.
  const openLastAt = open?.last?.at ?? null;
  useEffect(() => {
    if (open) markRead.mutate(open.leadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per chat / new message
  }, [open?.leadId, openLastAt]);

  if (!crmEnabled) return null;
  if (isLoading) return <PageLoader />;

  const pick = (id: string | undefined) =>
    void navigate({ to: "/inbox", search: id ? { lead: id } : {}, replace: true });
  const choosePreset = (p: InboxPreset) => {
    setPreset(p);
    setFilter({ ...presetFilter(p, user?.id ?? null), text: filter.text });
  };
  const quick: { key: InboxPreset; n?: number }[] = [
    { key: "all" },
    { key: "unread", n: counts.unread },
    { key: "needsAnswer", n: counts.waiting },
    { key: "favorites" },
  ];
  const nActive = activeCount({ ...filter, text: "" });

  return (
    // Full-bleed under the top bar, like the lead card.
    <div className="-mx-4 -mb-20 -mt-4 flex h-[calc(100%+2rem)] md:-mx-6 md:-mb-[104px] md:h-[calc(100%+2.5rem)] phone:-mx-3 phone:-mb-4 phone:-mt-3 phone:h-[calc(100%+0.75rem)]">
      {/* Conversations */}
      <aside
        className={cn(
          "flex w-[340px] shrink-0 flex-col border-r border-border bg-card phone:w-full phone:border-r-0",
          open && "phone:hidden",
        )}
      >
        <div className="border-b border-border px-4 pb-3 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400">
              <Inbox className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-[17px] font-bold leading-tight text-foreground">
                {t("chats.title")}
              </h1>
              <p className="text-[12px] text-muted-foreground">
                {t("chats.summary2", {
                  n: chats.length,
                  u: counts.unread,
                  w: counts.waiting,
                })}
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-2.5 focus-within:border-primary">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={filter.text}
                onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value }))}
                placeholder={t("chats.search2")}
                className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-subtle"
              />
            </label>
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-semibold transition-colors",
                nActive > 0
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-foreground hover:bg-accent",
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {t("funnelFilter.button")}
              {nActive > 0 && (
                <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10.5px] font-bold text-primary-foreground">
                  {nActive}
                </span>
              )}
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button
                key={q.key}
                type="button"
                onClick={() => choosePreset(q.key)}
                aria-pressed={preset === q.key}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold transition-colors",
                  preset === q.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`inbox.preset.${q.key}`)}
                {!!q.n && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      preset === q.key ? "bg-primary-foreground/20" : "bg-primary text-white",
                    )}
                  >
                    {q.n}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
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
                stage={c.stageId ? (stageInfo.get(c.stageId)?.name ?? "") : ""}
                state={readState(c, marks?.readAt.get(c.leadId))}
                favorite={!!marks?.favorites.has(c.leadId)}
                onOpen={() => pick(c.leadId)}
              />
            ))
          )}
        </ul>
      </aside>

      {/* The open chat: the full lead card, as in the CRM. */}
      <section className={cn("min-w-0 flex-1 bg-background", !open && "phone:hidden")}>
        {open ? (
          <InboxLeadCard key={open.leadId} leadId={open.leadId} />
        ) : (
          <div className="grid h-full place-items-center p-8 text-center">
            <div>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <MessagesSquare className="h-7 w-7" />
              </span>
              <p className="mt-3 text-[15px] font-semibold text-foreground">{t("chats.pick")}</p>
              <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
                {t("chats.pickHint")}
              </p>
            </div>
          </div>
        )}
      </section>

      <InboxFilterDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filter}
        preset={preset}
        saved={saved}
        meId={user?.id ?? null}
        stages={stages}
        onApply={(f, p) => {
          setFilter(f);
          setPreset(p);
          setFilterOpen(false);
        }}
      />
    </div>
  );
}

function InboxLeadCard({ leadId }: { leadId: string }) {
  const { lead, isLoading } = useLeadById(leadId);
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);
  if (isLoading) return <PageLoader />;
  if (!lead) return null;
  const toLead = () =>
    void navigate({ to: "/crm/leads/$leadId", params: { leadId }, search: { from: "funnels" } });
  return (
    <div className="h-full">
      <AmoLeadCard
        lead={lead}
        actions={{ openTelegram: toLead, openEmail: toLead, openUpload: () => setUploadOpen(true) }}
      />
      <UploadCallDialog open={uploadOpen} onOpenChange={setUploadOpen} defaultLeadId={leadId} />
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
  state,
  favorite,
  onOpen,
}: {
  chat: InboxConversation;
  active: boolean;
  stage: string;
  state: ReturnType<typeof readState>;
  favorite: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const toggleFav = useToggleInboxFavorite();
  const last = chat.last;
  const unread = state === "unread";
  const preview = last
    ? last.fileKind
      ? chatFileLabel(last.fileKind, last.fileName, t)
      : last.text
    : t("chats.noMessages");
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
          active ? "bg-primary/[0.08] shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-accent/60",
        )}
      >
        <span className="relative mt-0.5 shrink-0">
          <ClientAvatar
            leadId={chat.leadId}
            name={chat.name}
            hasPhoto={chat.hasPhoto}
            className="h-10 w-10 text-[14px]"
          />
          <span className="absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-card ring-2 ring-card">
            <ChannelIcon channel={chat.channel} className="h-3 w-3" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[14px] text-foreground",
                unread ? "font-bold" : "font-semibold",
              )}
            >
              {chat.name}
            </span>
            {last && (
              <span
                className={cn(
                  "shrink-0 text-[11.5px] tabular-nums",
                  unread ? "font-bold text-primary" : "text-muted-foreground",
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
                unread ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {last && last.direction === "out" && `${t("chats.you")}: `}
              {preview}
            </span>
            {unread && (
              <span
                title={t("inbox.state.unread")}
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
              />
            )}
            {state === "read" && (
              <span
                title={t("inbox.state.read")}
                className="shrink-0 rounded bg-amber-500/15 px-1 text-[10.5px] font-bold text-amber-700 dark:text-amber-300"
              >
                {t("inbox.noAnswer")}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-subtle">
            {chat.leadNumber && <span className="font-mono">#{chat.leadNumber}</span>}
            <span className="truncate">
              {chat.leadNumber ? " · " : ""}
              {chat.funnel}
              {stage && ` · ${stage}`}
            </span>
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={t("inbox.favorite")}
        title={t("inbox.favorite")}
        disabled={toggleFav.isPending}
        onClick={() =>
          toggleFav.mutate(
            { leadId: chat.leadId, on: !favorite },
            { onError: () => toast.error(t("inbox.notReady")) },
          )
        }
        className={cn(
          "absolute bottom-2.5 right-3 grid h-6 w-6 place-items-center rounded-md transition-opacity hover:bg-accent",
          favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        <Star
          className={cn(
            "h-3.5 w-3.5",
            favorite ? "fill-amber-400 text-amber-500" : "text-muted-foreground",
          )}
        />
      </button>
    </li>
  );
}

/* ---------------------------------------------------------------- */
/* The filter window: presets and saved filters on the left, the full */
/* filter on the right, like amoCRM's imBox.                          */
/* ---------------------------------------------------------------- */

/** One row of the filter window: its name on the left, the choices on the right. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] items-start gap-3 border-b border-border py-3 last:border-b-0 phone:grid-cols-1 phone:gap-1.5">
      <p className="pt-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex min-w-0 flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

type StageRow = NonNullable<ReturnType<typeof usePipelineStagesRaw>["data"]>[number];

function InboxFilterDialog({
  open,
  onOpenChange,
  value,
  preset,
  saved,
  meId,
  stages,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: InboxFilter;
  preset: string;
  saved: ReturnType<typeof useSavedInboxFilters>;
  meId: string | null;
  stages: StageRow[];
  onApply: (f: InboxFilter, preset: string) => void;
}) {
  const { t } = useI18n();
  const { data: profiles } = useProfilesRaw();
  const [draft, setDraft] = useState(value);
  const [draftPreset, setDraftPreset] = useState(preset);
  const [naming, setNaming] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (open) {
      setDraft(value);
      setDraftPreset(preset);
      setNaming(null);
    }
  }, [open, value, preset]);
  const set = (patch: Partial<InboxFilter>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDraftPreset("custom");
  };
  const funnels = useMemo(() => {
    const by = new Map<string, StageRow[]>();
    for (const s of [...stages].sort((a, b) => a.position - b.position)) {
      const f = s.pipeline_name ?? "Direct Sales";
      by.set(f, [...(by.get(f) ?? []), s]);
    }
    return [...by.entries()];
  }, [stages]);
  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const presetRow = (on: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors",
      on ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-accent",
    );
  const chip = (on: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors",
      on
        ? "border-primary bg-primary/10 text-primary"
        : "border-border bg-card text-foreground hover:bg-accent",
    );
  const dayStart = (v: string) => (v ? new Date(`${v}T00:00:00`).toISOString() : null);
  const dayEnd = (v: string) => (v ? new Date(`${v}T23:59:59`).toISOString() : null);
  const asDay = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-foreground/15 backdrop-blur-[3px]"
        className="w-[min(980px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden rounded-2xl border-border bg-card p-0 shadow-2xl"
      >
        <DialogTitle className="flex h-14 items-center gap-2 border-b border-border px-5 text-[16px] font-bold text-foreground">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          {t("inbox.filterTitle")}
        </DialogTitle>
        <div className="grid max-h-[min(72vh,620px)] grid-cols-1 overflow-y-auto md:grid-cols-[250px_minmax(0,1fr)] md:overflow-hidden">
          {/* Presets and saved filters */}
          <div className="border-b border-border bg-surface p-3 md:overflow-y-auto md:border-b-0 md:border-r">
            <div className="space-y-0.5">
              {INBOX_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setDraft({ ...presetFilter(p, meId), text: draft.text });
                    setDraftPreset(p);
                  }}
                  className={presetRow(draftPreset === p)}
                >
                  {p === "favorites" && <Star className="h-3.5 w-3.5 text-amber-500" />}
                  <span className="truncate">{t(`inbox.preset.${p}`)}</span>
                </button>
              ))}
            </div>
            {saved.list.length > 0 && (
              <>
                <p className="mb-1 mt-4 px-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t("inbox.savedTitle")}
                </p>
                <div className="space-y-0.5">
                  {saved.list.map((s) =>
                    editing?.id === s.id ? (
                      <form
                        key={s.id}
                        className="flex items-center gap-1 px-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (editing.name.trim()) saved.rename(s.id, editing.name.trim());
                          setEditing(null);
                        }}
                      >
                        <input
                          autoFocus
                          value={editing.name}
                          onChange={(e) =>
                            setEditing({ id: s.id, name: e.target.value.slice(0, 40) })
                          }
                          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[13px]"
                        />
                        <button
                          type="submit"
                          aria-label={t("common.save")}
                          className="grid h-7 w-7 place-items-center rounded-md text-primary hover:bg-accent"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </form>
                    ) : (
                      <div key={s.id} className="group/saved flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setDraft(s.filter);
                            setDraftPreset(s.id);
                          }}
                          className={cn(presetRow(draftPreset === s.id), "min-w-0 flex-1")}
                        >
                          <span className="truncate">{s.name}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={t("inbox.rename")}
                          title={t("inbox.rename")}
                          onClick={() => setEditing({ id: s.id, name: s.name })}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-accent group-hover/saved:opacity-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={t("inbox.deleteSaved")}
                          title={t("inbox.deleteSaved")}
                          onClick={() => saved.remove(s.id)}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-destructive group-hover/saved:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ),
                  )}
                </div>
              </>
            )}
          </div>

          {/* The full filter */}
          <div className="min-w-0 px-5 py-2 md:overflow-y-auto">
            <Field label={t("inbox.f.text")}>
              <input
                value={draft.text}
                onChange={(e) => set({ text: e.target.value })}
                placeholder={t("chats.search2")}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13.5px] outline-none focus:border-primary"
              />
            </Field>
            <Field label={t("inbox.f.date")}>
              <input
                type="date"
                value={asDay(draft.from)}
                onChange={(e) => set({ from: dayStart(e.target.value) })}
                className="h-9 rounded-lg border border-border bg-background px-2.5 text-[13px]"
              />
              <span className="self-center text-muted-foreground">—</span>
              <input
                type="date"
                value={asDay(draft.to)}
                onChange={(e) => set({ to: dayEnd(e.target.value) })}
                className="h-9 rounded-lg border border-border bg-background px-2.5 text-[13px]"
              />
            </Field>
            <Field label={t("inbox.f.funnels")}>
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {funnels.map(([name, list]) => (
                  <div key={name} className="rounded-lg border border-border p-2">
                    <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-semibold text-foreground">
                      <input
                        type="checkbox"
                        checked={draft.funnels.includes(name)}
                        onChange={() => set({ funnels: toggle(draft.funnels, name) })}
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                      <span className="truncate">{name}</span>
                    </label>
                    <div className="mt-1.5 space-y-1 pl-6">
                      {list.map((s) => {
                        const color = s.is_won
                          ? { className: "bg-success" }
                          : s.is_lost
                            ? { className: "bg-destructive" }
                            : stageColorProps(s.color);
                        return (
                          <label
                            key={s.id}
                            className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground"
                          >
                            <input
                              type="checkbox"
                              checked={draft.stageIds.includes(s.id)}
                              onChange={() => set({ stageIds: toggle(draft.stageIds, s.id) })}
                              className="h-3.5 w-3.5 accent-[var(--primary)]"
                            />
                            <span
                              className={cn("h-2.5 w-2.5 shrink-0 rounded-full", color.className)}
                              style={color.style}
                            />
                            <span className="truncate">{s.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Field>
            <Field label={t("inbox.f.channel")}>
              {(["telegram", "instagram"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set({ channels: toggle(draft.channels, c) })}
                  className={chip(draft.channels.includes(c))}
                >
                  <ChannelIcon channel={c} className="h-3.5 w-3.5" />
                  {c === "telegram" ? "Telegram" : "Instagram"}
                </button>
              ))}
            </Field>
            <Field label={t("inbox.f.read")}>
              {(["", "unread", "read", "answered"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set({ read: r })}
                  className={chip(draft.read === r)}
                >
                  {r ? t(`inbox.state.${r}`) : t("common.all")}
                </button>
              ))}
            </Field>
            <Field label={t("inbox.f.answer")}>
              {(["", "needs", "none"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set({ answer: r })}
                  className={chip(draft.answer === r)}
                >
                  {r ? t(`inbox.answer.${r}`) : t("common.all")}
                </button>
              ))}
            </Field>
            <Field label={t("inbox.f.status")}>
              {(["", "open", "closed"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set({ status: r })}
                  className={chip(draft.status === r)}
                >
                  {r ? t(`inbox.status.${r}`) : t("common.all")}
                </button>
              ))}
            </Field>
            <Field label={t("inbox.f.owner")}>
              {(profiles ?? [])
                .filter((p) => p.role !== "platform_owner")
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set({ ownerIds: toggle(draft.ownerIds, p.id) })}
                    className={chip(draft.ownerIds.includes(p.id))}
                  >
                    {p.full_name}
                  </button>
                ))}
            </Field>
            <Field label={t("inbox.f.author")}>
              {(["", "client", "team"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set({ lastAuthor: r })}
                  className={chip(draft.lastAuthor === r)}
                >
                  {r ? t(`inbox.author.${r}`) : t("common.all")}
                </button>
              ))}
            </Field>
            <Field label={t("inbox.f.favorites")}>
              <button
                type="button"
                onClick={() => set({ favorites: !draft.favorites })}
                className={chip(draft.favorites)}
              >
                <Star
                  className={cn("h-3.5 w-3.5", draft.favorites && "fill-amber-400 text-amber-500")}
                />
                {t("inbox.onlyFavorites")}
              </button>
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface px-4 py-3">
          {naming === null ? (
            <button
              type="button"
              onClick={() => setNaming("")}
              disabled={activeCount(draft) === 0}
              className="h-9 rounded-lg border border-border bg-card px-3 text-[13px] font-semibold text-foreground hover:bg-accent disabled:opacity-50"
            >
              {t("inbox.saveAs")}
            </button>
          ) : (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!naming.trim()) return;
                saved.add(naming.trim(), draft);
                setNaming(null);
                toast.success(t("filters.savedToast"));
              }}
            >
              <input
                autoFocus
                value={naming}
                onChange={(e) => setNaming(e.target.value.slice(0, 40))}
                placeholder={t("inbox.saveName")}
                className="h-9 w-48 rounded-lg border border-border bg-background px-3 text-[13px]"
              />
              <button
                type="submit"
                className="h-9 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground"
              >
                {t("common.save")}
              </button>
              <button
                type="button"
                aria-label={t("common.cancel")}
                onClick={() => setNaming(null)}
                className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </form>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => {
              setDraft({ ...EMPTY_INBOX_FILTER });
              setDraftPreset("all");
            }}
            className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("funnelFilter.reset")}
          </button>
          <button
            type="button"
            onClick={() => onApply(draft, draftPreset)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:brightness-110"
          >
            {t("inbox.apply")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
