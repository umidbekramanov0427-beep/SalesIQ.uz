import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitBranch,
  ListFilter,
  Loader2,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Search,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Upload,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { TagChip } from "@/components/crm/tag-editor";
import { CallAnalysisDetail, scoreTone } from "@/components/audio/CallAnalysisDetail";
import { UploadCallDialog } from "@/components/audio/UploadCallDialog";
import { enqueueCallAnalysis, useAutoAnalyzeStates } from "@/lib/auto-analyze";
import { useI18n, type Lang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  useAiAssistantChat,
  useAmoCrmLink,
  useAudioAnalyticsView,
  useFunnelNames,
  type AudioCallView,
  type RecoverableLeadView,
} from "@/hooks/use-crm-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import {
  AmountRangeFilter,
  EMPTY_AMOUNT_RANGE,
  amountInRange,
  type AmountRangeValue,
} from "@/components/filters/AmountRangeFilter";
import { FilterSelect, FilterSearchInput } from "@/components/filters/FilterSelect";
import { PermissionGate } from "@/components/PermissionGate";
import { PlanGate } from "@/components/PlanGate";

export const Route = createFileRoute("/audio-analytics")({
  head: () => ({
    meta: [
      { title: "Audio Analytics — SalesIQ" },
      {
        name: "description",
        content: "Real call activity synced from AmoCRM: volume, connection rate, duration.",
      },
      { property: "og:title", content: "Audio Analytics — SalesIQ" },
      { property: "og:description", content: "Real call activity per rep, from AmoCRM." },
    ],
  }),
  component: AudioAnalyticsGated,
});

function AudioAnalyticsGated() {
  return (
    <PlanGate feature="analytics">
      <PermissionGate action="View recordings">
        <AudioAnalytics />
      </PermissionGate>
    </PlanGate>
  );
}

const LANG_NAME: Record<Lang, string> = { uz: "o'zbek", ru: "русский", en: "English" };

function formatDuration(seconds: number, min: string): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")} ${min}`;
}

function formatDateCell(iso: string, lang: Lang): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(lang === "uz" ? "en-CA" : lang),
    time: d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }),
  };
}

type SortKey = "date" | "duration" | "score";

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors",
        active
          ? "bg-background text-foreground shadow-soft"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {active && (
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", dir === "asc" && "rotate-180")}
        />
      )}
    </button>
  );
}

const TONE_TEXT = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
} as const;

// The call's score as a ring -- the one number a manager scans this list
// for, so it's the biggest thing on the row. Unscored calls show what's
// happening instead (analysing, AI busy, failed, or not analysed yet).
function ScoreRing({
  call,
  analyzing,
  waiting,
}: {
  call: AudioCallView;
  analyzing: boolean;
  waiting: boolean;
}) {
  const { t } = useI18n();
  const r = 23;
  const c = 2 * Math.PI * r;
  if (call.score != null) {
    const tone = scoreTone(call.score);
    return (
      <div className={cn("relative h-14 w-14 shrink-0", TONE_TEXT[tone])}>
        <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
          <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" className="stroke-border" />
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            stroke="currentColor"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.min(100, Math.max(0, call.score)) / 100)}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-lg font-bold tabular-nums text-foreground">
          {call.score}
        </span>
      </div>
    );
  }
  const base =
    "grid h-14 w-14 shrink-0 place-items-center rounded-full text-center text-[10px] font-semibold leading-tight";
  if (analyzing || (waiting && !call.aiSummary)) {
    return (
      <div
        className={cn(base, "border-2 border-primary/30 text-primary")}
        title={waiting ? t("audio.aiBusyRetry") : undefined}
      >
        <span className="flex flex-col items-center gap-0.5">
          <Loader2 className="h-4 w-4 animate-spin" />
          {waiting ? t("audio.aiBusyShort") : t("audio.analyzing")}
        </span>
      </div>
    );
  }
  if (call.analysisError) {
    return (
      <div className={cn(base, "bg-destructive/10 text-destructive")} title={call.analysisError}>
        <span className="flex flex-col items-center gap-0.5">
          <AlertTriangle className="h-4 w-4" />
          {t("audio.analysisFailedShort")}
        </span>
      </div>
    );
  }
  return (
    <div
      className={cn(base, "border-2 border-dashed border-border text-subtle")}
      title={call.recordingUrl ? t("audio.clickToAnalyze") : undefined}
    >
      {call.recordingUrl ? <Sparkles className="h-4 w-4" /> : "—"}
    </div>
  );
}

