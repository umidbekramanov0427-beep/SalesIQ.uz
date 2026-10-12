import { useMemo, useState, type ComponentType } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Clock,
  Hourglass,
  Loader2,
  PhoneCall,
  PhoneMissed,
  PhoneOff,
  RotateCcw,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth";
import { InfoTip } from "@/components/layout/Primitives";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  CALL_RING_GUESS_SECONDS,
  CALL_TALK_SECONDS,
  useCallStats,
  useProfilesRaw,
  type CallStats,
} from "@/hooks/use-crm-data";

// The phone widget's "Analitika": how much the team talked, how many people
// it reached and how many picked up, every salesperson side by side (all of
// them see the whole team -- who's ahead, who's behind) and the hours and
// weekdays clients actually answer. Filters: period, people, direction.

type Period = "today" | "yesterday" | "week" | "month" | "lastMonth" | "custom";
type Direction = "all" | "outgoing" | "incoming";
type SortKey = "talk" | "attempts" | "answered" | "people" | "rate";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rangeFor(period: Period, custom: { from: string; to: string }): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  switch (period) {
    case "today":
      return { from: today, to: addDays(today, 1) };
    case "yesterday":
      return { from: addDays(today, -1), to: today };
    case "week":
      return { from: addDays(today, -6), to: addDays(today, 1) };
    case "month":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: addDays(today, 1) };
    case "lastMonth":
      return {
        from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        to: new Date(today.getFullYear(), today.getMonth(), 1),
      };
    case "custom": {
      const from = custom.from ? new Date(`${custom.from}T00:00:00`) : today;
      const to = custom.to ? addDays(new Date(`${custom.to}T00:00:00`), 1) : addDays(today, 1);
      return { from, to: to > from ? to : addDays(from, 1) };
    }
  }
}

/** 3725 -> "1:02:05", 125 -> "2:05". */
function fmtDuration(total: number): string {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function CallAnalytics() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: profiles = [] } = useProfilesRaw();
  const [period, setPeriod] = useState<Period>("today");
  const [custom, setCustom] = useState(() => ({
    from: isoDay(addDays(new Date(), -6)),
    to: isoDay(new Date()),
  }));
  const [people, setPeople] = useState<string[]>([]);
  const [direction, setDirection] = useState<Direction>("all");
  const [sort, setSort] = useState<SortKey>("talk");

  const range = useMemo(() => rangeFor(period, custom), [period, custom]);
  const { data, isLoading, isFetching, error } = useCallStats({
    from: range.from,
    to: range.to,
    profileIds: people,
    direction: direction === "all" ? null : direction,
  });

  const team = profiles.filter((p) => p.role !== "platform_owner");
  const nameOf = (id: string | null) =>
    (id && team.find((p) => p.id === id)?.full_name) ||
    (id ? t("callStats.formerUser") : t("callStats.unknownRep"));

  const filtered = people.length > 0 || direction !== "all" || period !== "today";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Filters, one row */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-5 py-3">
        <div className="flex rounded-xl bg-muted/80 p-1">
          {(["today", "yesterday", "week", "month", "lastMonth", "custom"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "h-8 rounded-lg px-3 text-[12.5px] font-medium transition-colors",
                period === p
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`callStats.period.${p}`)}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <input
              type="date"
              value={custom.from}
              max={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              className="h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground outline-none [color-scheme:light] focus:border-primary dark:[color-scheme:dark]"
            />
            —
            <input
              type="date"
              value={custom.to}
              min={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              className="h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground outline-none [color-scheme:light] focus:border-primary dark:[color-scheme:dark]"
            />
          </span>
        )}
        <PeoplePicker team={team} value={people} onChange={setPeople} meId={user?.id ?? null} />
        <div className="flex rounded-xl bg-muted/80 p-1">
          {(["all", "outgoing", "incoming"] as Direction[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={cn(
                "h-8 rounded-lg px-3 text-[12.5px] font-medium transition-colors",
                direction === d
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`callStats.direction.${d}`)}
            </button>
          ))}
        </div>
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setPeriod("today");
              setPeople([]);
              setDirection("all");
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {t("callStats.reset")}
          </button>
        )}
        {isFetching && <Loader2 className="ml-auto h-4 w-4 animate-spin text-subtle" />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : error || !data ? (
          <p className="mx-auto max-w-md py-20 text-center text-sm text-muted-foreground">
            {t("callStats.notReady")}
          </p>
        ) : (
          <Report
            data={data}
            sort={sort}
            onSort={setSort}
            nameOf={nameOf}
            team={people.length ? team.filter((p) => people.includes(p.id)) : team}
            meId={user?.id ?? null}
            showTrend={period !== "today" && period !== "yesterday"}
          />
        )}
      </div>
    </div>
  );
}

