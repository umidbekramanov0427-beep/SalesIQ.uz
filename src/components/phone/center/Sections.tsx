import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BellRing,
  Cable,
  CheckCircle2,
  Clock,
  Delete,
  Download,
  ExternalLink,
  Hash,
  Headphones,
  MonitorDown,
  Pause,
  Percent,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Play,
  Search,
  Settings,
  Smartphone,
  Star,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { RecordingAudio } from "@/components/audio/RecordingLink";
import { DeskBlock, DeskKpi } from "@/components/dashboard/desk/DeskParts";
import { SettingRow, SettingRows, StatusChip } from "@/components/layout/Primitives";
import { usePhone } from "@/components/phone/PhoneProvider";
import { TELEPHONY_PROVIDERS, useLeadLookup, useTelephonyStatus } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { clock, type PcCall, type PcOutcome, type PhoneCenterData } from "@/lib/phone-center";
import { isIos, promptInstall, useInstallState } from "@/lib/pwa";
import { cn } from "@/lib/utils";
import type { PcSection } from "./PhoneCenterPage";

const OUTCOME_TONE: Record<PcOutcome, string> = {
  answered: "text-emerald-600 dark:text-emerald-400",
  missed: "text-rose-600 dark:text-rose-400",
  noAnswer: "text-amber-600 dark:text-amber-400",
  ringing: "text-primary",
  failed: "text-rose-600 dark:text-rose-400",
};

function CallGlyph({ c }: { c: Pick<PcCall, "outcome" | "direction"> }) {
  const cls = cn("h-4 w-4 shrink-0", OUTCOME_TONE[c.outcome]);
  if (c.outcome === "missed") return <PhoneMissed className={cls} />;
  return c.direction === "incoming" ? (
    <PhoneIncoming className={cls} />
  ) : (
    <PhoneOutgoing className={cls} />
  );
}

const timeOf = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function useIsAdmin() {
  const { user } = useAuth();
  return user?.role === "super_admin" || user?.role === "platform_owner";
}

/* ---- Asosiy ---------------------------------------------------------------- */

