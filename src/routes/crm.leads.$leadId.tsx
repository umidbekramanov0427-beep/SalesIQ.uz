import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileSearch,
  FileSignature,
  Layers,
  Link2,
  Loader2,
  MessageCircle,
  Mail,
  MoreHorizontal,
  Receipt,
  Paperclip,
  Phone,
  RefreshCw,
  Send,
  Settings,
  Share2,
  Sparkles,
  Target,
  Trash2,
  Upload,
  User,
  SearchX,
  Info,
  ArrowRightCircle,
  StickyNote,
  ListChecks,
  Pencil,
  X,
} from "lucide-react";
import { usePhone } from "@/components/phone/PhoneProvider";
import { SectionCard, Pill, PageLoader } from "@/components/layout/Primitives";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
import { cn, describeError, timeAgo } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useCrmEnabled } from "@/lib/use-org-access";
import { useCurrency } from "@/lib/currency";
import { renderContractTemplate } from "@/lib/contracts";
import { useI18n, type Lang } from "@/lib/i18n";
import { useGoBack } from "@/components/layout/BackButton";
import {
  getLeadInfoFieldOrder,
  getLeadWorkspaceSectionOrder,
  isLeadSectionVisible,
  type LeadWorkspaceSectionKey,
  useAiAssistantChat,
  useLeadAmoCalls,
  useTriggerAmoCrmSync,
  useAmoCrmLink,
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
  useOrgGeneralSettings,
  usePbxCalls,
  usePermission,
  usePipelineStagesRaw,
  useProfilesRaw,
  useSendLeadEmail,
  useSendLeadTelegramMessage,
  useLeadTasksView,
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
import { UploadCallDialog } from "@/components/audio/UploadCallDialog";
import { InvoiceEditorDialog } from "@/components/invoices/InvoiceEditorDialog";
import { LeadAiScoreCard } from "@/components/lead/LeadAiScoreCard";
import { StartSalesbotMenuItems } from "@/components/automations/StartSalesbotMenu";
import {
  CallAnalysisSection,
  CustomerInfoSection,
  LeadHistoryPanel,
  LeadInfoOverview,
  LeadSectionHeading,
  OutcomeAnalysisSection,
  QualificationSection,
  TemperaturePill,
  asAnalysis,
  latestAnalyzed,
  qualificationScore,
} from "@/components/lead/LeadAnalysisView";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PermissionGate } from "@/components/PermissionGate";
import { AmoLeadCard } from "@/components/lead/AmoLeadCard";

const LANG_NAME: Record<Lang, string> = { uz: "o'zbek", ru: "русский", en: "English" };

