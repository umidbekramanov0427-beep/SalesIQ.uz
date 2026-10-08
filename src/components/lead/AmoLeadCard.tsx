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
  StickyNote,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
  useCreateLeadActivity,
  useCreateTask,
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
  usePermission,
  usePipelineStagesRaw,
  useProfilesRaw,
  useSendLeadTelegramMessage,
  useSendLeadWhatsappMessage,
  useStartCall,
  useUpdateContact,
  useUpdateLead,
  useUpdateTask,
  useUploadLeadFile,
  type CrmLeadView,
} from "@/hooks/use-crm-data";
import type { Database } from "@/integrations/supabase/types";

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

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function hhmm(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayWord(d: Date, t: (k: string) => string) {
  const now = new Date();
  const y = new Date();
  y.setDate(now.getDate() - 1);
  const tm = new Date();
  tm.setDate(now.getDate() + 1);
  if (sameDay(d, now)) return t("amo.today");
  if (sameDay(d, y)) return t("amo.yesterday");
  if (sameDay(d, tm)) return t("amo.tomorrow");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function stamp(iso: string, t: (k: string) => string) {
  const d = new Date(iso);
  return `${dayWord(d, t)} ${hhmm(d)}`;
}

function mmss(sec: number) {
  return `${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}`;
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[29px] grid-cols-[128px_minmax(0,1fr)] items-center gap-2 text-[13px]">
      <span className="truncate text-muted-foreground">{label}</span>
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
          "block w-full truncate rounded px-1 py-0.5 -mx-1 text-left transition-colors hover:bg-accent",
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
      className="h-7 w-full rounded border border-primary/50 bg-background px-1.5 text-[13px] text-foreground outline-none"
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
            "-mx-1 inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-accent",
            !current && "text-subtle",
          )}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-subtle" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-60 overflow-y-auto p-1">
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
        className="flex w-full items-center justify-between rounded-[4px] border border-border bg-surface/60 px-2 py-[5px] text-[11px] font-bold uppercase tracking-wide text-foreground transition-colors hover:bg-accent"
      >
        {title}
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-subtle transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="space-y-0.5 px-1 pb-1 pt-1.5">{children}</div>}
    </div>
  );
}

