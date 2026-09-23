import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  ExternalLink,
  FileSearch,
  Headphones,
  Loader2,
  MessageCircle,
  Mail,
  Phone,
  Send,
  Sparkles,
} from "lucide-react";
import { SectionCard, Pill, PageLoader } from "@/components/layout/Primitives";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TagChip, TagEditor } from "@/components/crm/tag-editor";
import { currency } from "@/lib/mock-data";
import { cn, describeError, timeAgo } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useI18n, type Lang } from "@/lib/i18n";
import type { StoredCustomerProfile } from "@/lib/ai-customer-profile";
import {
  useAiAssistantChat,
  useAmoCrmCallsRaw,
  useAmoCrmLink,
  useAnalyzeCall,
  useAuditTrail,
  useCreateLeadActivity,
  useCreateTask,
  useLeadById,
  useLeadActivities,
  usePbxCalls,
  usePermission,
  usePipelineStagesRaw,
  useProfilesRaw,
  useStartCall,
  useTasksView,
  useUpdateLead,
  type CallAnalysis,
  type CrmLeadView,
} from "@/hooks/use-crm-data";
import { toast } from "sonner";
import { CallAnalysisDetail } from "@/components/audio/CallAnalysisDetail";
import { PermissionGate } from "@/components/PermissionGate";

const LANG_NAME: Record<Lang, string> = { uz: "o'zbek", ru: "русский", en: "English" };

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

