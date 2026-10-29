import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  AudioLines,
  ChevronDown,
  CircleCheck,
  ExternalLink,
  FileSpreadsheet,
  GitBranch,
  LayoutGrid,
  ListFilter,
  Loader2,
  PhoneCall,
  Rows3,
  Search,
  SlidersHorizontal,
  Smile,
  Upload,
  User,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CallAnalysisDetail } from "@/components/audio/CallAnalysisDetail";
import { UploadCallDialog } from "@/components/audio/UploadCallDialog";
import { ReportCard } from "@/components/audio/report/ReportCard";
import { formatClock, formatWhen } from "@/components/audio/report/report-utils";
import {
  ManagerRegister,
  PickupHours,
  ReportLines,
  ReportTabel,
  type ManagerRow,
} from "@/components/audio/report/ReportPanels";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { enqueueCallAnalysis, useAutoAnalyzeStates } from "@/lib/auto-analyze";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { MIN_AUTO_ANALYSIS_SECONDS } from "@/lib/call-analysis-policy";
import { gradeOf } from "@/lib/call-grade";
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
  normalizeCallAnalysis,
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
import { FilterSearchInput, FilterSelect } from "@/components/filters/FilterSelect";
import { FilterChevron } from "@/components/filters/FilterTile";
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
// the window loads the call's own, under a header saying whose call it is.
// "Mijoz ma'lumotlari" beside the call's summary: the lead's own fields and
// what the AI heard about the client's need, budget and timeline.
function ClientAside({
  call,
  analysis,
}: {
  call: AudioCallView;
  analysis: AudioCallView["analysis"];
}) {
  const { t } = useI18n();
  const a = normalizeCallAnalysis(analysis);
  const answer = (key: "need" | "budget" | "timeline") =>
    a?.qualification?.find((q) => q.key === key && q.status !== "unanswered")?.answer || null;
  const rows: [string, string | null][] = [
    [t("ca2.name"), call.leadName || call.company || null],
    [t("ca2.phone"), call.phone || null],
    [t("ca2.owner"), call.owner || null],
    [t("ca2.stage"), call.stage || null],
    [t("ca2.need"), answer("need")],
    [t("ca2.budget"), answer("budget")],
    [t("ca2.timeline"), answer("timeline")],
  ];
  const pains = a?.painPoints ?? [];
  return (
    <section className="rp-sheet h-full p-5 phone:p-4">
      <h3 className="text-[15px] font-bold">{t("ca2.client")}</h3>
      <dl className="mt-3 space-y-2.5 text-[13px]">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="shrink-0 text-subtle">{k}</dt>
              <dd className="min-w-0 text-right font-semibold [overflow-wrap:anywhere]">{v}</dd>
            </div>
          ))}
      </dl>
      {pains.length > 0 && (
        <div className="mt-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
            {t("ca2.pains")}
          </p>
          <ul className="mt-1.5 space-y-1 text-[13px] text-muted-foreground">
            {pains.slice(0, 4).map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ExpandedCallDetail({ call, amoLink }: { call: AudioCallView; amoLink: string | null }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["amocrm_calls", "detail", call.id],
    queryFn: async () => {
      const [callRes, leadRes] = await Promise.all([
        supabase
          .from("amocrm_calls")
          .select("transcript, analysis, ai_summary")
          .eq("id", call.id)
          .maybeSingle(),
        call.leadId
          ? supabase
              .from("leads")
              .select("lead_quality:lead_quality_stages(title, qualified)")
              .eq("id", call.leadId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (callRes.error) throw callRes.error;
      const quality = (
        leadRes.data as { lead_quality?: { title: string; qualified: boolean } | null } | null
      )?.lead_quality;
      return { ...callRes.data, leadQuality: quality ?? null };
    },
  });
  const analysis = (data?.analysis as AudioCallView["analysis"]) ?? null;
  return (
    <div className="report-skin">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-1 pt-5 pr-12 phone:px-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("rp.sheetTitle")}
          </p>
          <h2 className="mt-0.5 font-display text-[22px] font-semibold leading-tight text-foreground phone:text-[19px]">
            {call.leadName || call.company || call.phone || t("audio.noLead")}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
            <span>{call.owner || "—"}</span>
            <span>·</span>
            <span>
              {formatWhen(call.occurredAtRaw, lang, {
                today: t("rp.today"),
                yesterday: t("rp.yesterday"),
              })}
            </span>
            <span>·</span>
            <span className="tabular-nums">
              {call.durationSeconds > 0 ? formatClock(call.durationSeconds) : "—"}
            </span>
            {call.stage && (
              <>
                <span>·</span>
                <span>{call.stage}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {amoLink && (
            <Button variant="outline" asChild>
              <a href={amoLink} target="_blank" rel="noreferrer">
                <ExternalLink /> {t("la.openInAmo")}
              </a>
            </Button>
          )}
          {call.leadId && (
            <Button
              onClick={() =>
                void navigate({
                  to: "/crm/leads/$leadId",
                  params: { leadId: call.leadId! },
                  search: { from: "funnels" },
                })
              }
            >
              {t("rp.openLeadCard")}
            </Button>
          )}
        </div>
      </header>
      {isLoading ? (
        <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      ) : (
        <CallAnalysisDetail
          call={{
            ...call,
            aiSummary: data?.ai_summary ?? null,
            transcript: data?.transcript ?? null,
            analysis,
            leadQuality: data?.leadQuality ?? null,
          }}
          aside={<ClientAside call={call} analysis={analysis} />}
        />
      )}
    </div>
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
  // Summaries and card fields of just the cards on screen.
  const visibleIds = useMemo(
    () => sortedCalls.slice(0, visibleCount).map((c) => c.id),
    [sortedCalls, visibleCount],
  );
  const details = useCallCardDetails(visibleIds);
  const queueStates = useAutoAnalyzeStates();
  const [view, setView] = useState<"cards" | "lines">(() => readView());
  const [dialogCall, setDialogCall] = useState<AudioCallView | null>(null);
  // "Batafsil ko'rish" opens the call's report card in a window over the
  // page, so the list, its filters and scroll stay where they were.
  const openCall = setDialogCall;

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
  const moreFiltersActive =
    !!funnelFilter ||
    !!stageFilter ||
    !!moodFilter ||
    scoreRange.min != null ||
    scoreRange.max != null ||
    durationRange.min != null ||
    durationRange.max != null;
  const sortLabel: Record<SortKey, string> = {
    date: t("audio.colDate"),
    score: t("rp.colGrade"),
    duration: t("audio.colDuration"),
  };

  return (
    <div className="report-skin">
      <PageHeader
        icon={AudioLines}
        tone="rose"
        title={t("rp.pageTitle")}
        description={t("rp.pageDesc")}
        actions={
          <>
            <Button variant="outline" onClick={exportXlsx} disabled={!sortedCalls.length}>
              <FileSpreadsheet />
              {t("rp.exportExcel")}
            </Button>
            <Button onClick={() => setUploadOpen(true)}>
              <Upload />
              {t("audio.uploadCall")}
            </Button>
          </>
        }
      />
      <UploadCallDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      {isLoading && recent.length === 0 ? (
        <Skeleton className="h-[104px] w-full rounded-xl" />
      ) : (
        <ReportTabel calls={baseFilteredCalls} talks={talkCalls} minTalkSeconds={minTalkSeconds} />
      )}

      {/* Filters in the platform's one filter shape; the rarer ones live
          under "Yana filtrlar". */}
      <SectionCard className="mt-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <FilterSearchInput
            icon={Search}
            label={t("leadFilter.searchLabel")}
            value={search}
            onChange={setSearch}
            placeholder={t("audio.searchPlaceholder")}
            className="w-[260px] phone:w-full"
          />
          <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
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
            icon={CircleCheck}
            label={t("audio.analysisLabel")}
            value={analyzedFilter}
            onChange={(v) => setAnalyzedFilter(v as "" | "yes" | "no")}
          >
            <option value="">{t("audio.filterAllAnalysis")}</option>
            <option value="yes">{t("audio.filterAnalyzed")}</option>
            <option value="no">{t("audio.filterNotAnalyzed")}</option>
          </FilterSelect>
          <FilterSelect
            icon={ArrowRightLeft}
            label={t("audio.directionLabel")}
            value={direction}
            onChange={(v) => setDirection(v as "" | "in" | "out")}
          >
            <option value="">{t("audio.filterAllDirections")}</option>
            <option value="in">{t("audio.filterIncoming")}</option>
            <option value="out">{t("audio.filterOutgoing")}</option>
          </FilterSelect>
          <Popover open={showMoreFilters} onOpenChange={setShowMoreFilters}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="filter-field"
                data-open={showMoreFilters}
                data-active={moreFiltersActive}
              >
                <span className="filter-field-icon">
                  <SlidersHorizontal />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="filter-field-label block">{t("rp.moreFilters")}</span>
                  <span className="filter-field-value">
                    {moreFiltersActive ? t("rp.moreFiltersOn") : t("rp.moreFiltersHint")}
                  </span>
                </span>
                <FilterChevron />
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
                <Button variant="outline" onClick={clearFilters}>
                  <X />
                  {t("audio.clearFilters")}
                </Button>
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
            <Button variant="outline" className="h-12 rounded-xl" onClick={clearFilters}>
              <X />
              {t("audio.clearFilters")}
            </Button>
          )}
        </div>
      </SectionCard>

      {/* Conversations vs. short and unanswered calls; then sort, and
          cards vs. lines. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="phone-tabs inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-soft">
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
              className={cn(
                "inline-flex items-center gap-2 rounded-xl bg-surface px-3.5 py-2 text-sm font-semibold ring-1 ring-transparent transition-colors",
                bucket === key
                  ? "bg-primary/10 text-primary ring-primary/50"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {label}
              <span className="tabular-nums opacity-80">{count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">{t("rp.sortBy")}</span>
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
            {(["date", "score", "duration"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => toggleSort(k)}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[13px] font-semibold transition-colors",
                  sortKey === k
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {sortLabel[k]}
                {sortKey === k && (
                  <ChevronDown className={cn("h-3.5 w-3.5", sortDir === "asc" && "rotate-180")} />
                )}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
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
                className={cn(
                  "grid h-8 w-9 place-items-center rounded-lg transition-colors",
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-[18px]">
        {isLoading && sortedCalls.length === 0 ? (
          <CardSkeletons />
        ) : sortedCalls.length === 0 ? (
          <div className="rp-sheet py-12 text-center text-[14px]">
            <p className="text-muted-foreground">
              {hasActiveFilters ? t("audio.noFilteredCalls") : t("audio.noCalls")}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" className="mt-3" onClick={clearFilters}>
                <X />
                {t("audio.clearFilters")}
              </Button>
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
            <Button variant="outline" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
              <ChevronDown />
              {t("rp.moreSheets", { count: sortedCalls.length - visibleCount })}
            </Button>
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
          {dialogCall && (
            <ExpandedCallDetail call={dialogCall} amoLink={getAmoLink(dialogCall.amocrmId)} />
          )}
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