function PeoplePicker({
  team,
  value,
  onChange,
  meId,
}: {
  team: { id: string; full_name: string | null; email: string | null }[];
  value: string[];
  onChange: (v: string[]) => void;
  meId: string | null;
}) {
  const { t } = useI18n();
  const label =
    value.length === 0
      ? t("callStats.everyone")
      : value.length === 1
        ? (team.find((p) => p.id === value[0])?.full_name ?? "1")
        : t("callStats.nPeople", { count: value.length });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 max-w-[220px] items-center gap-2 rounded-xl border px-3 text-[12.5px] font-medium transition-colors",
            value.length
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border bg-background text-foreground hover:border-primary/40",
          )}
        >
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="flex gap-1 border-b border-border p-1 pb-1.5">
          <button
            type="button"
            onClick={() => onChange([])}
            className="h-7 flex-1 rounded-md text-[12px] font-medium hover:bg-accent"
          >
            {t("callStats.everyone")}
          </button>
          {meId && (
            <button
              type="button"
              onClick={() => onChange([meId])}
              className="h-7 flex-1 rounded-md text-[12px] font-medium hover:bg-accent"
            >
              {t("callStats.onlyMe")}
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto pt-1">
          {team.map((p) => {
            const on = value.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
              >
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="truncate">{p.full_name || p.email}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "text-foreground",
  hero,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  hero?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-4",
        hero && "border-primary/30 bg-primary/[0.06]",
      )}
    >
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className={cn("mt-1.5 text-[26px] font-extrabold leading-none tabular-nums", tone)}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Report({
  data,
  sort,
  onSort,
  nameOf,
  team,
  meId,
  showTrend,
}: {
  data: CallStats;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  nameOf: (id: string | null) => string;
  team: { id: string }[];
  meId: string | null;
  showTrend: boolean;
}) {
  const { t } = useI18n();
  const x = data.totals;
  const reached = x.attempts - x.failed;
  const estimated = x.missed_estimated > 0;

  // Everyone in the team gets a row, with zeros if they made no calls.
  const rows = useMemo(() => {
    const byId = new Map(data.reps.map((r) => [r.profile_id ?? "", r]));
    const zero = {
      attempts: 0,
      outgoing: 0,
      incoming: 0,
      people: 0,
      answered: 0,
      talked: 0,
      missed: 0,
      failed: 0,
      talk_seconds: 0,
      missed_seconds: 0,
    };
    const list = team.map((p) => ({
      ...zero,
      ...byId.get(p.id),
      profile_id: p.id as string | null,
    }));
    for (const r of data.reps)
      if (!team.some((p) => p.id === r.profile_id) && r.attempts > 0) list.push(r);
    const key = (r: (typeof list)[number]) =>
      sort === "talk"
        ? r.talk_seconds
        : sort === "attempts"
          ? r.attempts
          : sort === "answered"
            ? r.answered
            : sort === "people"
              ? r.people
              : pct(r.answered, r.attempts - r.failed);
    return list.sort((a, b) => key(b) - key(a) || b.attempts - a.attempts);
  }, [data.reps, team, sort]);
  const maxTalk = Math.max(1, ...rows.map((r) => r.talk_seconds));

  return (
    <div className="space-y-6">
      {/* Headline numbers */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          hero
          icon={Timer}
          label={t("callStats.talkTime")}
          value={fmtDuration(x.talk_seconds)}
          sub={t("callStats.avgTalk", {
            time: fmtDuration(x.answered ? x.talk_seconds / x.answered : 0),
          })}
        />
        <Tile
          icon={PhoneCall}
          label={t("callStats.attempts")}
          value={String(x.attempts)}
          sub={t("callStats.inOut", { out: x.outgoing, in: x.incoming })}
        />
        <Tile
          icon={Users}
          label={t("callStats.people")}
          value={String(x.people)}
          sub={t("callStats.perPerson", {
            n: x.people ? (x.attempts / x.people).toFixed(1) : "0",
          })}
        />
        <Tile
          icon={Check}
          label={t("callStats.answered")}
          value={String(x.answered)}
          sub={t("callStats.ofReached", { pct: pct(x.answered, reached) })}
          tone="text-emerald-600 dark:text-emerald-400"
        />
        <Tile
          icon={Clock}
          label={t("callStats.talked", { s: CALL_TALK_SECONDS })}
          value={String(x.talked)}
          sub={t("callStats.ofAnswered", { pct: pct(x.talked, x.answered) })}
          tone="text-primary"
        />
        <Tile
          icon={PhoneMissed}
          label={t("callStats.missed")}
          value={String(x.missed)}
          sub={
            x.missed_incoming
              ? t("callStats.missedIncoming", { n: x.missed_incoming })
              : t("callStats.ofReached", { pct: pct(x.missed, reached) })
          }
          tone="text-amber-600 dark:text-amber-400"
        />
        <Tile
          icon={Hourglass}
          label={t("callStats.missedTime")}
          value={`${estimated ? "≈ " : ""}${fmtDuration(x.missed_seconds)}`}
          {...(estimated
            ? { sub: t("callStats.missedTimeHint", { s: CALL_RING_GUESS_SECONDS }) }
            : {})}
        />
        <Tile
          icon={PhoneOff}
          label={t("callStats.failed")}
          value={String(x.failed)}
          sub={t("callStats.failedHint")}
          tone={x.failed ? "text-destructive" : "text-foreground"}
        />
      </div>

      {/* Salespeople side by side */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <Trophy className="h-4 w-4 text-amber-500" />
          <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-foreground">
            {t("callStats.team")}
            <InfoTip text={t("callStats.teamHint")} />
          </h3>
          <span className="text-[12px] text-muted-foreground">{t("callStats.teamHint")}</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-4 py-2.5">#</th>
                <th className="px-2 py-2.5">{t("callStats.col.rep")}</th>
                <SortTh k="talk" sort={sort} onSort={onSort} label={t("callStats.col.talk")} wide />
                <SortTh
                  k="attempts"
                  sort={sort}
                  onSort={onSort}
                  label={t("callStats.col.attempts")}
                />
                <SortTh k="people" sort={sort} onSort={onSort} label={t("callStats.col.people")} />
                <SortTh
                  k="answered"
                  sort={sort}
                  onSort={onSort}
                  label={t("callStats.col.answered")}
                />
                <th className="px-3 py-2.5 text-right">{t("callStats.col.talked")}</th>
                <th className="px-3 py-2.5 text-right">{t("callStats.col.missed")}</th>
                <SortTh k="rate" sort={sort} onSort={onSort} label={t("callStats.col.rate")} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => {
                const me = r.profile_id === meId;
                const rate = pct(r.answered, r.attempts - r.failed);
                return (
                  <tr
                    key={r.profile_id ?? "none"}
                    className={cn("tabular-nums", me && "bg-primary/[0.06]")}
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "grid h-6 w-6 place-items-center rounded-full text-[11.5px] font-bold",
                          i === 0 && r.attempts > 0
                            ? "bg-amber-400/20 text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
                          {nameOf(r.profile_id).slice(0, 1).toUpperCase()}
                        </span>
                        <span className="truncate font-semibold text-foreground">
                          {nameOf(r.profile_id)}
                        </span>
                        {me && (
                          <span className="rounded-md bg-primary/15 px-1.5 text-[10.5px] font-bold text-primary">
                            {t("callStats.you")}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${(r.talk_seconds / maxTalk) * 100}%` }}
                          />
                        </span>
                        <span className="font-semibold text-foreground">
                          {fmtDuration(r.talk_seconds)}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-foreground">
                      {r.attempts}
                      <span className="ml-1.5 text-[11px] text-subtle">
                        <ArrowUpRight className="inline h-3 w-3" />
                        {r.outgoing} <ArrowDownLeft className="inline h-3 w-3" />
                        {r.incoming}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-foreground">{r.people}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {r.answered}
                    </td>
                    <td className="px-3 py-2.5 text-right text-foreground">{r.talked}</td>
                    <td className="px-3 py-2.5 text-right text-amber-600 dark:text-amber-400">
                      {r.missed}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[12px] font-semibold",
                          r.attempts === 0
                            ? "text-subtle"
                            : rate >= 50
                              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                              : rate >= 30
                                ? "bg-amber-500/12 text-amber-700 dark:text-amber-400"
                                : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {r.attempts ? `${rate}%` : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* When clients pick up */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <HourChart hours={data.hours} />
        <WeekdayChart days={data.weekdays} />
      </div>

      {showTrend && data.days.length > 1 && <DayChart days={data.days} />}
    </div>
  );
}

function SortTh({
  k,
  sort,
  onSort,
  label,
  wide,
}: {
  k: SortKey;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  label: string;
  wide?: boolean;
}) {
  return (
    <th className={cn("px-3 py-2.5", wide ? "text-left" : "text-right")}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground",
          sort === k && "text-primary",
        )}
      >
        {label}
        {sort === k && "↓"}
      </button>
    </th>
  );
}

function Legend() {
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> {t("callStats.answered")}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-foreground/15" /> {t("callStats.notAnswered")}
      </span>
    </span>
  );
}

/** Stacked bars: picked up (green) on not picked up (neutral), with a hover readout. */
function Bars({
  items,
  height = 150,
  best,
}: {
  items: { key: string; label: string; attempts: number; answered: number }[];
  height?: number;
  best?: Set<string>;
}) {
  const { t } = useI18n();
  const max = Math.max(1, ...items.map((i) => i.attempts));
  return (
    <div className="flex items-end gap-1" style={{ height: height + 22 }}>
      {items.map((i) => {
        const h = (i.attempts / max) * height;
        const a = i.attempts ? (i.answered / i.attempts) * h : 0;
        return (
          <div key={i.key} className="group relative flex min-w-0 flex-1 flex-col items-center">
            <div className="flex w-full max-w-[34px] flex-col justify-end" style={{ height }}>
              <div
                className="w-full rounded-t-[4px] bg-foreground/15 transition-colors group-hover:bg-foreground/25"
                style={{ height: Math.max(0, h - a - (a > 0 ? 2 : 0)) }}
              />
              {a > 0 && (
                <div
                  className={cn(
                    "mt-[2px] w-full bg-emerald-500 transition-[filter] group-hover:brightness-110",
                    h - a < 1 && "rounded-t-[4px]",
                  )}
                  style={{ height: a }}
                />
              )}
            </div>
            <span
              className={cn(
                "mt-1.5 text-[10.5px] tabular-nums",
                best?.has(i.key)
                  ? "font-bold text-emerald-600 dark:text-emerald-400"
                  : "text-subtle",
              )}
            >
              {i.label}
            </span>
            {i.attempts > 0 && (
              <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg border border-border bg-popover px-2 py-1 text-[11.5px] text-popover-foreground shadow-md group-hover:block">
                <b>{i.label}</b> · {t("callStats.tipAnswered", { a: i.answered, n: i.attempts })} ·{" "}
                {pct(i.answered, i.attempts)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-foreground">
            {title}
            <InfoTip text={hint || t("info.fallback", { name: title })} />
          </h3>
          {hint && <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>}
        </div>
        <Legend />
      </div>
      {children}
    </section>
  );
}

function HourChart({ hours }: { hours: CallStats["hours"] }) {
  const { t } = useI18n();
  const byHour = new Map(hours.map((h) => [h.hour, h]));
  const withData = hours.filter((h) => h.attempts > 0).map((h) => h.hour);
  const lo = Math.min(8, ...withData);
  const hi = Math.max(21, ...withData);
  const items = Array.from({ length: hi - lo + 1 }, (_, i) => {
    const hour = lo + i;
    const h = byHour.get(hour);
    return {
      key: String(hour),
      label: String(hour),
      attempts: h?.attempts ?? 0,
      answered: h?.answered ?? 0,
    };
  });
  // Best hours: highest pick-up rate among hours with enough calls to mean something.
  const ranked = items
    .filter((i) => i.attempts >= 3)
    .sort((a, b) => b.answered / b.attempts - a.answered / a.attempts);
  const best = new Set(ranked.slice(0, 3).map((i) => i.key));
  const top = ranked[0];
  return (
    <ChartCard
      title={t("callStats.byHour")}
      hint={
        top
          ? t("callStats.bestHour", {
              from: `${top.label}:00`,
              to: `${Number(top.label) + 1}:00`,
              pct: pct(top.answered, top.attempts),
            })
          : t("callStats.byHourHint")
      }
    >
      <Bars items={items} best={best} />
    </ChartCard>
  );
}

function WeekdayChart({ days }: { days: CallStats["weekdays"] }) {
  const { t } = useI18n();
  const byDay = new Map(days.map((d) => [d.day, d]));
  const items = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    key: String(d),
    label: t(`callStats.wd.${d}`),
    attempts: byDay.get(d)?.attempts ?? 0,
    answered: byDay.get(d)?.answered ?? 0,
  }));
  return (
    <ChartCard title={t("callStats.byWeekday")}>
      <Bars items={items} />
    </ChartCard>
  );
}

function DayChart({ days }: { days: CallStats["days"] }) {
  const { t } = useI18n();
  const items = days.map((d) => ({
    key: d.day,
    label: `${d.day.slice(8, 10)}.${d.day.slice(5, 7)}`,
    attempts: d.attempts,
    answered: d.answered,
  }));
  return (
    <ChartCard title={t("callStats.byDay")}>
      <Bars items={items} height={120} />
    </ChartCard>
  );
}