export function OverviewSection({
  data,
  onSection,
}: {
  data: PhoneCenterData;
  onSection: (s: PcSection) => void;
}) {
  const { t } = useI18n();
  const x = data.totals;
  const top = data.operators.filter((o) => o.total > 0).slice(0, 6);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DeskKpi
          tipKey="ptel.k.total"
          label={t("ptel.k.total")}
          icon={Phone}
          tone="primary"
          rawValue={x.total}
          value={x.total}
          prevText={t("ptel.k.totalHint", { i: x.incoming, o: x.outgoing })}
        />
        <DeskKpi
          tipKey="ptel.k.missed"
          label={t("ptel.k.missed")}
          icon={PhoneMissed}
          tone="rose"
          rawValue={x.missed}
          value={x.missed}
          prevText={t("ptel.k.missedHint")}
        />
        <DeskKpi
          tipKey="ptel.k.rate"
          label={t("ptel.k.rate")}
          icon={Percent}
          tone="emerald"
          rawValue={x.answerRate}
          value={`${x.answerRate}%`}
          prevText={t("ptel.k.rateHint", { n: x.answered })}
        />
        <DeskKpi
          tipKey="ptel.k.talk"
          label={t("ptel.k.talk")}
          icon={Timer}
          tone="amber"
          rawValue={x.talkSeconds}
          value={clock(x.talkSeconds)}
          prevText={t("ptel.k.avg", { v: clock(x.avgSeconds) })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DeskBlock tipKey="ptel.b.quick" title={t("ptel.b.quick")} icon={Phone} tone="emerald">
          <QuickDial />
        </DeskBlock>
        <DeskBlock
          tipKey="ptel.b.top"
          title={t("ptel.b.top")}
          icon={Headphones}
          tone="amber"
          actions={
            <button
              type="button"
              onClick={() => onSection("operators")}
              className="text-[12.5px] font-semibold text-primary hover:underline"
            >
              {t("ptel.more")}
            </button>
          }
        >
          {top.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              {t("ptel.noCalls")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {top.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2 text-[13px]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[12px] font-bold text-primary">
                    {o.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {o.name}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {t("ptel.nCalls", { n: o.total })}
                  </span>
                  <span className="w-16 text-right tabular-nums text-foreground">
                    {clock(o.talkSeconds)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DeskBlock>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["dial", "auto", "voice", "rating"] as PcSection[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSection(s)}
            className="group flex items-center gap-3 surface-card p-3.5 text-left transition-colors hover:border-primary/40"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-foreground">
                {t(`ptel.s.${s}`)}
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                {t(`ptel.d.${s}`)}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickDial() {
  const { t } = useI18n();
  const { call, live, enabled } = usePhone();
  const [n, setN] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (n.trim()) call(n.trim());
      }}
      className="flex gap-2"
    >
      <input
        value={n}
        onChange={(e) => setN(e.target.value.replace(/[^\d+*#\s()-]/g, ""))}
        inputMode="tel"
        placeholder={t("phone.dialPlaceholder")}
        className="h-10 min-w-0 flex-1 rounded-[6px] border border-border bg-background px-3 text-[14px] tabular-nums outline-none focus:border-primary phone:text-base"
      />
      <button
        type="submit"
        disabled={!enabled || !n.trim() || !!live}
        className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-emerald-600 px-4 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <Phone className="h-4 w-4" />
        {t("phone.call")}
      </button>
    </form>
  );
}

/* ---- Telefon (the dialer) --------------------------------------------------- */

const KEYS: [string, string][] = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
];

export function DialerSection({
  data,
  compact = false,
}: {
  data: PhoneCenterData | undefined;
  /** Only the keypad (the «Terish paneli» layout keeps it on the left). */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const { call, live, enabled, calling } = usePhone();
  const [n, setN] = useState("");
  const lookup = useLeadLookup(n.replace(/\D/g, "").length >= 7 ? n : "");
  const match = lookup.data?.[0];
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: PcCall[] = [];
    for (const c of data?.calls ?? []) {
      const k = c.phone.replace(/\D/g, "");
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(c);
      if (out.length >= 8) break;
    }
    return out;
  }, [data?.calls]);
  const connected = !!data?.provider?.connected;

  function dial() {
    const v = n.trim();
    if (!v || live) return;
    call(v, match ? { leadId: match.leadId, name: match.name } : {});
  }

  // Typing on the keyboard dials too (Enter calls, Backspace erases).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
        return;
      if (/^[\d*#+]$/.test(e.key)) setN((v) => v + e.key);
      else if (e.key === "Backspace") setN((v) => v.slice(0, -1));
      else if (e.key === "Enter") dial();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pad = (
    <section className="surface-card p-5">
      <div className="flex items-center justify-between gap-2">
        <StatusChip state={connected ? "ok" : "warn"}>
          {connected ? t("ptel.ready") : t("ptel.notConnected")}
        </StatusChip>
        {data?.myExtension ? (
          <span className="text-[12.5px] font-semibold tabular-nums text-muted-foreground">
            {t("ptel.ext", { n: data.myExtension })}
          </span>
        ) : (
          <span className="text-[12px] text-muted-foreground">{t("ptel.noExt")}</span>
        )}
      </div>
      <div className="mt-4 rounded-xl border border-border bg-surface px-4 py-4 text-center">
        <input
          value={n}
          onChange={(e) => setN(e.target.value.replace(/[^\d+*#\s()-]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && dial()}
          inputMode="tel"
          placeholder={t("ptel.dialHere")}
          aria-label={t("ptel.dialHere")}
          className="w-full bg-transparent text-center font-display text-[28px] font-semibold tabular-nums tracking-wide text-foreground outline-none placeholder:text-[20px] placeholder:font-medium placeholder:text-subtle phone:text-[24px]"
        />
        <p className="mt-1 h-5 truncate text-[13px] text-muted-foreground">
          {match ? (
            <Link
              to="/crm/leads/$leadId"
              params={{ leadId: match.leadId }}
              className="font-semibold text-primary hover:underline"
            >
              {match.name || t("phone.unknown")}
            </Link>
          ) : n.replace(/\D/g, "").length >= 7 && !lookup.isFetching ? (
            t("ptel.newNumber")
          ) : null}
        </p>
      </div>
      <div className="mx-auto mt-4 grid max-w-[300px] grid-cols-3 gap-3">
        {KEYS.map(([k, sub]) => (
          <button
            key={k}
            type="button"
            onClick={() => setN((v) => v + k)}
            onContextMenu={(e) => {
              if (k === "0") {
                e.preventDefault();
                setN((v) => v + "+");
              }
            }}
            className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-border bg-surface text-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.06] active:scale-95"
          >
            <span className="leading-none">
              <span className="block text-[22px] font-semibold tabular-nums">{k}</span>
              <span className="block h-3 text-[9.5px] font-semibold tracking-[0.12em] text-muted-foreground">
                {sub}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="mx-auto mt-4 grid max-w-[300px] grid-cols-3 items-center gap-3">
        <button
          type="button"
          onClick={() => setN("")}
          disabled={!n}
          className="mx-auto text-[12.5px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          {t("ptel.clear")}
        </button>
        <button
          type="button"
          onClick={dial}
          disabled={!enabled || !n.trim() || !!live || calling}
          aria-label={t("phone.call")}
          className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-600 text-white shadow-[0_6px_16px_-6px_rgb(5_150_105/0.6)] transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          <Phone className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={() => setN((v) => v.slice(0, -1))}
          disabled={!n}
          aria-label={t("phone.erase")}
          className="mx-auto grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <Delete className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-4 text-center text-[12px] leading-snug text-muted-foreground">
        {t("ptel.dialHint")}
      </p>
    </section>
  );
  if (compact) return pad;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {pad}

      <DeskBlock tipKey="ptel.b.recent" title={t("ptel.b.recent")} icon={Clock} tone="sky">
        {recent.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">{t("ptel.noCalls")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                <CallGlyph c={c} />
                <button
                  type="button"
                  onClick={() => setN(c.phone)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate font-medium text-foreground">
                    {c.name || c.phone}
                  </span>
                  <span className="block truncate text-[12px] tabular-nums text-muted-foreground">
                    {c.name ? `${c.phone} · ` : ""}
                    {timeOf(c.at)}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!enabled || !!live}
                  onClick={() =>
                    call(c.phone, {
                      ...(c.leadId ? { leadId: c.leadId } : {}),
                      ...(c.name ? { name: c.name } : {}),
                    })
                  }
                  title={t("phone.callBack")}
                  className="grid h-8 w-8 place-items-center rounded-[6px] bg-emerald-500/12 text-emerald-700 hover:bg-emerald-600 hover:text-white disabled:opacity-40 dark:text-emerald-400"
                >
                  <Phone className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DeskBlock>
    </div>
  );
}

/* ---- Qo'ng'iroqlar -------------------------------------------------------- */

type Dir = "all" | "incoming" | "outgoing" | "missed" | "answered";

export function CallsSection({ data }: { data: PhoneCenterData }) {
  const { t } = useI18n();
  const { call, live, enabled } = usePhone();
  const [dir, setDir] = useState<Dir>("all");
  const [who, setWho] = useState("");
  const [q, setQ] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const names = useMemo(() => new Map(data.operators.map((o) => [o.id, o.name])), [data.operators]);
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const rows = data.calls.filter((c) => {
    if (dir === "incoming" && c.direction !== "incoming") return false;
    if (dir === "outgoing" && c.direction !== "outgoing") return false;
    if (dir === "missed" && c.outcome !== "missed") return false;
    if (dir === "answered" && c.outcome !== "answered") return false;
    if (who && c.by !== who) return false;
    if (!needle) return true;
    return (
      c.name.toLowerCase().includes(needle) ||
      (digits.length > 2 && c.phone.replace(/\D/g, "").includes(digits))
    );
  });
  return (
    <section className="surface-card overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div
          role="tablist"
          className="ctl-track inline-flex items-center gap-0.5 rounded-[6px] p-0.5"
        >
          {(["all", "incoming", "outgoing", "missed", "answered"] as Dir[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={dir === k}
              data-state={dir === k ? "active" : "inactive"}
              onClick={() => setDir(k)}
              className="ctl-tab h-8 rounded-[4px] px-3 text-[12.5px] font-semibold"
            >
              {t(`ptel.dir.${k}`)}
            </button>
          ))}
        </div>
        <select
          value={who}
          onChange={(e) => setWho(e.target.value)}
          className="h-9 rounded-[6px] border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary"
        >
          <option value="">{t("ptel.allOperators")}</option>
          {data.operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-[6px] border border-border bg-background px-2.5 focus-within:border-primary">
          <Search className="h-4 w-4 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("phone.search")}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle phone:text-base"
          />
        </label>
        <span className="text-[12.5px] tabular-nums text-muted-foreground">
          {t("ptel.nCalls", { n: rows.length })}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-[12px] text-muted-foreground">
              <th className="py-2.5 pl-4 pr-3 font-semibold">{t("ptel.col.time")}</th>
              <th className="px-3 py-2.5 font-semibold">{t("phone.col.name")}</th>
              <th className="px-3 py-2.5 font-semibold">{t("phone.col.phone")}</th>
              <th className="px-3 py-2.5 font-semibold">{t("ptel.col.operator")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("phone.col.duration")}</th>
              <th className="px-3 py-2.5 font-semibold">{t("phone.col.status")}</th>
              <th className="py-2.5 pl-3 pr-4" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  {t("ptel.noCalls")}
                </td>
              </tr>
            )}
            {rows.slice(0, 300).map((c) => (
              <CallRow
                key={c.id}
                c={c}
                operator={c.by ? (names.get(c.by) ?? "—") : "—"}
                playing={playing === c.id}
                onPlay={() => setPlaying(playing === c.id ? null : c.id)}
                canCall={enabled && !live}
                onCall={() =>
                  call(c.phone, {
                    ...(c.leadId ? { leadId: c.leadId } : {}),
                    ...(c.name ? { name: c.name } : {}),
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CallRow({
  c,
  operator,
  playing,
  onPlay,
  canCall,
  onCall,
}: {
  c: PcCall;
  operator: string;
  playing: boolean;
  onPlay: () => void;
  canCall: boolean;
  onCall: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <tr className="border-b border-border/70 hover:bg-accent/40">
        <td className="py-2.5 pl-4 pr-3">
          <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
            <CallGlyph c={c} />
            {timeOf(c.at)}
          </span>
        </td>
        <td className="max-w-[220px] px-3 py-2.5">
          {c.leadId ? (
            <Link
              to="/crm/leads/$leadId"
              params={{ leadId: c.leadId }}
              className="block truncate font-medium text-foreground hover:text-primary hover:underline"
            >
              {c.name || t("phone.unknown")}
            </Link>
          ) : (
            <span className="block truncate font-medium text-foreground">
              {c.name || t("phone.unknown")}
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 tabular-nums text-foreground/85">{c.phone || "—"}</td>
        <td className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground">{operator}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
          {clock(c.seconds)}
        </td>
        <td className="px-3 py-2.5" title={c.error ?? undefined}>
          <span className={cn("font-medium", OUTCOME_TONE[c.outcome])}>
            {t(`phone.outcome.${c.outcome}`)}
          </span>
        </td>
        <td className="py-2.5 pl-3 pr-4">
          <span className="flex items-center justify-end gap-1">
            {c.recording && (
              <button
                type="button"
                onClick={onPlay}
                title={t("phone.listen")}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-[6px]",
                  playing
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
            )}
            {c.phone && (
              <button
                type="button"
                onClick={onCall}
                disabled={!canCall}
                title={t("phone.callBack")}
                className="grid h-8 w-8 place-items-center rounded-[6px] bg-emerald-500/12 text-emerald-700 hover:bg-emerald-600 hover:text-white disabled:opacity-40 dark:text-emerald-400"
              >
                <Phone className="h-4 w-4" />
              </button>
            )}
          </span>
        </td>
      </tr>
      {playing && c.recording && (
        <tr className="border-b border-border/70">
          <td colSpan={7} className="px-4 pb-3 pt-1">
            <RecordingAudio url={c.recording} controls autoPlay className="h-9 w-full" />
          </td>
        </tr>
      )}
    </>
  );
}

/* ---- Operatorlar ------------------------------------------------------------ */

export function OperatorsSection({ data }: { data: PhoneCenterData }) {
  const { t } = useI18n();
  const admin = useIsAdmin();
  const th = "px-3 py-2.5 text-right font-semibold whitespace-nowrap";
  return (
    <DeskBlock
      tipKey="ptel.b.operators"
      title={t("ptel.s.operators")}
      icon={Headphones}
      tone="amber"
      actions={
        admin ? (
          <Link
            to="/admin/telephony"
            className="text-[12.5px] font-semibold text-primary hover:underline"
          >
            {t("ptel.setExt")}
          </Link>
        ) : undefined
      }
    >
      <div className="-mx-4 -my-4 overflow-x-auto sm:-mx-5 sm:-my-5">
        <table className="w-full min-w-[980px] text-[13px]">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-[12px] text-muted-foreground">
              <th className="py-2.5 pl-4 pr-3 font-semibold">{t("ptel.col.operator")}</th>
              <th className="px-3 py-2.5 font-semibold">{t("ptel.col.ext")}</th>
              <th className={th}>{t("ptel.col.total")}</th>
              <th className={th}>{t("ptel.col.in")}</th>
              <th className={th}>{t("ptel.col.out")}</th>
              <th className={th}>{t("ptel.col.missed")}</th>
              <th className={th}>{t("ptel.col.rate")}</th>
              <th className={th}>{t("ptel.col.talk")}</th>
              <th className={th}>{t("ptel.col.avg")}</th>
              <th className={th}>{t("ptel.col.longest")}</th>
              <th className={th}>{t("ptel.col.ai")}</th>
              <th className="py-2.5 pl-3 pr-4 text-right font-semibold">{t("ptel.col.last")}</th>
            </tr>
          </thead>
          <tbody>
            {data.operators.map((o) => (
              <tr key={o.id} className="border-b border-border/70 last:border-0 hover:bg-accent/40">
                <td className="py-2.5 pl-4 pr-3">
                  <span className="block font-semibold text-foreground">{o.name}</span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {o.role ? t(`distrib.role.${o.role}`) : "—"}
                  </span>
                </td>
                <td className="px-3 py-2.5 tabular-nums">
                  {o.extension ? (
                    <span className="inline-flex items-center gap-1 rounded-[4px] bg-surface px-1.5 py-0.5 font-semibold">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      {o.extension}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{o.total}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{o.incoming}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{o.outgoing}</td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right tabular-nums",
                    o.missed > 0 && "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {o.missed}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {o.total ? `${o.answerRate}%` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{clock(o.talkSeconds)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{clock(o.avgSeconds)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{clock(o.longest)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {o.aiScore === null ? "—" : <ScoreChip score={o.aiScore} />}
                </td>
                <td className="py-2.5 pl-3 pr-4 text-right tabular-nums text-muted-foreground">
                  {o.lastAt ? timeOf(o.lastAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DeskBlock>
  );
}

function ScoreChip({ score }: { score: number }) {
  return (
    <span
      className={cn(
        "inline-block min-w-[38px] rounded-[4px] px-1.5 py-0.5 text-center text-[12px] font-semibold tabular-nums",
        score >= 80
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
          : score >= 60
            ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
            : "bg-rose-500/12 text-rose-700 dark:text-rose-300",
      )}
    >
      {score}
    </span>
  );
}

/* ---- Baholash --------------------------------------------------------------- */

export function RatingSection({ data }: { data: PhoneCenterData }) {
  const { t } = useI18n();
  const rated = data.operators
    .filter((o) => o.aiScore !== null)
    .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0));
  const names = new Map(data.operators.map((o) => [o.id, o.name]));
  return (
    <div className="space-y-4">
      <DeskBlock
        tipKey="ptel.b.rating"
        title={t("ptel.b.rating")}
        icon={Star}
        tone="amber"
        actions={
          <Link
            to="/audio-analytics"
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
          >
            {t("ptel.openAudio")} <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        }
      >
        {rated.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">{t("ptel.noScores")}</p>
        ) : (
          <ul className="space-y-2.5">
            {rated.map((o) => (
              <li
                key={o.id}
                className="grid grid-cols-[minmax(0,200px)_1fr_auto] items-center gap-3 text-[13px]"
              >
                <span className="truncate font-medium text-foreground">{o.name}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      (o.aiScore ?? 0) >= 80
                        ? "bg-emerald-500"
                        : (o.aiScore ?? 0) >= 60
                          ? "bg-amber-500"
                          : "bg-rose-500",
                    )}
                    style={{ width: `${o.aiScore}%` }}
                  />
                </span>
                <span className="w-32 text-right tabular-nums text-muted-foreground">
                  <b className="font-semibold text-foreground">{o.aiScore}</b> ·{" "}
                  {t("ptel.nAnalyzed", { n: o.analyzed })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DeskBlock>
      <DeskBlock
        tipKey="ptel.b.scored"
        title={t("ptel.b.scored")}
        icon={CheckCircle2}
        tone="emerald"
      >
        {data.scores.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">{t("ptel.noScores")}</p>
        ) : (
          <ul className="-my-1 divide-y divide-border">
            {data.scores.slice(0, 60).map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-2.5 text-[13px]">
                <ScoreChip score={s.score} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {s.by ? (names.get(s.by) ?? "—") : "—"}
                    </span>
                    <span className="tabular-nums">{timeOf(s.at)}</span>
                    {s.phone && <span className="tabular-nums">{s.phone}</span>}
                    <span className="tabular-nums">{clock(s.seconds)}</span>
                    {s.leadId && (
                      <Link
                        to="/crm/leads/$leadId"
                        params={{ leadId: s.leadId }}
                        className="font-semibold text-primary hover:underline"
                      >
                        {t("phone.openLead")}
                      </Link>
                    )}
                  </span>
                  {s.summary && (
                    <span className="mt-0.5 line-clamp-2 block text-foreground/85">
                      {s.summary}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DeskBlock>
    </div>
  );
}

/* ---- Ulanish ----------------------------------------------------------------- */

export function ConnectSection({ data }: { data: PhoneCenterData | undefined }) {
  const { t } = useI18n();
  const admin = useIsAdmin();
  const { data: statuses } = useTelephonyStatus();
  const providers = TELEPHONY_PROVIDERS.filter((p) => p.id !== "telegram");
  return (
    <DeskBlock tipKey="ptel.b.connect" title={t("ptel.s.connect")} icon={Cable} tone="slate">
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {providers.map((p) => {
          const st = admin
            ? statuses?.[p.id]
            : data?.provider?.id === p.id
              ? { connected: data.provider.connected, lastEventAt: data.provider.lastEventAt }
              : undefined;
          const on = !!st?.connected;
          return (
            <li
              key={p.id}
              className={cn(
                "flex flex-col rounded-xl border p-4",
                on ? "border-emerald-500/40" : "border-border",
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-[6px]",
                    on
                      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                      : "bg-surface text-muted-foreground",
                  )}
                >
                  <Phone className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-foreground">
                    {t(p.labelKey)}
                  </span>
                  <StatusChip state={on ? "ok" : "off"}>
                    {on ? t("ptel.on") : t("ptel.off")}
                  </StatusChip>
                </span>
              </div>
              <p className="mt-2.5 flex-1 text-[12.5px] leading-snug text-muted-foreground">
                {t(p.descriptionKey)}
              </p>
              {st?.lastEventAt && (
                <p className="mt-2 text-[12px] tabular-nums text-muted-foreground">
                  {t("ptel.lastEvent", { at: timeOf(st.lastEventAt) })}
                </p>
              )}
              {admin && (
                <Link
                  to="/admin/telephony"
                  search={{ provider: p.id } as never}
                  className="ctl-soft mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] text-[13px] font-semibold text-foreground"
                >
                  <Settings className="h-4 w-4" />
                  {on ? t("ptel.manage") : t("ptel.connect")}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {!admin && (
        <p className="mt-3 text-[12.5px] text-muted-foreground">{t("ptel.adminConnects")}</p>
      )}
    </DeskBlock>
  );
}

/* ---- Desktop ---------------------------------------------------------------- */

export function DesktopSection() {
  const { t } = useI18n();
  const state = useInstallState();
  const [notif, setNotif] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <DeskBlock
        tipKey="ptel.b.desktop"
        title={t("ptel.b.desktop")}
        icon={MonitorDown}
        tone="primary"
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t("ptel.desk.what")}</p>
        <div className="mt-4">
          {state === "installed" ? (
            <StatusChip state="ok">{t("ptel.desk.installed")}</StatusChip>
          ) : state === "available" ? (
            <button
              type="button"
              onClick={() =>
                void promptInstall().then((ok) => ok && toast.success(t("ptel.desk.done")))
              }
              className="ctl-lit inline-flex h-10 items-center gap-2 rounded-[6px] px-4 text-[13px] font-semibold"
            >
              <Download className="h-4 w-4" />
              {t("ptel.desk.install")}
            </button>
          ) : (
            <p className="rounded-[6px] border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-snug text-foreground">
              {isIos() ? t("ptel.desk.ios") : t("ptel.desk.manual")}
            </p>
          )}
        </div>
      </DeskBlock>
      <DeskBlock tipKey="ptel.b.notify" title={t("ptel.b.notify")} icon={BellRing} tone="amber">
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t("ptel.desk.notify")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {notif === "granted" ? (
            <StatusChip state="ok">{t("ptel.desk.notifyOn")}</StatusChip>
          ) : notif === "unsupported" ? (
            <StatusChip state="off">{t("ptel.desk.notifyNo")}</StatusChip>
          ) : (
            <button
              type="button"
              onClick={() => void Notification.requestPermission().then(setNotif)}
              className="ctl-lit inline-flex h-10 items-center gap-2 rounded-[6px] px-4 text-[13px] font-semibold"
            >
              <BellRing className="h-4 w-4" />
              {t("ptel.desk.notifyAsk")}
            </button>
          )}
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Smartphone className="h-3.5 w-3.5" />
            {t("ptel.desk.phoneToo")}
          </span>
        </div>
      </DeskBlock>
    </div>
  );
}
