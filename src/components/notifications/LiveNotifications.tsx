import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlarmClock, AlarmClockOff, BellRing, ClipboardList, MessageCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useOpenNotificationLink } from "./open-link";
import {
  decidePopup,
  leadIdFromLink,
  staysOpen,
  systemTag,
  type LiveRow,
  type PopupKind,
} from "@/lib/live-notifications";
import { cn } from "@/lib/utils";

// Live notifications, without a page refresh: a client's message ("Mijozdan
// xabar keldi") and task reminders (15 minutes before, at the deadline, 15
// minutes late) slide in at the bottom left with a short chime, the bell's
// count goes up and an open chat, the board and the Inbox show the new
// message at once.
//
// New rows arrive over Supabase Realtime (notifications + chat messages).
// The tab also checks on its own -- every 10 s while the websocket is down,
// once a minute while it is up -- and claims its own task reminders, so
// nothing depends on the websocket or on the server's minute cron alone.
// While the tab is hidden the title blinks and, if the person allowed it,
// the system shows the notification (same tag as the server's push, so a
// device shows it once).

const FALLBACK_POLL_MS = 10_000;
const SAFETY_POLL_MS = 60_000;
const CLAIM_EVERY_MS = 30_000;
const SHOW_FOR_MS = 15_000;
const MAX_CARDS = 6;
/** Cards drawn in the deck; the rest wait behind. */
const DECK_DEPTH = 3;

type Card = LiveRow & { type: PopupKind; key: string };

