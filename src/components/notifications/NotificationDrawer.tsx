import { useEffect, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  Bell,
  CheckCheck,
  ListChecks,
  Maximize2,
  MessageCircle,
  MoreHorizontal,
  Search,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InboxPanel, NOTIF_LABEL, kindOf, type Kind } from "@/components/inbox/InboxPanel";
import { useOpenNotificationLink } from "@/components/notifications/open-link";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsView,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The rail's notifications, the amoCRM way: a compact bell under the
// person's tile, opening a panel that slides out right beside the rail
// with search and the newest notifications. "Hammasini ko'rish" opens the
// full notification center (InboxPanel) as before.

const KIND_ICON: Record<Kind, LucideIcon> = {
  leads: UserRound,
  tasks: ListChecks,
  messages: MessageCircle,
  other: Bell,
};
const KIND_TONE: Record<Kind, string> = {
  leads: "bg-sky-500/12 text-sky-600 dark:text-sky-300",
  tasks: "bg-amber-500/12 text-amber-600 dark:text-amber-300",
  messages: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
  other: "bg-violet-500/12 text-violet-600 dark:text-violet-300",
};

const pad = (n: number) => String(n).padStart(2, "0");
/** amoCRM's stamp: "Bugun 10:13", "Kecha 23:55", else "17.10 14:20". */
function stamp(iso: string, today: string, yesterday: string): string {
  const d = new Date(iso);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (day === start) return `${today} ${hm}`;
  if (day === start - 86_400_000) return `${yesterday} ${hm}`;
  const y = d.getFullYear() === now.getFullYear() ? "" : `.${d.getFullYear()}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}${y} ${hm}`;
}

const badge = (n: number) => (n > 99 ? "99+" : String(n));

export function RailNotifications({ railWidth }: { railWidth: number }) {
  const { t } = useI18n();
  const { rows, isLoading } = useNotificationsView();
  const unread = rows.filter((n) => n.unread).length;
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const path = useRouterState({ select: (s) => s.location.href });
  useEffect(() => {
    setOpen(false);
    setFull(false);
  }, [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("shell.notifications")}
        aria-expanded={open}
        title={t("shell.notifications")}
        className={cn(
          "relative mx-auto mt-1.5 flex h-8 w-[50px] items-center justify-center rounded-xl border transition-colors",
          open
            ? "border-primary/50 bg-primary/12 text-primary"
            : "border-sidebar-border text-amber-600 hover:border-primary/40 hover:bg-accent dark:text-amber-400",
        )}
      >
        <Bell className="h-[17px] w-[17px]" strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-[18px] text-destructive-foreground ring-2 ring-background tabular-nums">
            {badge(unread)}
          </span>
        )}
      </button>

      {/* Clicking anywhere on the page (not the rail) closes the panel. */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        style={{ left: railWidth }}
        className={cn(
          "fixed inset-y-0 right-0 z-[44] bg-black/25 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <section
        role="dialog"
        aria-label={t("shell.notifications")}
        style={{ left: railWidth }}
        className={cn(
          "fixed top-0 z-[45] flex h-dvh w-[380px] flex-col border-r border-sidebar-border bg-card shadow-[12px_0_40px_-12px_rgba(0,0,0,0.35)] transition-[transform,opacity] duration-200 ease-out",
          open ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-3 opacity-0",
        )}
      >
        {open && (
          <DrawerBody
            rows={rows}
            isLoading={isLoading}
            unread={unread}
            onClose={() => setOpen(false)}
            onFull={() => {
              setOpen(false);
              setFull(true);
            }}
          />
        )}
      </section>

      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent className="max-h-[88dvh] w-[min(1100px,calc(100vw-32px))] max-w-none overflow-y-auto p-6">
          <DialogTitle className="sr-only">{t("shell.notifications")}</DialogTitle>
          <InboxPanel />
        </DialogContent>
      </Dialog>
    </>
  );
}

function DrawerBody({
  rows,
  isLoading,
  unread,
  onClose,
  onFull,
}: {
  rows: ReturnType<typeof useNotificationsView>["rows"];
  isLoading: boolean;
  unread: number;
  onClose: () => void;
  onFull: () => void;
}) {
  const { t } = useI18n();
  const openLink = useOpenNotificationLink();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [q, setQ] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [menu, setMenu] = useState(false);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(
      (n) =>
        (!onlyUnread || n.unread) &&
        (!s || n.title.toLowerCase().includes(s) || n.body.toLowerCase().includes(s)),
    );
  }, [rows, q, onlyUnread]);

  function open(n: (typeof rows)[number]) {
    if (n.unread) markRead.mutate(n.id);
    if (n.link) {
      openLink(n.link);
      onClose();
    }
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search.title")}
            className="h-9 w-full rounded-lg bg-transparent pl-8 pr-2 text-[13.5px] text-foreground outline-none placeholder:text-subtle focus:bg-surface"
          />
        </label>
        <Popover open={menu} onOpenChange={setMenu}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("notif.more")}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="h-4.5 w-4.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-60 rounded-xl p-1.5">
            <button
              type="button"
              disabled={unread === 0 || markAll.isPending}
              onClick={() => {
                setMenu(false);
                markAll.mutate(undefined, {
                  onError: () => toast.error(t("notif.markAllFailed")),
                });
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-foreground hover:bg-accent disabled:opacity-40"
            >
              <CheckCheck className="h-4 w-4 text-primary" /> {t("notif.markAll")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                onFull();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-foreground hover:bg-accent"
            >
              <Maximize2 className="h-4 w-4 text-muted-foreground" /> {t("notif.openAll")}
            </button>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2">
        {[false, true].map((u) => (
          <button
            key={String(u)}
            type="button"
            onClick={() => setOnlyUnread(u)}
            className={cn(
              "h-7 rounded-full px-3 text-[12px] font-semibold transition-colors",
              onlyUnread === u
                ? "bg-primary/12 text-[var(--primary-ink)]"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {t(u ? "inbox.filterUnread" : "inbox.filterAll")}
            {u && unread > 0 && (
              <span className="ml-1 tabular-nums opacity-70">{badge(unread)}</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-px">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3 px-4 py-3.5">
                <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
                <span className="flex-1 space-y-2 pt-1">
                  <span className="block h-2.5 w-2/3 animate-pulse rounded bg-muted" />
                  <span className="block h-2.5 w-full animate-pulse rounded bg-muted" />
                </span>
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Bell className="mx-auto h-7 w-7 text-subtle" />
            <p className="mt-3 text-[13px] text-muted-foreground">{t("inbox.empty")}</p>
          </div>
        ) : (
          shown.map((n) => {
            const kind = kindOf(n.type);
            const Icon = KIND_ICON[kind];
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                className={cn(
                  "flex w-full gap-3 border-b border-border/70 px-4 py-3 text-left transition-colors hover:bg-accent/60",
                  n.unread && "bg-primary/[0.05]",
                )}
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                    KIND_TONE[kind],
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold uppercase tracking-[0.04em] text-subtle">
                      {NOTIF_LABEL[n.type] ? t(NOTIF_LABEL[n.type]!) : t(`notif.kind.${kind}`)}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-subtle">
                      {stamp(n.at, t("notif.today"), t("notif.yesterday"))}
                    </span>
                    {n.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block truncate text-[13.5px] text-foreground",
                      n.unread ? "font-bold" : "font-semibold",
                    )}
                  >
                    {n.title}
                  </span>
                  {n.body && (
                    <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-muted-foreground">
                      {n.body}
                    </span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
