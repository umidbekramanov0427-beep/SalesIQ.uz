import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  Delete,
  ExternalLink,
  Grid3x3,
  Loader2,
  Pause,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  Play,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CallAnalytics } from "@/components/phone/CallAnalytics";
import { RecordingAudio } from "@/components/audio/RecordingLink";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  useCallHistory,
  useSyncPbxHistory,
  usePbxCall,
  useStartCall,
  type CallHistoryItem,
  type CallOutcome,
} from "@/hooks/use-crm-data";

// The phone widget, like amoCRM's telephony one: an icon in the sidebar
// opens the call history (all / incoming / outgoing / missed, by day) with
// a dial bar at the bottom, and every call placed from anywhere in the
// platform shows a small live card in the corner until it ends. Calls go
// out through the company's PBX (click-to-call): the PBX rings the
// salesperson's own phone or SIP line first, then the client.

type CallMeta = { leadId?: string; contactId?: string; name?: string };
type LiveCall = { id: string | null; number: string; startedAt: number } & CallMeta;

type PhoneCtx = {
  enabled: boolean;
  calling: boolean;
  live: LiveCall | null;
  call: (number: string, meta?: CallMeta) => void;
  openHistory: () => void;
};

const Ctx = createContext<PhoneCtx>({
  enabled: false,
  calling: false,
  live: null,
  call: () => {},
  openHistory: () => {},
});

export const usePhone = () => useContext(Ctx);

export function PhoneProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { t } = useI18n();
  const start = useStartCall();
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<LiveCall | null>(null);

  const call = useCallback(
    (number: string, meta: CallMeta = {}) => {
      const to = number.trim();
      if (!to) return;
      setLive({ id: null, number: to, startedAt: Date.now(), ...meta });
      start.mutate(
        {
          toNumber: to,
          ...(meta.leadId ? { leadId: meta.leadId } : {}),
          ...(meta.contactId ? { contactId: meta.contactId } : {}),
        },
        {
          onSuccess: (r) => setLive((l) => (l && l.number === to ? { ...l, id: r.id } : l)),
          onError: (err) => {
            setLive(null);
            toast.error(describeError(err, t("lead.callFailed")));
          },
        },
      );
    },
    [start, t],
  );

  const value = useMemo<PhoneCtx>(
    () => ({ enabled, calling: start.isPending, live, call, openHistory: () => setOpen(true) }),
    [enabled, start.isPending, live, call],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {enabled && !open && <FloatingPhone live={!!live} onOpen={() => setOpen(true)} />}
      {enabled && open && <CallHistoryPanel onClose={() => setOpen(false)} />}
      {enabled && live && !open && <LiveCallCard call={live} onClose={() => setLive(null)} />}
    </Ctx.Provider>
  );
}

/* ------------------------------------------------------------------ */

const FAB_KEY = "salesiq.phoneFab";
const FAB = 54;