function StageChip({ stage }: { stage?: StageRow }) {
  if (!stage) return <span className="text-subtle">—</span>;
  const tint = stageTintProps(stage.color);
  return (
    <span className="inline-flex items-center overflow-hidden rounded-[3px] border border-border text-[12px]">
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
    <div className="mt-3">
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
        <PopoverContent align="start" className="max-h-[70vh] w-[340px] overflow-y-auto p-1.5">
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
                      "mb-px flex w-full items-center gap-2 rounded-[3px] px-2 py-[7px] text-left text-[13px] text-foreground transition-[filter] hover:brightness-95",
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
      <PopoverContent align="start" className="w-56 p-1">
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
    <aside className="flex w-full shrink-0 flex-col border-b border-border bg-card lg:h-full lg:w-[360px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="px-6 pb-0 pt-4">
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
              display={<span className="text-[20px] font-semibold leading-7">{lead.name}</span>}
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
            <DropdownMenuContent align="end" className="w-60">
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
              className="group inline-flex max-w-[200px] items-center gap-1 rounded-[3px] border border-border bg-surface px-1.5 py-[2px] text-[12px] text-foreground"
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
              className="h-6 w-32 rounded-[3px] border border-primary/50 bg-background px-1.5 text-[12px] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setTagOpen(true)}
              className="rounded-[3px] px-1 py-[2px] text-[12px] text-subtle transition-colors hover:text-foreground"
            >
              #{t("amo.addTag")}
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
        <div className="mt-4 flex gap-5 border-b border-border">
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
                "-mb-px border-b-2 pb-2 text-[13px] transition-colors",
                tab === key
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "main" && (
        <>
          <div className="space-y-1.5 px-6 py-3">
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

            <div className="space-y-1.5 pt-1.5">
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
            <div className="border-t border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-[13px] font-bold text-primary">
                  {initials || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-foreground">
                    {contactName}
                  </p>
                  {lead.telegram && (
                    <span className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full bg-sky-500/15 px-1.5 py-px text-[10px] font-semibold text-sky-600 dark:text-sky-400">
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
                <div className="mt-3 space-y-2">
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
                        className="h-7 w-full rounded border border-border bg-background px-1.5 text-[13px] outline-none focus:border-primary/50"
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
                <div className="mt-3 space-y-1">
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
                        className="truncate underline underline-offset-2"
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
          {!lead.contactId && !lead.phone && !lead.contactName && (
            <div className="border-t border-border px-6 py-3">
              {addingContact ? (
                <div className="space-y-2">
                  <FieldRow label={t("amo.contact.name")}>
                    <input
                      autoFocus
                      value={contactDraft.name}
                      onChange={(e) => setContactDraft((d) => ({ ...d, name: e.target.value }))}
                      className="h-7 w-full rounded border border-border bg-background px-1.5 text-[13px] outline-none focus:border-primary/50"
                    />
                  </FieldRow>
                  <FieldRow label={t("amo.contact.phone")}>
                    <input
                      type="tel"
                      value={contactDraft.phone}
                      onChange={(e) => setContactDraft((d) => ({ ...d, phone: e.target.value }))}
                      className="h-7 w-full rounded border border-border bg-background px-1.5 text-[13px] outline-none focus:border-primary/50"
                    />
                  </FieldRow>
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAddingContact(false);
                        void saveContact({
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
          )}
          {!lead.company && (
            <div className="border-t border-border px-6 py-3">
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
          )}
          <div className="border-t border-border" />
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
      className="flex w-full items-center gap-3 py-1.5 text-[14px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <span className="grid h-8 w-8 place-items-center rounded-full border border-border">
        <Plus className="h-4 w-4" />
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
    <div className="flex items-start gap-3 px-[52px] py-[3px] text-[12.5px] leading-5 text-muted-foreground">
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
}: {
  icon?: ReactNode;
  header: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="my-1.5 flex gap-3 rounded-md border border-border bg-card px-4 py-3">
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
        <span className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground">
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
              className="rounded-[3px] border border-primary/50 px-1.5 text-[13px] text-primary transition-colors hover:bg-primary/10"
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
        <span className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground">
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
              className="rounded-[3px] border border-primary/50 px-1.5 text-[13px] text-primary transition-colors hover:bg-primary/10"
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
  return (
    <div className="my-1.5 rounded-md border border-border bg-card">
      <div className="flex items-center justify-center gap-1.5 border-b border-border/60 px-4 py-2 text-[12px] font-semibold text-muted-foreground">
        {tg ? (
          <Send className="h-3.5 w-3.5 text-sky-500" />
        ) : (
          <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
        )}
        {tg ? "Telegram" : "WhatsApp"}
      </div>
      <div className="space-y-3 px-4 py-3">
        {item.messages.map((m) =>
          m.out ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[78%] rounded-lg rounded-tr-sm bg-primary/12 px-3 py-2">
                <p className="text-[11.5px] text-muted-foreground">
                  {stamp(m.at, t)} {m.sentBy ?? t("amo.robot")} <Check className="inline h-3 w-3" />{" "}
                  {t("amo.delivered")}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[14px] text-foreground">{m.text}</p>
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex items-start gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                {contactName.slice(0, 1).toUpperCase()}
              </span>
              <div className="max-w-[78%] rounded-lg rounded-tl-sm bg-surface px-3 py-2">
                <p className="text-[11.5px] text-muted-foreground">
                  {stamp(m.at, t)} {contactName}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[14px] text-foreground">{m.text}</p>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function TaskItem({
  task,
  onDone,
}: {
  task: ReturnType<typeof useLeadTasksView>["rows"][number];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const due = task.dueRaw ? new Date(task.dueRaw) : null;
  const overdue = !!due && due.getTime() < Date.now() && task.status !== "Done";
  return (
    <div
      className={cn(
        "my-1.5 flex items-start gap-3 rounded-md border bg-card px-4 py-3",
        overdue ? "border-destructive/50" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={onDone}
        title={t("amo.task.complete")}
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-border text-transparent transition-colors hover:border-success hover:text-success"
      >
        <Check className="h-3 w-3" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-muted-foreground">
          <span className={cn(overdue && "font-semibold text-destructive")}>
            {due ? stamp(due.toISOString(), t) : t("amo.task.noDate")}
          </span>{" "}
          {t("amo.task.for")} {task.assignee || "—"}
        </p>
        <p className="mt-0.5 text-[14px] text-foreground">
          <span className="font-semibold">{t("amo.task.label")}:</span> {task.title}
        </p>
        {task.description && task.description !== task.title && (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{task.description}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Composer                                                            */
/* ------------------------------------------------------------------ */

type ComposeMode = "chat" | "note" | "task";

const TASK_TYPES = ["contact", "meeting", "call"] as const;

function timeSlots() {
  const out: string[] = [];
  for (let h = 7; h <= 22; h++) for (const m of [0, 30]) out.push(`${pad(h)}:${pad(m)}`);
  return out;
}

function addMin(time: string, mins: number) {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m + mins);
  return hhmm(d);
}

function Composer({
  lead,
  mode,
  setMode,
  channel,
  setChannel,
  focusKey,
  onOpenTelegramLink,
}: {
  lead: CrmLeadView;
  mode: ComposeMode;
  setMode: (m: ComposeMode) => void;
  channel: "telegram" | "whatsapp";
  setChannel: (c: "telegram" | "whatsapp") => void;
  focusKey: number;
  onOpenTelegramLink: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const crmEnabled = useCrmEnabled();
  const canCreateTasks = usePermission("Create tasks");
  const { data: profiles = [] } = useProfilesRaw();
  const createActivity = useCreateLeadActivity();
  const createTask = useCreateTask();
  const sendTg = useSendLeadTelegramMessage();
  const sendWa = useSendLeadWhatsappMessage();
  const upload = useUploadLeadFile();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const now = new Date();
  const nextSlot = addMin(
    hhmm(new Date(now.getTime() + (30 - (now.getMinutes() % 30)) * 60_000)),
    0,
  );
  const [taskDate, setTaskDate] = useState<Date>(() => new Date());
  const [taskTime, setTaskTime] = useState(nextSlot);
  const [taskType, setTaskType] = useState<(typeof TASK_TYPES)[number]>("contact");
  const [assignee, setAssignee] = useState(lead.ownerId || user?.id || "");
  const [dateOpen, setDateOpen] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusKey === 0) return;
    setOpen(true);
    requestAnimationFrame(() => areaRef.current?.focus());
  }, [focusKey]);

  const contactName = lead.contactName || lead.name;
  const busy =
    createActivity.isPending || createTask.isPending || sendTg.isPending || sendWa.isPending;
  const chatAllowed = crmEnabled;
  const effectiveMode: ComposeMode = !chatAllowed && mode === "chat" ? "note" : mode;

  function reset() {
    setText("");
    setOpen(false);
  }

  function presets(): { label: string; at: () => Date }[] {
    const base = () => new Date();
    const plus = (mins: number) => () => new Date(Date.now() + mins * 60_000);
    const dayAt = (days: number) => () => {
      const d = base();
      d.setDate(d.getDate() + days);
      return d;
    };
    return [
      { label: t("amo.when.15m"), at: plus(15) },
      { label: t("amo.when.30m"), at: plus(30) },
      { label: t("amo.when.1h"), at: plus(60) },
      { label: t("amo.when.today"), at: dayAt(0) },
      { label: t("amo.when.tomorrow"), at: dayAt(1) },
      {
        label: t("amo.when.weekEnd"),
        at: () => {
          const d = base();
          d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
          return d;
        },
      },
      { label: t("amo.when.week"), at: dayAt(7) },
      { label: t("amo.when.month"), at: dayAt(30) },
      { label: t("amo.when.year"), at: dayAt(365) },
    ];
  }

  async function submit() {
    const body = text.trim();
    try {
      if (effectiveMode === "note") {
        if (!body) return;
        await createActivity.mutateAsync({
          lead_id: lead.id,
          type: "note",
          content: body,
          created_by: user?.id ?? null,
        });
        void qc.invalidateQueries({ queryKey: ["lead_activities", lead.id] });
      } else if (effectiveMode === "task") {
        const [h = 9, m = 0] = taskTime.split(":").map(Number);
        const due = new Date(taskDate);
        due.setHours(h, m, 0, 0);
        const typeLabel = t(`amo.taskType.${taskType}`);
        await createTask.mutateAsync({
          title: body ? `${typeLabel}: ${body}` : typeLabel,
          description: body || null,
          lead_id: lead.id,
          due_date: due.toISOString(),
          assignee_id: assignee || null,
          created_by: user?.id ?? null,
          organization_id: user!.organizationId!,
        });
        void qc.invalidateQueries({ queryKey: ["tasks", "lead", lead.id] });
      } else {
        if (!body) return;
        if (channel === "telegram") await sendTg.mutateAsync({ leadId: lead.id, text: body });
        else await sendWa.mutateAsync({ leadId: lead.id, text: body });
      }
      reset();
    } catch (err) {
      const msg = describeError(err, t("amo.sendFailed"));
      toast.error(msg);
      if (effectiveMode === "chat" && channel === "telegram" && /link|ulan|bog/i.test(msg)) {
        onOpenTelegramLink();
      }
    }
  }

  const modeLabel = {
    chat: t("amo.mode.chat"),
    note: t("amo.mode.note"),
    task: t("amo.mode.task"),
  }[effectiveMode];

  const modes: ComposeMode[] = [
    ...(chatAllowed ? (["chat"] as const) : []),
    "note",
    ...(canCreateTasks ? (["task"] as const) : []),
  ];

  return (
    <div
      className={cn(
        "mx-4 mb-4 rounded-md border bg-card transition-colors",
        open ? "border-primary/50" : "border-border",
        effectiveMode === "note" && open && "bg-amber-50/60 dark:bg-amber-500/5",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-1.5 gap-y-1 px-3.5 pt-2.5 text-[13px]",
          !open && effectiveMode !== "task" && "pb-2.5",
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="text-primary underline underline-offset-2">
              {modeLabel}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-40">
            {modes.map((m) => (
              <DropdownMenuItem
                key={m}
                onSelect={() => {
                  setMode(m);
                  setOpen(true);
                  requestAnimationFrame(() => areaRef.current?.focus());
                }}
              >
                <span className="flex-1">{t(`amo.mode.${m}`)}</span>
                {m === effectiveMode && <Check className="h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {effectiveMode === "chat" && (
          <>
            <span className="text-muted-foreground">{t("amo.for")}</span>
            <span className="text-primary underline underline-offset-2">{contactName}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded px-1 text-muted-foreground hover:bg-accent"
                >
                  {channel === "telegram" ? (
                    <Send className="h-3.5 w-3.5 text-sky-500" />
                  ) : (
                    <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
                  )}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top">
                <DropdownMenuItem onSelect={() => setChannel("telegram")}>
                  <Send className="mr-2 h-4 w-4 text-sky-500" /> Telegram
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setChannel("whatsapp")}>
                  <MessageCircle className="mr-2 h-4 w-4 text-emerald-500" /> WhatsApp
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="text-muted-foreground">:</span>
          </>
        )}

        {effectiveMode === "task" && (
          <>
            <span className="text-muted-foreground">{t("amo.on")}</span>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-7 rounded border border-border bg-background px-2 text-foreground hover:border-primary/50"
                >
                  {dayWord(taskDate, t)}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="flex w-auto p-0">
                <div className="w-44 border-r border-border p-1">
                  {presets().map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        const d = p.at();
                        setTaskDate(d);
                        if (/15|30|1/.test(p.label) && d.getTime() - Date.now() < 2 * 3600_000) {
                          setTaskTime(hhmm(d));
                        }
                        setDateOpen(false);
                      }}
                      className="block w-full rounded px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <Calendar
                  mode="single"
                  selected={taskDate}
                  onSelect={(d) => {
                    if (d) {
                      setTaskDate(d);
                      setDateOpen(false);
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
            <select
              value={taskTime}
              onChange={(e) => setTaskTime(e.target.value)}
              className="h-7 rounded border border-border bg-background px-1.5 text-foreground outline-none hover:border-primary/50"
            >
              {[...new Set([taskTime, ...timeSlots()])].sort().map((s) => (
                <option key={s} value={s}>
                  {s} - {addMin(s, 30)}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">{t("amo.for")}</span>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="h-7 max-w-[180px] rounded border-0 bg-transparent px-0 text-primary underline underline-offset-2 outline-none"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">:</span>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as (typeof TASK_TYPES)[number])}
              className="h-7 rounded border-0 bg-transparent px-0 font-semibold text-foreground outline-none"
            >
              {TASK_TYPES.map((k) => (
                <option key={k} value={k}>
                  {t(`amo.taskType.${k}`)}
                </option>
              ))}
            </select>
          </>
        )}

        {!open && effectiveMode !== "task" && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              requestAnimationFrame(() => areaRef.current?.focus());
            }}
            className="min-w-0 flex-1 truncate text-left text-subtle"
          >
            {t("amo.typeHere")}
          </button>
        )}
        {effectiveMode === "chat" && (
          <span className="ml-auto text-[12px] text-success">{t("amo.newConversation")}</span>
        )}
      </div>

      {(open || effectiveMode === "task") && (
        <>
          <textarea
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
              if (e.key === "Escape") reset();
            }}
            rows={3}
            placeholder={effectiveMode === "task" ? t("amo.taskPlaceholder") : t("amo.typeHere")}
            className="block w-full resize-none bg-transparent px-3.5 py-2 text-[14px] text-foreground outline-none placeholder:text-subtle"
          />
          <div className="flex items-center gap-3 px-3.5 pb-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || (effectiveMode !== "task" && !text.trim())}
              className="inline-flex h-9 min-w-[100px] items-center justify-center gap-1.5 rounded bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {effectiveMode === "task"
                ? t("amo.setTask")
                : effectiveMode === "note"
                  ? t("amo.addNote")
                  : t("amo.send")}
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-[13px] text-muted-foreground hover:text-foreground"
            >
              {t("amo.cancel")}
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                title={t("lead.files.uploadButton")}
                onClick={() => fileRef.current?.click()}
                className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {upload.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f)
                    upload.mutate(
                      { leadId: lead.id, file: f },
                      {
                        onSuccess: () => toast.success(t("amo.fileAttached")),
                        onError: (err) =>
                          toast.error(describeError(err, t("lead.files.uploadFailed"))),
                      },
                    );
                }}
              />
            </div>
          </div>
        </>
      )}
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
  const qc = useQueryClient();
  const items = useFeed(lead);
  const { rows: taskRows } = useLeadTasksView(lead);
  const updateTask = useUpdateTask();
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<Set<FeedFilter>>(new Set());
  const [mode, setMode] = useState<ComposeMode>("chat");
  const [channel, setChannel] = useState<"telegram" | "whatsapp">("telegram");
  const [focusKey, setFocusKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

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
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <LeadPanel lead={lead} actions={actions} onComposeChat={(ch) => compose("chat", ch)} />

      <section className="flex min-h-[70dvh] min-w-0 flex-1 flex-col bg-surface lg:min-h-0">
        <div className="flex h-[56px] shrink-0 items-center gap-2 border-b border-border bg-surface px-4">
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
            <DropdownMenuContent align="end" className="w-52">
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
                      <span className="h-px flex-1 bg-border" />
                      <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] text-muted-foreground">
                        {day}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <FeedEntry item={i} lead={lead} />
                </div>
              );
            })}
            {openTasks.map((tk) => (
              <TaskItem
                key={tk.id}
                task={tk}
                onDone={() =>
                  updateTask.mutate(
                    { id: tk.id, patch: { status: "Done", progress: 100 } },
                    {
                      onSuccess: () => {
                        void qc.invalidateQueries({ queryKey: ["tasks", "lead", lead.id] });
                        toast.success(t("amo.task.done"));
                      },
                      onError: (err) => toast.error(describeError(err, t("amo.saveFailed"))),
                    },
                  )
                }
              />
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
          setChannel={setChannel}
          focusKey={focusKey}
          onOpenTelegramLink={actions.openTelegram}
        />
      </section>
    </div>
  );
}

function FeedEntry({ item, lead }: { item: FeedItem; lead: CrmLeadView }) {
  const { t } = useI18n();
  switch (item.kind) {
    case "created":
      return (
        <SystemLine at={item.at}>
          {t("amo.sys.created")} <span className="text-foreground">{lead.name}</span>
        </SystemLine>
      );
    case "stage":
      return (
        <SystemLine at={item.at}>
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
        <SystemLine at={item.at}>
          {item.actor} {t("amo.sys.owner")}: <span className="text-foreground">{item.to}</span>
        </SystemLine>
      );
    case "field":
      return (
        <SystemLine at={item.at}>
          {item.actor} {t("amo.sys.field", { field: item.label })}{" "}
          <span className="text-foreground">«{item.value}»</span>
        </SystemLine>
      );
    case "note":
      return (
        <FeedBox
          icon={
            <span
              className={cn(
                "grid h-9 w-9 place-items-center rounded-full border",
                item.ai
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-amber-400/40 bg-amber-400/10 text-amber-600 dark:text-amber-400",
              )}
            >
              {item.ai ? <Bot className="h-4 w-4" /> : <StickyNote className="h-4 w-4" />}
            </span>
          }
          header={
            <>
              {stamp(item.at, t)} {item.actor} · {item.ai ? t("amo.aiNote") : t("amo.mode.note")}
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
            <span className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground">
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
