import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pause,
  Pencil,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Play,
  Plus,
  Printer,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StartSalesbotMenuItems } from "@/components/automations/StartSalesbotMenu";
import { CallAnalysisDetail } from "@/components/audio/CallAnalysisDetail";
import { scoreTone } from "@/components/audio/CallAnalysisDetail";
import { useAuth } from "@/lib/auth";
import { useCrmEnabled } from "@/lib/use-org-access";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, stageColorProps, stageTintProps } from "@/lib/utils";
import {
  fetchLeadFileDownloadUrl,
  useAmoCrmLink,
  useAuditTrail,
  useCreateContact,
  useDeleteLeadFile,
  useLeadActivities,
  useLeadAmoCalls,
  useLeadCustomFieldDefs,
  useLeadEmails,
  useLeadFiles,
  useLeadTasksView,
  useLeadTelegramMessages,
  useLeadWhatsappMessages,
  usePbxCalls,
  usePipelineStagesRaw,
  useProfilesRaw,
  useStartCall,
  useUpdateContact,
  useUpdateLead,
  useUploadLeadFile,
  type CrmLeadView,
} from "@/hooks/use-crm-data";
import type { Database } from "@/integrations/supabase/types";
import { CARD, FEED_BG, dayWord, mmss, stamp } from "@/components/lead/amo-utils";
import { Composer, OpenTaskItem, type ComposeMode } from "@/components/lead/AmoComposer";

// The lead card as amoCRM shows it, opened from Voronkalar: a fixed left
// panel (deal, stage, fields, contact) and one chronological feed on the
// right -- calls, chats, notes, stage moves, tasks -- with the composer
// (chat / note / task) pinned under it. Audio tahlil keeps opening the
// analysis-first workspace instead.

type Tables = Database["public"]["Tables"];
type StageRow = Tables["pipeline_stages"]["Row"];
type AmoCallRow = Tables["amocrm_calls"]["Row"];
type PbxRow = Tables["pbx_calls"]["Row"];
type EmailRow = Tables["lead_emails"]["Row"];

type ChatMsg = {
  id: string;
  at: string;
  out: boolean;
  text: string;
  sentBy: string | null;
};

type FeedItem =
  | { kind: "created"; id: string; at: string }
  | { kind: "stage"; id: string; at: string; actor: string; from?: StageRow; to?: StageRow }
  | { kind: "owner"; id: string; at: string; actor: string; from: string; to: string }
  | { kind: "field"; id: string; at: string; actor: string; label: string; value: string }
  | { kind: "note"; id: string; at: string; actor: string; text: string; ai: boolean }
  | { kind: "call"; id: string; at: string; call: AmoCallRow }
  | { kind: "pbx"; id: string; at: string; call: PbxRow }
  | { kind: "email"; id: string; at: string; email: EmailRow }
  | {
      kind: "chat";
      id: string;
      at: string;
      channel: "telegram" | "whatsapp";
      messages: ChatMsg[];
    };

type FeedFilter = "notes" | "calls" | "chats" | "system" | "tasks";

const FILTER_OF: Record<FeedItem["kind"], FeedFilter> = {
  created: "system",
  stage: "system",
  owner: "system",
  field: "system",
  note: "notes",
  call: "calls",
  pbx: "calls",
  email: "chats",
  chat: "chats",
};

// Lead columns whose edits show up in the feed as "field X set to Y".
const FIELD_LABEL_KEY: Record<string, string> = {
  name: "amo.field.name",
  budget: "amo.field.budget",
  company_name: "amo.field.company",
  priority: "amo.field.priority",
  source: "amo.field.source",
};

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[38px] grid-cols-[132px_minmax(0,1fr)] items-center gap-3 py-0.5 text-[14px]">
      <span className="truncate text-[var(--amo-label)]">{label}</span>
      <div className="min-w-0 text-foreground">{children}</div>
    </div>
  );
}

// A value that reads as plain text and turns into an input on click --
// saved on Enter or blur, dropped on Escape.
function InlineText({
  value,
  placeholder,
  type = "text",
  display,
  onSave,
}: {
  value: string;
  placeholder: string;
  type?: "text" | "number" | "email" | "tel";
  display?: ReactNode;
  onSave: (v: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "-mx-1.5 block w-full truncate rounded px-1.5 py-1 text-left transition-colors hover:bg-accent",
          !value && "text-subtle",
        )}
      >
        {value ? (display ?? value) : placeholder}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    if (draft !== value) void onSave(draft);
  };
  return (
    <input
      autoFocus
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="h-8 w-full rounded border border-primary/50 bg-background px-2 text-[14px] text-foreground outline-none"
    />
  );
}

// amoCRM's "Выбрать ⌄" picker: a list with a check on the current value.
function InlinePick({
  value,
  options,
  placeholder,
  onPick,
  allowEmpty = true,
}: {
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  onPick: (v: string) => void;
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "-mx-1.5 inline-flex max-w-full items-center gap-1 rounded px-1.5 py-1 text-left transition-colors hover:bg-accent",
            !current && "text-subtle",
          )}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-subtle" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="amo-skin max-h-72 w-60 overflow-y-auto p-1">
        {allowEmpty && (
          <PickRow
            label={placeholder}
            active={!current}
            onClick={() => {
              onPick("");
              setOpen(false);
            }}
          />
        )}
        {options.map((o) => (
          <PickRow
            key={o.value}
            label={o.label}
            active={o.value === value}
            onClick={() => {
              onPick(o.value);
              setOpen(false);
            }}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function PickRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent",
        active ? "font-semibold text-foreground" : "text-foreground/90",
      )}
    >
      <Check className={cn("h-3.5 w-3.5 shrink-0", active ? "opacity-100" : "opacity-0")} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function GroupBox({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-lg border border-[var(--amo-group-line)] bg-transparent px-2 py-[7px] text-[12px] font-bold uppercase tracking-wide text-foreground transition-colors hover:bg-white/5"
      >
        {title}
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-subtle transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="space-y-1 px-1 pb-2 pt-2">{children}</div>}
    </div>
  );
}

function StageChip({ stage }: { stage?: StageRow }) {
  if (!stage) return <span className="text-subtle">—</span>;
  const tint = stageTintProps(stage.color);
  return (
    <span className="inline-flex items-center overflow-hidden rounded-md border border-border text-[12px]">
      <span className="bg-background px-1.5 py-px text-muted-foreground">
        {stage.pipeline_name ?? ""}
      </span>
      <span
        className={cn("px-1.5 py-px font-medium text-foreground", tint.className)}
        style={tint.style}
      >
        {stage.name}
      </span>
    </span>
  );
}

