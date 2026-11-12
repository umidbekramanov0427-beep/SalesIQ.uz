import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Clock3,
  MapPin,
  MessagesSquare,
  Moon,
  PhoneCall,
  PhoneIncoming,
  Search,
  Users,
  WifiOff,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { OnlineAvatar, ROLE_KEY, pageLabel } from "@/components/layout/OnlineTeam";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { PRESENCE_ORDER, type Presence } from "@/lib/presence";
import { cn } from "@/lib/utils";
import { useOnlineTeam, type OnlinePerson } from "@/hooks/use-crm-data";

// Foydalanuvchilar -> Jamoa holati: the whole team in one window, each with
// what they are doing right now -- on a call (with a running timer), a call
// ringing, with a client (lead card or inbox), active, idle, or offline
// (and since when) -- plus whether they started work today. Refreshes every
// 20 seconds while open; the chips on top filter by status.

const META: Record<
  Presence,
  { icon: LucideIcon; dot: string; ring: string; text: string; chip: string; key: string }
> = {
  call: {
    icon: PhoneCall,
    dot: "bg-rose-500",
    ring: "ring-rose-500",
    text: "text-rose-700 dark:text-rose-300",
    chip: "bg-rose-500/10",
    key: "team.call",
  },
  ringing: {
    icon: PhoneIncoming,
    dot: "bg-orange-500",
    ring: "ring-orange-500",
    text: "text-orange-700 dark:text-orange-300",
    chip: "bg-orange-500/10",
    key: "team.ringing",
  },
  client: {
    icon: MessagesSquare,
    dot: "bg-violet-500",
    ring: "ring-violet-500",
    text: "text-violet-700 dark:text-violet-300",
    chip: "bg-violet-500/10",
    key: "team.client",
  },
  active: {
    icon: Zap,
    dot: "bg-emerald-500",
    ring: "ring-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    chip: "bg-emerald-500/10",
    key: "team.active",
  },
  idle: {
    icon: Moon,
    dot: "bg-amber-400",
    ring: "ring-amber-400",
    text: "text-amber-700 dark:text-amber-300",
    chip: "bg-amber-500/10",
    key: "team.idle",
  },
  offline: {
    icon: WifiOff,
    dot: "bg-muted-foreground/40",
    ring: "ring-border",
    text: "text-muted-foreground",
    chip: "bg-muted",
    key: "team.offline",
  },
};

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