// The phone button floats over the funnel board and the lead card only --
// where calls are made -- and can be dragged anywhere; it stays where it
// was left (per browser).
function FloatingPhone({ live, onOpen }: { live: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  const location = useRouterState({ select: (s) => s.location });
  const search = location.search as Record<string, unknown>;
  const onPhone =
    typeof document !== "undefined" && document.documentElement.classList.contains("phone");
  const show =
    (location.pathname.startsWith("/crm/leads/") && !onPhone) ||
    (location.pathname === "/funnels" &&
      typeof search["funnel"] === "string" &&
      !!search["funnel"]);

  const [pos, setPos] = useState<{ right: number; bottom: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAB_KEY) ?? "null") as {
        right: number;
        bottom: number;
      } | null;
      if (saved && Number.isFinite(saved.right) && Number.isFinite(saved.bottom)) return saved;
    } catch {
      /* private mode etc. */
    }
    // On a phone: bottom left, above the tab bar, away from the AI button.
    if (typeof document !== "undefined" && document.documentElement.classList.contains("phone"))
      return { right: Math.max(8, window.innerWidth - FAB - 14), bottom: 92 };
    return { right: 28, bottom: 96 };
  });
  const drag = useRef<{
    x: number;
    y: number;
    right: number;
    bottom: number;
    moved: boolean;
  } | null>(null);

  const clamp = useCallback(
    (p: { right: number; bottom: number }) => ({
      right: Math.min(Math.max(8, p.right), window.innerWidth - FAB - 8),
      bottom: Math.min(
        Math.max(document.documentElement.classList.contains("phone") ? 84 : 8, p.bottom),
        window.innerHeight - FAB - 8,
      ),
    }),
    [],
  );
  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  if (!show) return null;
  return (
    <button
      type="button"
      aria-label={t("phone.title")}
      title={t("phone.fabHint")}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, ...pos, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) < 5) return;
        d.moved = true;
        setPos(clamp({ right: d.right - dx, bottom: d.bottom - dy }));
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d?.moved) {
          onOpen();
          return;
        }
        try {
          localStorage.setItem(FAB_KEY, JSON.stringify(pos));
        } catch {
          /* ignore */
        }
      }}
      onPointerCancel={() => (drag.current = null)}
      style={{ right: pos.right, bottom: pos.bottom, width: FAB, height: FAB }}
      className={cn(
        "fixed z-[45] grid touch-none select-none place-items-center rounded-2xl border shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition-[background-color,box-shadow,transform] active:scale-95",
        live
          ? "border-emerald-400 bg-emerald-500 text-white"
          : "border-emerald-500/40 bg-card text-emerald-600 hover:bg-emerald-500/10 hover:shadow-[0_12px_34px_rgba(16,185,129,0.30)] dark:text-emerald-400",
      )}
    >
      {live && <span className="absolute inset-0 animate-ping rounded-2xl bg-emerald-500/30" />}
      <Phone className="relative h-6 w-6" />
    </button>
  );
}

/* ------------------------------------------------------------------ */

type LiveState = "dialing" | "ringing" | "talking" | "ended" | "failed";

function useLiveState(call: LiveCall) {
  const { data } = usePbxCall(call.id);
  const [now, setNow] = useState(Date.now());
  const status = data?.status;
  const state: LiveState =
    !call.id || status === "initiated"
      ? "dialing"
      : status === "ringing"
        ? "ringing"
        : status === "answered"
          ? "talking"
          : status === "failed" || status === "no_answer"
            ? "failed"
            : status === "completed"
              ? "ended"
              : "ringing";
  const ended = state === "ended" || state === "failed";
  useEffect(() => {
    if (ended) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ended]);
  const since =
    state === "talking" && data?.updated_at ? new Date(data.updated_at).getTime() : call.startedAt;
  const seconds = ended
    ? (data?.duration_seconds ?? 0)
    : Math.max(0, Math.round((now - since) / 1000));
  return { state, seconds, ended };
}

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const LIVE_TONE: Record<LiveState, string> = {
  dialing: "bg-amber-500",
  ringing: "bg-amber-500",
  talking: "bg-emerald-500",
  ended: "bg-slate-400",
  failed: "bg-destructive",
};

