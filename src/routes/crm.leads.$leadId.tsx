import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileSearch,
  FileSignature,
  Flame,
  Headphones,
  Loader2,
  MessageCircle,
  Mail,
  Paperclip,
  Phone,
  Send,
  Settings,
  Snowflake,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { SectionCard, Pill, PageLoader, ChannelActionButton } from "@/components/layout/Primitives";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
import { TagChip, TagEditor } from "@/components/crm/tag-editor";
import { cn, describeError, timeAgo } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { renderContractTemplate } from "@/lib/contracts";
import { useI18n, type Lang } from "@/lib/i18n";
import type { StoredCustomerProfile } from "@/lib/ai-customer-profile";
import {
  getLeadInfoFieldOrder,
  getLeadWorkspaceSectionOrder,
  isLeadSectionVisible,
  type LeadWorkspaceSectionKey,
  useAiAssistantChat,
  useAmoCrmCallsRaw,
  useAmoCrmLink,
  useAnalyzeCall,
  useAuditTrail,
  useCreateContact,
  useCreateLeadActivity,
  useCreateTask,
  useGenerateLeadTelegramLinkCode,
  useLeadById,
  useLeadActivities,
  useContractTemplatesRaw,
  useCreateLeadContract,
  useLeadContracts,
  useMarkContractSent,
  useLeadCustomFieldDefs,
  useLeadEmails,
  useLeadFiles,
  useLeadTelegramLink,
  useLeadTelegramMessages,
  useLeadWhatsappMessages,
  useOrgGeneralSettings,
  usePbxCalls,
  usePermission,
  usePipelineStagesRaw,
  useProfilesRaw,
  useSendLeadEmail,
  useSendLeadTelegramMessage,
  useSendLeadWhatsappMessage,
  useStartCall,
  useTasksView,
  useUnlinkLeadTelegram,
  useUpdateContact,
  useUpdateLead,
  useUploadLeadFile,
  useDeleteLeadFile,
  fetchLeadFileDownloadUrl,
  type CallAnalysis,
  type CrmLeadView,
} from "@/hooks/use-crm-data";
import { toast } from "sonner";
import { CallAnalysisDetail } from "@/components/audio/CallAnalysisDetail";
import { PermissionGate } from "@/components/PermissionGate";

const LANG_NAME: Record<Lang, string> = { uz: "o'zbek", ru: "русский", en: "English" };

// Which physical column (LEFT/CENTER/RIGHT) each reorderable workspace
// section lives in -- the admin-configured order only reshuffles sections
// within the same column, since the three-column layout itself is fixed.
const LEFT_SECTION_KEYS = new Set<LeadWorkspaceSectionKey>(["tags"]);
const CENTER_SECTION_KEYS = new Set<LeadWorkspaceSectionKey>([
  "customerProfile",
  "aiSummary",
  "customerRemark",
  "nextSteps",
]);
const RIGHT_SECTION_KEYS = new Set<LeadWorkspaceSectionKey>([
  "actionHistory",
  "leadScore",
  "audioAnalysis",
  "telephonyCalls",
  "aiAssistant",
]);

export const Route = createFileRoute("/crm/leads/$leadId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { from?: "funnels" | "audio" | "leadTasks" | undefined } => ({
    from:
      search["from"] === "funnels" || search["from"] === "audio" || search["from"] === "leadTasks"
        ? search["from"]
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Lead workspace — SalesIQ CRM" },
      {
        name: "description",
        content: "Full CRM workspace for a lead: timeline, tasks, notes and AI assistance.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LeadWorkspaceGated,
});

function LeadWorkspaceGated() {
  return (
    <PermissionGate action="View leads">
      <LeadWorkspace />
    </PermissionGate>
  );
}

function LeadNotFound() {
  const { t } = useI18n();
  return (
    <SectionCard title={t("lead.notFoundTitle")} description={t("lead.notFoundDesc")}>
      <Link to="/crm/leads" className="text-sm font-semibold text-primary">
        {t("lead.backToLeads")}
      </Link>
    </SectionCard>
  );
}