function AudioRow({ url, seconds }: { url: string; seconds: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(seconds);
  return (
    <div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
      <button
        type="button"
        onClick={() => {
          const a = ref.current;
          if (!a) return;
          if (a.paused) void a.play();
          else a.pause();
        }}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>
      <input
        type="range"
        min={0}
        max={dur || 1}
        step={0.1}
        value={pos}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (ref.current) ref.current.currentTime = v;
          setPos(v);
        }}
        className="h-1 flex-1 accent-[var(--color-primary)]"
      />
      <span className="w-[88px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {mmss(pos)} / {mmss(dur)}
      </span>
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stage picker (header)                                               */
/* ------------------------------------------------------------------ */

function StageHeader({
  lead,
  stages,
  onPick,
}: {
  lead: CrmLeadView;
  stages: StageRow[];
  onPick: (s: StageRow) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = stages.find((s) => s.id === lead.stageId);
  const pipelines = useMemo(() => {
    const map = new Map<string, { name: string; stages: StageRow[] }>();
    for (const s of stages) {
      const key = s.pipeline_id ?? s.pipeline_name ?? "—";
      const g = map.get(key) ?? { name: s.pipeline_name ?? "—", stages: [] };
      g.stages.push(s);
      map.set(key, g);
    }
    for (const g of map.values()) g.stages.sort((a, b) => a.position - b.position);
    return [...map.entries()];
  }, [stages]);
  const ownPipeline = pipelines.find(([, g]) => g.stages.some((s) => s.id === lead.stageId));
  const progress = (ownPipeline?.[1].stages ?? []).filter((s) => !s.is_won && !s.is_lost);
  const currentIdx = progress.findIndex((s) => s.id === lead.stageId);
  const reached = current?.is_won ? progress.length : currentIdx;

  return (
    <div className="mt-4">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="group block w-full text-left">
            <span className="block truncate text-[12px] text-muted-foreground">
              {current?.pipeline_name ?? lead.funnel ?? "—"}
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-[14px] font-semibold text-foreground">
                {current?.name ?? lead.stage ?? "—"}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-subtle transition-transform group-hover:text-foreground",
                  open && "rotate-180",
                )}
              />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="amo-skin max-h-[70vh] w-[340px] overflow-y-auto p-1.5"
        >
          {pipelines.map(([key, g]) => (
            <div key={key} className="mb-1.5 last:mb-0">
              <p className="px-2 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-subtle">
                {g.name}
              </p>
              {g.stages.map((s) => {
                const tint = stageTintProps(s.color);
                const dot = stageColorProps(s.color);
                const active = s.id === lead.stageId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (!active) onPick(s);
                    }}
                    className={cn(
                      "mb-px flex w-full items-center gap-2 rounded-lg px-2 py-[7px] text-left text-[13px] text-foreground transition-[filter] hover:brightness-95",
                      tint.className,
                      active && "font-semibold ring-1 ring-primary/50",
                    )}
                    style={tint.style}
                  >
                    <span
                      className={cn("h-3 w-1 shrink-0 rounded-full", dot.className)}
                      style={dot.style}
                    />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
          {pipelines.length === 0 && (
            <p className="px-2 py-3 text-[13px] text-subtle">{t("amo.noStages")}</p>
          )}
        </PopoverContent>
      </Popover>
      {/* amoCRM's stage line: one thin segment per stage, filled in each
          stage's own colour up to where the lead is now. */}
      <div className="mt-2 flex h-[4px] gap-[2px] overflow-hidden rounded-full">
        {progress.map((s, i) => {
          const c = stageColorProps(s.color);
          return (
            <span
              key={s.id}
              className={cn("h-full flex-1", i <= reached ? c.className : "bg-border")}
              style={i <= reached ? c.style : undefined}
            />
          );
        })}
        {progress.length === 0 && <span className="h-full flex-1 bg-border" />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Left panel                                                          */
/* ------------------------------------------------------------------ */

function LeadPanel({
  lead,
  actions,
  onComposeChat,
}: {
  lead: CrmLeadView;
  actions: AmoLeadActions;
  onComposeChat: (channel: "telegram" | "whatsapp") => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const crmEnabled = useCrmEnabled();
  const { format: formatMoney } = useCurrency();
  const amoLinkFor = useAmoCrmLink();
  const amoLink = amoLinkFor(lead.amocrmId);
  const updateLead = useUpdateLead();
  const updateContact = useUpdateContact();
  const createContact = useCreateContact();
  const startCall = useStartCall();
  const { data: stages = [] } = usePipelineStagesRaw();
  const { data: profiles = [] } = useProfilesRaw();
  const { data: fieldDefs = [] } = useLeadCustomFieldDefs();
  const [tab, setTab] = useState<"main" | "ai" | "files">("main");
  const [groups, setGroups] = useState<Record<string, boolean>>({ lead: false, extra: false });
  const [more, setMore] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState({
    name: "",
    phone: "",
    email: "",
    telegram: "",
  });
  const [addingContact, setAddingContact] = useState(false);
  const [addingCompany, setAddingCompany] = useState(false);
  const [companyDraft, setCompanyDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [tagOpen, setTagOpen] = useState(false);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["lead_detail", lead.id] });
    void qc.invalidateQueries({ queryKey: ["audit_logs", "leads", lead.id] });
  }

  async function patchLead(patch: Tables["leads"]["Update"]) {
    try {
      await updateLead.mutateAsync({ id: lead.id, patch });
      refresh();
    } catch (err) {
      toast.error(describeError(err, t("amo.saveFailed")));
    }
  }

  async function saveContact(patch: Tables["contacts"]["Update"]) {
    try {
      if (lead.contactId) {
        await updateContact.mutateAsync({ id: lead.contactId, patch });
      } else {
        const created = await createContact.mutateAsync({
          organization_id: user!.organizationId!,
          full_name: (patch.full_name as string | undefined) || lead.name,
          ...patch,
        });
        await updateLead.mutateAsync({ id: lead.id, patch: { contact_id: created.id } });
      }
      refresh();
    } catch (err) {
      toast.error(describeError(err, t("amo.saveFailed")));
    }
  }

  // "Add contact": a new person becomes this lead's contact.
  async function addContact(patch: Tables["contacts"]["Update"]) {
    try {
      const created = await createContact.mutateAsync({
        organization_id: user!.organizationId!,
        full_name: (patch.full_name as string | undefined) || lead.name,
        ...patch,
      });
      await updateLead.mutateAsync({ id: lead.id, patch: { contact_id: created.id } });
      refresh();
    } catch (err) {
      toast.error(describeError(err, t("amo.saveFailed")));
    }
  }

  function call(number: string) {
    startCall.mutate(
      {
        toNumber: number,
        leadId: lead.id,
        ...(lead.contactId ? { contactId: lead.contactId } : {}),
      },
      {
        onSuccess: () => toast.success(t("lead.callStarted")),
        onError: (err) => toast.error(describeError(err, t("lead.callFailed"))),
      },
    );
  }

  const contactName = lead.contactName || lead.name;
  const initials = contactName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  function addTag() {
    const v = tagDraft.trim();
    setTagDraft("");
    setTagOpen(false);
    if (!v || lead.tags.includes(v)) return;
    void patchLead({ tags: [...lead.tags, v] });
  }

  const PhoneMenu = ({ number }: { number: string }) => (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="-mx-1 truncate rounded px-1 py-0.5 text-left text-foreground underline decoration-border underline-offset-2 transition-colors hover:bg-accent"
        >
          {number}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="amo-skin w-56 p-1">
        {crmEnabled && (
          <MenuRow icon={Phone} label={t("amo.phone.call")} onClick={() => call(number)} />
        )}
        {crmEnabled && (
          <MenuRow
            icon={Send}
            label={t("amo.phone.telegram")}
            onClick={() => onComposeChat("telegram")}
          />
        )}
        {crmEnabled && (
          <MenuRow
            icon={MessageCircle}
            label={t("amo.phone.whatsapp")}
            onClick={() => onComposeChat("whatsapp")}
          />
        )}
        <MenuRow
          icon={Copy}
          label={t("amo.phone.copy")}
          onClick={() => {
            void navigator.clipboard?.writeText(number);
            toast.success(t("amo.copied"));
          }}
        />
        <MenuRow
          icon={Pencil}
          label={t("amo.phone.edit")}
          onClick={() => {
            setContactDraft({
              name: lead.contactName,
              phone: lead.phone,
              email: lead.email,
              telegram: lead.telegram,
            });
            setEditingContact(true);
          }}
        />
      </PopoverContent>
    </Popover>
  );

  const customFields = fieldDefs.map((def) => {
    const v = lead.customFields[def.key];
    const setValue = (next: string | boolean) =>
      void patchLead({ custom_fields: { ...lead.customFields, [def.key]: next } });
    if (def.field_type === "toggle") {
      return (
        <FieldRow key={def.id} label={def.label}>
          <input
            type="checkbox"
            checked={v === true}
            onChange={(e) => setValue(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
        </FieldRow>
      );
    }
    if (def.field_type === "select") {
      const opts = Array.isArray(def.options) ? (def.options as string[]) : [];
      return (
        <FieldRow key={def.id} label={def.label}>
          <InlinePick
            value={typeof v === "string" ? v : ""}
            options={opts.map((o) => ({ value: o, label: o }))}
            placeholder={t("amo.choose")}
            onPick={setValue}
          />
        </FieldRow>
      );
    }
    return (
      <FieldRow key={def.id} label={def.label}>
        <InlineText
          value={typeof v === "string" ? v : ""}
          placeholder="..."
          onSave={(next) => setValue(next)}
        />
      </FieldRow>
    );
  });

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-[var(--amo-divider)] bg-card lg:h-full lg:w-[432px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="bg-[var(--amo-head)] px-6 pb-0 pt-5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              window.history.length > 1 ? router.history.back() : void navigate({ to: "/funnels" })
            }
            aria-label={t("amo.back")}
            className="-ml-2 grid h-7 w-7 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <InlineText
              value={lead.name}
              placeholder={t("amo.field.name")}
              display={<span className="text-[22px] font-medium leading-8">{lead.name}</span>}
              onSave={(v) => (v.trim() ? patchLead({ name: v.trim() }) : undefined)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("amo.more")}
                className="grid h-7 w-7 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="amo-skin w-60">
              {crmEnabled && lead.phone && (
                <DropdownMenuItem onSelect={() => call(lead.phone)}>
                  <Phone className="mr-2 h-4 w-4" /> {t("amo.phone.call")}
                </DropdownMenuItem>
              )}
              {crmEnabled && (
                <>
                  <DropdownMenuItem onSelect={actions.openTelegram}>
                    <Send className="mr-2 h-4 w-4" /> {t("lead.actionTelegram")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={actions.openWhatsapp}>
                    <MessageCircle className="mr-2 h-4 w-4" /> {t("lead.actionWhatsapp")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={actions.openEmail}>
                    <Mail className="mr-2 h-4 w-4" /> {t("lead.actionEmail")}
                  </DropdownMenuItem>
                  <StartSalesbotMenuItems leadId={lead.id} />
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onSelect={actions.openUpload}>
                <Upload className="mr-2 h-4 w-4" /> {t("la.uploadAudio")}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  to="/crm/leads/$leadId"
                  params={{ leadId: lead.id }}
                  search={{ from: "audio" }}
                >
                  <Sparkles className="mr-2 h-4 w-4" /> {t("amo.fullAnalysis")}
                </Link>
              </DropdownMenuItem>
              {amoLink && (
                <DropdownMenuItem asChild>
                  <a href={amoLink} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> {t("la.openInAmo")}
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard?.writeText(
                    `${window.location.origin}/crm/leads/${lead.id}`,
                  );
                  toast.success(t("la.linkCopied"));
                }}
              >
                <Link2 className="mr-2 h-4 w-4" /> {t("amo.copyLink")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> {t("amo.print")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Tags */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {lead.tags.map((tag) => (
            <span
              key={tag}
              className="group inline-flex max-w-[200px] items-center gap-1 rounded-full border border-[var(--amo-chip-line)] bg-transparent px-2 py-[3px] text-[13px] text-foreground"
            >
              <span className="truncate">{tag}</span>
              <button
                type="button"
                aria-label={t("amo.removeTag")}
                onClick={() => void patchLead({ tags: lead.tags.filter((x) => x !== tag) })}
                className="hidden text-subtle hover:text-foreground group-hover:inline"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {tagOpen ? (
            <input
              autoFocus
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onBlur={addTag}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTag();
                if (e.key === "Escape") {
                  setTagDraft("");
                  setTagOpen(false);
                }
              }}
              placeholder={t("amo.tagPlaceholder")}
              className="h-6 w-32 rounded-full border border-primary/50 bg-background px-1.5 text-[12px] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setTagOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--amo-chip-line)] px-2 py-[3px] text-[13px] text-[var(--amo-soft)] transition-colors hover:border-primary/60 hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" /> {t("amo.addTag")}
            </button>
          )}
        </div>

        <StageHeader
          lead={lead}
          stages={stages}
          onPick={(s) =>
            void patchLead({ stage_id: s.id, funnel: s.pipeline_name ?? lead.funnel ?? null })
          }
        />

        {/* Tabs */}
        <div className="mt-5 flex gap-5">
          {(
            [
              ["main", t("amo.tab.main")],
              ["ai", t("amo.tab.ai")],
              ["files", t("amo.tab.files")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "border-b-2 pb-2.5 text-[14px] transition-colors",
                tab === key
                  ? "border-primary font-semibold text-[var(--amo-head-fg)]"
                  : "border-transparent text-subtle hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "main" && (
        <>
          <div className="space-y-1 px-6 py-4">
            <FieldRow label={t("amo.field.owner")}>
              <InlinePick
                value={lead.ownerId}
                options={profiles.map((p) => ({ value: p.id, label: p.full_name || p.email }))}
                placeholder={t("lead.info.unassigned")}
                onPick={(v) => void patchLead({ owner_id: v || null })}
              />
            </FieldRow>
            <FieldRow label={t("amo.field.budget")}>
              <InlineText
                type="number"
                value={
                  lead.budget || lead.expectedRevenue
                    ? String(lead.budget || lead.expectedRevenue)
                    : ""
                }
                display={formatMoney(lead.budget || lead.expectedRevenue || 0)}
                placeholder={formatMoney(0)}
                onSave={(v) => {
                  const n = Number(v.replace(/\s/g, "")) || 0;
                  return patchLead({ budget: n, expected_revenue: n });
                }}
              />
            </FieldRow>

            <div className="space-y-2.5 pt-3">
              <GroupBox
                title={t("amo.group.lead")}
                open={!!groups["lead"]}
                onToggle={() => setGroups((g) => ({ ...g, lead: !g["lead"] }))}
              >
                <FieldRow label={t("amo.field.source")}>
                  <InlineText
                    value={lead.source}
                    placeholder="..."
                    onSave={(v) => patchLead({ source: v.trim() || null })}
                  />
                </FieldRow>
                <FieldRow label={t("amo.field.campaign")}>
                  <InlineText
                    value={lead.campaign}
                    placeholder="..."
                    onSave={(v) => patchLead({ campaign: v.trim() || null })}
                  />
                </FieldRow>
                <FieldRow label={t("amo.field.priority")}>
                  <InlinePick
                    value={lead.priority}
                    allowEmpty={false}
                    options={(["Low", "Normal", "High", "Urgent"] as const).map((p) => ({
                      value: p,
                      label: t(`amo.priority.${p}`),
                    }))}
                    placeholder={t("amo.choose")}
                    onPick={(v) => void patchLead({ priority: v as CrmLeadView["priority"] })}
                  />
                </FieldRow>
                <FieldRow label={t("amo.field.created")}>
                  <span className="text-muted-foreground">{stamp(lead.createdAtIso, t)}</span>
                </FieldRow>
              </GroupBox>
              {customFields.length > 0 && (
                <GroupBox
                  title={t("amo.group.extra")}
                  open={!!groups["extra"]}
                  onToggle={() => setGroups((g) => ({ ...g, extra: !g["extra"] }))}
                >
                  {customFields}
                </GroupBox>
              )}
            </div>
          </div>

          {/* Contact */}
          {(lead.contactId || lead.phone || lead.contactName) && (
            <div className="border-t border-[var(--amo-divider)] px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--amo-avatar)] text-[13px] font-bold text-[var(--amo-avatar-fg)]">
                  {initials || "?"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold text-foreground">
                    {contactName}
                  </p>
                  {lead.telegram && (
                    <span className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full bg-[#1f6fd1] px-2 py-px text-[10px] font-semibold text-white">
                      <Send className="h-2.5 w-2.5" />
                      <span className="truncate">Telegram</span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t("amo.phone.edit")}
                  onClick={() => {
                    setContactDraft({
                      name: lead.contactName,
                      phone: lead.phone,
                      email: lead.email,
                      telegram: lead.telegram,
                    });
                    setEditingContact((v) => !v);
                  }}
                  className="grid h-7 w-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>

              {editingContact ? (
                <div className="mt-4 space-y-2">
                  {(
                    [
                      ["name", t("amo.contact.name"), "text"],
                      ["phone", t("amo.contact.phone"), "tel"],
                      ["email", "Email", "email"],
                      ["telegram", t("amo.contact.telegram"), "text"],
                    ] as const
                  ).map(([key, label, type]) => (
                    <FieldRow key={key} label={label}>
                      <input
                        type={type}
                        value={contactDraft[key]}
                        onChange={(e) => setContactDraft((d) => ({ ...d, [key]: e.target.value }))}
                        className="h-8 w-full rounded border border-border bg-background px-2 text-[14px] outline-none focus:border-primary/50"
                      />
                    </FieldRow>
                  ))}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingContact(false);
                        void saveContact({
                          full_name: contactDraft.name.trim() || lead.name,
                          phone: contactDraft.phone.trim() || null,
                          email: contactDraft.email.trim() || null,
                          telegram: contactDraft.telegram.trim() || null,
                        });
                      }}
                      className="h-8 rounded bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
                    >
                      {t("amo.save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingContact(false)}
                      className="text-[13px] text-muted-foreground hover:text-foreground"
                    >
                      {t("amo.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-1">
                  <FieldRow label={t("amo.contact.company")}>
                    <span className={cn(!lead.company && "text-subtle")}>
                      {lead.company || "..."}
                    </span>
                  </FieldRow>
                  <FieldRow label={t("amo.contact.workPhone")}>
                    {lead.phone ? (
                      <span className="flex items-center gap-1.5">
                        <Plus className="h-3 w-3 shrink-0 text-subtle" />
                        <PhoneMenu number={lead.phone} />
                      </span>
                    ) : (
                      <span className="text-subtle">...</span>
                    )}
                  </FieldRow>
                  {lead.email && (
                    <FieldRow label="Email">
                      <a
                        href={`mailto:${lead.email}`}
                        className="block truncate underline underline-offset-2"
                      >
                        {lead.email}
                      </a>
                    </FieldRow>
                  )}
                  {lead.telegram && (
                    <FieldRow label={t("amo.contact.telegram")}>
                      <a
                        href={`https://t.me/${lead.telegram.replace(/^@/, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 underline underline-offset-2"
                      >
                        <Send className="h-3 w-3 shrink-0 text-sky-500" />
                        <span className="truncate">{lead.telegram.replace(/^@/, "")}</span>
                      </a>
                    </FieldRow>
                  )}
                  {more && (
                    <>
                      <FieldRow label={t("amo.contact.altPhone")}>
                        {lead.altPhone ? (
                          <PhoneMenu number={lead.altPhone} />
                        ) : (
                          <span className="text-subtle">...</span>
                        )}
                      </FieldRow>
                      <FieldRow label="WhatsApp">
                        <span className={cn(!lead.whatsapp && "text-subtle")}>
                          {lead.whatsapp || "..."}
                        </span>
                      </FieldRow>
                      <FieldRow label={t("amo.contact.position")}>
                        <span className={cn(!lead.position && "text-subtle")}>
                          {lead.position || "..."}
                        </span>
                      </FieldRow>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setMore((v) => !v)}
                    className="pt-0.5 text-[12px] text-subtle underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {more ? t("amo.less") : t("amo.moreFields")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Add contact / company */}
          {
            <div className="border-t border-[var(--amo-divider)] px-6 py-3">
              {addingContact ? (
                <div className="space-y-2">
                  <FieldRow label={t("amo.contact.name")}>
                    <input
                      autoFocus
                      value={contactDraft.name}
                      onChange={(e) => setContactDraft((d) => ({ ...d, name: e.target.value }))}
                      className="h-8 w-full rounded border border-border bg-background px-2 text-[14px] outline-none focus:border-primary/50"
                    />
                  </FieldRow>
                  <FieldRow label={t("amo.contact.phone")}>
                    <input
                      type="tel"
                      value={contactDraft.phone}
                      onChange={(e) => setContactDraft((d) => ({ ...d, phone: e.target.value }))}
                      className="h-8 w-full rounded border border-border bg-background px-2 text-[14px] outline-none focus:border-primary/50"
                    />
                  </FieldRow>
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAddingContact(false);
                        void addContact({
                          full_name: contactDraft.name.trim() || lead.name,
                          phone: contactDraft.phone.trim() || null,
                        });
                      }}
                      className="h-8 rounded bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
                    >
                      {t("amo.save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingContact(false)}
                      className="text-[13px] text-muted-foreground hover:text-foreground"
                    >
                      {t("amo.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <AddRow
                  label={t("amo.addContact")}
                  onClick={() => {
                    setContactDraft({ name: "", phone: "", email: "", telegram: "" });
                    setAddingContact(true);
                  }}
                />
              )}
            </div>
          }
          {
            <div className="border-t border-[var(--amo-divider)] px-6 py-3">
              {addingCompany ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={companyDraft}
                    onChange={(e) => setCompanyDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && companyDraft.trim()) {
                        setAddingCompany(false);
                        void patchLead({ company_name: companyDraft.trim() });
                      }
                      if (e.key === "Escape") setAddingCompany(false);
                    }}
                    placeholder={t("amo.companyPlaceholder")}
                    className="h-8 flex-1 rounded border border-border bg-background px-2 text-[13px] outline-none focus:border-primary/50"
                  />
                  <button
                    type="button"
                    disabled={!companyDraft.trim()}
                    onClick={() => {
                      setAddingCompany(false);
                      void patchLead({ company_name: companyDraft.trim() });
                    }}
                    className="h-8 rounded bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {t("amo.save")}
                  </button>
                </div>
              ) : (
                <AddRow
                  label={t("amo.addCompany")}
                  onClick={() => {
                    setCompanyDraft("");
                    setAddingCompany(true);
                  }}
                />
              )}
            </div>
          }
          <div className="border-t border-[var(--amo-divider)]" />
        </>
      )}

      {tab === "ai" && <AiTab lead={lead} />}
      {tab === "files" && <FilesTab leadId={lead.id} />}
    </aside>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 py-2 text-[15px] text-[var(--amo-label)] transition-colors hover:text-foreground"
    >
      <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--amo-group-line)]">
        <Plus className="h-5 w-5" />
      </span>
      {label}
    </button>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Phone;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-accent"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      {label}
    </button>
  );
}

function AiTab({ lead }: { lead: CrmLeadView }) {
  const { t } = useI18n();
  const { data: calls = [] } = useLeadAmoCalls(lead.id);
  const analyzed = calls.filter((c) => c.score != null || c.ai_summary);
  const latest = analyzed[0];
  const avg = analyzed.length
    ? Math.round(analyzed.reduce((s, c) => s + (c.score ?? 0), 0) / analyzed.length)
    : null;
  return (
    <div className="space-y-4 px-6 py-4 text-[13px]">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border p-3">
          <p className="text-[11px] text-muted-foreground">{t("amo.ai.avgScore")}</p>
          <p
            className={cn(
              "mt-1 text-2xl font-bold tabular-nums",
              avg == null
                ? "text-subtle"
                : {
                    success: "text-success",
                    warning: "text-warning",
                    danger: "text-destructive",
                  }[scoreTone(avg)],
            )}
          >
            {avg ?? "—"}
          </p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-[11px] text-muted-foreground">{t("amo.ai.analyzedCalls")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {analyzed.length}
            <span className="text-sm font-medium text-subtle"> / {calls.length}</span>
          </p>
        </div>
      </div>
      {latest?.ai_summary && (
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-subtle">
            {t("amo.ai.lastSummary")}
          </p>
          <p className="leading-relaxed text-foreground">{latest.ai_summary}</p>
        </div>
      )}
      {latest?.next_step && (
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-subtle">
            {t("amo.ai.nextStep")}
          </p>
          <p className="leading-relaxed text-foreground">{latest.next_step}</p>
        </div>
      )}
      {!latest && <p className="text-subtle">{t("amo.ai.none")}</p>}
      <Link
        to="/crm/leads/$leadId"
        params={{ leadId: lead.id }}
        search={{ from: "audio" }}
        className="inline-flex h-9 items-center gap-2 rounded bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
      >
        <Sparkles className="h-4 w-4" /> {t("amo.fullAnalysis")}
      </Link>
    </div>
  );
}

function FilesTab({ leadId }: { leadId: string }) {
  const { t } = useI18n();
  const files = useLeadFiles(leadId);
  const upload = useUploadLeadFile();
  const remove = useDeleteLeadFile();
  return (
    <div className="space-y-2 px-6 py-4">
      <label className="flex h-16 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
        {upload.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {t("lead.files.uploadButton")}
        <input
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f)
              upload.mutate(
                { leadId, file: f },
                { onError: (err) => toast.error(describeError(err, t("lead.files.uploadFailed"))) },
              );
          }}
        />
      </label>
      {(files.data ?? []).length === 0 && !files.isLoading && (
        <p className="py-2 text-[13px] text-subtle">{t("lead.files.empty")}</p>
      )}
      {(files.data ?? []).map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2"
        >
          <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{f.file_name}</span>
          <button
            type="button"
            title={t("lead.files.download")}
            onClick={() =>
              void fetchLeadFileDownloadUrl(f.id)
                .then((url) => window.open(url, "_blank", "noreferrer"))
                .catch((err) => toast.error(describeError(err, t("lead.files.downloadFailed"))))
            }
            className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t("lead.files.delete")}
            onClick={() =>
              remove.mutate(
                { fileId: f.id, leadId },
                { onError: (err) => toast.error(describeError(err, t("lead.files.deleteFailed"))) },
              )
            }
            className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feed                                                                */
/* ------------------------------------------------------------------ */

function useFeed(lead: CrmLeadView) {
  const { t } = useI18n();
  const { rows: audit } = useAuditTrail("leads", lead.id);
  const activities = useLeadActivities(lead.id);
  const { data: calls = [] } = useLeadAmoCalls(lead.id);
  const { data: pbx = [] } = usePbxCalls({ leadId: lead.id });
  const { data: tg = [] } = useLeadTelegramMessages(lead.id);
  const { data: wa = [] } = useLeadWhatsappMessages(lead.id);
  const { data: emails = [] } = useLeadEmails(lead.id);
  const { data: stages = [] } = usePipelineStagesRaw();
  const { data: profiles = [] } = useProfilesRaw();
  const { data: fieldDefs = [] } = useLeadCustomFieldDefs();

  return useMemo(() => {
    const stageById = new Map(stages.map((s) => [s.id, s]));
    const person = new Map(profiles.map((p) => [p.id, p.full_name]));
    const defLabel = new Map(fieldDefs.map((d) => [d.key, d.label]));
    const list: FeedItem[] = [{ kind: "created", id: "created", at: lead.createdAtIso }];

    for (const row of audit) {
      const actor = row.actorId ? row.actorName : t("amo.robot");
      if (row.changedFields.includes("stage_id")) {
        const f = row.before?.["stage_id"] as string | null | undefined;
        const to = row.after?.["stage_id"] as string | null | undefined;
        list.push({
          kind: "stage",
          id: `${row.id}-s`,
          at: row.createdAt,
          actor,
          ...(f && stageById.get(f) ? { from: stageById.get(f)! } : {}),
          ...(to && stageById.get(to) ? { to: stageById.get(to)! } : {}),
        });
      }
      if (row.changedFields.includes("owner_id")) {
        const f = row.before?.["owner_id"] as string | null | undefined;
        const to = row.after?.["owner_id"] as string | null | undefined;
        list.push({
          kind: "owner",
          id: `${row.id}-o`,
          at: row.createdAt,
          actor,
          from: (f && person.get(f)) || "—",
          to: (to && person.get(to)) || "—",
        });
      }
      for (const f of row.changedFields) {
        if (FIELD_LABEL_KEY[f]) {
          const v = row.after?.[f];
          list.push({
            kind: "field",
            id: `${row.id}-${f}`,
            at: row.createdAt,
            actor,
            label: t(FIELD_LABEL_KEY[f]),
            value: v == null || v === "" ? "—" : String(v),
          });
        }
      }
      if (row.changedFields.includes("custom_fields")) {
        const before = (row.before?.["custom_fields"] ?? {}) as Record<string, unknown>;
        const after = (row.after?.["custom_fields"] ?? {}) as Record<string, unknown>;
        for (const key of Object.keys(after)) {
          if (JSON.stringify(after[key]) === JSON.stringify(before[key])) continue;
          const v = after[key];
          list.push({
            kind: "field",
            id: `${row.id}-cf-${key}`,
            at: row.createdAt,
            actor,
            label: defLabel.get(key) ?? key,
            value:
              v === true
                ? t("amo.yes")
                : v === false
                  ? t("amo.no")
                  : v == null || v === ""
                    ? "—"
                    : String(v),
          });
        }
      }
    }
    for (const a of activities.data ?? []) {
      list.push({
        kind: "note",
        id: a.id,
        at: a.created_at,
        actor:
          a.type === "ai_note"
            ? t("lead.panel.aiActor")
            : (a.created_by && person.get(a.created_by)) || t("amo.robot"),
        text: a.content,
        ai: a.type === "ai_note",
      });
    }
    for (const c of calls) list.push({ kind: "call", id: c.id, at: c.occurred_at, call: c });
    for (const c of pbx) list.push({ kind: "pbx", id: c.id, at: c.created_at, call: c });
    for (const e of emails) list.push({ kind: "email", id: e.id, at: e.created_at, email: e });

    // Chat messages become conversation blocks: consecutive messages on the
    // same channel less than 3 hours apart, like amoCRM's "Беседа №".
    const msgs = [
      ...tg.map((m) => ({ ch: "telegram" as const, m })),
      ...wa.map((m) => ({ ch: "whatsapp" as const, m })),
    ].sort((x, y) => new Date(x.m.created_at).getTime() - new Date(y.m.created_at).getTime());
    let block: Extract<FeedItem, { kind: "chat" }> | null = null;
    for (const { ch, m } of msgs) {
      const msg: ChatMsg = {
        id: m.id,
        at: m.created_at,
        out: m.direction === "out",
        text: m.text,
        sentBy: m.sent_by ? (person.get(m.sent_by) ?? null) : null,
      };
      const last = block?.messages[block.messages.length - 1];
      if (
        block &&
        block.channel === ch &&
        last &&
        new Date(m.created_at).getTime() - new Date(last.at).getTime() < 3 * 3600_000
      ) {
        block.messages.push(msg);
      } else {
        block = {
          kind: "chat",
          id: `chat-${m.id}`,
          at: m.created_at,
          channel: ch,
          messages: [msg],
        };
        list.push(block);
      }
    }

    return list.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
  }, [
    audit,
    activities.data,
    calls,
    pbx,
    tg,
    wa,
    emails,
    stages,
    profiles,
    fieldDefs,
    lead.createdAtIso,
    t,
  ]);
}

function itemText(i: FeedItem): string {
  switch (i.kind) {
    case "note":
      return i.text;
    case "call":
      return `${i.call.phone ?? ""} ${i.call.ai_summary ?? ""}`;
    case "pbx":
      return i.call.to_number;
    case "email":
      return `${i.email.subject} ${i.email.body}`;
    case "chat":
      return i.messages.map((m) => m.text).join(" ");
    case "stage":
      return `${i.from?.name ?? ""} ${i.to?.name ?? ""}`;
    case "field":
      return `${i.label} ${i.value}`;
    case "owner":
      return `${i.from} ${i.to}`;
    default:
      return "";
  }
}

function SystemLine({
  at,
  children,
  right,
}: {
  at: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3 px-[52px] py-1 text-[13px] leading-5 text-muted-foreground">
      <p className="min-w-0 flex-1">
        <span className="mr-1">{stamp(at, t)}</span>
        {children}
      </p>
      {right}
    </div>
  );
}

function FeedBox({
  icon,
  header,
  right,
  children,
  tone,
}: {
  tone?: string;
  icon?: ReactNode;
  header: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={cn("my-2 flex gap-3 rounded-xl px-4 py-3.5", tone ?? CARD)}>
      {icon && <div className="shrink-0 pt-0.5">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-[12px] leading-5 text-muted-foreground">{header}</p>
          {right}
        </div>
        {children}
      </div>
    </div>
  );
}

function CallItem({ call, lead }: { call: AmoCallRow; lead: CrmLeadView }) {
  const { t } = useI18n();
  const { data: profiles = [] } = useProfilesRaw();
  const [listen, setListen] = useState(false);
  const [analysis, setAnalysis] = useState(false);
  const incoming = call.direction === "in";
  const who = profiles.find((p) => p.id === call.created_by)?.full_name || lead.owner || "—";
  const from = incoming ? call.phone || "—" : who;
  const to = incoming ? who : call.phone || "—";
  return (
    <FeedBox
      icon={
        <span className="grid h-9 w-9 place-items-center rounded-full border border-[var(--amo-group-line)] text-[var(--amo-label)]">
          {incoming ? <PhoneIncoming className="h-4 w-4" /> : <PhoneOutgoing className="h-4 w-4" />}
        </span>
      }
      header={
        <>
          {stamp(call.occurred_at, t)} {incoming ? t("amo.call.incoming") : t("amo.call.outgoing")}{" "}
          {t("amo.call.from")}: {from} {t("amo.call.to")}: {to}
        </>
      }
      right={
        call.score != null ? (
          <button
            type="button"
            onClick={() => setAnalysis((v) => !v)}
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[12px] font-bold tabular-nums",
              {
                success: "bg-success/12 text-success",
                warning: "bg-warning/12 text-warning",
                danger: "bg-destructive/12 text-destructive",
              }[scoreTone(call.score)],
            )}
            title={t("amo.call.analysis")}
          >
            AI {call.score}
          </button>
        ) : undefined
      }
    >
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-foreground">
        <span>
          {incoming ? t("amo.call.incoming") : t("amo.call.outgoing")}{" "}
          {mmss(call.duration_seconds ?? 0)}
        </span>
        {call.recording_url && (
          <>
            <button
              type="button"
              onClick={() => setListen((v) => !v)}
              className="rounded-md border border-primary/50 px-1.5 text-[13px] text-primary transition-colors hover:bg-primary/10"
            >
              {t("amo.call.listen")}
            </button>
            <a
              href={call.recording_url}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-primary underline underline-offset-2"
            >
              {t("amo.call.download")}
            </a>
          </>
        )}
        {call.ai_summary && call.score == null && (
          <button
            type="button"
            onClick={() => setAnalysis((v) => !v)}
            className="text-[13px] text-primary underline underline-offset-2"
          >
            {t("amo.call.analysis")}
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        {call.connected ? t("amo.call.talked") : t("amo.call.noAnswer")}
      </p>
      {call.ai_summary && !analysis && (
        <p className="mt-1.5 line-clamp-2 text-[13px] text-foreground/80">
          <Bot className="mr-1 inline h-3.5 w-3.5 text-primary" />
          {call.ai_summary}
        </p>
      )}
      {listen && call.recording_url && (
        <AudioRow url={call.recording_url} seconds={call.duration_seconds ?? 0} />
      )}
      {analysis && (
        <div className="mt-3 rounded-md border border-border bg-background p-3">
          <CallAnalysisDetail call={toAudioView(call, lead)} />
        </div>
      )}
    </FeedBox>
  );
}

// CallAnalysisDetail takes the Audio tahlil row shape.
function toAudioView(c: AmoCallRow, lead: CrmLeadView) {
  return {
    id: c.id,
    leadId: lead.id,
    leadName: lead.name,
    company: lead.company,
    owner: lead.owner,
    ownerId: lead.ownerId || null,
    funnel: lead.funnel || null,
    stage: lead.stage || null,
    phone: c.phone ?? "",
    direction: (c.direction === "in" ? "in" : "out") as "in" | "out",
    connected: c.connected,
    durationSeconds: c.duration_seconds ?? 0,
    recordingUrl: c.recording_url,
    occurredAt: c.occurred_at,
    occurredAtRaw: c.occurred_at,
    transcript: c.transcript,
    aiSummary: c.ai_summary,
    nextStep: c.next_step,
    amocrmTaskId: c.amocrm_task_id,
    aiNoteId: c.ai_note_id,
    amocrmId: lead.amocrmId,
    score: c.score,
    mood: c.mood,
    talkRatio: c.talk_ratio,
    analysis: (c.analysis ?? null) as never,
    analysisError: c.analysis_error,
    createdBy: c.created_by,
    source: c.source,
  };
}

function PbxItem({ call }: { call: PbxRow }) {
  const { t } = useI18n();
  const [listen, setListen] = useState(false);
  const incoming = call.direction === "in" || call.direction === "inbound";
  const talked =
    call.status === "answered" || call.status === "completed" || call.duration_seconds > 0;
  return (
    <FeedBox
      icon={
        <span className="grid h-9 w-9 place-items-center rounded-full border border-[var(--amo-group-line)] text-[var(--amo-label)]">
          {incoming ? <PhoneIncoming className="h-4 w-4" /> : <PhoneOutgoing className="h-4 w-4" />}
        </span>
      }
      header={
        <>
          {stamp(call.created_at, t)} {incoming ? t("amo.call.incoming") : t("amo.call.outgoing")}{" "}
          {t("amo.call.from")}: {call.from_number || "—"} {t("amo.call.to")}: {call.to_number}
        </>
      }
    >
      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[14px] text-foreground">
        <span>
          {incoming ? t("amo.call.incoming") : t("amo.call.outgoing")} {mmss(call.duration_seconds)}
        </span>
        {call.recording_url && (
          <>
            <button
              type="button"
              onClick={() => setListen((v) => !v)}
              className="rounded-md border border-primary/50 px-1.5 text-[13px] text-primary transition-colors hover:bg-primary/10"
            >
              {t("amo.call.listen")}
            </button>
            <a
              href={call.recording_url}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-primary underline underline-offset-2"
            >
              {t("amo.call.download")}
            </a>
          </>
        )}
      </div>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        {talked ? t("amo.call.talked") : t("amo.call.noAnswer")}
      </p>
      {listen && call.recording_url && (
        <AudioRow url={call.recording_url} seconds={call.duration_seconds} />
      )}
    </FeedBox>
  );
}

function ChatBlock({
  item,
  lead,
}: {
  item: Extract<FeedItem, { kind: "chat" }>;
  lead: CrmLeadView;
}) {
  const { t } = useI18n();
  const contactName = lead.contactName || lead.name;
  const tg = item.channel === "telegram";
  const initial = contactName.slice(0, 1).toUpperCase();
  return (
    <div className="my-2">
      {/* amoCRM draws a conversation as a small stack of sheets. */}
      <div className="mx-2 h-[5px] rounded-t-xl border border-b-0 border-[var(--amo-box-line)] bg-[var(--amo-box)]" />
      <div className={cn("rounded-xl px-5 pb-3 pt-3", CARD)}>
        <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-[var(--amo-soft)]">
          {tg ? (
            <Send className="h-3.5 w-3.5 text-sky-400" />
          ) : (
            <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
          )}
          {tg ? "Telegram" : "WhatsApp"}
        </p>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--amo-avatar)] text-[12px] font-bold text-[var(--amo-avatar-fg)]">
            {initial}
          </span>
          <span className="text-[14px] text-[var(--amo-label)]">{contactName}</span>
        </div>
        <div className="mt-3 space-y-3">
          {item.messages.map((m) =>
            m.out ? (
              <div key={m.id} className="flex items-end justify-end gap-2.5">
                <div className="max-w-[70%] rounded-2xl bg-[var(--amo-bubble-out)] px-3 py-2">
                  <p className="text-[12px] text-[var(--amo-bubble-out-meta)]">
                    {stamp(m.at, t)} {m.sentBy ?? t("amo.robot")}{" "}
                    <Check className="inline h-3 w-3" /> {t("amo.delivered")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] text-[var(--amo-bubble-out-fg)]">
                    {m.text}
                  </p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--amo-avatar)] text-[11px] font-bold text-[var(--amo-avatar-fg)]">
                  {((m.sentBy ?? "R").match(/\p{L}/u)?.[0] ?? "R").toUpperCase()}
                </span>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--amo-avatar)] text-[12px] font-bold text-[var(--amo-avatar-fg)]">
                  {initial}
                </span>
                <div className="max-w-[70%] rounded-2xl bg-[var(--amo-bubble-in)] px-3 py-2">
                  <p className="text-[12px] text-[var(--amo-label)]">
                    {stamp(m.at, t)} {contactName}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] text-foreground">{m.text}</p>
                </div>
              </div>
            ),
          )}
        </div>
        <p className="mt-2 text-right text-[12px] text-[var(--amo-label)]">
          {t("amo.conversationNo", {
            no: item.id
              .replace(/[^a-z0-9]/gi, "")
              .slice(-6)
              .toUpperCase(),
          })}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export type AmoLeadActions = {
  openTelegram: () => void;
  openWhatsapp: () => void;
  openEmail: () => void;
  openUpload: () => void;
};

export function AmoLeadCard({ lead, actions }: { lead: CrmLeadView; actions: AmoLeadActions }) {
  const { t } = useI18n();
  const items = useFeed(lead);
  const { rows: taskRows } = useLeadTasksView(lead);
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<Set<FeedFilter>>(new Set());
  const [mode, setMode] = useState<ComposeMode>("chat");
  const [channel, setChannel] = useState<"telegram" | "whatsapp">("telegram");
  const [focusKey, setFocusKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Team members who wrote on this lead (notes, outgoing messages).
  const robot = t("amo.robot");
  const participants = new Set(
    items.flatMap((i) =>
      i.kind === "note" && !i.ai && i.actor !== robot
        ? [i.actor]
        : i.kind === "chat"
          ? i.messages.filter((m) => m.out && m.sentBy).map((m) => m.sentBy!)
          : [],
    ),
  ).size;
  const q = query.trim().toLowerCase();
  const visible = items.filter(
    (i) => !hidden.has(FILTER_OF[i.kind]) && (!q || itemText(i).toLowerCase().includes(q)),
  );
  const openTasks = hidden.has("tasks")
    ? []
    : taskRows
        .filter((tk) => tk.status !== "Done")
        .filter((tk) => !q || `${tk.title} ${tk.description}`.toLowerCase().includes(q))
        .sort((a, b) => new Date(a.dueRaw ?? 0).getTime() - new Date(b.dueRaw ?? 0).getTime());

  // Newest at the bottom, like amoCRM: land on the latest entry and stay
  // pinned there while new ones arrive, unless the user scrolled up.
  const count = visible.length + openTasks.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  function compose(next: ComposeMode, ch?: "telegram" | "whatsapp") {
    setMode(next);
    if (ch) setChannel(ch);
    setFocusKey((k) => k + 1);
  }

  let lastDay = "";

  return (
    <div className="amo-skin flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <LeadPanel lead={lead} actions={actions} onComposeChat={(ch) => compose("chat", ch)} />

      <section className={cn("flex min-h-[70dvh] min-w-0 flex-1 flex-col lg:min-h-0", FEED_BG)}>
        <div className="flex h-[56px] shrink-0 items-center gap-2 border-b border-[var(--amo-divider)] bg-[var(--amo-feed)] px-5">
          <Search className="h-4 w-4 shrink-0 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("amo.search")}
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="grid h-7 w-7 place-items-center rounded text-subtle hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("amo.filter")}
                className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="amo-skin w-52">
              <DropdownMenuLabel>{t("amo.show")}</DropdownMenuLabel>
              {(["notes", "calls", "chats", "tasks", "system"] as const).map((f) => (
                <DropdownMenuCheckboxItem
                  key={f}
                  checked={!hidden.has(f)}
                  onCheckedChange={(on) =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (on) next.delete(f);
                      else next.add(f);
                      return next;
                    })
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  {t(`amo.filter.${f}`)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
            }}
            className="h-full overflow-y-auto px-4 pb-3 pt-2"
          >
            {visible.map((i) => {
              const day = dayWord(new Date(i.at), t);
              const sep = day !== lastDay;
              lastDay = day;
              return (
                <div key={`${i.kind}-${i.id}`}>
                  {sep && (
                    <div className="my-3 flex items-center gap-3">
                      <span className="h-px flex-1 bg-[var(--amo-box-line)]" />
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-[11.5px] font-medium text-muted-foreground",
                          CARD,
                        )}
                      >
                        {day}
                      </span>
                      <span className="h-px flex-1 bg-[var(--amo-box-line)]" />
                    </div>
                  )}
                  <FeedEntry item={i} lead={lead} />
                </div>
              );
            })}
            {openTasks.length > 0 && (
              <p className="mt-4 text-right text-[12.5px] text-[var(--amo-label)]">
                {t("amo.participants", { count: participants })}
              </p>
            )}
            {openTasks.map((tk) => (
              <OpenTaskItem key={tk.id} task={tk} leadId={lead.id} />
            ))}
            {visible.length === 0 && openTasks.length === 0 && (
              <p className="py-10 text-center text-[13px] text-subtle">{t("amo.empty")}</p>
            )}
          </div>
          {!atBottom && (
            <button
              type="button"
              onClick={() => {
                const el = scrollRef.current;
                if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
              }}
              aria-label={t("amo.toBottom")}
              className="absolute bottom-3 right-6 grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft hover:text-foreground"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          )}
        </div>

        <Composer
          lead={lead}
          mode={mode}
          setMode={setMode}
          channel={channel}
          focusKey={focusKey}
          onOpenTelegramLink={actions.openTelegram}
        />
      </section>
    </div>
  );
}

function FeedEntry({ item, lead }: { item: FeedItem; lead: CrmLeadView }) {
  const { t } = useI18n();
  // amoCRM shows whose card a system event belongs to on the right.
  const contactLink = (
    <span className="shrink-0 text-[12.5px] text-[var(--amo-label)] underline underline-offset-2">
      {lead.contactName || lead.name}
    </span>
  );
  switch (item.kind) {
    case "created":
      return (
        <SystemLine at={item.at} right={contactLink}>
          {t("amo.sys.created")} <span className="text-foreground">{lead.name}</span>
        </SystemLine>
      );
    case "stage":
      return (
        <SystemLine at={item.at} right={contactLink}>
          {item.actor} {t("amo.sys.newStage")}:{" "}
          <StageChip {...(item.to ? { stage: item.to } : {})} />{" "}
          {item.from && (
            <>
              {t("amo.sys.fromStage")} {item.from.name}
            </>
          )}
        </SystemLine>
      );
    case "owner":
      return (
        <SystemLine at={item.at} right={contactLink}>
          {item.actor} {t("amo.sys.owner")}: <span className="text-foreground">{item.to}</span>
        </SystemLine>
      );
    case "field":
      return (
        <SystemLine at={item.at} right={contactLink}>
          {item.actor} {t("amo.sys.field", { field: item.label })}{" "}
          <span className="text-foreground">«{item.value}»</span>
        </SystemLine>
      );
    case "note":
      return (
        <FeedBox
          icon={
            <span className="grid h-9 w-9 place-items-center rounded-full border border-[var(--amo-group-line)] text-[var(--amo-label)]">
              {item.ai ? <Bot className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </span>
          }
          header={
            <>
              {stamp(item.at, t)} {item.actor}
              {item.ai && <> · {t("amo.aiNote")}</>}
            </>
          }
        >
          <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
            {item.text}
          </p>
        </FeedBox>
      );
    case "call":
      return <CallItem call={item.call} lead={lead} />;
    case "pbx":
      return <PbxItem call={item.call} />;
    case "email":
      return (
        <FeedBox
          icon={
            <span className="grid h-9 w-9 place-items-center rounded-full border border-[var(--amo-group-line)] text-[var(--amo-label)]">
              <Mail className="h-4 w-4" />
            </span>
          }
          header={
            <>
              {stamp(item.at, t)} Email → {item.email.to_email}
            </>
          }
          right={
            item.email.error ? (
              <span className="text-[12px] font-semibold text-destructive">{t("amo.notSent")}</span>
            ) : (
              <CheckCircle2 className="h-4 w-4 text-success" />
            )
          }
        >
          <p className="mt-0.5 text-[14px] font-semibold text-foreground">{item.email.subject}</p>
          <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[13px] text-muted-foreground">
            {item.email.body}
          </p>
        </FeedBox>
      );
    case "chat":
      return <ChatBlock item={item} lead={lead} />;
    default:
      return (
        <SystemLine at={(item as FeedItem).at}>
          <FileText className="inline h-3.5 w-3.5" />
        </SystemLine>
      );
  }
}