function timer(fromIso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const m = Math.floor(s / 60);
  return m >= 60
    ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function useAgo() {
  const { t } = useI18n();
  return (iso: string | null, now: number) => {
    if (!iso) return t("team.never");
    const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
    if (min < 1) return t("team.justNow");
    if (min < 60) return t("team.agoMin", { n: min });
    if (min < 24 * 60) return t("team.agoHour", { n: Math.floor(min / 60) });
    return t("team.agoDay", { n: Math.floor(min / 1440) });
  };
}

export function TeamStatusDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: team = [], isLoading } = useOnlineTeam(true, true);
  const [filter, setFilter] = useState<Presence | "all" | "online">("all");
  const [q, setQ] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const counts = useMemo(() => {
    const c = Object.fromEntries(PRESENCE_ORDER.map((p) => [p, 0])) as Record<Presence, number>;
    for (const p of team) c[p.presence] += 1;
    return c;
  }, [team]);
  const online = team.filter((p) => p.online).length;
  const busy = counts.call + counts.ringing + counts.client;

  const shown = team
    .filter((p) =>
      filter === "all" ? true : filter === "online" ? p.online : p.presence === filter,
    )
    .filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort(
      (a, b) =>
        PRESENCE_ORDER.indexOf(a.presence) - PRESENCE_ORDER.indexOf(b.presence) ||
        Number(b.me) - Number(a.me) ||
        a.name.localeCompare(b.name),
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[920px]">
        {/* Header: the team at a glance. */}
        <div className="border-b border-border px-6 pb-4 pt-5">
          <div className="flex items-start gap-3.5 pr-8">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <Users className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[19px] font-bold">{t("team.title")}</DialogTitle>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {t("team.summary", { online, total: team.length, busy })}
              </p>
            </div>
            <span className="mt-1 hidden items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 sm:inline-flex dark:text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {t("online.live")}
            </span>
          </div>

          {/* Status chips double as filters. */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <FilterChip
              on={filter === "all"}
              onClick={() => setFilter("all")}
              label={t("team.all")}
              n={team.length}
            />
            <FilterChip
              on={filter === "online"}
              onClick={() => setFilter("online")}
              label={t("team.online")}
              n={online}
              dot="bg-emerald-500"
            />
            {PRESENCE_ORDER.map((p) =>
              counts[p] || p === "offline" ? (
                <FilterChip
                  key={p}
                  on={filter === p}
                  onClick={() => setFilter(p)}
                  label={t(META[p].key)}
                  n={counts[p]}
                  dot={META[p].dot}
                />
              ) : null,
            )}
            <label className="ml-auto flex h-9 w-[210px] items-center gap-2 rounded-xl border border-border bg-card px-3 phone:ml-0 phone:w-full">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("online.search")}
                className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
              />
            </label>
          </div>
        </div>

        {/* Everyone, the busiest first. */}
        <div className="flex-1 overflow-y-auto bg-canvas/50 p-4">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">…</p>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("team.nobody")}</p>
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {shown.map((p) => (
                <PersonCard key={p.id} p={p} now={now} />
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3 text-[12.5px] text-muted-foreground">
          <span>{t("team.footer")}</span>
          {(user?.role === "super_admin" || user?.role === "platform_owner") && (
            <Link
              to="/admin/employees"
              onClick={onClose}
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline"
            >
              {t("team.manage")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterChip({
  on,
  onClick,
  label,
  n,
  dot,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  n: number;
  dot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium transition-colors",
        on
          ? "border-foreground/80 bg-foreground text-background"
          : "border-border bg-card text-foreground hover:border-primary/40",
      )}
    >
      {dot && <span className={cn("h-2 w-2 rounded-full", dot)} />}
      {label}
      <span className={cn("tabular-nums", on ? "opacity-80" : "text-muted-foreground")}>{n}</span>
    </button>
  );
}

function PersonCard({ p, now }: { p: OnlinePerson; now: number }) {
  const { t } = useI18n();
  const ago = useAgo();
  const m = META[p.presence];
  const page = pageLabel(t, p.path);
  const detail =
    p.presence === "call"
      ? `${p.call?.number ?? ""}${p.call ? ` · ${timer(p.call.since, now)}` : ""}`
      : p.presence === "ringing"
        ? (p.call?.number ?? "")
        : p.presence === "idle"
          ? t("team.idleFor", { t: ago(p.lastActive, now) })
          : p.presence === "offline"
            ? t("team.lastSeen", { t: ago(p.lastSeen, now) })
            : (page ?? "");
  return (
    <li
      className={cn(
        "surface-card flex items-center gap-3.5 p-3.5 transition-shadow",
        p.presence === "offline" && "opacity-75",
      )}
    >
      <span className="relative shrink-0">
        <span className={cn("block rounded-full ring-2 ring-offset-2 ring-offset-card", m.ring)}>
          <OnlineAvatar p={p} size={44} />
        </span>
        <span
          className={cn(
            "absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full text-white ring-2 ring-card",
            m.dot,
          )}
        >
          <m.icon className="h-2.5 w-2.5" />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-foreground">{p.name}</span>
          {p.me && (
            <span className="shrink-0 text-[12px] text-muted-foreground">({t("online.you")})</span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
          {p.role && ROLE_KEY[p.role] ? t(ROLE_KEY[p.role]!).split(" | ")[0] : ""}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold",
              m.chip,
              m.text,
            )}
          >
            {p.presence === "ringing" && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500 motion-reduce:animate-none" />
            )}
            {t(m.key)}
          </span>
          {detail && (
            <span className="flex min-w-0 items-center gap-1 truncate text-[12px] tabular-nums text-muted-foreground">
              {(p.presence === "active" || p.presence === "client") && (
                <MapPin className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">{detail}</span>
            </span>
          )}
        </div>
      </div>
      {p.clockIn ? (
        <span className="flex shrink-0 flex-col items-end text-right" title={t("team.workedSince")}>
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[11.5px] font-semibold text-sky-700 dark:text-sky-300">
            <Clock3 className="h-3 w-3" />
            {clock(p.clockIn)}
          </span>
          <span className="mt-0.5 text-[11px] text-subtle">{t("team.atWork")}</span>
        </span>
      ) : null}
    </li>
  );
}