function LiveCallCard({ call, onClose }: { call: LiveCall; onClose: () => void }) {
  const { t } = useI18n();
  const { state, seconds, ended } = useLiveState(call);
  // A finished call lingers a moment so its result can be read, then goes.
  useEffect(() => {
    if (!ended) return;
    const id = window.setTimeout(onClose, 8000);
    return () => window.clearTimeout(id);
  }, [ended, onClose]);
  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-[60] w-[320px] phone:bottom-[calc(84px+env(safe-area-inset-bottom))] phone:right-2 phone:w-[calc(100vw-16px)] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-[0_18px_50px_rgba(0,0,0,0.28)]"
    >
      <div className={cn("h-1 w-full", LIVE_TONE[state], !ended && "animate-pulse")} />
      <div className="flex items-start gap-3 p-3.5">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-full text-white",
            LIVE_TONE[state],
          )}
        >
          {ended ? <PhoneOff className="h-4.5 w-4.5" /> : <PhoneOutgoing className="h-4.5 w-4.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{call.name || call.number}</p>
          {call.name && (
            <p className="truncate text-[12px] tabular-nums text-muted-foreground">{call.number}</p>
          )}
          <p className="mt-1 flex items-center gap-1.5 text-[12px] font-medium">
            {!ended && state !== "talking" && <Loader2 className="h-3 w-3 animate-spin" />}
            {t(`phone.live.${state}`)}
            <span className="tabular-nums text-muted-foreground">· {mmss(seconds)}</span>
          </p>
          {(state === "dialing" || state === "ringing") && (
            <p className="mt-1.5 text-[11.5px] leading-snug text-subtle">{t("phone.live.hint")}</p>
          )}
        </div>
        <button
          type="button"
          aria-label={t("phone.close")}
          onClick={onClose}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {call.leadId && (
        <div className="border-t border-border px-3.5 py-2">
          <Link
            to="/crm/leads/$leadId"
            params={{ leadId: call.leadId }}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> {t("phone.openLead")}
          </Link>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

type Tab = "all" | "incoming" | "outgoing" | "missed";

const OUTCOME_TONE: Record<CallOutcome, string> = {
  answered: "text-emerald-600 dark:text-emerald-400",
  missed: "text-destructive",
  noAnswer: "text-amber-600 dark:text-amber-400",
  ringing: "text-primary",
  failed: "text-destructive",
};

function CallIcon({ c }: { c: CallHistoryItem }) {
  const cls = cn("h-4 w-4 shrink-0", OUTCOME_TONE[c.outcome]);
  if (c.outcome === "missed") return <PhoneMissed className={cls} />;
  return c.direction === "incoming" ? (
    <PhoneIncoming className={cls} />
  ) : (
    <PhoneOutgoing className={cls} />
  );
}

function dayTitle(iso: string, t: (k: string, v?: Record<string, string | number>) => string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  // Spelled out here: browsers have no Uzbek month names (they print "M10").
  const date = `${d.getDate()} ${t(`phone.month.${d.getMonth() + 1}`)}, ${t(`phone.weekday.${d.getDay()}`)}`;
  if (same(d, today)) return `${t("phone.today")} — ${date}`;
  if (same(d, yesterday)) return `${t("phone.yesterday")} — ${date}`;
  return date;
}

function CallHistoryPanel({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { call, live } = usePhone();
  const { data: calls = [], isLoading } = useCallHistory(true);
  // Bring in what the PBX knows (incoming, missed, desk-phone calls) on open.
  const sync = useSyncPbxHistory();
  const syncRef = useRef(sync.mutate);
  useEffect(() => syncRef.current({}), []);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [dial, setDial] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [view, setView] = useState<"history" | "analytics">("history");
  const locale = lang === "ru" ? "ru-RU" : lang === "en" ? "en-GB" : "uz-UZ";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const counts = {
    all: calls.length,
    incoming: calls.filter((c) => c.direction === "incoming").length,
    outgoing: calls.filter((c) => c.direction === "outgoing").length,
    missed: calls.filter((c) => c.outcome === "missed").length,
  };
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const shown = calls.filter((c) => {
    if (tab === "incoming" && c.direction !== "incoming") return false;
    if (tab === "outgoing" && c.direction !== "outgoing") return false;
    if (tab === "missed" && c.outcome !== "missed") return false;
    if (!needle) return true;
    return (
      c.name.toLowerCase().includes(needle) ||
      (digits.length > 2 && c.phone.replace(/\D/g, "").includes(digits))
    );
  });
  const groups: { day: string; items: CallHistoryItem[] }[] = [];
  for (const c of shown.slice(0, 300)) {
    const day = new Date(c.at).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(c);
    else groups.push({ day, items: [c] });
  }

  function dialNow(number: string, meta?: Parameters<typeof call>[1]) {
    call(number, meta);
    onClose();
  }

  return (
    // Over the whole screen, blurred, with the window ~3 cm in from every
    // edge (less on small screens).
    <div
      className="fixed inset-0 z-[55] bg-black/50 p-3 backdrop-blur-md sm:p-8 lg:p-[3cm]"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-label={t("phone.title")}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
      >
        {/* Head: title, tabs, search */}
        <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
            <Phone className="h-5 w-5" />
          </span>
          <div className="mr-2">
            <h2 className="text-[17px] font-bold leading-tight text-foreground">
              {view === "analytics" ? t("callStats.title") : t("phone.title")}
            </h2>
            <p className="text-[12px] text-muted-foreground">
              {view === "analytics" ? t("callStats.subtitle") : t("phone.subtitle")}
            </p>
          </div>
          {view === "history" && (
            <>
              <div className="flex rounded-xl bg-muted/70 p-1">
                {(["all", "incoming", "outgoing", "missed"] as Tab[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium transition-colors",
                      tab === k
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`phone.tab.${k}`)}
                    <span
                      className={cn(
                        "rounded-md px-1.5 text-[11px] tabular-nums",
                        k === "missed" && counts.missed
                          ? "bg-destructive/15 text-destructive"
                          : "bg-foreground/[0.06] text-muted-foreground",
                      )}
                    >
                      {counts[k]}
                    </span>
                  </button>
                ))}
              </div>
              <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 focus-within:border-primary">
                <Search className="h-4 w-4 text-subtle" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("phone.search")}
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
                />
              </label>
            </>
          )}
          {view === "analytics" && <span className="flex-1" />}
          {/* The way into (and back out of) the call analytics. */}
          <button
            type="button"
            onClick={() => setView(view === "history" ? "analytics" : "history")}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold shadow-sm transition-[filter,background-color] hover:brightness-110",
              view === "history"
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-foreground",
            )}
          >
            {view === "history" ? (
              <>
                <BarChart3 className="h-4 w-4" /> {t("callStats.open")}
              </>
            ) : (
              <>
                <ArrowLeft className="h-4 w-4" /> {t("callStats.backToCalls")}
              </>
            )}
          </button>
          <button
            type="button"
            aria-label={t("phone.close")}
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {view === "analytics" ? (
          <CallAnalytics />
        ) : (
          <>
            {/* Column heads */}
            <div className="hidden grid-cols-[96px_minmax(0,1.3fr)_160px_80px_minmax(0,1fr)_112px] gap-3 border-b border-border bg-muted/40 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-subtle md:grid">
              <span>{t("phone.col.call")}</span>
              <span>{t("phone.col.name")}</span>
              <span>{t("phone.col.phone")}</span>
              <span>{t("phone.col.duration")}</span>
              <span>{t("phone.col.status")}</span>
              <span />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
                </div>
              ) : groups.length === 0 ? (
                <p className="py-16 text-center text-sm text-subtle">{t("phone.empty")}</p>
              ) : (
                groups.map((g) => (
                  <div key={g.day}>
                    <p className="sticky top-0 z-[1] border-b border-border bg-background/95 px-5 py-2 text-[12px] font-semibold capitalize text-muted-foreground backdrop-blur">
                      {dayTitle(g.items[0]!.at, t)}
                    </p>
                    {g.items.map((c) => (
                      <div key={c.id} className="border-b border-border/70 last:border-0">
                        <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5 text-[13px] transition-colors hover:bg-accent/60 md:grid-cols-[96px_minmax(0,1.3fr)_160px_80px_minmax(0,1fr)_112px]">
                          <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                            <CallIcon c={c} />
                            {new Date(c.at).toLocaleTimeString(locale, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            <span className="truncate font-medium text-foreground md:hidden">
                              {c.name || c.phone}
                            </span>
                          </span>
                          <span className="hidden min-w-0 md:block">
                            {c.leadId ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  void navigate({
                                    to: "/crm/leads/$leadId",
                                    params: { leadId: c.leadId! },
                                  });
                                }}
                                className="block max-w-full truncate text-left font-medium text-foreground hover:text-primary hover:underline"
                              >
                                {c.name || t("phone.unknown")}
                              </button>
                            ) : (
                              <span className="block truncate font-medium text-foreground">
                                {c.name || t("phone.unknown")}
                              </span>
                            )}
                          </span>
                          <span className="hidden truncate tabular-nums text-foreground/85 md:block">
                            {c.phone || "—"}
                          </span>
                          <span className="hidden tabular-nums text-muted-foreground md:block">
                            {mmss(c.durationSeconds)}
                          </span>
                          <span className="hidden min-w-0 md:block" title={c.error ?? undefined}>
                            <span
                              className={cn("block truncate font-medium", OUTCOME_TONE[c.outcome])}
                            >
                              {t(`phone.outcome.${c.outcome}`)}
                            </span>
                            {c.outcome === "failed" && c.error && (
                              <span className="block truncate text-[11.5px] text-muted-foreground">
                                {c.error}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center justify-end gap-1">
                            {c.recordingUrl && (
                              <button
                                type="button"
                                title={t("phone.listen")}
                                onClick={() => setPlaying(playing === c.id ? null : c.id)}
                                className={cn(
                                  "grid h-8 w-8 place-items-center rounded-lg transition-colors",
                                  playing === c.id
                                    ? "bg-primary/12 text-primary"
                                    : "text-muted-foreground hover:bg-background hover:text-foreground",
                                )}
                              >
                                {playing === c.id ? (
                                  <Pause className="h-4 w-4" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            {c.phone && (
                              <button
                                type="button"
                                title={t("phone.callBack")}
                                disabled={!!live}
                                onClick={() =>
                                  dialNow(c.phone, {
                                    ...(c.leadId ? { leadId: c.leadId } : {}),
                                    ...(c.contactId ? { contactId: c.contactId } : {}),
                                    ...(c.name ? { name: c.name } : {}),
                                  })
                                }
                                className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/12 text-emerald-600 transition-colors hover:bg-emerald-500 hover:text-white disabled:opacity-40 dark:text-emerald-400"
                              >
                                <Phone className="h-4 w-4" />
                              </button>
                            )}
                          </span>
                        </div>
                        {playing === c.id && c.recordingUrl && (
                          <div className="px-5 pb-3">
                            <RecordingAudio url={c.recordingUrl} controls autoPlay className="h-9 w-full" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Dial bar */}
            <footer className="flex items-center gap-2 border-t border-border bg-muted/40 px-5 py-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (dial.trim()) dialNow(dial);
                }}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <input
                  value={dial}
                  onChange={(e) => setDial(e.target.value.replace(/[^\d+*#\s()-]/g, ""))}
                  inputMode="tel"
                  placeholder={t("phone.dialPlaceholder")}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 text-[14px] tabular-nums outline-none placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title={t("phone.keypad")}
                      className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground"
                    >
                      <Grid3x3 className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="end" className="w-56 p-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "#"].map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setDial((d) => d + k)}
                          className="h-11 rounded-xl bg-muted text-[17px] font-semibold tabular-nums hover:bg-accent"
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDial((d) => d.slice(0, -1))}
                      className="mt-1.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-[12.5px] text-muted-foreground hover:bg-accent"
                    >
                      <Delete className="h-4 w-4" /> {t("phone.erase")}
                    </button>
                  </PopoverContent>
                </Popover>
                <button
                  type="submit"
                  disabled={!dial.trim() || !!live}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-500 px-5 text-[13.5px] font-semibold text-white shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-50"
                >
                  <Phone className="h-4 w-4" /> {t("phone.call")}
                </button>
              </form>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
