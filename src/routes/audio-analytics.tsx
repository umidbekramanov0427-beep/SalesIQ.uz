import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
  AudioLines,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { CallAnalysisDetail, scoreTone } from "@/components/audio/CallAnalysisDetail";
import { UploadCallDialog } from "@/components/audio/UploadCallDialog";
import { enqueueCallAnalysis, useAutoAnalyzeStates } from "@/lib/auto-analyze";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n, type Lang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { MIN_AUTO_ANALYSIS_SECONDS } from "@/lib/call-analysis-policy";
import { useSavedFilters } from "@/hooks/use-saved-filters";
import { SaveFiltersButton } from "@/components/filters/SaveFiltersButton";
import {
  useAmoCrmLink,
  useAudioAnalyticsView,
  useCallAnalysisSettings,
  useCallSummaries,
  useCallTranscriptSearch,
  useFunnelNames,
  type AudioCallView,
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

const CallPickupByHourChart = lazy(() =>
  import("@/components/dashboard/Charts").then((m) => ({ default: m.CallPickupByHourChart })),
);

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
  if (analyzing || (waiting && !call.analyzed)) {
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

function CallRow({
  call,
  summary,
  lang,
  getAmoLink,
}: {
  call: AudioCallView;
  summary: string | null;
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
  const clickable = !!(call.analyzed || call.recordingUrl);
  const title = call.leadName || call.company || call.phone || t("audio.noLead");
  const meta = [call.phone && call.phone !== title ? call.phone : null, call.owner || null].filter(
    Boolean,
  );

  // Analysis normally starts on its own (on upload, or via the cron); a
  // click on a still-unanalyzed row just puts it at the front of this tab's
  // queue, which keeps retrying while the AI is overloaded.
  function onRowClick() {
    if (call.analyzed) {
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
          {summary && <p className="mt-1 line-clamp-1 text-[13px] text-foreground/75">{summary}</p>}
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

      {expanded && call.analyzed && (
        <div className="rounded-b-2xl border border-t-0 border-primary/40 bg-primary/5 p-4">
          <ExpandedCallDetail call={call} />
        </div>
      )}
    </li>
  );
}

// The list carries no transcript or full analysis (see useAmoCrmCallsSince);
// an expanded call loads its own.
function ExpandedCallDetail({ call }: { call: AudioCallView }) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["amocrm_calls", "detail", call.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amocrm_calls")
        .select("transcript, analysis, ai_summary")
        .eq("id", call.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </p>
    );
  }
  return (
    <CallAnalysisDetail
      call={{
        ...call,
        aiSummary: data?.ai_summary ?? null,
        transcript: data?.transcript ?? null,
        analysis: (data?.analysis as AudioCallView["analysis"]) ?? null,
      }}
    />
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
function formatTalkTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function defaultAudioDateFilter(label: string): DateFilterValue {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  return { from, to, label, preset: "7d" };
}

function AudioAnalytics() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  // A sotuv_menejeri's calls are already scoped to their own leads (see
  // useAudioAnalyticsView), so this "per manager" breakdown would only ever
  // show their own single row -- a teammate comparison list makes sense for
  // rop/super_admin, not for a rep looking at their own numbers.
  const showPerRep = user?.role !== "sotuv_menejeri";
  // The page opens on the last 7 days; that default isn't a "filter" the
  // user set, so it doesn't count toward Tozalash, and Tozalash returns to it.
  const [defaultDate] = useState<DateFilterValue>(() => defaultAudioDateFilter(t("lb.preset7d")));
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(defaultDate);
  const isDefaultDate =
    dateFilter.from?.getTime() === defaultDate.from?.getTime() &&
    dateFilter.to?.getTime() === defaultDate.to?.getTime();
  const { recent, isLoading } = useAudioAnalyticsView({
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
        !c.analyzed &&
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
  const [analyzedFilter, setAnalyzedFilter] = useState<"" | "yes" | "no">("");
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
    !!analyzedFilter ||
    !!ownerId ||
    !!funnelFilter ||
    !!stageFilter ||
    !!moodFilter ||
    scoreRange.min != null ||
    scoreRange.max != null ||
    durationRange.min != null ||
    durationRange.max != null ||
    !isDefaultDate;

  function clearFilters() {
    setSearch("");
    setDirection("");
    setConnectedFilter("");
    setAnalyzedFilter("");
    setOwnerId("");
    setFunnelFilter("");
    setStageFilter("");
    setMoodFilter("");
    setScoreRange(EMPTY_AMOUNT_RANGE);
    setDurationRange(EMPTY_AMOUNT_RANGE);
    setDateFilter(defaultDate);
  }

  // Words inside transcripts are searched by the database (the list itself
  // doesn't download transcripts); a short pause after typing first.
  const [transcriptQuery, setTranscriptQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setTranscriptQuery(search), 400);
    return () => clearTimeout(id);
  }, [search]);
  const transcriptHits = useCallTranscriptSearch(
    { from: dateFilter.from, to: dateFilter.to },
    transcriptQuery,
  );

  const baseFilteredCalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recent.filter((c) => {
      if (direction && c.direction !== direction) return false;
      if (connectedFilter === "yes" && !c.connected) return false;
      if (connectedFilter === "no" && c.connected) return false;
      if (analyzedFilter === "yes" && !c.analyzed) return false;
      if (analyzedFilter === "no" && c.analyzed) return false;
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
        const haystack = [c.leadName, c.company, c.owner, c.phone].join(" ").toLowerCase();
        if (!haystack.includes(q) && !transcriptHits.data?.has(c.id)) return false;
      }
      return true;
    });
  }, [
    recent,
    search,
    direction,
    connectedFilter,
    analyzedFilter,
    ownerId,
    funnelFilter,
    stageFilter,
    moodFilter,
    scoreRange,
    durationRange,
    dateFilter,
    transcriptHits.data,
  ]);

  // Conversations vs. short and unanswered calls, split at the company's
  // own minimum (the same one the automatic AI analysis uses); uploaded
  // recordings always count as conversations.
  const { data: analysisRules } = useCallAnalysisSettings();
  const minTalkSeconds = analysisRules?.minSeconds ?? MIN_AUTO_ANALYSIS_SECONDS;
  const [bucket, setBucket] = useState<"talks" | "short">("talks");

  // "Saqlash": everything in the filter bar and the list's tab and sort
  // (not the search box, which is a one-off).
  const filterState = {
    direction,
    connected: connectedFilter,
    analyzed: analyzedFilter,
    ownerId,
    funnel: funnelFilter,
    stage: stageFilter,
    mood: moodFilter,
    score: scoreRange,
    duration: durationRange,
    date: dateFilter,
    bucket,
    sortKey,
    sortDir,
  };
  const filterDefaults = useMemo(
    () => ({
      direction: "" as "" | "in" | "out",
      connected: "" as "" | "yes" | "no",
      analyzed: "" as "" | "yes" | "no",
      ownerId: "",
      funnel: "",
      stage: "",
      mood: "",
      score: EMPTY_AMOUNT_RANGE,
      duration: EMPTY_AMOUNT_RANGE,
      date: defaultDate,
      bucket: "talks" as "talks" | "short",
      sortKey: "date" as SortKey,
      sortDir: "desc" as "asc" | "desc",
    }),
    [defaultDate],
  );
  const savedFilters = useSavedFilters("audio-analytics", filterState, filterDefaults, (v) => {
    setDirection(v.direction);
    setConnectedFilter(v.connected);
    setAnalyzedFilter(v.analyzed ?? "");
    setOwnerId(v.ownerId);
    setFunnelFilter(v.funnel);
    setStageFilter(v.stage);
    setMoodFilter(v.mood);
    setScoreRange(v.score ?? EMPTY_AMOUNT_RANGE);
    setDurationRange(v.duration ?? EMPTY_AMOUNT_RANGE);
    setDateFilter(v.date ?? defaultDate);
    setBucket(v.bucket === "short" ? "short" : "talks");
    setSortKey(v.sortKey ?? "date");
    setSortDir(v.sortDir === "asc" ? "asc" : "desc");
  });
  const { talkCalls, shortCalls } = useMemo(() => {
    const talk: typeof baseFilteredCalls = [];
    const short: typeof baseFilteredCalls = [];
    for (const c of baseFilteredCalls) {
      (c.source === "manual" || c.durationSeconds >= minTalkSeconds ? talk : short).push(c);
    }
    return { talkCalls: talk, shortCalls: short };
  }, [baseFilteredCalls, minTalkSeconds]);
  const filteredCalls = bucket === "talks" ? talkCalls : shortCalls;

  // Calls, connect rate, talk time and score per manager, for the calls the
  // filters above select -- the one place these per-person numbers live.
  const perManager = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        calls: number;
        connected: number;
        seconds: number;
        scoreSum: number;
        scored: number;
      }
    >();
    for (const c of filteredCalls) {
      const key = c.ownerId ?? c.owner ?? "—";
      const row = map.get(key) ?? {
        key,
        name: c.owner || "—",
        calls: 0,
        connected: 0,
        seconds: 0,
        scoreSum: 0,
        scored: 0,
      };
      row.calls += 1;
      if (c.connected) row.connected += 1;
      row.seconds += c.durationSeconds;
      if (c.score != null) {
        row.scoreSum += c.score;
        row.scored += 1;
      }
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.calls - a.calls);
  }, [filteredCalls]);

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
  // Summaries of just the rows on screen.
  const visibleIds = useMemo(
    () => sortedCalls.slice(0, visibleCount).map((c) => c.id),
    [sortedCalls, visibleCount],
  );
  const summaries = useCallSummaries(visibleIds);

  return (
    <>
      <PageHeader
        icon={AudioLines}
        tone="rose"
        title={t("audio.title")}
        description={t("audio.desc")}
      />

      <div className="mb-8 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-soft sm:flex-nowrap sm:[&>*:not(:last-child)]:w-auto sm:[&>*:not(:last-child)]:min-w-0 sm:[&>*:not(:last-child)]:flex-1 phone:flex-wrap phone:overflow-visible phone:mb-5 phone:[&>*:first-child]:basis-full">
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
          icon={Sparkles}
          label={t("audio.analysisLabel")}
          value={analyzedFilter}
          onChange={(v) => setAnalyzedFilter(v as "" | "yes" | "no")}
        >
          <option value="">{t("audio.filterAllAnalysis")}</option>
          <option value="yes">{t("audio.filterAnalyzed")}</option>
          <option value="no">{t("audio.filterNotAnalyzed")}</option>
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
                "inline-flex h-9 w-32 shrink-0 items-center justify-center gap-1.5 rounded-xl border text-[11px] font-medium transition-colors sm:h-11 sm:w-auto sm:rounded-xl sm:px-4 sm:text-[13px] sm:font-semibold phone:h-[54px] phone:w-auto phone:flex-1 phone:basis-[calc(50%-8px)] phone:rounded-2xl phone:text-sm",
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

        <SaveFiltersButton
          changed={savedFilters.changed}
          saved={savedFilters.saved}
          onSave={savedFilters.save}
          onForget={savedFilters.forget}
        />
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
          icon={PhoneCall}
          tone="sky"
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
          <div className="mb-4 inline-flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1">
            {(
              [
                ["talks", t("audio.bucketTalks", { min: minTalkSeconds }), talkCalls.length],
                ["short", t("audio.bucketShort", { min: minTalkSeconds }), shortCalls.length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setBucket(key)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors",
                  bucket === key
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary tabular-nums">
                  {count}
                </span>
              </button>
            ))}
          </div>
          {isLoading && sortedCalls.length === 0 ? (
            // Still loading: placeholder rows, not "no calls found" with a
            // Tozalash button that then flips to the real list.
            <CallListSkeleton />
          ) : sortedCalls.length === 0 ? (
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
                  <CallRow
                    key={c.id}
                    call={c}
                    summary={summaries.data?.get(c.id) ?? null}
                    lang={lang}
                    getAmoLink={getAmoLink}
                  />
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

      {showPerRep && (
        <SectionCard
          className="mt-6"
          icon={Users}
          tone="violet"
          title={t("audio.perRep")}
          description={t("audio.perRepDesc")}
        >
          {isLoading && perManager.length === 0 ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          ) : perManager.length === 0 ? (
            <p className="text-sm text-subtle">{t("audio.noCalls")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
                    <th className="py-2 pr-3">{t("audio.colManager")}</th>
                    <th className="px-2 py-2 text-right">{t("audio.colCalls")}</th>
                    <th className="px-2 py-2 text-right">{t("audio.colConnectRate")}</th>
                    <th className="px-2 py-2 text-right">{t("audio.colTalkTime")}</th>
                    <th className="py-2 pl-2 text-right">{t("audio.colAvgScore")}</th>
                  </tr>
                </thead>
                <tbody>
                  {perManager.map((r) => (
                    <tr key={r.key} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{r.name}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.calls}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.calls ? Math.round((r.connected / r.calls) * 100) : 0}%
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {formatTalkTime(r.seconds)}
                      </td>
                      <td className="py-2 pl-2 text-right tabular-nums">
                        {r.scored ? Math.round(r.scoreSum / r.scored) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <div className="mt-6">
        <Suspense fallback={null}>
          <CallPickupByHourChart dateRange={{ from: dateFilter.from, to: dateFilter.to }} />
        </Suspense>
      </div>
    </>
  );
}

function CallListSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[72px] rounded-xl" />
        ))}
      </div>
      <ul className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}