function RecoverableRow({
  lead,
  getAmoLink,
}: {
  lead: RecoverableLeadView;
  getAmoLink: (id: number | null) => string | null;
}) {
  const { t, lang } = useI18n();
  const chat = useAiAssistantChat();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const reply = await chat.mutateAsync({
        messages: [
          {
            role: "user",
            content: `This lead is marked Lost but had ${lead.connectedCalls} real connected call(s) with our team, last call ${lead.lastCallAt}. Lead: ${lead.name} (${lead.company || "no company"}), owner: ${lead.owner}, tags: ${lead.tags.join(", ") || "none"}. In 2-3 sentences, suggest why this lead might be worth a second outreach and a concrete next step. Respond in ${LANG_NAME[lang]}.`,
          },
        ],
      });
      setSuggestion(reply);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("audio.suggestFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {lead.company || lead.name}
          </p>
          <p className="truncate text-xs text-subtle">{lead.owner}</p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="warning">
            {t("audio.connectedCallsCount", { count: lead.connectedCalls })}
          </Pill>
        </div>
      </div>
      {lead.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.tags.slice(0, 3).map((tag) => (
            <TagChip key={tag} tag={tag} size="xs" />
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-subtle">
        {t("audio.lastCall")}: {lead.lastCallAt}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          to="/crm/leads/$leadId"
          params={{ leadId: lead.id }}
          search={{ from: "audio" }}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" /> {t("funnels.viewLead")}
        </Link>
        {getAmoLink(lead.amocrmId) && (
          <a
            href={getAmoLink(lead.amocrmId)!}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground/90 px-2.5 text-xs font-bold text-background hover:opacity-80"
          >
            {t("leadFilter.openInAmoCrm")} <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {t("audio.suggestNextStep")}
        </button>
      </div>
      {suggestion && (
        <p className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs text-foreground">
          {suggestion}
        </p>
      )}
    </li>
  );
}

function CallRow({
  call,
  lang,
  getAmoLink,
}: {
  call: AudioCallView;
  lang: Lang;
  getAmoLink: (id: number | null) => string | null;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const queueStates = useAutoAnalyzeStates();
  const queueState = queueStates.get(call.id);
  const analyzing = queueState?.status === "queued" || queueState?.status === "running";

  // A call on a lead opens that lead's full analysis page, scrolled to this
  // call; a manual upload with no lead still expands inline.
  function openOnLeadPage() {
    if (!call.leadId) return false;
    void navigate({
      to: "/crm/leads/$leadId",
      params: { leadId: call.leadId },
      search: { from: "audio", audio: call.id },
    });
    return true;
  }
  const { date, time } = formatDateCell(call.occurredAtRaw, lang);
  const amoLink = getAmoLink(call.amocrmId);
  const clickable = !!(call.aiSummary || call.recordingUrl);
  const title = call.leadName || call.company || call.phone || t("audio.noLead");
  const meta = [call.phone && call.phone !== title ? call.phone : null, call.owner || null].filter(
    Boolean,
  );

  // Analysis normally starts on its own (on upload, or via the cron); a
  // click on a still-unanalyzed row just puts it at the front of this tab's
  // queue, which keeps retrying while the AI is overloaded.
  function onRowClick() {
    if (call.aiSummary) {
      if (!openOnLeadPage()) setExpanded((e) => !e);
    } else if (call.recordingUrl) {
      enqueueCallAnalysis(call.id);
      toast.info(t("audio.analysisStarted"));
    }
  }

  return (
    <li>
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={onRowClick}
        onKeyDown={(e) => {
          if (clickable && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onRowClick();
          }
        }}
        className={cn(
          "group grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-2xl border border-border bg-card px-4 py-3.5 transition-colors md:grid-cols-[auto_minmax(0,1fr)_auto]",
          clickable &&
            "cursor-pointer hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          expanded && "rounded-b-none border-primary/40",
        )}
      >
        <ScoreRing call={call} analyzing={analyzing} waiting={queueState?.status === "waiting"} />

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p
              className={cn(
                "truncate text-[15px] font-semibold",
                call.leadName || call.company || call.phone ? "text-foreground" : "text-subtle",
              )}
            >
              {title}
            </p>
            {amoLink && (
              <a
                href={amoLink}
                target="_blank"
                rel="noreferrer"
                title={t("leadFilter.openInAmoCrm")}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 text-subtle transition-colors hover:text-primary"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {call.stage && (
              <span className="hidden shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground sm:inline">
                {call.stage}
              </span>
            )}
          </div>
          {meta.length > 0 && (
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{meta.join(" · ")}</p>
          )}
          {call.aiSummary && (
            <p className="mt-1 line-clamp-1 text-[13px] text-foreground/75">{call.aiSummary}</p>
          )}
        </div>

        <div className="col-span-2 flex items-center justify-between gap-3 border-t border-border pt-3 sm:gap-5 md:col-span-1 md:justify-end md:border-0 md:pt-0">
          <div className="text-right">
            <p className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
              {call.direction === "in" ? (
                <PhoneIncoming className="h-3.5 w-3.5 text-subtle" />
              ) : (
                <PhoneOutgoing className="h-3.5 w-3.5 text-subtle" />
              )}
              {call.durationSeconds > 0
                ? formatDuration(call.durationSeconds, t("audio.min"))
                : "—"}
            </p>
            <p className="text-xs text-subtle">
              {call.direction === "in" ? t("audio.filterIncoming") : t("audio.filterOutgoing")}
            </p>
          </div>
          <div className="whitespace-nowrap text-right">
            <p className="text-sm font-semibold tabular-nums text-foreground">{date}</p>
            <p className="text-xs tabular-nums text-subtle">{time}</p>
          </div>
          <span
            className={cn(
              "inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-semibold sm:w-[124px] sm:px-2.5",
              call.connected ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
            )}
            title={call.connected ? t("audio.connected") : t("audio.notConnected")}
          >
            {call.connected ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            {/* Phones get the icon alone -- the row is too narrow for both. */}
            <span className="hidden sm:inline">
              {call.connected ? t("audio.connected") : t("audio.notConnected")}
            </span>
          </span>
          <ChevronRight
            className={cn(
              "hidden h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 md:block",
              !clickable && "invisible",
            )}
          />
        </div>
      </div>

      {expanded && call.aiSummary && (
        <div className="rounded-b-2xl border border-t-0 border-primary/40 bg-primary/5 p-4">
          <CallAnalysisDetail call={call} />
        </div>
      )}
    </li>
  );
}

// The headline numbers for whatever the filters currently show.
function CallKpis({ calls }: { calls: AudioCallView[] }) {
  const { t } = useI18n();
  const scored = calls.filter((c) => c.score != null);
  const avg = scored.length
    ? Math.round(scored.reduce((s, c) => s + (c.score ?? 0), 0) / scored.length)
    : null;
  const connected = calls.filter((c) => c.connected).length;
  const low = scored.filter((c) => (c.score ?? 0) < 50).length;
  const tiles: { label: string; value: string; hint: string; tone?: string }[] = [
    {
      label: t("audio.kpiCalls"),
      value: String(calls.length),
      hint: t("audio.kpiAnalyzed", { count: scored.length }),
    },
    {
      label: t("audio.kpiAvgScore"),
      value: avg == null ? "—" : String(avg),
      hint: t("audio.kpiOutOf100"),
      ...(avg != null ? { tone: TONE_TEXT[scoreTone(avg)] } : {}),
    },
    {
      label: t("audio.kpiConnectRate"),
      value: calls.length ? `${Math.round((connected / calls.length) * 100)}%` : "—",
      hint: t("audio.kpiConnectedOf", { count: connected }),
    },
    {
      label: t("audio.kpiLowScore"),
      value: String(low),
      hint: t("audio.kpiLowScoreHint"),
      ...(low > 0 ? { tone: "text-destructive" } : {}),
    },
  ];
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-2xl border border-border bg-surface px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground">{tile.label}</p>
          <p
            className={cn(
              "mt-1 text-[28px] font-bold leading-none tabular-nums",
              tile.tone ?? "text-foreground",
            )}
          >
            {tile.value}
          </p>
          <p className="mt-1.5 text-xs text-subtle">{tile.hint}</p>
        </div>
      ))}
    </div>
  );
}

// Audio tahlil's calls query is now bounded server-side by this range (see
// useAmoCrmCallsSince) instead of always fetching the org's entire call
// history -- default to the last 30 days, matching the DateRangeFilter's
// own "month" preset, so the common case never pays for years of synced
// transcripts/analysis just to show recent activity. Widening the filter
// (including to "All Time") re-fetches with the wider range.
function defaultAudioDateFilter(label: string): DateFilterValue {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setDate(from.getDate() - 29);
  from.setHours(0, 0, 0, 0);
  return { from, to, label };
}

function AudioAnalytics() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  // A sotuv_menejeri's calls are already scoped to their own leads (see
  // useAudioAnalyticsView), so this "per manager" breakdown would only ever
  // show their own single row -- a teammate comparison list makes sense for
  // rop/super_admin, not for a rep looking at their own numbers.
  const showPerRep = user?.role !== "sotuv_menejeri";
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(() =>
    defaultAudioDateFilter(t("lb.presetMonth")),
  );
  const { recent, perRep, recoverable, isLoading } = useAudioAnalyticsView({
    from: dateFilter.from,
    to: dateFilter.to,
  });

  // Your own uploads that still have no analysis (e.g. uploaded before this
  // queue existed, or the tab was closed mid-analysis) are picked up again
  // as soon as Audio tahlil is open -- nothing to click.
  useEffect(() => {
    if (!user) return;
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    for (const c of recent) {
      if (
        !c.aiSummary &&
        c.recordingUrl &&
        c.source === "manual" &&
        c.createdBy === user.id &&
        new Date(c.occurredAtRaw).getTime() >= cutoff
      ) {
        enqueueCallAnalysis(c.id);
      }
    }
  }, [recent, user]);
  const getAmoLink = useAmoCrmLink();
  const [uploadOpen, setUploadOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"" | "in" | "out">("");
  const [connectedFilter, setConnectedFilter] = useState<"" | "yes" | "no">("");
  const [ownerId, setOwnerId] = useState("");
  const [funnelFilter, setFunnelFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [moodFilter, setMoodFilter] = useState("");
  const [scoreRange, setScoreRange] = useState<AmountRangeValue>(EMPTY_AMOUNT_RANGE);
  const [durationRange, setDurationRange] = useState<AmountRangeValue>(EMPTY_AMOUNT_RANGE);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { names: funnelNames } = useFunnelNames();

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of recent) if (c.ownerId && c.owner) map.set(c.ownerId, c.owner);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [recent]);
  const stages = useMemo(
    () => Array.from(new Set(recent.map((c) => c.stage).filter((s): s is string => !!s))).sort(),
    [recent],
  );
  const moods = useMemo(
    () => Array.from(new Set(recent.map((c) => c.mood).filter((m): m is string => !!m))).sort(),
    [recent],
  );

  const hasActiveFilters =
    !!search ||
    !!direction ||
    !!connectedFilter ||
    !!ownerId ||
    !!funnelFilter ||
    !!stageFilter ||
    !!moodFilter ||
    scoreRange.min != null ||
    scoreRange.max != null ||
    durationRange.min != null ||
    durationRange.max != null ||
    !!dateFilter.from ||
    !!dateFilter.to;

  function clearFilters() {
    setSearch("");
    setDirection("");
    setConnectedFilter("");
    setOwnerId("");
    setFunnelFilter("");
    setStageFilter("");
    setMoodFilter("");
    setScoreRange(EMPTY_AMOUNT_RANGE);
    setDurationRange(EMPTY_AMOUNT_RANGE);
    setDateFilter({ from: null, to: null, label: t("lb.presetAll") });
  }

  const filteredCalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recent.filter((c) => {
      if (direction && c.direction !== direction) return false;
      if (connectedFilter === "yes" && !c.connected) return false;
      if (connectedFilter === "no" && c.connected) return false;
      if (ownerId && c.ownerId !== ownerId) return false;
      if (funnelFilter && c.funnel !== funnelFilter) return false;
      if (stageFilter && c.stage !== stageFilter) return false;
      if (moodFilter && c.mood !== moodFilter) return false;
      if ((scoreRange.min != null || scoreRange.max != null) && c.score == null) return false;
      if (c.score != null && !amountInRange(c.score, scoreRange)) return false;
      if (!amountInRange(c.durationSeconds, durationRange)) return false;
      if (dateFilter.from && new Date(c.occurredAtRaw) < dateFilter.from) return false;
      if (dateFilter.to && new Date(c.occurredAtRaw) > dateFilter.to) return false;
      if (q) {
        const haystack = [c.leadName, c.company, c.owner, c.phone, c.transcript ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    recent,
    search,
    direction,
    connectedFilter,
    ownerId,
    funnelFilter,
    stageFilter,
    moodFilter,
    scoreRange,
    durationRange,
    dateFilter,
  ]);

  const sortedCalls = useMemo(() => {
    const arr = [...filteredCalls];
    arr.sort((a, b) => {
      let diff = 0;
      if (sortKey === "date") {
        diff = new Date(a.occurredAtRaw).getTime() - new Date(b.occurredAtRaw).getTime();
      } else if (sortKey === "duration") {
        diff = a.durationSeconds - b.durationSeconds;
      } else if (sortKey === "score") {
        diff = (a.score ?? -1) - (b.score ?? -1);
      }
      return sortDir === "asc" ? diff : -diff;
    });
    return arr;
  }, [filteredCalls, sortKey, sortDir]);

  return (
    <>
      <PageHeader title={t("audio.title")} description={t("audio.desc")} />

      {isLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}

      <div className="mb-8 flex items-center gap-2 overflow-x-auto rounded-2xl border border-border bg-card p-3 shadow-soft">
        <FilterSearchInput
          icon={Search}
          label={t("leadFilter.searchLabel")}
          value={search}
          onChange={setSearch}
          placeholder={t("audio.searchPlaceholder")}
        />
        <FilterSelect
          icon={PhoneCall}
          label={t("audio.resultLabel")}
          value={connectedFilter}
          onChange={(v) => setConnectedFilter(v as "" | "yes" | "no")}
        >
          <option value="">{t("audio.filterAllResults")}</option>
          <option value="yes">{t("audio.connected")}</option>
          <option value="no">{t("audio.notConnected")}</option>
        </FilterSelect>
        <FilterSelect
          icon={ArrowLeftRight}
          label={t("audio.directionLabel")}
          value={direction}
          onChange={(v) => setDirection(v as "" | "in" | "out")}
        >
          <option value="">{t("audio.filterAllDirections")}</option>
          <option value="in">{t("audio.filterIncoming")}</option>
          <option value="out">{t("audio.filterOutgoing")}</option>
        </FilterSelect>
        <FilterSelect
          icon={User}
          label={t("leadFilter.ownerLabel")}
          value={ownerId}
          onChange={setOwnerId}
        >
          <option value="">{t("audio.filterAllOwners")}</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </FilterSelect>
        <DateRangeFilter value={dateFilter} onChange={setDateFilter} />

        <Popover open={showMoreFilters} onOpenChange={setShowMoreFilters}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-9 w-32 shrink-0 items-center justify-center gap-1.5 rounded-xl border text-[11px] font-medium transition-colors sm:h-14 sm:w-64 sm:rounded-2xl sm:text-sm",
                showMoreFilters
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              <SlidersHorizontal className="h-3 w-3 sm:h-4 sm:w-4" />
              {t("audio.moreFilters")}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(640px,90vw)] p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FilterSelect
                  icon={GitBranch}
                  label={t("leadFilter.funnelLabel")}
                  value={funnelFilter}
                  onChange={setFunnelFilter}
                  className="w-full"
                >
                  <option value="">{t("leadFilter.allFunnels")}</option>
                  {funnelNames.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div>
                <FilterSelect
                  icon={ListFilter}
                  label={t("leadFilter.stageLabel")}
                  value={stageFilter}
                  onChange={setStageFilter}
                  className="w-full"
                >
                  <option value="">{t("audio.filterAllStages")}</option>
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div>
                <FilterSelect
                  icon={Smile}
                  label={t("audio.moodLabel")}
                  value={moodFilter}
                  onChange={setMoodFilter}
                  className="w-full"
                >
                  <option value="">{t("audio.filterAllMoods")}</option>
                  {moods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div>
                <AmountRangeFilter
                  value={scoreRange}
                  onChange={setScoreRange}
                  label={t("audio.scoreRange")}
                  className="w-full"
                />
              </div>
              <div className="sm:col-span-2">
                <AmountRangeFilter
                  value={durationRange}
                  onChange={setDurationRange}
                  label={t("audio.durationRangeSec")}
                  className="w-full"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end border-t border-border pt-3">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl border border-border bg-background pl-3.5 pr-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                <X className="h-4 w-4" />
                {t("audio.clearFilters")}
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-9 w-32 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent sm:h-14 sm:w-64 sm:rounded-2xl sm:text-sm"
          >
            <X className="h-3 w-3 sm:h-4 sm:w-4" />
            {t("audio.clearFilters")}
          </button>
        )}
      </div>

      <div>
        <SectionCard
          title={t("audio.recentCalls")}
          description={t("audio.callsShownCount", {
            shown: Math.min(visibleCount, sortedCalls.length),
            total: sortedCalls.length,
          })}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-0.5"
                aria-label={t("audio.sortLabel")}
              >
                <SortButton
                  label={t("audio.colDate")}
                  active={sortKey === "date"}
                  dir={sortDir}
                  onClick={() => toggleSort("date")}
                />
                <SortButton
                  label={t("audio.colScore")}
                  active={sortKey === "score"}
                  dir={sortDir}
                  onClick={() => toggleSort("score")}
                />
                <SortButton
                  label={t("audio.colDuration")}
                  active={sortKey === "duration"}
                  dir={sortDir}
                  onClick={() => toggleSort("duration")}
                />
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
              >
                <Upload className="h-3.5 w-3.5" />
                {t("audio.uploadCall")}
              </button>
            </div>
          }
        >
          <UploadCallDialog open={uploadOpen} onOpenChange={setUploadOpen} />
          {sortedCalls.length === 0 ? (
            <div className="py-10 text-center text-sm text-subtle">
              <p>{hasActiveFilters ? t("audio.noFilteredCalls") : t("audio.noCalls")}</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-2xl border border-border bg-background px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
                >
                  <X className="h-4 w-4" />
                  {t("audio.clearFilters")}
                </button>
              )}
            </div>
          ) : (
            <>
              <CallKpis calls={sortedCalls} />
              <ul className="space-y-2">
                {sortedCalls.slice(0, visibleCount).map((c) => (
                  <CallRow key={c.id} call={c} lang={lang} getAmoLink={getAmoLink} />
                ))}
              </ul>
              {visibleCount < sortedCalls.length && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((v) => v + 20)}
                    className="inline-flex h-9 items-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
                  >
                    {t("audio.loadMore")}
                  </button>
                </div>
              )}
            </>
          )}
        </SectionCard>
      </div>

      <div className={cn("mt-6 grid gap-5", showPerRep && "xl:grid-cols-2")}>
        {showPerRep && (
          <SectionCard title={t("audio.perRep")} description={t("audio.perRepDesc")}>
            {perRep.length === 0 ? (
              <p className="text-sm text-subtle">{t("audio.noCalls")}</p>
            ) : (
              <ul className="space-y-3">
                {perRep.map((r) => (
                  <li key={r.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-foreground">{r.name}</span>
                    <span className="shrink-0 text-xs text-subtle">
                      {r.calls} {t("audio.colCalls").toLowerCase()} ·{" "}
                      {r.calls ? Math.round((r.connected / r.calls) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}

        <SectionCard title={t("audio.recoverable")} description={t("audio.recoverableDesc")}>
          {recoverable.length === 0 ? (
            <p className="py-6 text-center text-sm text-subtle">{t("audio.noRecoverable")}</p>
          ) : (
            <ul className="grid gap-3">
              {recoverable.map((lead) => (
                <RecoverableRow key={lead.id} lead={lead} getAmoLink={getAmoLink} />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