const TABS = ["Timeline", "Notes", "Tasks", "Files", "Contracts"] as const;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Accumulated across every analyzed call (mergeCustomerProfile in
// ai-customer-profile.ts) rather than reset each time -- an early call's
// finding still shows even if a later call never repeats it.
function CustomerProfileSection({ profile }: { profile: StoredCustomerProfile | null }) {
  const { t } = useI18n();
  if (!profile) return null;
  const hasAnything =
    profile.interestLevel ||
    profile.budget ||
    profile.location ||
    profile.occupation ||
    profile.currentStatus ||
    profile.needs.length > 0 ||
    profile.preferences.length > 0 ||
    profile.otherNotes;
  if (!hasAnything) return null;

  return (
    <SectionCard
      title={t("lead.customerProfile.title")}
      description={t("lead.customerProfile.desc")}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface-card space-y-1.5 p-3 sm:space-y-2 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
            {t("lead.customerProfile.signals")}
          </p>
          {profile.interestLevel && (
            <div>
              <p className="text-[11px] text-subtle">{t("lead.customerProfile.interestLevel")}</p>
              <p className="text-sm font-medium text-foreground">{profile.interestLevel.value}</p>
            </div>
          )}
          {profile.budget && (
            <div>
              <p className="text-[11px] text-subtle">{t("lead.customerProfile.budget")}</p>
              <p className="text-sm font-medium text-foreground">{profile.budget.value}</p>
            </div>
          )}
          {!profile.interestLevel && !profile.budget && <p className="text-sm text-subtle">—</p>}
        </div>

        <div className="surface-card space-y-1.5 p-3 sm:space-y-2 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
            {t("lead.customerProfile.personalInfo")}
          </p>
          {profile.location && (
            <div>
              <p className="text-[11px] text-subtle">{t("lead.customerProfile.location")}</p>
              <p className="text-sm font-medium text-foreground">{profile.location.value}</p>
            </div>
          )}
          {profile.occupation && (
            <div>
              <p className="text-[11px] text-subtle">{t("lead.customerProfile.occupation")}</p>
              <p className="text-sm font-medium text-foreground">{profile.occupation.value}</p>
            </div>
          )}
          {profile.currentStatus && (
            <div>
              <p className="text-[11px] text-subtle">{t("lead.customerProfile.currentStatus")}</p>
              <p className="text-sm font-medium text-foreground">{profile.currentStatus.value}</p>
            </div>
          )}
          {!profile.location && !profile.occupation && !profile.currentStatus && (
            <p className="text-sm text-subtle">—</p>
          )}
        </div>

        <div className="surface-card space-y-1.5 p-3 sm:space-y-2 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
            {t("lead.customerProfile.needs")}
          </p>
          {profile.needs.length === 0 ? (
            <p className="text-sm text-subtle">—</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {profile.needs.map((n) => (
                <TagChip key={n.text} tag={n.text} size="xs" />
              ))}
            </div>
          )}
        </div>

        <div className="surface-card space-y-1.5 p-3 sm:space-y-2 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
            {t("lead.customerProfile.preferences")}
          </p>
          {profile.preferences.length === 0 ? (
            <p className="text-sm text-subtle">—</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {profile.preferences.map((p) => (
                <TagChip key={p.text} tag={p.text} size="xs" />
              ))}
            </div>
          )}
        </div>
      </div>

      {profile.otherNotes && (
        <div className="mt-3 rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
            {t("lead.customerProfile.otherNotes")}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{profile.otherNotes}</p>
        </div>
      )}
    </SectionCard>
  );
}

function LeadCallsSection({
  leadId,
  openId,
  setOpenId,
}: {
  leadId: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const { data: calls, isLoading } = useAmoCrmCallsRaw();
  const analyze = useAnalyzeCall();
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const leadCalls = useMemo(
    () => (calls ?? []).filter((c) => c.lead_id === leadId),
    [calls, leadId],
  );

  async function onAnalyze(callId: string) {
    setAnalyzingId(callId);
    try {
      await analyze.mutateAsync(callId);
      setOpenId(callId);
    } catch {
      // surfaced via the mutation's own error state elsewhere
    } finally {
      setAnalyzingId(null);
    }
  }

  return (
    <SectionCard title={t("audio.title")} description={t("lead.calls.desc")}>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}
      {!isLoading && leadCalls.length === 0 && (
        <p className="text-sm text-subtle">{t("lead.calls.empty")}</p>
      )}
      <ul className="space-y-3">
        {leadCalls.map((c) => {
          const isOpen = openId === c.id;
          return (
            <li
              key={c.id}
              id={`call-${c.id}`}
              className="scroll-mt-4 rounded-xl border border-border bg-surface p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Headphones className="h-4 w-4 text-subtle" />
                  <span className="text-sm font-medium text-foreground">
                    {timeAgo(c.occurred_at)}
                  </span>
                  <Pill tone={c.connected ? "success" : "neutral"}>
                    {c.connected ? t("audio.connected") : t("audio.notConnected")}
                  </Pill>
                </div>
                <div className="flex items-center gap-2">
                  {c.recording_url && !(isOpen && c.ai_summary) && (
                    <a
                      href={c.recording_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {t("audio.listen")}
                    </a>
                  )}
                  {c.ai_summary ? (
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : c.id)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {t("audio.viewAnalysis")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onAnalyze(c.id)}
                      disabled={analyzingId === c.id || !c.recording_url}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      {analyzingId === c.id && <Loader2 className="h-3 w-3 animate-spin" />}
                      {t("audio.analyze")}
                    </button>
                  )}
                </div>
              </div>
              {isOpen && c.ai_summary && (
                <div className="mt-3">
                  <CallAnalysisDetail
                    call={{
                      score: c.score,
                      mood: c.mood,
                      talkRatio: c.talk_ratio,
                      nextStep: c.next_step,
                      aiSummary: c.ai_summary,
                      transcript: c.transcript,
                      recordingUrl: c.recording_url,
                      analysis: c.analysis as CallAnalysis | null,
                      amocrmTaskId: c.amocrm_task_id,
                      aiNoteId: c.ai_note_id,
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

const PBX_STATUS_TONE: Record<string, "success" | "danger" | "info"> = {
  answered: "success",
  completed: "success",
  failed: "danger",
  no_answer: "danger",
  initiated: "info",
  ringing: "info",
};

function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// The org's own OnlinePBX click-to-call log for this lead -- separate from
// LeadCallsSection (AmoCRM's own call records) since an org can run either
// or both telephony sources side by side.
function LeadPbxCallsSection({ leadId }: { leadId: string }) {
  const { t } = useI18n();
  const { data: calls, isLoading } = usePbxCalls({ leadId });

  return (
    <SectionCard title={t("lead.pbxCalls.title")} description={t("lead.pbxCalls.desc")}>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}
      {!isLoading && (calls ?? []).length === 0 && (
        <p className="text-sm text-subtle">{t("lead.pbxCalls.empty")}</p>
      )}
      <ul className="space-y-2">
        {(calls ?? []).map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3"
          >
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-subtle" />
              <div>
                <p className="text-sm font-medium text-foreground">{c.to_number}</p>
                <p className="text-xs text-subtle">{timeAgo(c.created_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {c.duration_seconds > 0 && (
                <span className="text-xs text-subtle">
                  {formatCallDuration(c.duration_seconds)}
                </span>
              )}
              <Pill tone={PBX_STATUS_TONE[c.status] ?? "info"}>
                {t(`lead.pbxCalls.status.${c.status}`)}
              </Pill>
              {c.recording_url && (
                <a
                  href={c.recording_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t("audio.listen")}
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

const BACK_LABEL_KEY: Record<string, string> = {
  funnels: "funnels.backToFunnels",
  audio: "lead.backFromAudio",
  leadTasks: "lead.backFromLeadTasks",
};

type TimelineEntry =
  | { kind: "created"; id: string; at: string }
  | { kind: "stage_change"; id: string; at: string; from: string; to: string }
  | { kind: "owner_change"; id: string; at: string; from: string; to: string }
  | { kind: "note"; id: string; at: string; content: string; actorName: string; isAi: boolean }
  | {
      kind: "call";
      id: string;
      at: string;
      callId: string;
      connected: boolean;
      hasAnalysis: boolean;
    }
  | { kind: "pbx_call"; id: string; at: string; toNumber: string; status: string };

type PanelFilter = "answered" | "allCalls" | "all";

// The persistent right-hand history panel -- merges the lead's own audit
// trail (stage/owner changes), its notes, and its calls into one feed, so
// "when did this happen relative to that call" doesn't require switching
// between the Timeline tab and the Calls section. "View analysis" opens
// the matching call inline in LeadCallsSection (openId is lifted to
// LeadWorkspace) and scrolls it into view rather than duplicating the
// full call-analysis UI a second time here.
function LeadPanelSidebar({
  leadId,
  createdAtIso,
  openId,
  setOpenId,
}: {
  leadId: string;
  createdAtIso: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const { rows: auditRows } = useAuditTrail("leads", leadId);
  const activities = useLeadActivities(leadId);
  const { data: calls } = useAmoCrmCallsRaw();
  const { data: pbxCalls } = usePbxCalls({ leadId });
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();
  const [filter, setFilter] = useState<PanelFilter>("all");

  const stageNameById = useMemo(() => new Map((stages ?? []).map((s) => [s.id, s.name])), [stages]);
  const profileNameById = useMemo(
    () => new Map((profiles ?? []).map((p) => [p.id, p.full_name])),
    [profiles],
  );

  const leadCalls = useMemo(
    () => (calls ?? []).filter((c) => c.lead_id === leadId),
    [calls, leadId],
  );

  const entries = useMemo<TimelineEntry[]>(() => {
    const list: TimelineEntry[] = [{ kind: "created", id: "created", at: createdAtIso }];

    for (const row of auditRows) {
      if (row.changedFields.includes("stage_id")) {
        const fromId = row.before?.["stage_id"] as string | null | undefined;
        const toId = row.after?.["stage_id"] as string | null | undefined;
        list.push({
          kind: "stage_change",
          id: row.id,
          at: row.createdAt,
          from: (fromId && stageNameById.get(fromId)) || "—",
          to: (toId && stageNameById.get(toId)) || "—",
        });
      }
      if (row.changedFields.includes("owner_id")) {
        const fromId = row.before?.["owner_id"] as string | null | undefined;
        const toId = row.after?.["owner_id"] as string | null | undefined;
        list.push({
          kind: "owner_change",
          id: `${row.id}-owner`,
          at: row.createdAt,
          from: (fromId && profileNameById.get(fromId)) || "—",
          to: (toId && profileNameById.get(toId)) || "—",
        });
      }
    }

    for (const a of activities.data ?? []) {
      if (a.type !== "note" && a.type !== "ai_note") continue;
      list.push({
        kind: "note",
        id: a.id,
        at: a.created_at,
        content: a.content,
        actorName:
          a.type === "ai_note"
            ? t("lead.panel.aiActor")
            : (a.created_by && profileNameById.get(a.created_by)) || t("lead.someone"),
        isAi: a.type === "ai_note",
      });
    }

    for (const c of leadCalls) {
      list.push({
        kind: "call",
        id: c.id,
        at: c.occurred_at,
        callId: c.id,
        connected: c.connected,
        hasAnalysis: !!c.ai_summary,
      });
    }

    for (const c of pbxCalls ?? []) {
      list.push({
        kind: "pbx_call",
        id: c.id,
        at: c.created_at,
        toNumber: c.to_number,
        status: c.status,
      });
    }

    return list.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  }, [
    auditRows,
    activities.data,
    leadCalls,
    pbxCalls,
    createdAtIso,
    stageNameById,
    profileNameById,
    t,
  ]);

  const answeredCount = leadCalls.filter((c) => c.connected).length;
  const totalCallCount = leadCalls.length + (pbxCalls ?? []).length;
  const filtered = entries.filter((e) => {
    if (filter === "answered") return e.kind === "call" && e.connected;
    if (filter === "allCalls") return e.kind === "call" || e.kind === "pbx_call";
    return true;
  });

  function openAnalysis(callId: string) {
    setOpenId(callId);
    requestAnimationFrame(() => {
      document
        .getElementById(`call-${callId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <SectionCard title={t("lead.panel.title")}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["answered", t("lead.panel.filterAnswered", { count: String(answeredCount) })],
            ["allCalls", t("lead.panel.filterAllCalls", { count: String(totalCallCount) })],
            ["all", t("lead.panel.filterAll", { count: String(entries.length) })],
          ] as [PanelFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
              filter === key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-subtle">{t("lead.panel.empty")}</p>
      ) : (
        <ol className="relative space-y-4 border-l border-border pl-4">
          {filtered.map((entry) => (
            <li key={entry.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[21px] top-1 h-2 w-2 rounded-full border-2 border-background",
                  entry.kind === "created" && "bg-success",
                  entry.kind === "call" && (entry.connected ? "bg-success" : "bg-destructive"),
                  entry.kind === "pbx_call" &&
                    (entry.status === "completed" || entry.status === "answered"
                      ? "bg-success"
                      : "bg-destructive"),
                  (entry.kind === "stage_change" || entry.kind === "owner_change") && "bg-subtle",
                  entry.kind === "note" && (entry.isAi ? "bg-mint-border" : "bg-primary"),
                )}
              />
              {entry.kind === "created" && (
                <p className="text-sm font-medium text-foreground">{t("lead.panel.created")}</p>
              )}
              {entry.kind === "stage_change" && (
                <p className="text-sm text-foreground">
                  {t("lead.panel.stageChanged")}{" "}
                  <span className="text-muted-foreground">
                    {entry.from} → {entry.to}
                  </span>
                </p>
              )}
              {entry.kind === "owner_change" && (
                <p className="text-sm text-foreground">
                  {t("lead.panel.ownerChanged")}{" "}
                  <span className="text-muted-foreground">
                    {entry.from} → {entry.to}
                  </span>
                </p>
              )}
              {entry.kind === "note" && (
                <>
                  <p className="text-sm font-medium text-foreground">
                    {entry.isAi ? t("lead.panel.aiNote") : t("lead.panel.note")} ·{" "}
                    <span className="font-normal">{entry.actorName}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{entry.content}</p>
                </>
              )}
              {entry.kind === "call" && (
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {t("lead.panel.call")} ·{" "}
                    {entry.connected ? t("audio.connected") : t("audio.notConnected")}
                  </p>
                  {entry.hasAnalysis && (
                    <button
                      type="button"
                      onClick={() => openAnalysis(entry.callId)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {t("audio.viewAnalysis")}
                    </button>
                  )}
                </div>
              )}
              {entry.kind === "pbx_call" && (
                <p className="text-sm font-medium text-foreground">
                  {t("lead.panel.pbxCall")} · {entry.toNumber} ·{" "}
                  {t(`lead.pbxCalls.status.${entry.status}`)}
                </p>
              )}
              <p className="mt-0.5 text-xs text-subtle">{timeAgo(entry.at)}</p>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

const TEMPERATURE_STYLE: Record<
  CrmLeadView["temperature"],
  { icon: LucideIcon; className: string }
> = {
  Cold: { icon: Snowflake, className: "border-sky-500/30 bg-sky-500/10 text-sky-600" },
  Warm: { icon: Sun, className: "border-amber-500/30 bg-amber-500/10 text-amber-600" },
  Hot: { icon: Flame, className: "border-orange-500/30 bg-orange-500/10 text-orange-600" },
  VeryHot: { icon: Flame, className: "border-red-500/30 bg-red-500/10 text-red-600" },
};

// Was a small Pill lost among half a dozen other header controls -- given
// its own clearly legible badge, right beside the lead's name, so a rep
// scanning the page can't miss how hot this lead currently is.
function TemperatureBadge({ temperature }: { temperature: CrmLeadView["temperature"] }) {
  const style = TEMPERATURE_STYLE[temperature];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold",
        style.className,
      )}
    >
      <Icon className="h-4 w-4" />
      {temperature}
    </span>
  );
}

// Collapsed by default -- click to expand the current pipeline's own stage
// list (not every stage across every pipeline) and pick one. Selecting a
// stage only stages the change locally; EditableLeadInfoCard's Save button
// is what actually persists it, alongside any other pending field edits.
function StagePicker({
  stageId,
  pendingStageId,
  onSelect,
}: {
  stageId: string;
  pendingStageId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data: stages } = usePipelineStagesRaw();
  const [open, setOpen] = useState(false);

  const activeStageId = pendingStageId ?? stageId;
  const currentStage = (stages ?? []).find((s) => s.id === stageId);
  const pipelineStages = useMemo(
    () =>
      (stages ?? [])
        .filter((s) => s.pipeline_id === currentStage?.pipeline_id)
        .sort((a, b) => a.position - b.position),
    [stages, currentStage?.pipeline_id],
  );
  const activeStage = (stages ?? []).find((s) => s.id === activeStageId);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        <span>{activeStage?.name ?? "—"}</span>
        <ChevronDown
          className={cn("h-4 w-4 text-subtle transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul className="mt-1.5 max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-background p-1">
          {pipelineStages.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(s.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  activeStageId === s.id
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-foreground",
                )}
              >
                {s.name}
                {activeStageId === s.id && <Check className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const LEAD_PRIORITIES: CrmLeadView["priority"][] = ["Low", "Normal", "High", "Urgent"];

// Replaces the old all-static "Lid ma'lumotlari" card -- stage, owner and
// priority are now editable inline, with one shared Save/Cancel pair that
// appears the moment any of the three is touched and persists all of them
// together in a single update.
// The contact-derived fields (phone/altPhone/email/telegram/whatsapp) live
// on the linked `contacts` row, not on `leads` itself -- everything else
// editable here (source/campaign/manager/budget/nextFollowUp) is a plain
// leads column. `expectedRevenue` has no field of its own in the UI --
// the single "Byudjet" input sets both it and `budget` together (see
// that field's own comment below); kept as a distinct pending key only
// because the save() patch still needs to write leads.expected_revenue
// separately from leads.budget.
type PendingContactPatch = Partial<
  Record<"phone" | "altPhone" | "email" | "telegram" | "whatsapp", string>
>;
type PendingLeadFieldPatch = Partial<{
  source: string;
  campaign: string;
  managerId: string;
  budget: number;
  expectedRevenue: number;
  nextFollowUp: string;
}>;

function EditableLeadInfoCard({ lead }: { lead: CrmLeadView }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const updateLead = useUpdateLead();
  const updateContact = useUpdateContact();
  const createContact = useCreateContact();
  const { data: profiles } = useProfilesRaw();
  const { data: stages } = usePipelineStagesRaw();
  const { data: fieldDefs } = useLeadCustomFieldDefs();
  const { data: orgSettings } = useOrgGeneralSettings();
  const showField = (key: Parameters<typeof isLeadSectionVisible>[1]) =>
    isLeadSectionVisible(orgSettings, key);

  const [pendingStageId, setPendingStageId] = useState<string | null>(null);
  const [pendingOwnerId, setPendingOwnerId] = useState<string | null>(null);
  const [pendingPriority, setPendingPriority] = useState<CrmLeadView["priority"] | null>(null);
  const [pendingCustomFields, setPendingCustomFields] = useState<Record<string, string | boolean>>(
    {},
  );
  const [pendingContact, setPendingContact] = useState<PendingContactPatch>({});
  const [pendingLeadFields, setPendingLeadFields] = useState<PendingLeadFieldPatch>({});

  const canManageFields = user?.role === "super_admin" || user?.role === "platform_owner";

  const hasChanges =
    pendingStageId !== null ||
    pendingOwnerId !== null ||
    pendingPriority !== null ||
    Object.keys(pendingCustomFields).length > 0 ||
    Object.keys(pendingContact).length > 0 ||
    Object.keys(pendingLeadFields).length > 0;

  function discard() {
    setPendingStageId(null);
    setPendingOwnerId(null);
    setPendingPriority(null);
    setPendingCustomFields({});
    setPendingContact({});
    setPendingLeadFields({});
  }

  function setCustomField(key: string, value: string | boolean) {
    setPendingCustomFields((prev) => ({ ...prev, [key]: value }));
  }

  function setContactField(key: keyof PendingContactPatch, value: string) {
    setPendingContact((prev) => ({ ...prev, [key]: value }));
  }

  function setLeadField<K extends keyof PendingLeadFieldPatch>(
    key: K,
    value: PendingLeadFieldPatch[K],
  ) {
    setPendingLeadFields((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    // leads.funnel is a separate, denormalized text column the Voronkalar
    // kanban board filters its lead list by -- it has to move together
    // with stage_id or a lead whose stage changed can silently vanish from
    // every kanban column despite still having a perfectly valid stage
    // (see lead-intake.server.ts's resolveStageAndFunnel for the same
    // fix on the creation side).
    const pendingStage = (stages ?? []).find((s) => s.id === pendingStageId);
    try {
      let newContactId: string | undefined;
      if (Object.keys(pendingContact).length > 0) {
        const contactPatch = {
          ...(pendingContact.phone !== undefined
            ? { phone: pendingContact.phone.trim() || null }
            : {}),
          ...(pendingContact.altPhone !== undefined
            ? { alt_phone: pendingContact.altPhone.trim() || null }
            : {}),
          ...(pendingContact.email !== undefined
            ? { email: pendingContact.email.trim() || null }
            : {}),
          ...(pendingContact.telegram !== undefined
            ? { telegram: pendingContact.telegram.trim() || null }
            : {}),
          ...(pendingContact.whatsapp !== undefined
            ? { whatsapp: pendingContact.whatsapp.trim() || null }
            : {}),
        };
        if (lead.contactId) {
          await updateContact.mutateAsync({ id: lead.contactId, patch: contactPatch });
        } else {
          // A lead can exist with no linked contact at all (created without
          // a phone/email, or manually) -- the first time someone fills in
          // any of these fields, create the contact it should have had.
          const created = await createContact.mutateAsync({
            organization_id: user!.organizationId!,
            full_name: lead.name,
            ...contactPatch,
          });
          newContactId = created.id;
        }
      }

      const leadPatch = {
        ...(pendingStageId !== null
          ? { stage_id: pendingStageId, funnel: pendingStage?.pipeline_name ?? null }
          : {}),
        ...(pendingOwnerId !== null ? { owner_id: pendingOwnerId || null } : {}),
        ...(pendingPriority !== null ? { priority: pendingPriority } : {}),
        ...(Object.keys(pendingCustomFields).length > 0
          ? { custom_fields: { ...lead.customFields, ...pendingCustomFields } }
          : {}),
        ...(pendingLeadFields.source !== undefined
          ? { source: pendingLeadFields.source.trim() || null }
          : {}),
        ...(pendingLeadFields.campaign !== undefined
          ? { campaign: pendingLeadFields.campaign.trim() || null }
          : {}),
        ...(pendingLeadFields.managerId !== undefined
          ? { manager_id: pendingLeadFields.managerId || null }
          : {}),
        ...(pendingLeadFields.budget !== undefined ? { budget: pendingLeadFields.budget } : {}),
        ...(pendingLeadFields.expectedRevenue !== undefined
          ? { expected_revenue: pendingLeadFields.expectedRevenue }
          : {}),
        ...(pendingLeadFields.nextFollowUp !== undefined
          ? {
              next_follow_up: pendingLeadFields.nextFollowUp
                ? new Date(pendingLeadFields.nextFollowUp).toISOString()
                : null,
            }
          : {}),
        ...(newContactId ? { contact_id: newContactId } : {}),
      };
      if (Object.keys(leadPatch).length > 0) {
        await updateLead.mutateAsync({ id: lead.id, patch: leadPatch });
      }
      toast.success(t("lead.info.saved"));
      discard();
    } catch (err) {
      toast.error(describeError(err, t("lead.info.saveFailed")));
    }
  }

  // "2026-09-25T10:00" for a <input type="datetime-local"> -- the raw ISO
  // string has a trailing "Z"/offset and seconds the input rejects.
  function toDatetimeLocal(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  return (
    <SectionCard
      title={t("lead.info.title")}
      actions={
        canManageFields ? (
          <Link
            to="/admin/lead-fields"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Settings className="h-3.5 w-3.5" />
            {t("lead.info.configureFields")}
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-4 text-sm">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-subtle">{t("lead.info.funnelStage")}</p>
          <StagePicker
            stageId={lead.stageId}
            pendingStageId={pendingStageId}
            onSelect={setPendingStageId}
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-subtle">{t("lead.info.owner")}</p>
          <select
            value={pendingOwnerId ?? lead.ownerId}
            onChange={(e) => setPendingOwnerId(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">{t("lead.info.unassigned")}</option>
            {(profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-subtle">{t("lead.info.priority")}</p>
          <select
            value={pendingPriority ?? lead.priority}
            onChange={(e) => setPendingPriority(e.target.value as CrmLeadView["priority"])}
            className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-primary"
          >
            {LEAD_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {(fieldDefs ?? []).length > 0 && (
          <div className="space-y-4 border-t border-border pt-4">
            {(fieldDefs ?? []).map((def) => {
              const current = pendingCustomFields[def.key] ?? lead.customFields[def.key];
              if (def.field_type === "toggle") {
                return (
                  <label key={def.id} className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-subtle">{def.label}</span>
                    <Switch
                      checked={typeof current === "boolean" ? current : false}
                      onCheckedChange={(v) => setCustomField(def.key, v)}
                    />
                  </label>
                );
              }
              if (def.field_type === "select") {
                const options = Array.isArray(def.options) ? (def.options as string[]) : [];
                return (
                  <div key={def.id}>
                    <p className="mb-1.5 text-xs font-semibold text-subtle">{def.label}</p>
                    <select
                      value={typeof current === "string" ? current : ""}
                      onChange={(e) => setCustomField(def.key, e.target.value)}
                      className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-primary"
                    >
                      <option value="">—</option>
                      {options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }
              return (
                <div key={def.id}>
                  <p className="mb-1.5 text-xs font-semibold text-subtle">{def.label}</p>
                  <input
                    value={typeof current === "string" ? current : ""}
                    onChange={(e) => setCustomField(def.key, e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
              );
            })}
          </div>
        )}

        {hasChanges && (
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={updateLead.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {updateLead.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {t("common.save")}
            </button>
            <button
              type="button"
              onClick={discard}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {t("confirm.cancel")}
            </button>
          </div>
        )}

        <div className="space-y-3 border-t border-border pt-3 text-sm">
          {(() => {
            const contactRowTypes = {
              phone: "tel",
              altPhone: "tel",
              email: "email",
              telegram: "text",
              whatsapp: "text",
            } as const;
            const fieldElements: Record<string, ReactNode> = {};

            for (const key of Object.keys(contactRowTypes) as (keyof typeof contactRowTypes)[]) {
              fieldElements[key] = (
                <div key={key} className="flex items-center justify-between gap-3">
                  <label htmlFor={`lead-info-${key}`} className="shrink-0 text-subtle">
                    {t(`lead.info.${key}`)}
                  </label>
                  <input
                    id={`lead-info-${key}`}
                    type={contactRowTypes[key]}
                    value={pendingContact[key] ?? lead[key]}
                    onChange={(e) => setContactField(key, e.target.value)}
                    className="h-8 w-40 min-w-0 rounded-lg border border-border bg-surface px-2 text-right text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
              );
            }

            fieldElements["source"] = (
              <div key="source" className="flex items-center justify-between gap-3">
                <label htmlFor="lead-info-source" className="shrink-0 text-subtle">
                  {t("lead.info.source")}
                </label>
                <input
                  id="lead-info-source"
                  value={pendingLeadFields.source ?? lead.source}
                  onChange={(e) => setLeadField("source", e.target.value)}
                  className="h-8 w-40 min-w-0 rounded-lg border border-border bg-surface px-2 text-right text-sm text-foreground outline-none focus:border-primary"
                />
              </div>
            );

            fieldElements["campaign"] = (
              <div key="campaign" className="flex items-center justify-between gap-3">
                <label htmlFor="lead-info-campaign" className="shrink-0 text-subtle">
                  {t("lead.info.campaign")}
                </label>
                <input
                  id="lead-info-campaign"
                  value={pendingLeadFields.campaign ?? lead.campaign}
                  onChange={(e) => setLeadField("campaign", e.target.value)}
                  className="h-8 w-40 min-w-0 rounded-lg border border-border bg-surface px-2 text-right text-sm text-foreground outline-none focus:border-primary"
                />
              </div>
            );

            fieldElements["manager"] = (
              <div key="manager" className="flex items-center justify-between gap-3">
                <label htmlFor="lead-info-manager" className="shrink-0 text-subtle">
                  {t("lead.info.manager")}
                </label>
                <select
                  id="lead-info-manager"
                  value={pendingLeadFields.managerId ?? lead.managerId ?? ""}
                  onChange={(e) => setLeadField("managerId", e.target.value)}
                  className="h-8 w-40 min-w-0 rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">{t("lead.info.unassigned")}</option>
                  {(profiles ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </div>
            );

            fieldElements["budget"] = (
              <div key="budget" className="flex items-center justify-between gap-3">
                <label htmlFor="lead-info-budget" className="shrink-0 text-subtle">
                  {t("lead.info.budget")}
                </label>
                <input
                  id="lead-info-budget"
                  type="number"
                  value={pendingLeadFields.budget ?? (lead.budget || lead.expectedRevenue)}
                  onChange={(e) => {
                    // Writes both leads.budget and leads.expected_revenue --
                    // every stage/funnel/dashboard revenue total sums
                    // expected_revenue, and AmoCRM/Bitrix24 sync already
                    // keep the two equal (see the LEAD_INFO_FIELD_KEYS
                    // comment), so this was previously a silent dead end:
                    // editing "Byudjet" here never moved any of those
                    // totals.
                    const next = Number(e.target.value);
                    setLeadField("budget", next);
                    setLeadField("expectedRevenue", next);
                  }}
                  className="h-8 w-40 min-w-0 rounded-lg border border-border bg-surface px-2 text-right text-sm text-foreground outline-none focus:border-primary"
                />
              </div>
            );

            fieldElements["nextFollowUp"] = (
              <div key="nextFollowUp" className="flex items-center justify-between gap-3">
                <label htmlFor="lead-info-next-follow-up" className="shrink-0 text-subtle">
                  {t("lead.info.nextFollowUp")}
                </label>
                <input
                  id="lead-info-next-follow-up"
                  type="datetime-local"
                  value={pendingLeadFields.nextFollowUp ?? toDatetimeLocal(lead.nextFollowUpIso)}
                  onChange={(e) => setLeadField("nextFollowUp", e.target.value)}
                  className="h-8 w-40 min-w-0 rounded-lg border border-border bg-surface px-1 text-right text-xs text-foreground outline-none focus:border-primary"
                />
              </div>
            );

            const readOnlyValues: Record<string, string> = {
              funnel: lead.funnel || "—",
              lastContact: lead.lastContact,
              created: lead.created,
              updated: lead.updated,
            };
            for (const key of Object.keys(readOnlyValues)) {
              fieldElements[key] = (
                <div key={key} className="flex items-start justify-between gap-3">
                  <span className="text-subtle">{t(`lead.info.${key}`)}</span>
                  <span className="text-right font-medium text-foreground">
                    {readOnlyValues[key]}
                  </span>
                </div>
              );
            }

            return getLeadInfoFieldOrder(orgSettings)
              .filter((key) => showField(key))
              .map((key) => fieldElements[key]);
          })()}
        </div>
      </div>
    </SectionCard>
  );
}

// The center column's headline card -- the latest analyzed call's summary
// at a glance, with "Batafsil tahlil" opening the exact same full
// CallAnalysisDetail the Calls section shows inline, just in a dialog so
// the summary itself stays compact instead of the whole page committing to
// showing the full breakdown by default.
function AiSummaryCard({ leadId }: { leadId: string }) {
  const { t } = useI18n();
  const { data: calls } = useAmoCrmCallsRaw();
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const analyzedCalls = useMemo(
    () =>
      (calls ?? [])
        .filter((c) => c.lead_id === leadId && !!c.ai_summary)
        .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()),
    [calls, leadId],
  );
  const latest = analyzedCalls[0] ?? null;
  // Defaults to the latest call every time the dialog reopens, but lets the
  // rep step through every one of this lead's own analyzed calls from
  // inside it -- the same "each call gets its full breakdown" the org-wide
  // /audio-analytics table gives, scoped to just this lead instead of
  // requiring a trip back to that separate page.
  const selected = analyzedCalls.find((c) => c.id === selectedCallId) ?? latest ?? null;

  return (
    <SectionCard
      title={t("lead.aiSummary.title")}
      description={t("lead.aiSummary.desc")}
      actions={
        latest ? (
          <button
            type="button"
            onClick={() => {
              setSelectedCallId(latest.id);
              setDetailOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-mint px-3 py-1.5 text-xs font-semibold text-mint-foreground transition-colors hover:bg-mint-border"
          >
            <FileSearch className="h-3.5 w-3.5" /> {t("lead.aiSummary.detailButton")}
          </button>
        ) : undefined
      }
    >
      {latest ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {latest.score != null && (
              <Pill
                tone={latest.score >= 70 ? "success" : latest.score >= 40 ? "warning" : "danger"}
              >
                {latest.score}/100
              </Pill>
            )}
            {latest.mood && <Pill tone="info">{latest.mood}</Pill>}
            <span className="text-xs text-subtle">{timeAgo(latest.occurred_at)}</span>
          </div>
          <p className="text-sm text-foreground">{latest.ai_summary}</p>
          {latest.next_step && (
            <p className="rounded-lg bg-mint p-2.5 text-xs text-mint-foreground">
              <strong>{t("lead.aiSummary.nextStep")}:</strong> {latest.next_step}
            </p>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-subtle">
          <Sparkles className="h-4 w-4" /> {t("lead.aiSummary.empty")}
        </p>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("lead.aiSummary.detailButton")}</DialogTitle>
          </DialogHeader>
          {analyzedCalls.length > 1 && (
            <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
              {analyzedCalls.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCallId(c.id)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
                    selected?.id === c.id
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {timeAgo(c.occurred_at)}
                </button>
              ))}
            </div>
          )}
          {selected && (
            <CallAnalysisDetail
              call={{
                score: selected.score,
                mood: selected.mood,
                talkRatio: selected.talk_ratio,
                nextStep: selected.next_step,
                aiSummary: selected.ai_summary,
                transcript: selected.transcript,
                recordingUrl: selected.recording_url,
                analysis: selected.analysis as CallAnalysis | null,
                amocrmTaskId: selected.amocrm_task_id,
                aiNoteId: selected.ai_note_id,
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

type UpcomingTask = { id: string; title: string; due: string };

// Merges the AI's own suggested next step (from the latest analyzed call)
// with the lead's upcoming tasks into one card, instead of the AI's
// suggestion being buried inside a collapsed call-analysis panel and
// upcoming tasks sitting in an entirely separate card far down the page.
function NextStepsCard({
  nextStep,
  upcoming,
}: {
  nextStep: string | null;
  upcoming: UpcomingTask[];
}) {
  const { t } = useI18n();
  const hasAnything = !!nextStep || upcoming.length > 0;

  return (
    <SectionCard title={t("lead.nextSteps.title")} description={t("lead.nextSteps.desc")}>
      {!hasAnything && <p className="text-sm text-subtle">{t("lead.nextSteps.empty")}</p>}
      {nextStep && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-mint p-3 text-sm text-mint-foreground">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{nextStep}</p>
        </div>
      )}
      {upcoming.length > 0 && (
        <ul className="space-y-2">
          {upcoming.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <CalendarClock className="h-4 w-4 text-subtle" />
              <div>
                <p className="text-sm font-medium text-foreground">{task.title}</p>
                <p className="text-xs text-subtle">{task.due}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

const AI_ACTION_KEYS = [
  "suggest1",
  "suggest2",
  "suggest3",
  "suggest4",
  "suggest5",
  "suggest6",
  "suggest7",
  "suggest8",
] as const;

// English instructions given straight to the model -- unrelated to which
// UI language the button itself is labeled in (LANG_NAME below already
// tells the model what language to answer in).
const AI_ACTION_PROMPTS: Record<(typeof AI_ACTION_KEYS)[number], string> = {
  suggest1: "Summarize this lead's current status in a few concise sentences.",
  suggest2: "Draft a follow-up email to send to this customer.",
  suggest3: "Estimate the probability of closing this deal (a rough percentage) and explain why.",
  suggest4: "Suggest the single best next action for the rep to take right now.",
  suggest5: "Draft a WhatsApp message to send to this customer.",
  suggest6: "Draft a Telegram message to send to this customer.",
  suggest7: "Generate a short outline for a sales proposal for this customer.",
  suggest8: "Analyze the most recent call and highlight the key risks or objections.",
};

// Real Telegram messaging for one lead, built on the platform's shared bot
// (see telegram.link-lead.ts / telegram.send-lead-message.ts /
// telegram.webhook.ts). Not linked yet -> generate a one-time code the rep
// hands the customer; once redeemed, this becomes a real two-way thread
// logged onto the lead.
function TelegramMessageDialog({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { data: link, isLoading: linkLoading } = useLeadTelegramLink(leadId, { enabled: open });
  const { data: messages } = useLeadTelegramMessages(leadId, { enabled: open && !!link });
  const generateCode = useGenerateLeadTelegramLinkCode();
  const unlink = useUnlinkLeadTelegram();
  const sendMessage = useSendLeadTelegramMessage();
  const [codeInfo, setCodeInfo] = useState<{ code: string; botUsername: string | null } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  async function generate() {
    try {
      const res = await generateCode.mutateAsync(leadId);
      setCodeInfo({ code: res.code, botUsername: res.botUsername });
    } catch (err) {
      toast.error(describeError(err, t("lead.telegram.generateFailed")));
    }
  }

  async function copyCode() {
    if (!codeInfo) return;
    try {
      await navigator.clipboard.writeText(codeInfo.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("lead.telegram.copyFailed"));
    }
  }

  async function send() {
    if (!text.trim()) return;
    try {
      await sendMessage.mutateAsync({ leadId, text: text.trim() });
      setText("");
    } catch (err) {
      toast.error(describeError(err, t("lead.telegram.sendFailed")));
    }
  }

  async function confirmUnlinkNow() {
    try {
      await unlink.mutateAsync(leadId);
      setCodeInfo(null);
    } catch (err) {
      toast.error(describeError(err, t("lead.telegram.unlinkFailed")));
    } finally {
      setConfirmUnlink(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> {t("lead.telegram.title")}
          </DialogTitle>
        </DialogHeader>

        {linkLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : link ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                {t("lead.telegram.linkedAs", {
                  name: link.chat_first_name || link.chat_username || String(link.chat_id),
                })}
              </span>
              <button
                type="button"
                onClick={() => setConfirmUnlink(true)}
                className="font-medium text-destructive hover:underline"
              >
                {t("lead.telegram.unlink")}
              </button>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border bg-background p-3">
              {(messages ?? []).length === 0 ? (
                <p className="py-6 text-center text-xs text-subtle">{t("lead.telegram.empty")}</p>
              ) : (
                (messages ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2 text-xs",
                      m.direction === "out"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-surface text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    <p
                      className={cn(
                        "mt-1 text-[10px]",
                        m.direction === "out" ? "text-primary-foreground/70" : "text-subtle",
                      )}
                    >
                      {timeAgo(m.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={t("lead.telegram.messagePlaceholder")}
                className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!text.trim() || sendMessage.isPending}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendMessage.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        ) : codeInfo ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {t("lead.telegram.shareInstructions", {
                bot: codeInfo.botUsername ? `@${codeInfo.botUsername}` : t("lead.telegram.thisBot"),
              })}
            </p>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
              <code className="text-lg font-bold tracking-widest text-foreground">
                {codeInfo.code}
              </code>
              <button
                type="button"
                onClick={() => void copyCode()}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t("lead.telegram.copied") : t("lead.telegram.copyCode")}
              </button>
            </div>
            <p className="text-xs text-subtle">{t("lead.telegram.expiresHint")}</p>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>{t("lead.telegram.notLinkedDesc")}</p>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={generateCode.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {generateCode.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("lead.telegram.generateButton")}
            </button>
          </div>
        )}

        <ConfirmDialog
          open={confirmUnlink}
          onOpenChange={setConfirmUnlink}
          title={t("lead.telegram.unlinkConfirmTitle")}
          description={t("lead.telegram.unlinkConfirmDesc")}
          confirmLabel={t("lead.telegram.unlink")}
          onConfirm={() => void confirmUnlinkNow()}
        />
      </DialogContent>
    </Dialog>
  );
}

// Real per-lead WhatsApp messaging, via the org's own WhatsApp Business
// Cloud API credentials (see /integrations -> WhatsApp). Unlike Telegram,
// there's no link-code step -- a WhatsApp Business number can message any
// customer directly, so this just sends to the lead's own contact
// phone/whatsapp number and shows the resulting thread (both directions,
// inbound logged by the webhook).
function WhatsAppMessageDialog({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { data: messages, isLoading } = useLeadWhatsappMessages(leadId, { enabled: open });
  const sendMessage = useSendLeadWhatsappMessage();
  const [text, setText] = useState("");

  async function send() {
    if (!text.trim()) return;
    try {
      await sendMessage.mutateAsync({ leadId, text: text.trim() });
      setText("");
    } catch (err) {
      toast.error(describeError(err, t("lead.whatsapp.sendFailed")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" /> {t("lead.whatsapp.title")}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border bg-background p-3">
              {(messages ?? []).length === 0 ? (
                <p className="py-6 text-center text-xs text-subtle">{t("lead.whatsapp.empty")}</p>
              ) : (
                (messages ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2 text-xs",
                      m.direction === "out"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-surface text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    <p
                      className={cn(
                        "mt-1 text-[10px]",
                        m.direction === "out" ? "text-primary-foreground/70" : "text-subtle",
                      )}
                    >
                      {timeAgo(m.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={t("lead.whatsapp.messagePlaceholder")}
                className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!text.trim() || sendMessage.isPending}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendMessage.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const CONTRACT_STATUS_TONE: Record<string, "neutral" | "info" | "success"> = {
  draft: "neutral",
  sent: "info",
  signed: "success",
};

// Lightweight contract generation + "simple" e-signature (typed name + IP +
// timestamp, not a qualified/PKI digital signature) -- see
// src/lib/contracts.ts and the /sign/$token public page.
function ContractsTab({ lead }: { lead: CrmLeadView }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { format: formatCurrency } = useCurrency();
  const { data: templates } = useContractTemplatesRaw();
  const { data: contracts, isLoading } = useLeadContracts(lead.id);
  const createContract = useCreateLeadContract();
  const markSent = useMarkContractSent();

  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function loadTemplate(id: string) {
    setTemplateId(id);
    const tpl = (templates ?? []).find((tp) => tp.id === id);
    if (!tpl) return;
    setTitle(tpl.name);
    setBody(renderContractTemplate(tpl.body, lead, lead.owner, formatCurrency));
  }

  async function generate() {
    if (!title.trim() || !body.trim() || !user?.organizationId) return;
    try {
      await createContract.mutateAsync({
        organizationId: user.organizationId,
        leadId: lead.id,
        templateId: templateId || null,
        title: title.trim(),
        body: body.trim(),
        createdBy: user.id,
      });
      setTitle("");
      setBody("");
      setTemplateId("");
      toast.success(t("lead.contracts.generatedToast"));
    } catch (err) {
      toast.error(describeError(err, t("lead.contracts.generateFailed")));
    }
  }

  function signLink(token: string): string {
    return `${window.location.origin}/sign/${token}`;
  }

  async function copyLink(id: string, token: string) {
    try {
      await navigator.clipboard.writeText(signLink(token));
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      toast.error(t("lead.contracts.copyFailed"));
    }
  }

  return (
    <SectionCard title={t("lead.contracts.title")} description={t("lead.contracts.desc")}>
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <select
          value={templateId}
          onChange={(e) => loadTemplate(e.target.value)}
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
        >
          <option value="">{t("lead.contracts.pickTemplate")}</option>
          {(templates ?? []).map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("lead.contracts.titlePlaceholder")}
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none placeholder:text-subtle focus:border-primary/40"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder={t("lead.contracts.bodyPlaceholder")}
          className="w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none placeholder:text-subtle focus:border-primary/40"
        />
        <button
          type="button"
          onClick={() => void generate()}
          disabled={createContract.isPending || !title.trim() || !body.trim()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {createContract.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSignature className="h-4 w-4" />
          )}
          {t("lead.contracts.generateButton")}
        </button>
      </div>

      {isLoading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}
      {!isLoading && (contracts ?? []).length === 0 && (
        <p className="mt-4 text-sm text-subtle">{t("lead.contracts.empty")}</p>
      )}
      <ul className="mt-4 space-y-3">
        {(contracts ?? []).map((c) => (
          <li key={c.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{c.title}</p>
              <Pill tone={CONTRACT_STATUS_TONE[c.status] ?? "neutral"}>
                {t(`lead.contracts.status.${c.status}`)}
              </Pill>
            </div>
            {c.status === "signed" && c.signer_name && (
              <p className="mt-1 text-xs text-subtle">
                {t("lead.contracts.signedBy", { name: c.signer_name })}
                {c.signed_at && ` · ${new Date(c.signed_at).toLocaleString()}`}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyLink(c.id, c.sign_token)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                {copiedId === c.id ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiedId === c.id ? t("lead.contracts.copied") : t("lead.contracts.copyLink")}
              </button>
              <a
                href={signLink(c.sign_token)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {t("lead.contracts.openLink")}
              </a>
              {c.status === "draft" && (
                <button
                  type="button"
                  onClick={() => void markSent.mutateAsync({ id: c.id, leadId: lead.id })}
                  disabled={markSent.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" /> {t("lead.contracts.markSent")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// Real per-lead email sending, via the org's own SMTP credentials (see
// /admin -> Integrations -> Email). No inbound mailbox polling yet, so this
// only shows the org's own sent history, not real replies.
function EmailMessageDialog({
  leadId,
  defaultTo,
  open,
  onOpenChange,
}: {
  leadId: string;
  defaultTo: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { data: emails } = useLeadEmails(leadId, { enabled: open });
  const sendEmail = useSendLeadEmail();
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  async function send() {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    try {
      await sendEmail.mutateAsync({
        leadId,
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
      toast.success(t("lead.email.sentToast"));
      setSubject("");
      setBody("");
    } catch (err) {
      toast.error(describeError(err, t("lead.email.sendFailed")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> {t("lead.email.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t("lead.email.toPlaceholder")}
            className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("lead.email.subjectPlaceholder")}
            className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("lead.email.bodyPlaceholder")}
            rows={5}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary/40"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!to.trim() || !subject.trim() || !body.trim() || sendEmail.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sendEmail.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {t("lead.email.sendButton")}
          </button>

          {(emails ?? []).length > 0 && (
            <div className="max-h-48 space-y-2 overflow-y-auto border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("lead.email.historyTitle")}
              </p>
              {(emails ?? []).map((e) => (
                <div
                  key={e.id}
                  className="rounded-xl border border-border bg-surface p-2.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">{e.subject}</span>
                    <span className="shrink-0 text-subtle">{timeAgo(e.created_at)}</span>
                  </div>
                  <p className="mt-1 text-subtle">
                    {t("lead.email.toLabel")}: {e.to_email}
                  </p>
                  {e.error && <p className="mt-1 text-destructive">{e.error}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeadWorkspace() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { from } = Route.useSearch();
  const backLabel = t(from ? (BACK_LABEL_KEY[from] ?? "lead.backToLeads") : "lead.backToLeads");
  const { leadId } = Route.useParams();
  const { user } = useAuth();
  const { lead, isLoading } = useLeadById(leadId);
  const { data: profiles } = useProfilesRaw();
  const { data: orgSettings } = useOrgGeneralSettings();
  const showSection = (key: Parameters<typeof isLeadSectionVisible>[1]) =>
    isLeadSectionVisible(orgSettings, key);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Timeline");
  const [openCallId, setOpenCallId] = useState<string | null>(null);
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false);
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const activities = useLeadActivities(lead?.id);
  const createActivity = useCreateLeadActivity();
  const createTask = useCreateTask();
  const { rows: allTasks } = useTasksView();
  const canCreateTasks = usePermission("Create tasks");

  const leadFiles = useLeadFiles(lead?.id);
  const uploadLeadFile = useUploadLeadFile();
  const deleteLeadFile = useDeleteLeadFile();
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  const chat = useAiAssistantChat();
  const amoCrmLinkFor = useAmoCrmLink();
  const startCall = useStartCall();
  const [aiOutput, setAiOutput] = useState<string | null>(null);
  const [activeAiAction, setActiveAiAction] = useState<string | null>(null);

  // Every quick-action button and the free-form "deep analysis" button
  // share this one call -- only the trailing instruction differs, so a
  // dead placeholder button ("Ushbu lidni umumlashtirish" etc, previously
  // with no onClick at all) becomes a real, working AI action instead of
  // eight separate near-duplicate code paths.
  async function runAiAction(key: string, instruction: string) {
    if (!lead) return;
    setActiveAiAction(key);
    try {
      const notes = (activities.data ?? [])
        .filter((a) => a.type === "note")
        .map((n) => `- ${n.content}`)
        .join("\n");
      const events = (activities.data ?? [])
        .slice(0, 10)
        .map((e) => `- [${e.type}] ${e.content}`)
        .join("\n");
      const reply = await chat.mutateAsync({
        messages: [
          {
            role: "user",
            content: `Lead: ${lead.name} (${lead.company || "no company"})\nStage: ${lead.stage}\nTemperature: ${lead.temperature}\nScore: ${lead.score}\nTags: ${lead.tags.join(", ") || "none"}\nExpected revenue: ${lead.expectedRevenue}\nSource: ${lead.source || "unknown"}\nCreated: ${lead.created}, last contact: ${lead.lastContact}\n\nRecent activity:\n${events || "none recorded"}\n\nNotes:\n${notes || "none"}\n\n${instruction} Respond in ${LANG_NAME[lang]}.`,
          },
        ],
      });
      setAiOutput(reply);
    } catch (err) {
      setAiOutput(err instanceof Error ? err.message : t("lead.deepAnalysis.failed"));
    } finally {
      setActiveAiAction(null);
    }
  }

  function generateDeepAnalysis() {
    return runAiAction(
      "deepAnalysis",
      "Deep-analyze this CRM lead and write a thorough assessment of where the customer stands and what to do next. Cover: overall customer status/intent, key signals from the activity so far, likely objections or risks, and 2-3 concrete next actions for the rep.",
    );
  }

  const leadTasks = useMemo(
    () => allTasks.filter((t) => t.leadId === lead?.id),
    [allTasks, lead?.id],
  );
  const upcoming = useMemo(
    () =>
      leadTasks
        .filter((t) => t.dueRaw)
        .sort((a, b) => new Date(a.dueRaw!).getTime() - new Date(b.dueRaw!).getTime())
        .slice(0, 3),
    [leadTasks],
  );

  const { data: amoCalls } = useAmoCrmCallsRaw();
  const latestNextStep = useMemo(() => {
    const analyzed = (amoCalls ?? [])
      .filter((c) => c.lead_id === lead?.id && !!c.next_step)
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
    return analyzed[0]?.next_step ?? null;
  }, [amoCalls, lead?.id]);

  const [noteText, setNoteText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");

  if (isLoading) {
    return <PageLoader />;
  }
  if (!lead) return <LeadNotFound />;

  const amoLink = amoCrmLinkFor(lead.amocrmId);

  async function saveNote() {
    if (!noteText.trim() || !lead) return;
    await createActivity.mutateAsync({
      lead_id: lead.id,
      type: "note",
      content: noteText.trim(),
      created_by: user?.id ?? null,
    });
    setNoteText("");
  }

  async function addTask() {
    if (!taskTitle.trim() || !lead) return;
    await createTask.mutateAsync({
      title: taskTitle.trim(),
      lead_id: lead.id,
      assignee_id: user?.id ?? null,
      created_by: user?.id ?? null,
      organization_id: user!.organizationId!,
    });
    setTaskTitle("");
  }

  async function onFilePicked(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file || !lead) return;
    try {
      await uploadLeadFile.mutateAsync({ leadId: lead.id, file });
    } catch (err) {
      toast.error(describeError(err, t("lead.files.uploadFailed")));
    }
  }

  async function downloadFile(fileId: string) {
    setDownloadingFileId(fileId);
    try {
      const url = await fetchLeadFileDownloadUrl(fileId);
      window.open(url, "_blank", "noreferrer");
    } catch (err) {
      toast.error(describeError(err, t("lead.files.downloadFailed")));
    } finally {
      setDownloadingFileId(null);
    }
  }

  async function removeFile(fileId: string) {
    if (!lead) return;
    try {
      await deleteLeadFile.mutateAsync({ fileId, leadId: lead.id });
    } catch (err) {
      toast.error(describeError(err, t("lead.files.deleteFailed")));
    }
  }

  const profileName = (id: string | null) =>
    (profiles ?? []).find((p) => p.id === id)?.full_name || t("lead.someone");

  const sectionOrder = getLeadWorkspaceSectionOrder(orgSettings);
  const sectionElements: Partial<Record<LeadWorkspaceSectionKey, ReactNode>> = {};
  sectionElements["tags"] = (
    <SectionCard key="tags" title={t("lead.tags.title")}>
      <TagEditor leadId={lead.id} tags={lead.tags} />
    </SectionCard>
  );
  sectionElements["customerProfile"] = (
    <CustomerProfileSection key="customerProfile" profile={lead.aiCustomerProfile} />
  );
  sectionElements["aiSummary"] = <AiSummaryCard key="aiSummary" leadId={lead.id} />;
  sectionElements["customerRemark"] = (
    <SectionCard
      key="customerRemark"
      title={t("lead.remark.title")}
      description={t("lead.remark.desc")}
      actions={
        <button
          type="button"
          onClick={() => void saveNote()}
          disabled={createActivity.isPending || !noteText.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {createActivity.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("lead.notes.save")}
        </button>
      }
    >
      <textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder={t("lead.remark.placeholder")}
        className="h-24 w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none placeholder:text-subtle focus:border-primary/40"
      />
      {(activities.data ?? []).some((a) => a.type === "note") && (
        <p className="mt-2 text-xs text-subtle">
          {t("lead.remark.latestHint")}{" "}
          <button
            type="button"
            onClick={() => setTab("Notes")}
            className="font-semibold text-primary hover:underline"
          >
            {t("lead.tab.Notes")}
          </button>
        </p>
      )}
    </SectionCard>
  );
  sectionElements["nextSteps"] = (
    <NextStepsCard key="nextSteps" nextStep={latestNextStep} upcoming={upcoming} />
  );
  sectionElements["actionHistory"] = (
    <LeadPanelSidebar
      key="actionHistory"
      leadId={lead.id}
      createdAtIso={lead.createdAtIso}
      openId={openCallId}
      setOpenId={setOpenCallId}
    />
  );
  sectionElements["leadScore"] = (
    <SectionCard key="leadScore" title={t("lead.score.title")} description={t("lead.score.desc")}>
      <div className="flex items-end gap-3">
        <p className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {lead.score}
        </p>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-success" style={{ width: `${lead.score}%` }} />
      </div>
    </SectionCard>
  );
  sectionElements["audioAnalysis"] = (
    <LeadCallsSection
      key="audioAnalysis"
      leadId={lead.id}
      openId={openCallId}
      setOpenId={setOpenCallId}
    />
  );
  sectionElements["telephonyCalls"] = <LeadPbxCallsSection key="telephonyCalls" leadId={lead.id} />;
  sectionElements["aiAssistant"] = (
    <SectionCard
      key="aiAssistant"
      title={t("lead.ai.title")}
      description={t("lead.ai.desc")}
      actions={
        <button
          type="button"
          onClick={() => void generateDeepAnalysis()}
          disabled={activeAiAction === "deepAnalysis"}
          className="inline-flex items-center gap-2 rounded-xl bg-mint px-3 py-1.5 text-xs font-semibold text-mint-foreground transition-colors hover:bg-mint-border disabled:opacity-50"
        >
          {activeAiAction === "deepAnalysis" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {t("lead.deepAnalysis.title")}
        </button>
      }
    >
      <div className="mb-4 rounded-xl bg-mint p-4 text-sm text-mint-foreground">
        <Bot className="mb-2 h-4 w-4" />
        {t("lead.ai.hint", { name: lead.name })}
      </div>
      <div className="grid gap-2">
        {AI_ACTION_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => void runAiAction(key, AI_ACTION_PROMPTS[key])}
            disabled={activeAiAction === key}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            {activeAiAction === key && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
            {t(`lead.ai.${key}`)}
          </button>
        ))}
      </div>

      {aiOutput && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{aiOutput}</p>
        </div>
      )}
    </SectionCard>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => router.history.back()}
        className="mb-3 inline-flex items-center gap-1.5 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-500 shadow-soft transition-colors hover:border-amber-400/60 hover:bg-amber-400/20 sm:mb-4 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
      >
        <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> {backLabel}
      </button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-mint text-xs font-semibold text-mint-foreground sm:h-12 sm:w-12 sm:rounded-2xl sm:text-sm">
            {lead.initials}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h1 className="truncate text-base font-semibold text-foreground sm:text-xl">
                {lead.name}
              </h1>
              <TemperatureBadge temperature={lead.temperature} />
            </div>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              {lead.position || "—"} · {lead.company || "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <Pill tone={lead.stage === "Won" ? "success" : "info"}>{lead.stage}</Pill>
          {amoLink && (
            <ChannelActionButton
              icon={ExternalLink}
              label={t("leadFilter.openInAmoCrm")}
              href={amoLink}
            />
          )}
          <ChannelActionButton
            icon={Phone}
            label={t("lead.actionCall")}
            tone="call"
            loading={startCall.isPending}
            disabled={!lead.phone}
            onClick={() => {
              if (!lead.phone) return;
              startCall.mutate(
                { toNumber: lead.phone, leadId: lead.id },
                {
                  onSuccess: () => toast.success(t("lead.callStarted")),
                  onError: (err) => toast.error(describeError(err, t("lead.callFailed"))),
                },
              );
            }}
          />
          <ChannelActionButton
            icon={MessageCircle}
            label={t("lead.actionWhatsapp")}
            tone="whatsapp"
            onClick={() => setWhatsappDialogOpen(true)}
          />
          <WhatsAppMessageDialog
            leadId={lead.id}
            open={whatsappDialogOpen}
            onOpenChange={setWhatsappDialogOpen}
          />
          <ChannelActionButton
            icon={Mail}
            label={t("lead.actionEmail")}
            tone="email"
            onClick={() => setEmailDialogOpen(true)}
          />
          <ChannelActionButton
            icon={Send}
            label={t("lead.actionTelegram")}
            tone="telegram"
            onClick={() => setTelegramDialogOpen(true)}
          />
          <TelegramMessageDialog
            leadId={lead.id}
            open={telegramDialogOpen}
            onOpenChange={setTelegramDialogOpen}
          />
          <EmailMessageDialog
            leadId={lead.id}
            defaultTo={lead.email}
            open={emailDialogOpen}
            onOpenChange={setEmailDialogOpen}
          />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* LEFT — lead information */}
        <div className="space-y-5">
          <EditableLeadInfoCard lead={lead} />

          {sectionOrder
            .filter((key) => LEFT_SECTION_KEYS.has(key) && showSection(key))
            .map((key) => sectionElements[key])}
        </div>

        {/* CENTER — workspace tabs */}
        <div className="space-y-5">
          {sectionOrder
            .filter((key) => CENTER_SECTION_KEYS.has(key) && showSection(key))
            .map((key) => sectionElements[key])}

          <div className="flex flex-nowrap gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1">
            {TABS.map((tb) => (
              <button
                key={tb}
                onClick={() => setTab(tb)}
                className={cn(
                  "shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:py-2 sm:text-sm",
                  tab === tb
                    ? "bg-background text-foreground shadow-soft"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {t(`lead.tab.${tb}`)}
              </button>
            ))}
          </div>

          {tab === "Timeline" && (
            <SectionCard title={t("lead.timeline.title")} description={t("lead.timeline.desc")}>
              {activities.isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
                </div>
              )}
              {!activities.isLoading && (activities.data?.length ?? 0) === 0 && (
                <p className="text-sm text-subtle">{t("lead.timeline.empty")}</p>
              )}
              <ol className="relative space-y-6 border-l border-border pl-5">
                {(activities.data ?? []).map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={e.type === "ai" || e.type === "ai_note" ? "success" : "info"}>
                        {e.type === "ai_note" ? t("lead.timeline.typeAiNote") : e.type}
                      </Pill>
                      <p className="text-sm font-medium text-foreground">{e.content}</p>
                    </div>
                    <p className="mt-1 text-xs text-subtle">
                      {timeAgo(e.created_at)} · {profileName(e.created_by)}
                    </p>
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}

          {tab === "Notes" && (
            <SectionCard title={t("lead.notes.title")} description={t("lead.notes.desc")}>
              {(activities.data ?? []).filter((a) => a.type === "note").length === 0 ? (
                <p className="text-sm text-subtle">{t("lead.notes.empty")}</p>
              ) : (
                <ul className="space-y-4">
                  {(activities.data ?? [])
                    .filter((a) => a.type === "note")
                    .map((n) => (
                      <li key={n.id} className="rounded-xl border border-border bg-surface p-4">
                        <p className="text-sm text-foreground">{n.content}</p>
                        <p className="mt-2 text-xs text-subtle">
                          {profileName(n.created_by)} · {timeAgo(n.created_at)}
                        </p>
                      </li>
                    ))}
                </ul>
              )}
            </SectionCard>
          )}

          {tab === "Tasks" && (
            <SectionCard title={t("lead.tasks.title")} description={t("lead.tasks.desc")}>
              {canCreateTasks && (
                <div className="mb-4 flex items-center gap-2">
                  <input
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder={t("lead.tasks.placeholder")}
                    className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none placeholder:text-subtle focus:border-primary/40"
                  />
                  <button
                    onClick={addTask}
                    disabled={createTask.isPending || !taskTitle.trim()}
                    className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {t("common.add")}
                  </button>
                </div>
              )}
              {leadTasks.length === 0 && (
                <p className="text-sm text-subtle">{t("lead.tasks.empty")}</p>
              )}
              <ul className="space-y-3">
                {leadTasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.title}</p>
                      <p className="mt-1 text-xs text-subtle">{t.assignee}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill
                        tone={
                          t.priority === "Urgent"
                            ? "danger"
                            : t.priority === "High"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {t.priority}
                      </Pill>
                      <Pill tone="info">{t.status}</Pill>
                      <span className="text-xs text-subtle">{t.due}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {tab === "Files" && (
            <SectionCard title={t("lead.files.title")} description={t("lead.files.desc")}>
              <label className="mb-4 flex h-24 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                {uploadLeadFile.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("lead.files.uploading")}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" /> {t("lead.files.uploadButton")}
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploadLeadFile.isPending}
                  onChange={(e) => {
                    void onFilePicked(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>

              {leadFiles.isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
                </div>
              )}
              {!leadFiles.isLoading && (leadFiles.data ?? []).length === 0 && (
                <p className="text-sm text-subtle">{t("lead.files.empty")}</p>
              )}
              <ul className="space-y-3">
                {(leadFiles.data ?? []).map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {f.file_name}
                        </p>
                        <p className="mt-1 text-xs text-subtle">
                          {formatFileSize(f.size_bytes)} · {timeAgo(f.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void downloadFile(f.id)}
                        disabled={downloadingFileId === f.id}
                        className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
                        title={t("lead.files.download")}
                      >
                        {downloadingFileId === f.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeFile(f.id)}
                        disabled={deleteLeadFile.isPending}
                        className="rounded-lg border border-border p-2 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                        title={t("lead.files.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {tab === "Contracts" && <ContractsTab lead={lead} />}
        </div>

        {/* RIGHT — Lid paneli (history) + AI + quick actions */}
        <div className="space-y-5">
          {sectionOrder
            .filter((key) => RIGHT_SECTION_KEYS.has(key) && showSection(key))
            .map((key) => sectionElements[key])}
        </div>
      </div>
    </>
  );
}
