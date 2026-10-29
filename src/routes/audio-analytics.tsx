import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  FileSpreadsheet,
  GitBranch,
  LayoutGrid,
  ListFilter,
  Loader2,
  Rows3,
  Search,
  SlidersHorizontal,
  Smile,
  Upload,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CallAnalysisDetail } from "@/components/audio/CallAnalysisDetail";
import { UploadCallDialog } from "@/components/audio/UploadCallDialog";
import { ReportCard } from "@/components/audio/report/ReportCard";
import { useOpenCall } from "@/components/audio/report/report-utils";
import { PillSelect } from "@/components/audio/report/ReportControls";
import {
  ManagerRegister,
  PickupHours,
  ReportLines,
  ReportTabel,
  type ManagerRow,
} from "@/components/audio/report/ReportPanels";
import { GuideButton } from "@/components/help/GuideButton";
import { BackButton } from "@/components/layout/BackButton";
import { enqueueCallAnalysis, useAutoAnalyzeStates } from "@/lib/auto-analyze";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { MIN_AUTO_ANALYSIS_SECONDS } from "@/lib/call-analysis-policy";
import { GRADES, gradeOf, gradeRange, type Grade } from "@/lib/call-grade";
import { downloadXlsx } from "@/lib/xlsx-write";
import { useSavedFilters } from "@/hooks/use-saved-filters";
import { SaveFiltersButton } from "@/components/filters/SaveFiltersButton";
import {
  useAmoCrmLink,
  useAudioAnalyticsView,
  useCallAnalysisSettings,
  useCallCardDetails,
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
import { FilterSelect } from "@/components/filters/FilterSelect";
import { PermissionGate } from "@/components/PermissionGate";
import { PlanGate } from "@/components/PlanGate";

// Audio tahlil as a stack of report cards ("baho varag'i"): every call the
// AI has heard gets a school grade (A-D), a mark out of 5 for each sales
// stage, a summary and its outcome as a stamp. Above them the period's
// tabel, below the managers' register and the hours clients pick up.

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

type SortKey = "date" | "duration" | "score";

const PAGE_SIZE = 18;
const VIEW_KEY = "salesiq.audio.view";

function readView(): "cards" | "lines" {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "lines" ? "lines" : "cards";
  } catch {
    return "cards";
  }
}

function saveView(v: "cards" | "lines") {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
    // Storage blocked: the choice still holds until the page reloads.
  }
}

// The list carries no transcript or full analysis (see useAmoCrmCallsSince);
// a call without a lead opens its sheet in a dialog and loads its own.
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
      <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
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