export function LiveNotifications({ enabled }: { enabled: boolean }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const pathname = useLocation({ select: (l) => l.pathname });
  const [cards, setCards] = useState<Card[]>([]);
  const userId = user?.id ?? null;
  const orgId = user?.organizationId ?? null;

  // Read inside the realtime/poll callbacks without re-subscribing.
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const tRef = useRef(t);
  tRef.current = t;
  const shown = useRef(new Map<string, string>());

  const markRead = useCallback(
    async (filter: { id?: string; link?: string }) => {
      if (!userId) return;
      let q = supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", userId)
        .eq("read", false);
      if (filter.id) q = q.eq("id", filter.id);
      if (filter.link) q = q.eq("type", "ClientMessage").eq("link", filter.link);
      await q;
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    [userId, qc],
  );

  useEffect(() => {
    if (!enabled || !userId || !orgId) return;
    let stopped = false;
    let live = false;
    // Rows from before this tab opened are already in the bell.
    const since = Date.now() - 20_000;

    const invalidateTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const invalidateSoon = (queryKey: unknown[]) => {
      const k = JSON.stringify(queryKey);
      if (invalidateTimers.has(k)) return;
      invalidateTimers.set(
        k,
        setTimeout(() => {
          invalidateTimers.delete(k);
          void qc.invalidateQueries({ queryKey });
        }, 250),
      );
    };

    function hear(row: LiveRow | undefined) {
      if (!row?.id || stopped) return;
      invalidateSoon(["notifications"]);
      if (row.read) {
        setCards((prev) => prev.filter((c) => c.id !== row.id));
        return;
      }
      const decision = decidePopup(row, {
        since,
        path: pathRef.current,
        shown: shown.current,
      });
      if (decision === "skip") return;
      shown.current.set(row.id, row.created_at);
      if (decision === "mark-read") {
        void markRead({ id: row.id });
        return;
      }
      const card = { ...row, type: row.type as PopupKind, key: `${row.id}-${row.created_at}` };
      setCards((prev) => [card, ...prev.filter((c) => c.id !== row.id)].slice(0, MAX_CARDS));
      if (row.type.startsWith("Task")) invalidateSoon(["tasks"]);
      chime(row.type === "ClientMessage" ? "message" : "task");
      if (document.visibilityState !== "visible") {
        blinkTitle(tRef.current(cardHeading(card.type)));
        void showSystemNotification(row);
      }
    }

    async function poll() {
      if (stopped) return;
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, link, read, created_at")
        .eq("user_id", userId!)
        .eq("read", false)
        .gte("created_at", new Date(since).toISOString())
        .order("created_at", { ascending: false })
        .limit(10);
      for (const r of (data ?? []).reverse()) hear(r);
    }

    // Until migration 20261208000000 has run the function is missing; stop asking.
    let claimUnavailable = false;
    async function claim() {
      if (stopped || claimUnavailable) return;
      const { data, error } = await supabase.rpc("claim_task_reminders");
      if (error) {
        if (/claim_task_reminders|function|schema cache/i.test(error.message)) {
          claimUnavailable = true;
        }
        return;
      }
      if (data?.length) await poll();
    }

    const channel = supabase
      .channel(`live-notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => hear(payload.new as LiveRow | undefined),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lead_telegram_messages",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const msg = payload.new as { lead_id?: string } | undefined;
          if (!msg?.lead_id) return;
          invalidateSoon(["lead_telegram_messages", msg.lead_id]);
          invalidateSoon(["board_chat_info"]);
          invalidateSoon(["inbox"]);
        },
      )
      .subscribe((status) => {
        const wasLive = live;
        live = status === "SUBSCRIBED";
        // Catch up on anything written while the socket was down.
        if (live && !wasLive) void poll();
      });

    let lastPoll = Date.now();
    void claim();
    const pollTimer = setInterval(() => {
      if (Date.now() - lastPoll < (live ? SAFETY_POLL_MS : FALLBACK_POLL_MS) - 500) return;
      lastPoll = Date.now();
      void poll();
    }, FALLBACK_POLL_MS);
    const claimTimer = setInterval(() => void claim(), CLAIM_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      stopBlink();
      lastPoll = Date.now();
      void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      stopped = true;
      clearInterval(pollTimer);
      clearInterval(claimTimer);
      for (const timer of invalidateTimers.values()) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      stopBlink();
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, orgId, qc, markRead]);

  // Opening a lead's card means its client's messages have been seen.
  useEffect(() => {
    if (!enabled || !leadIdFromLink(pathname)) return;
    setCards((prev) => prev.filter((c) => !(c.type === "ClientMessage" && c.link === pathname)));
    void markRead({ link: pathname });
  }, [enabled, pathname, markRead]);

  if (!enabled || cards.length === 0) return null;
  // One deck, not a growing column: the newest card in front, the older
  // ones tucked behind it with only their lower edge showing, so a burst of
  // messages never climbs up the screen. Closing the front card brings the
  // next one forward.
  return (
    <div className="pointer-events-none fixed bottom-24 left-3 z-[60] w-[min(300px,calc(100vw-24px))] lg:bottom-6 lg:left-[92px]">
      {cards.slice(0, DECK_DEPTH).map((c, i) => (
        <LiveCard
          key={c.key}
          card={c}
          depth={i}
          more={i === 0 ? cards.length - 1 : 0}
          onOpen={() => void markRead({ id: c.id })}
          onClose={() => setCards((prev) => prev.filter((x) => x.key !== c.key))}
        />
      ))}
    </div>
  );
}

const KIND_LOOK: Record<
  PopupKind,
  { icon: typeof MessageCircle; tile: string; heading: string; ring: string }
> = {
  ClientMessage: {
    icon: MessageCircle,
    tile: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
    heading: "live.message",
    ring: "border-sky-500/40",
  },
  TaskSoon: {
    icon: AlarmClock,
    tile: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    heading: "live.taskSoon",
    ring: "border-amber-500/40",
  },
  TaskDue: {
    icon: BellRing,
    tile: "bg-primary/15 text-primary",
    heading: "live.taskDue",
    ring: "border-primary/50",
  },
  TaskOverdue: {
    icon: AlarmClockOff,
    tile: "bg-destructive/15 text-destructive",
    heading: "overdue.title",
    ring: "border-destructive/50",
  },
  task_assigned: {
    icon: ClipboardList,
    tile: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
    heading: "live.taskAssigned",
    ring: "border-violet-500/40",
  },
};

function cardHeading(type: PopupKind): string {
  return KIND_LOOK[type].heading;
}

function LiveCard({
  card,
  depth,
  more,
  onOpen,
  onClose,
}: {
  card: Card;
  depth: number;
  more: number;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const openLink = useOpenNotificationLink();
  const [shownIn, setShownIn] = useState(false);
  const [hover, setHover] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const look = KIND_LOOK[card.type];
  const Icon = look.icon;
  const sticky = staysOpen(card.type);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShownIn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  // Fades away on its own (not a task whose time has come), but not while
  // the pointer rests on it.
  useEffect(() => {
    if (hover || sticky) return;
    const id = setTimeout(() => {
      setShownIn(false);
      setTimeout(() => closeRef.current(), 250);
    }, SHOW_FOR_MS);
    return () => clearTimeout(id);
  }, [hover, sticky]);

  function open() {
    onOpen();
    onClose();
    if (card.link) openLink(card.link);
  }

  const front = depth === 0;
  return (
    <div
      role="alert"
      aria-hidden={!front}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={front ? open : undefined}
      style={{
        zIndex: 10 - depth,
        transform: shownIn
          ? `translateY(${depth * 7}px) scale(${1 - depth * 0.05})`
          : "translateY(12px) scale(0.97)",
      }}
      className={cn(
        "flex origin-bottom items-start gap-2.5 rounded-xl border bg-popover p-2.5 pr-7 text-popover-foreground shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition-all duration-200 ease-out motion-reduce:transition-none",
        look.ring,
        front ? "pointer-events-auto relative cursor-pointer" : "absolute inset-x-0 bottom-0",
        shownIn ? "opacity-100" : "opacity-0",
        !front && "[&>*]:invisible",
      )}
    >
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", look.tile)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
          <span className="truncate">{t(look.heading)}</span>
          {more > 0 && (
            <span className="shrink-0 rounded-full bg-primary/12 px-1.5 text-[10px] font-bold normal-case tracking-normal text-primary">
              +{more}
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight">
          {card.type === "ClientMessage" ? card.title : card.body}
        </p>
        {card.type === "ClientMessage" && card.body && (
          <p className="mt-0.5 truncate text-[12px] leading-snug text-muted-foreground">
            {card.body}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label={t("overdue.close")}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded text-subtle hover:bg-accent hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ---- chime, blinking title, system notification ---- */

let audio: AudioContext | null = null;

// Two soft notes for a message, three for a task. Browsers allow sound only
// after the person has clicked somewhere on the page; before that it stays quiet.
function chime(kind: "message" | "task") {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === "suspended") void audio.resume().catch(() => undefined);
    const notes = kind === "message" ? [880, 1318.5] : [784, 988, 1175];
    const start = audio.currentTime + 0.02;
    notes.forEach((freq, i) => {
      const at = start + i * 0.14;
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(gain).connect(audio!.destination);
      osc.start(at);
      osc.stop(at + 0.25);
    });
  } catch {
    // No sound is fine; the card is the notification.
  }
}

let blink: { timer: ReturnType<typeof setInterval>; original: string } | null = null;

function blinkTitle(text: string) {
  if (blink) return;
  const original = document.title;
  let on = false;
  blink = {
    original,
    timer: setInterval(() => {
      on = !on;
      document.title = on ? `🔔 ${text}` : original;
    }, 1200),
  };
}

function stopBlink() {
  if (!blink) return;
  clearInterval(blink.timer);
  document.title = blink.original;
  blink = null;
}

async function showSystemNotification(row: LiveRow) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) return;
    await reg.showNotification(row.title, {
      body: row.body ?? "",
      tag: systemTag(row),
      icon: "/icon-192.png",
      data: { url: row.link ?? "/" },
    });
  } catch {
    // The card and the blinking title still tell the person.
  }
}