// The page used to be a rigid 3-column layout: a 300px identity rail, a
// middle column of stacked cards, and a 320px-wide rail trying to hold a
// full call-recording player + AI score breakdown + a merged history feed
// -- all genuinely wide content squeezed into a narrow sidebar, which is
// why it read as cramped/disorganized. Redesigned around 2 columns: a
// LEFT identity rail (who this lead is -- rarely edited, fine narrow) and
// one wide workspace on the right. The workspace's "quick context" cards
// (profile/summary/next step) sit in a full-width strip above the tabs;
// everything that's genuinely an activity log (notes, calls, AI analysis,
// the AI assistant) lives in its own tab instead of fighting for space in
// a sidebar. "customerRemark" also moved: its compose box is now the top
// of the Notes tab instead of a separate floating card duplicating "where
// do I add a note" with the Notes tab's own list right below it.
//
// Only these two groups still go through the admin-configurable
// show/hide-and-reorder list (getLeadWorkspaceSectionOrder) -- the five
// sections now pinned to a specific tab (customerRemark, actionHistory,
// audioAnalysis, telephonyCalls, aiAssistant) keep their own per-org
// visibility toggle, just not a reorder position, since "which tab" is a
// fixed, labeled destination rather than a stacking order.
export const Route = createFileRoute("/crm/leads/$leadId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    from?: "funnels" | "audio" | undefined;
    audio?: string | undefined;
    tab?: "setup" | undefined;
  } => ({
    from: search["from"] === "funnels" || search["from"] === "audio" ? search["from"] : undefined,
    // A call id: open (and scroll to) that call's analysis -- what Audio
    // tahlil links to when a row is clicked.
    audio: typeof search["audio"] === "string" ? search["audio"] : undefined,
    // The amoCRM-style card's "Sozlamalar" tab (field set-up).
    tab: search["tab"] === "setup" ? "setup" : undefined,
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
  const { from } = Route.useSearch();
  return (
    <PermissionGate action="View leads">
      {/* Opened from Voronkalar: the amoCRM-style card (fields + feed +
          composer). Everywhere else (Audio tahlil, tasks, links): the
          analysis-first workspace. */}
      {from === "funnels" ? <AmoLeadView /> : <LeadWorkspace />}
    </PermissionGate>
  );
}

function AmoLeadView() {
  const { leadId } = Route.useParams();
  const { tab } = Route.useSearch();
  const { lead, isLoading } = useLeadById(leadId);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  if (isLoading) return <PageLoader />;
  if (!lead) return <LeadNotFound />;
  return (
    // Full-bleed: cancels <main>'s padding and trailing spacer so the card
    // fills exactly the space under the top bar, like amoCRM's own.
    <div className="-mx-4 -mb-20 -mt-4 h-[calc(100%+2rem)] md:-mx-6 md:-mb-[104px] md:h-[calc(100%+2.5rem)]">
      <AmoLeadCard
        lead={lead}
        {...(tab ? { initialTab: tab } : {})}
        actions={{
          openTelegram: () => setTelegramOpen(true),
          openEmail: () => setEmailOpen(true),
          openUpload: () => setUploadOpen(true),
        }}
      />
      <UploadCallDialog open={uploadOpen} onOpenChange={setUploadOpen} defaultLeadId={lead.id} />
      <TelegramMessageDialog leadId={lead.id} open={telegramOpen} onOpenChange={setTelegramOpen} />
      <EmailMessageDialog
        leadId={lead.id}
        defaultTo={lead.email}
        open={emailOpen}
        onOpenChange={setEmailOpen}
      />
    </div>
  );
}

function LeadNotFound() {
  const { t } = useI18n();
  return (
    <SectionCard
      icon={SearchX}
      tone="rose"
      title={t("lead.notFoundTitle")}
      description={t("lead.notFoundDesc")}
    >
      <Link to="/funnels" className="text-sm font-semibold text-primary">
        {t("lead.backToLeads")}
      </Link>
    </SectionCard>
  );
}

const TABS = ["Notes", "Tasks", "Files", "Contracts", "Assistant", "Telephony"] as const;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Accumulated across every analyzed call (mergeCustomerProfile in
// ai-customer-profile.ts) rather than reset each time -- an early call's
// finding still shows even if a later call never repeats it.
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
    <SectionCard
      icon={Phone}
      tone="sky"
      title={t("lead.pbxCalls.title")}
      description={t("lead.pbxCalls.desc")}
    >
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
};

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
      icon={Info}
      tone="primary"
      title={t("lead.info.title")}
      actions={
        canManageFields ? (
          <Link
            to="/crm/leads/$leadId"
            params={{ leadId: lead.id }}
            search={{ from: "funnels", tab: "setup" }}
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
  const { data: calls } = useLeadAmoCalls(leadId);
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
      icon={Sparkles}
      tone="violet"
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
    <SectionCard
      icon={ArrowRightCircle}
      tone="emerald"
      title={t("lead.nextSteps.title")}
      description={t("lead.nextSteps.desc")}
    >
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
  suggest5: "Draft an SMS message to send to this customer.",
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
    <SectionCard
      icon={FileSignature}
      tone="sky"
      title={t("lead.contracts.title")}
      description={t("lead.contracts.desc")}
    >
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
  const { from, audio: audioParam } = Route.useSearch();
  const backLabel = t(from ? (BACK_LABEL_KEY[from] ?? "lead.backToLeads") : "lead.backToLeads");
  // Back to where the lead was opened from; opened by a link, to the funnels.
  const { go: goBack } = useGoBack();
  const { leadId } = Route.useParams();
  const { user } = useAuth();
  const { format: formatMoney } = useCurrency();
  const { lead, isLoading } = useLeadById(leadId);
  const { data: profiles } = useProfilesRaw();
  const { data: orgSettings } = useOrgGeneralSettings();
  const showSection = (key: Parameters<typeof isLeadSectionVisible>[1]) =>
    isLeadSectionVisible(orgSettings, key);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Notes");
  // The lead's fields are edited in place, under "Lid haqida ma'lumot".
  const [editingInfo, setEditingInfo] = useState(false);
  // undefined = not chosen yet -> falls back to the ?audio= call, else the
  // newest analyzed call; null = the user collapsed every call.
  const [openCallChoice, setOpenCallId] = useState<string | null | undefined>(undefined);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const syncAmo = useTriggerAmoCrmSync();
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const activities = useLeadActivities(lead?.id);
  const createActivity = useCreateLeadActivity();
  const createTask = useCreateTask();
  const { rows: leadTaskRows } = useLeadTasksView(lead);
  const canCreateTasks = usePermission("Create tasks");

  const leadFiles = useLeadFiles(lead?.id);
  const uploadLeadFile = useUploadLeadFile();
  const deleteLeadFile = useDeleteLeadFile();
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  const chat = useAiAssistantChat();
  const amoCrmLinkFor = useAmoCrmLink();
  const phone = usePhone();
  // CRM actions (call, messengers, salesbot, contracts, telephony) only when
  // the company's CRM module is on; analytics-only companies don't see them.
  const crmEnabled = useCrmEnabled();
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

  const leadTasks = leadTaskRows;
  const upcoming = useMemo(
    () =>
      leadTasks
        .filter((t) => t.dueRaw)
        .sort((a, b) => new Date(a.dueRaw!).getTime() - new Date(b.dueRaw!).getTime())
        .slice(0, 3),
    [leadTasks],
  );

  const { data: amoCalls } = useLeadAmoCalls(lead?.id);
  const leadCalls = useMemo(() => amoCalls ?? [], [amoCalls]);
  const latestCall = useMemo(() => latestAnalyzed(leadCalls), [leadCalls]);
  const openCallId =
    openCallChoice !== undefined
      ? openCallChoice
      : ((audioParam && leadCalls.some((c) => c.id === audioParam) ? audioParam : null) ??
        latestCall?.id ??
        null);

  // Arriving from Audio tahlil with ?audio=: bring that call's analysis
  // into view once the calls have loaded.
  const scrolledToAudio = useRef(false);
  useEffect(() => {
    if (!audioParam || scrolledToAudio.current) return;
    if (!leadCalls.some((c) => c.id === audioParam)) return;
    scrolledToAudio.current = true;
    requestAnimationFrame(() =>
      document
        .getElementById(`call-${audioParam}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, [audioParam, leadCalls]);

  function openCallFromHistory(callId: string) {
    setOpenCallId(callId);
    requestAnimationFrame(() =>
      document
        .getElementById(`call-${callId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
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
  sectionElements["aiSummary"] = <AiSummaryCard key="aiSummary" leadId={lead.id} />;
  sectionElements["leadScore"] = <LeadAiScoreCard key="leadScore" lead={lead} />;
  // Now rendered inline at the top of the Notes tab (see TABS === "Notes"
  // below) instead of as a separate floating card -- it's the compose box
  // for that tab's own list, so having it live apart from that list was
  // the "two places to add a note" confusion the page used to have.
  sectionElements["customerRemark"] = (
    <div key="customerRemark" className="space-y-2 border-b border-border pb-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{t("lead.remark.title")}</p>
        <button
          type="button"
          onClick={() => void saveNote()}
          disabled={createActivity.isPending || !noteText.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {createActivity.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("lead.notes.save")}
        </button>
      </div>
      <textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder={t("lead.remark.placeholder")}
        className="h-24 w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none placeholder:text-subtle focus:border-primary/40"
      />
    </div>
  );
  sectionElements["nextSteps"] = (
    <NextStepsCard key="nextSteps" nextStep={latestNextStep} upcoming={upcoming} />
  );
  sectionElements["telephonyCalls"] = <LeadPbxCallsSection key="telephonyCalls" leadId={lead.id} />;
  sectionElements["aiAssistant"] = (
    <SectionCard
      icon={Bot}
      tone="violet"
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

  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const amountLabel = formatMoney(lead.expectedRevenue || 0);
  const contactLabel = lead.contactName || lead.phone;

  async function shareLead() {
    const url = `${window.location.origin}/crm/leads/${lead!.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: lead!.name, url });
        return;
      }
    } catch {
      // user cancelled the share sheet -- fall through to copying
    }
    await navigator.clipboard?.writeText(url);
    toast.success(t("la.linkCopied"));
  }

  function reloadFromAmo() {
    syncAmo.mutate(undefined, {
      onSuccess: (res) => (res.error ? toast.error(res.error) : toast.success(t("la.amoReloaded"))),
      onError: (err) => toast.error(describeError(err, t("la.amoReloadFailed"))),
    });
  }

  const headerBtn =
    "inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 disabled:opacity-60";

  return (
    <>
      {/* Sticky deal header -- stays put while the analysis scrolls under it. */}
      <div
        ref={headerRef}
        className="sticky top-0 z-20 -mx-4 -mt-4 mb-6 border-b border-border bg-background px-4 py-4 md:-mx-6 md:px-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={goBack}
              title={backLabel}
              aria-label={backLabel}
              className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
                {lead.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-lg bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {lead.stage}
                </span>
                {(lead.stageIsWon || lead.stageIsLost) && (
                  <span
                    className={cn(
                      "rounded-lg px-2 py-0.5 text-xs font-semibold",
                      lead.stageIsWon
                        ? "bg-success/12 text-success"
                        : "bg-destructive/12 text-destructive",
                    )}
                  >
                    {lead.stageIsWon ? t("la.won") : t("la.lost")}
                  </span>
                )}
                <span className="rounded-lg bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                  {lead.score}/100
                </span>
                <TemperaturePill temperature={lead.temperature} size="sm" />
                {contactLabel && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                    <Phone className="h-3 w-3" /> {contactLabel}
                  </span>
                )}
              </div>
              <p className="mt-1.5 truncate text-sm text-muted-foreground">
                {[lead.funnel, lead.owner].filter(Boolean).join(" · ")}
                {" · "}
                <span className="font-mono font-semibold text-foreground">{amountLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              <Upload className="h-4 w-4" /> {t("la.uploadAudio")}
            </button>
            <button type="button" onClick={() => void shareLead()} className={headerBtn}>
              <Share2 className="h-4 w-4" /> {t("la.share")}
            </button>
            {amoLink && (
              <a href={amoLink} target="_blank" rel="noreferrer" className={headerBtn}>
                <ExternalLink className="h-4 w-4" /> {t("la.openInAmo")}
              </a>
            )}
            {lead.amocrmId && isAdmin && (
              <button
                type="button"
                onClick={reloadFromAmo}
                disabled={syncAmo.isPending}
                className={headerBtn}
              >
                <RefreshCw className={cn("h-4 w-4", syncAmo.isPending && "animate-spin")} />
                {t("la.reloadFromAmo")}
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(headerBtn, "w-11 justify-center px-0")}
                  aria-label={t("la.more")}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {crmEnabled && (
                  <>
                    <DropdownMenuItem
                      disabled={!lead.phone || phone.calling}
                      onSelect={() => {
                        if (lead.phone)
                          phone.call(lead.phone, { leadId: lead.id, name: lead.name });
                      }}
                    >
                      <Phone className="mr-2 h-4 w-4" /> {t("lead.actionCall")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setEmailDialogOpen(true)}>
                      <Mail className="mr-2 h-4 w-4" /> {t("lead.actionEmail")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setTelegramDialogOpen(true)}>
                      <Send className="mr-2 h-4 w-4" /> {t("lead.actionTelegram")}
                    </DropdownMenuItem>
                    <StartSalesbotMenuItems leadId={lead.id} />
                    <DropdownMenuItem onSelect={() => setInvoiceOpen(true)}>
                      <Receipt className="mr-2 h-4 w-4" /> {t("inv.fromLead")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <UploadCallDialog open={uploadOpen} onOpenChange={setUploadOpen} defaultLeadId={lead.id} />
      <InvoiceEditorDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        leadId={lead.id}
        defaultBuyer={lead.company || lead.name}
        defaultAmount={Number(lead.budget) || 0}
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

      <div
        className={cn(
          "grid items-start gap-6",
          historyCollapsed
            ? "xl:grid-cols-[minmax(0,1fr)_56px]"
            : "xl:grid-cols-[minmax(0,1fr)_400px]",
        )}
      >
        <div className="min-w-0 space-y-10">
          {/* Telegram chat link */}
          {crmEnabled && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <Send className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-foreground">
                    {lead.telegram
                      ? t("la.telegramLinked", { handle: lead.telegram })
                      : t("la.telegramNotLinked")}
                  </p>
                  <p className="text-sm text-muted-foreground">{t("la.telegramHint")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTelegramDialogOpen(true)}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition-opacity hover:opacity-90"
              >
                <Link2 className="h-4 w-4" />
                {lead.telegram ? t("la.telegramWrite") : t("la.telegramConnect")}
              </button>
            </div>
          )}

          <section>
            <LeadSectionHeading
              icon={User}
              title={t("la.leadInfo")}
              right={
                <button
                  type="button"
                  onClick={() => setEditingInfo((v) => !v)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                >
                  {editingInfo ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {editingInfo ? t("lead.info.doneEditing") : t("lead.info.edit")}
                </button>
              }
            />
            {editingInfo ? (
              <EditableLeadInfoCard lead={lead} />
            ) : (
              <LeadInfoOverview lead={lead} calls={leadCalls} />
            )}
          </section>

          <section>
            <LeadSectionHeading icon={BarChart3} title={t("la.customerInfo")} tone="warning" />
            <CustomerInfoSection profile={lead.aiCustomerProfile} />
          </section>

          <section>
            <LeadSectionHeading icon={Target} title={t("la.outcomeAnalysis")} tone="danger" />
            <OutcomeAnalysisSection lead={lead} latest={latestCall} />
          </section>

          <section>
            <LeadSectionHeading
              icon={ClipboardCheck}
              title={t("la.qualificationQuestions")}
              tone="success"
              right={(() => {
                const q = latestCall ? (asAnalysis(latestCall)?.qualification ?? []) : [];
                const sc = qualificationScore(q);
                return sc == null ? undefined : (
                  <span className="flex items-baseline gap-1.5 text-xs font-bold uppercase tracking-wider text-subtle">
                    {t("la.points")}
                    <span className="text-xl font-extrabold text-foreground">{sc}</span>
                    <span className="font-mono">/100</span>
                  </span>
                );
              })()}
            />
            <QualificationSection latest={latestCall} />
          </section>

          <section id="lead-calls">
            <LeadSectionHeading icon={BarChart3} title={t("la.callAnalysis")} tone="warning" />
            <CallAnalysisSection
              lead={lead}
              calls={leadCalls}
              openCallId={openCallId}
              setOpenCallId={(id) => setOpenCallId(id)}
              amoLink={amoLink}
            />
          </section>

          <section>
            <LeadSectionHeading icon={Layers} title={t("la.more3")} />
            <div className="space-y-5">
              <div className="flex flex-nowrap gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1">
                {TABS.filter((tb) => crmEnabled || (tb !== "Contracts" && tb !== "Telephony")).map(
                  (tb) => (
                    <button
                      key={tb}
                      onClick={() => setTab(tb)}
                      className={cn(
                        "shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:py-2 sm:text-sm",
                        // On a computer these calls are in the history panel
                        // beside the card; phones don't show that panel.
                        tb === "Telephony" && "hidden phone:inline-block",
                        tab === tb
                          ? "bg-background text-foreground shadow-soft"
                          : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {t(`lead.tab.${tb}`)}
                    </button>
                  ),
                )}
              </div>

              {tab === "Notes" && (
                <SectionCard
                  icon={StickyNote}
                  tone="amber"
                  title={t("lead.notes.title")}
                  description={t("lead.notes.desc")}
                >
                  {showSection("customerRemark") && sectionElements["customerRemark"]}
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
                <SectionCard
                  icon={ListChecks}
                  tone="amber"
                  title={t("lead.tasks.title")}
                  description={t("lead.tasks.desc")}
                >
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
                <SectionCard
                  icon={Paperclip}
                  tone="slate"
                  title={t("lead.files.title")}
                  description={t("lead.files.desc")}
                >
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

              {crmEnabled && tab === "Contracts" && <ContractsTab lead={lead} />}

              {tab === "Assistant" && (
                <div className="space-y-5">
                  {/* The AI lead score leads the tab: the one thing to act on. */}
                  {showSection("leadScore") && sectionElements["leadScore"]}
                  {sectionOrder
                    .filter(
                      (key) => (key === "aiSummary" || key === "nextSteps") && showSection(key),
                    )
                    .map((key) => sectionElements[key])}
                  {showSection("aiAssistant") && sectionElements["aiAssistant"]}
                </div>
              )}

              {crmEnabled &&
                tab === "Telephony" &&
                showSection("telephonyCalls") &&
                sectionElements["telephonyCalls"]}
            </div>
          </section>
        </div>

        <div className="hidden xl:block" style={{ position: "sticky", top: headerH + 8 }}>
          <LeadHistoryPanel
            lead={lead}
            calls={leadCalls}
            onOpenCall={openCallFromHistory}
            collapsed={historyCollapsed}
            onToggleCollapsed={() => setHistoryCollapsed((v) => !v)}
            maxHeight={`calc(100dvh - ${headerH + 120}px)`}
          />
        </div>
      </div>
    </>
  );
}