// The page opens on the last 7 days (a server-side bound, see
// useAmoCrmCallsSince); widening the period re-fetches.
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
  const [grade, setGrade] = useState<Grade | "">("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
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
    !!grade ||
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
    setGrade("");
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
    grade,
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
      grade: "" as Grade | "",
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
    setGrade(GRADES.includes(v.grade as Grade) ? (v.grade as Grade) : "");
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

  // Calls, connect rate, talk time and grades per manager, for the calls
  // the filters above select -- the one place these per-person numbers live.
  const perManager = useMemo(() => {
    const map = new Map<string, ManagerRow>();
    for (const c of filteredCalls) {
      const key = c.ownerId ?? c.owner ?? "—";
      const row = map.get(key) ?? {
        key,
        ownerId: c.ownerId,
        name: c.owner || "—",
        calls: 0,
        connected: 0,
        seconds: 0,
        scores: [],
      };
      row.calls += 1;
      if (c.connected) row.connected += 1;
      row.seconds += c.durationSeconds;
      if (c.score != null) row.scores.push(c.score);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.calls - a.calls);
  }, [filteredCalls]);

  // A grade (the pills or the tabel's spread bar) narrows the cards only;
  // the tabel and the managers' register keep the whole picture.
  const gradedCalls = useMemo(() => {
    if (!grade) return filteredCalls;
    const r = gradeRange(grade);
    return filteredCalls.filter((c) => c.score != null && c.score >= r.min && c.score <= r.max);
  }, [filteredCalls, grade]);

  const sortedCalls = useMemo(() => {
    const arr = [...gradedCalls];
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
  }, [gradedCalls, sortKey, sortDir]);
  // Summaries and card fields of just the cards on screen.
  const visibleIds = useMemo(
    () => sortedCalls.slice(0, visibleCount).map((c) => c.id),
    [sortedCalls, visibleCount],
  );
  const details = useCallCardDetails(visibleIds);
  const queueStates = useAutoAnalyzeStates();
  const [view, setView] = useState<"cards" | "lines">(() => readView());
  const [dialogCall, setDialogCall] = useState<AudioCallView | null>(null);
  const openCall = useOpenCall(setDialogCall);

  function exportXlsx() {
    const rows: (string | number | null)[][] = [
      [
        t("rp.colClient"),
        t("audio.colManager"),
        t("audio.colDate"),
        t("audio.colDuration"),
        t("audio.directionLabel"),
        t("audio.resultLabel"),
        t("audio.colScore"),
        t("rp.colGrade"),
        t("audio.mood"),
        t("leadFilter.stageLabel"),
      ],
      ...sortedCalls.map((c) => [
        c.leadName || c.company || c.phone || "",
        c.owner || "",
        new Date(c.occurredAtRaw).toLocaleString(lang),
        c.durationSeconds,
        c.direction === "in" ? t("audio.filterIncoming") : t("audio.filterOutgoing"),
        c.connected ? t("audio.connected") : t("audio.notConnected"),
        c.score,
        c.score != null ? gradeOf(c.score) : "",
        c.mood ?? "",
        c.stage ?? "",
      ]),
    ];
    downloadXlsx(`audio-tahlil-${new Date().toISOString().slice(0, 10)}`, [
      { name: t("audio.title"), rows },
    ]);
  }

  const shownCalls = sortedCalls.slice(0, visibleCount);
  const sortLabel: Record<SortKey, string> = {
    date: t("audio.colDate"),
    score: t("rp.colGrade"),
    duration: t("audio.colDuration"),
  };

  return (
    // Full-bleed paper desk: cancels <main>'s padding so the beige ground
    // reaches the edges, like the lead card's own skin.
    <div
      className="report-skin -mx-4 -mb-20 -mt-4 min-h-full px-4 pb-16 pt-4 md:-mx-6 md:-mb-[104px] md:-mt-6 md:px-[30px] md:pt-6 phone:-mx-3 phone:-mb-4 phone:-mt-3 phone:px-3 phone:pt-3"
      style={{ background: "var(--rp-bg)" }}
    >
      <BackButton className="mb-4" />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="rp-display text-[32px] leading-tight phone:text-[25px]">
            {t("rp.pageTitle")}
          </h1>
          <p className="rp-mute mt-1 max-w-2xl text-[14px] leading-relaxed">{t("rp.pageDesc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GuideButton />
          <button
            type="button"
            className="rp-pill"
            onClick={exportXlsx}
            disabled={!sortedCalls.length}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {t("rp.exportExcel")}
          </button>
          <button
            type="button"
            className="rp-pill rp-pill-primary"
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="h-3.5 w-3.5" />
            {t("audio.uploadCall")}
          </button>
        </div>
      </header>
      <UploadCallDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      <div className="mt-5">
        {isLoading && recent.length === 0 ? (
          <Skeleton className="h-[104px] w-full rounded-md" />
        ) : (
          <ReportTabel
            calls={baseFilteredCalls}
            talks={talkCalls}
            minTalkSeconds={minTalkSeconds}
            grade={grade}
            onGrade={setGrade}
          />
        )}
      </div>

      {/* Filters: the search line, the grade letters, then every filter the
          old bar had as pills; the rarer ones live under "Yana". */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label
          className="flex h-10 min-w-[240px] flex-1 items-center gap-2 px-1 phone:basis-full"
          style={{ borderBottom: "2px solid var(--rp-strong)" }}
        >
          <Search className="rp-mute h-4 w-4 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("audio.searchPlaceholder")}
            aria-label={t("leadFilter.searchLabel")}
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--rp-mute)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label={t("audio.clearFilters")}
            >
              <X className="rp-mute h-4 w-4" />
            </button>
          )}
        </label>
        <div className="flex items-center gap-1.5" role="group" aria-label={t("rp.colGrade")}>
          <button type="button" className="rp-pill" data-on={!grade} onClick={() => setGrade("")}>
            {t("rp.allGrades")}
          </button>
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              data-on={grade === g}
              onClick={() => setGrade(grade === g ? "" : g)}
              title={t("rp.filterGrade", { grade: g })}
              className={cn(
                "rp-pill rp-display w-9 justify-center px-0 text-[15px]",
                grade !== g && `rp-${g}`,
              )}
            >
              {g}
            </button>
          ))}
        </div>
        <PillSelect
          label={t("audio.resultLabel")}
          value={connectedFilter}
          onChange={(v) => setConnectedFilter(v as "" | "yes" | "no")}
          options={[
            { value: "", label: t("audio.filterAllResults") },
            { value: "yes", label: t("audio.connected") },
            { value: "no", label: t("audio.notConnected") },
          ]}
        />
        <PillSelect
          label={t("audio.analysisLabel")}
          value={analyzedFilter}
          onChange={(v) => setAnalyzedFilter(v as "" | "yes" | "no")}
          options={[
            { value: "", label: t("audio.filterAllAnalysis") },
            { value: "yes", label: t("audio.filterAnalyzed") },
            { value: "no", label: t("audio.filterNotAnalyzed") },
          ]}
        />
        <PillSelect
          label={t("audio.directionLabel")}
          value={direction}
          onChange={(v) => setDirection(v as "" | "in" | "out")}
          options={[
            { value: "", label: t("audio.filterAllDirections") },
            { value: "in", label: t("audio.filterIncoming") },
            { value: "out", label: t("audio.filterOutgoing") },
          ]}
        />
        <PillSelect
          label={t("leadFilter.ownerLabel")}
          value={ownerId}
          onChange={setOwnerId}
          options={[
            { value: "", label: t("audio.filterAllOwners") },
            ...owners.map((o) => ({ value: o.id, label: o.name })),
          ]}
        />
        <DateRangeFilter value={dateFilter} onChange={setDateFilter} variant="pill" />
        <Popover open={showMoreFilters} onOpenChange={setShowMoreFilters}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rp-pill"
              data-on={
                !!funnelFilter ||
                !!stageFilter ||
                !!moodFilter ||
                scoreRange.min != null ||
                scoreRange.max != null ||
                durationRange.min != null ||
                durationRange.max != null
              }
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t("rp.moreFilters")}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(640px,92vw)] p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <FilterSelect
                icon={ListFilter}
                label={t("leadFilter.stageLabel")}
                value={stageFilter}
                onChange={setStageFilter}
                className="w-full"
              >
                <option value="">{t("audio.filterAllStages")}</option>
                {stages.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </FilterSelect>
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
              <AmountRangeFilter
                value={scoreRange}
                onChange={setScoreRange}
                label={t("audio.scoreRange")}
                className="w-full"
              />
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
                className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-border bg-background px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
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
          <button type="button" className="rp-pill" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />
            {t("audio.clearFilters")}
          </button>
        )}
      </div>

      {/* Notebook tabs: conversations vs. short and unanswered calls; then
          sort, and cards vs. lines. */}
      <div
        className="mt-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2"
        style={{ borderBottom: "2px solid var(--rp-strong)" }}
      >
        <div className="flex gap-1">
          {(
            [
              ["talks", t("rp.tabTalks"), talkCalls.length],
              ["short", t("rp.tabShort"), shortCalls.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setBucket(key);
                setVisibleCount(PAGE_SIZE);
              }}
              title={
                key === "talks"
                  ? t("audio.bucketTalks", { min: minTalkSeconds })
                  : t("audio.bucketShort", { min: minTalkSeconds })
              }
              className="rounded-t-md border border-b-0 px-4 py-2 text-[14px] font-semibold transition-colors phone:px-3 phone:text-[13px]"
              style={
                bucket === key
                  ? {
                      background: "var(--rp-accent)",
                      color: "var(--rp-accent-fg)",
                      borderColor: "var(--rp-accent)",
                    }
                  : {
                      background: "var(--rp-paper-2)",
                      color: "var(--rp-mute)",
                      borderColor: "var(--rp-rule)",
                    }
              }
            >
              {label} · {count}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 pb-2 text-[13px]">
          <span className="rp-mute flex items-center gap-1.5">
            {t("rp.sortBy")}
            {(["date", "score", "duration"] as const).map((k, i) => (
              <span key={k} className="flex items-center gap-1.5">
                {i > 0 && <span>·</span>}
                <button
                  type="button"
                  onClick={() => toggleSort(k)}
                  className={cn(
                    "inline-flex items-center gap-0.5",
                    sortKey === k ? "font-bold" : "hover:underline",
                  )}
                  style={sortKey === k ? { color: "var(--rp-ink)" } : undefined}
                >
                  {sortLabel[k]}
                  {sortKey === k && (
                    <ChevronDown className={cn("h-3.5 w-3.5", sortDir === "asc" && "rotate-180")} />
                  )}
                </button>
              </span>
            ))}
          </span>
          <span
            className="flex overflow-hidden rounded-full"
            style={{ border: "1px solid var(--rp-ink)" }}
          >
            {(
              [
                ["cards", LayoutGrid, t("rp.viewCards")],
                ["lines", Rows3, t("rp.viewLines")],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={view === v}
                onClick={() => {
                  setView(v);
                  saveView(v);
                }}
                className="grid h-7 w-9 place-items-center"
                style={
                  view === v
                    ? { background: "var(--rp-accent)", color: "var(--rp-accent-fg)" }
                    : undefined
                }
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </span>
        </div>
      </div>

      <div className="mt-[18px]">
        {isLoading && sortedCalls.length === 0 ? (
          <CardSkeletons />
        ) : sortedCalls.length === 0 ? (
          <div className="rp-sheet py-12 text-center text-[14px]">
            <p className="rp-mute">
              {hasActiveFilters ? t("audio.noFilteredCalls") : t("audio.noCalls")}
            </p>
            {hasActiveFilters && (
              <button type="button" className="rp-pill mt-3" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />
                {t("audio.clearFilters")}
              </button>
            )}
          </div>
        ) : view === "lines" ? (
          <ReportLines calls={shownCalls} details={details.data} lang={lang} onOpen={openCall} />
        ) : (
          <div className="grid gap-[18px] md:grid-cols-2 xl:grid-cols-3">
            {shownCalls.map((c) => (
              <ReportCard
                key={c.id}
                call={c}
                detail={details.data?.get(c.id)}
                queueState={queueStates.get(c.id)}
                amoLink={getAmoLink(c.amocrmId)}
                lang={lang}
                onOpen={openCall}
              />
            ))}
          </div>
        )}
        {visibleCount < sortedCalls.length && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              className="rp-pill"
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            >
              {t("rp.moreSheets", { count: sortedCalls.length - visibleCount })} ↓
            </button>
          </div>
        )}
      </div>

      {showPerRep && (
        <ManagerRegister
          rows={perManager}
          loading={isLoading}
          selected={ownerId}
          onSelect={setOwnerId}
        />
      )}

      <PickupHours range={{ from: dateFilter.from, to: dateFilter.to }} />

      <Dialog open={!!dialogCall} onOpenChange={(o) => !o && setDialogCall(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-0">
          <DialogTitle className="sr-only">{t("rp.sheetTitle")}</DialogTitle>
          {dialogCall && <ExpandedCallDetail call={dialogCall} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CardSkeletons() {
  return (
    <div className="grid gap-[18px] md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="rp-sheet space-y-3 p-[18px]">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}
