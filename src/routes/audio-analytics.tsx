import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  GitBranch,
  ListFilter,
  Loader2,
  PhoneCall,
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
import { useI18n, type Lang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  useAiAssistantChat,
  useAmoCrmLink,
  useAnalyzeCall,
  useAudioAnalyticsView,
  useCrmLeads,
  useFunnelNames,
  useUploadManualCall,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

function SortableHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 bg-card px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-subtle",
        align === "right" && "text-right",
        align === "center" && "text-center",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          active && "text-primary",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", active && dir === "asc" && "rotate-180")}
        />
      </button>
    </th>
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

const CALL_TABLE_COLSPAN = 9;

function CallTableRow({
  call,
  lang,
  getAmoLink,
}: {
  call: AudioCallView;
  lang: Lang;
  getAmoLink: (id: number | null) => string | null;
}) {
  const { t } = useI18n();
  const analyze = useAnalyzeCall();
  const [expanded, setExpanded] = useState(false);
  const { date, time } = formatDateCell(call.occurredAtRaw, lang);
  const amoLink = getAmoLink(call.amocrmId);

  async function onAnalyze() {
    try {
      const result = await analyze.mutateAsync(call.id);
      setExpanded(true);
      toast.success(t("audio.analyzed"));
      if (result.taskWarning) toast.error(result.taskWarning);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("audio.analyzeFailed"));
    }
  }

  // A row with no analysis yet analyzes on click instead of showing a
  // separate action button/column -- the auto-analysis cron normally beats
  // a person to it anyway (see analyze-pending), so this is only ever a
  // manual nudge for a call that just came in.
  function onRowClick() {
    if (call.aiSummary) {
      setExpanded((e) => !e);
    } else if (call.recordingUrl && !analyze.isPending) {
      void onAnalyze();
    }
  }

  return (
    <>
      <tr
        onClick={onRowClick}
        className={cn(
          "border-b border-border last:border-0 hover:bg-accent/40",
          (call.aiSummary || call.recordingUrl) && "cursor-pointer",
        )}
      >
        <td className="whitespace-nowrap px-4 py-3">
          <p className="text-sm font-medium text-foreground">{date}</p>
          <p className="text-xs text-subtle">{time}</p>
        </td>
        <td className="max-w-[160px] truncate px-4 py-3 text-sm text-foreground">
          {call.owner || "—"}
        </td>
        <td className="max-w-[200px] px-4 py-3">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-foreground">
              {call.leadName || call.company || call.phone || "—"}
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
          </div>
          {call.phone && <p className="truncate text-xs text-subtle">{call.phone}</p>}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground">
          {formatDuration(call.durationSeconds, t("audio.min"))}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right">
          {analyze.isPending ? (
            <Loader2 className="ml-auto h-4 w-4 animate-spin text-primary" />
          ) : call.score != null ? (
            <Pill tone={scoreTone(call.score)}>{call.score}</Pill>
          ) : (
            <span className="text-xs text-subtle">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          {call.connected ? (
            <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
          ) : (
            <X className="mx-auto h-4 w-4 text-subtle" />
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <Pill tone={call.connected ? "success" : "neutral"}>
            {call.connected ? t("audio.connected") : t("audio.notConnected")}
          </Pill>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
          {call.stage || "—"}
        </td>
      </tr>

      {expanded && call.aiSummary && (
        <tr className="border-b border-border last:border-0">
          <td colSpan={CALL_TABLE_COLSPAN} className="bg-primary/5 px-4 py-4">
            <CallAnalysisDetail call={call} />
          </td>
        </tr>
      )}
    </>
  );
}

function UploadCallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  // Only fetch the (expensive, whole-org) leads picker list once the dialog
  // is actually opened — this used to run unconditionally on every Audio
  // Analytics page load just to populate a dropdown nobody looked at yet.
  const { rows: leads } = useCrmLeads(undefined, { enabled: open });
  const uploadCall = useUploadManualCall();
  const [file, setFile] = useState<File | null>(null);
  const [leadId, setLeadId] = useState("");
  const [phone, setPhone] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [connected, setConnected] = useState(true);

  function reset() {
    setFile(null);
    setLeadId("");
    setPhone("");
    setDirection("out");
    setConnected(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    try {
      await uploadCall.mutateAsync({
        file,
        leadId: leadId || null,
        phone: phone.trim(),
        direction,
        connected,
      });
      toast.success(t("audio.uploadSuccess"));
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("audio.uploadFailed"));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("audio.uploadCall")}</DialogTitle>
          <DialogDescription>{t("audio.uploadCallDesc")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("audio.uploadCallFile")}
            </span>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary"
            />
          </label>

          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("audio.uploadCallLead")}
            </span>
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm outline-none focus:border-primary/40"
            >
              <option value="">{t("audio.uploadCallNoLead")}</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} {l.company ? `· ${l.company}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("audio.uploadCallPhone")}
            </span>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                checked={direction === "out"}
                onChange={() => setDirection("out")}
              />
              {t("audio.directionOut")}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                checked={direction === "in"}
                onChange={() => setDirection("in")}
              />
              {t("audio.directionIn")}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={connected}
                onChange={(e) => setConnected(e.target.checked)}
              />
              {t("audio.connected")}
            </label>
          </div>

          <DialogFooter>
            <button
              type="submit"
              disabled={uploadCall.isPending || !file}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {uploadCall.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("audio.uploadCallSubmit")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
                "inline-flex h-14 w-64 shrink-0 items-center justify-center gap-1.5 rounded-2xl border text-sm font-medium transition-colors",
                showMoreFilters
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
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
            className="inline-flex h-14 w-64 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-border bg-background text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            <X className="h-4 w-4" />
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
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              <Upload className="h-3.5 w-3.5" />
              {t("audio.uploadCall")}
            </button>
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
              <div className="-mx-5 -mb-5 overflow-x-auto">
                <table className="w-full min-w-[1080px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <SortableHeader
                        label={t("audio.colDate")}
                        active={sortKey === "date"}
                        dir={sortDir}
                        onClick={() => toggleSort("date")}
                      />
                      <th className="sticky top-0 z-10 bg-card px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
                        {t("audio.colOperator")}
                      </th>
                      <th className="sticky top-0 z-10 bg-card px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
                        {t("audio.colLead")}
                      </th>
                      <SortableHeader
                        label={t("audio.colDuration")}
                        active={sortKey === "duration"}
                        dir={sortDir}
                        onClick={() => toggleSort("duration")}
                        align="right"
                      />
                      <SortableHeader
                        label={t("audio.colScore")}
                        active={sortKey === "score"}
                        dir={sortDir}
                        onClick={() => toggleSort("score")}
                        align="right"
                      />
                      <th className="sticky top-0 z-10 bg-card px-4 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-subtle">
                        {t("audio.colStatus")}
                      </th>
                      <th className="sticky top-0 z-10 bg-card px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
                        {t("audio.colResult")}
                      </th>
                      <th className="sticky top-0 z-10 bg-card px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
                        {t("audio.colStage")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCalls.slice(0, visibleCount).map((c) => (
                      <CallTableRow key={c.id} call={c} lang={lang} getAmoLink={getAmoLink} />
                    ))}
                  </tbody>
                </table>
              </div>
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