const TABS = ["Timeline", "Notes", "Tasks"] as const;

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
        <div className="surface-card space-y-2 p-4">
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

        <div className="surface-card space-y-2 p-4">
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

        <div className="surface-card space-y-2 p-4">
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

        <div className="surface-card space-y-2 p-4">
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
function EditableLeadInfoCard({ lead }: { lead: CrmLeadView }) {
  const { t } = useI18n();
  const updateLead = useUpdateLead();
  const { data: profiles } = useProfilesRaw();

  const [pendingStageId, setPendingStageId] = useState<string | null>(null);
  const [pendingOwnerId, setPendingOwnerId] = useState<string | null>(null);
  const [pendingPriority, setPendingPriority] = useState<CrmLeadView["priority"] | null>(null);

  const hasChanges = pendingStageId !== null || pendingOwnerId !== null || pendingPriority !== null;

  function discard() {
    setPendingStageId(null);
    setPendingOwnerId(null);
    setPendingPriority(null);
  }

  async function save() {
    try {
      await updateLead.mutateAsync({
        id: lead.id,
        patch: {
          ...(pendingStageId !== null ? { stage_id: pendingStageId } : {}),
          ...(pendingOwnerId !== null ? { owner_id: pendingOwnerId || null } : {}),
          ...(pendingPriority !== null ? { priority: pendingPriority } : {}),
        },
      });
      toast.success(t("lead.info.saved"));
      discard();
    } catch (err) {
      toast.error(describeError(err, t("lead.info.saveFailed")));
    }
  }

  return (
    <SectionCard title={t("lead.info.title")}>
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

        <dl className="space-y-3 border-t border-border pt-3">
          {[
            [t("lead.info.phone"), lead.phone || "—"],
            [t("lead.info.altPhone"), lead.altPhone || "—"],
            [t("lead.info.email"), lead.email || "—"],
            [t("lead.info.telegram"), lead.telegram || "—"],
            [t("lead.info.whatsapp"), lead.whatsapp || "—"],
            [t("lead.info.source"), lead.source || "—"],
            [t("lead.info.campaign"), lead.campaign || "—"],
            [t("lead.info.manager"), lead.manager],
            [t("lead.info.budget"), currency(lead.budget)],
            [t("lead.info.expectedRevenue"), currency(lead.expectedRevenue)],
            [t("lead.info.funnel"), lead.funnel || "—"],
            [t("lead.info.nextFollowUp"), lead.nextFollowUp],
            [t("lead.info.lastContact"), lead.lastContact],
            [t("lead.info.created"), lead.created],
            [t("lead.info.updated"), lead.updated],
          ].map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-3">
              <dt className="text-subtle">{k}</dt>
              <dd className="text-right font-medium text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
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

  const latest = useMemo(() => {
    const analyzed = (calls ?? [])
      .filter((c) => c.lead_id === leadId && !!c.ai_summary)
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
    return analyzed[0] ?? null;
  }, [calls, leadId]);

  return (
    <SectionCard
      title={t("lead.aiSummary.title")}
      description={t("lead.aiSummary.desc")}
      actions={
        latest ? (
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
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
          {latest && (
            <CallAnalysisDetail
              call={{
                score: latest.score,
                mood: latest.mood,
                talkRatio: latest.talk_ratio,
                nextStep: latest.next_step,
                aiSummary: latest.ai_summary,
                transcript: latest.transcript,
                recordingUrl: latest.recording_url,
                analysis: latest.analysis as CallAnalysis | null,
                amocrmTaskId: latest.amocrm_task_id,
                aiNoteId: latest.ai_note_id,
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

function LeadWorkspace() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { from } = Route.useSearch();
  const backLabel = t(from ? (BACK_LABEL_KEY[from] ?? "lead.backToLeads") : "lead.backToLeads");
  const { leadId } = Route.useParams();
  const { user } = useAuth();
  const { lead, isLoading } = useLeadById(leadId);
  const { data: profiles } = useProfilesRaw();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Timeline");
  const [openCallId, setOpenCallId] = useState<string | null>(null);

  const activities = useLeadActivities(lead?.id);
  const createActivity = useCreateLeadActivity();
  const createTask = useCreateTask();
  const { rows: allTasks } = useTasksView();
  const canCreateTasks = usePermission("Create tasks");

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

  const profileName = (id: string | null) =>
    (profiles ?? []).find((p) => p.id === id)?.full_name || t("lead.someone");

  return (
    <>
      <button
        type="button"
        onClick={() => router.history.back()}
        className="mb-4 inline-flex items-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-500 shadow-soft transition-colors hover:border-amber-400/60 hover:bg-amber-400/20"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint text-sm font-semibold text-mint-foreground">
            {lead.initials}
          </span>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{lead.name}</h1>
            <p className="text-sm text-muted-foreground">
              {lead.position || "—"} · {lead.company || "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={lead.temperature === "Hot" ? "danger" : "warning"}>{lead.temperature}</Pill>
          <Pill tone={lead.stage === "Won" ? "success" : "info"}>{lead.stage}</Pill>
          {amoLink && (
            <a
              href={amoLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              <ExternalLink className="h-4 w-4" /> {t("leadFilter.openInAmoCrm")}
            </a>
          )}
          <button
            type="button"
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
            disabled={!lead.phone || startCall.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {startCall.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className="h-4 w-4" />
            )}
            {t("lead.actionCall")}
          </button>
          {[
            { icon: MessageCircle, key: "WhatsApp", label: t("lead.actionWhatsapp") },
            { icon: Send, key: "Telegram", label: t("lead.actionTelegram") },
            { icon: Mail, key: "Email", label: t("lead.actionEmail") },
          ].map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => toast.info(t("lead.messaging.notConnected", { channel: a.label }))}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              <a.icon className="h-4 w-4" /> {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* LEFT — lead information */}
        <div className="space-y-5">
          <EditableLeadInfoCard lead={lead} />

          <SectionCard title={t("lead.location.title")}>
            <p className="text-sm text-muted-foreground">{lead.address || "—"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {lead.city || "—"}, {lead.region || "—"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{lead.country || "—"}</p>
          </SectionCard>

          <SectionCard title={t("lead.tags.title")}>
            <TagEditor leadId={lead.id} tags={lead.tags} />
          </SectionCard>
        </div>

        {/* CENTER — workspace tabs */}
        <div className="space-y-5">
          <CustomerProfileSection profile={lead.aiCustomerProfile} />

          <AiSummaryCard leadId={lead.id} />

          <NextStepsCard nextStep={latestNextStep} upcoming={upcoming} />

          <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1">
            {TABS.map((tb) => (
              <button
                key={tb}
                onClick={() => setTab(tb)}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
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
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={t("lead.notes.placeholder")}
                className="h-24 w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none placeholder:text-subtle focus:border-primary/40"
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={saveNote}
                  disabled={createActivity.isPending || !noteText.trim()}
                  className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {t("lead.notes.save")}
                </button>
              </div>
              <ul className="mt-6 space-y-4">
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
        </div>

        {/* RIGHT — Lid paneli (history) + AI + quick actions */}
        <div className="space-y-5">
          <LeadPanelSidebar
            leadId={lead.id}
            createdAtIso={lead.createdAtIso}
            openId={openCallId}
            setOpenId={setOpenCallId}
          />

          <SectionCard title={t("lead.score.title")} description={t("lead.score.desc")}>
            <div className="flex items-end gap-3">
              <p className="text-4xl font-semibold tracking-tight text-foreground">{lead.score}</p>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-success" style={{ width: `${lead.score}%` }} />
            </div>
          </SectionCard>

          <LeadCallsSection leadId={lead.id} openId={openCallId} setOpenId={setOpenCallId} />

          <LeadPbxCallsSection leadId={lead.id} />

          <SectionCard
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
                  {activeAiAction === key && (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  )}
                  {t(`lead.ai.${key}`)}
                </button>
              ))}
            </div>

            {aiOutput && (
              <div className="mt-4 rounded-xl border border-border bg-surface p-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {aiOutput}
                </p>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
