import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useBlocker, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Mail,
  MoreHorizontal,
  Paperclip,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Play,
  Plus,
  Printer,
  Search,
  Send,
  Instagram,
  Sparkles,
  Trash2,
  Upload,
  X,
  Repeat2,
  AlarmClock,
} from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/ui/copy-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { usePhone } from "@/components/phone/PhoneProvider";
import { StartSalesbotMenuItems } from "@/components/automations/StartSalesbotMenu";
import { CallAnalysisDetail } from "@/components/audio/CallAnalysisDetail";
import { scoreTone } from "@/components/audio/CallAnalysisDetail";
import { useAuth } from "@/lib/auth";
import { useCrmEnabled } from "@/lib/use-org-access";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, stageColorProps, stageTintProps } from "@/lib/utils";
import { RequiredTaskDialog, useTaskGuardedMove } from "@/components/crm/RequiredTaskDialog";
import { enqueueCallAnalysis } from "@/lib/auto-analyze";
import { asFieldType, fieldValueText } from "@/lib/lead-field-types";
import {
  fetchLeadFileDownloadUrl,
  useAmoCrmLink,
  useAuditTrail,
  useCreateContact,
  useDeleteLeadFile,
  useDeleteLeadForever,
  useDeleteLeadNote,
  useEditLeadNote,
  useLeadActivities,
  usePinLeadNote,
  useLeadAmoCalls,
  useLeadCustomFieldDefs,
  useLeadFieldGroups,
  type LeadCustomFieldDefRow,
  type LeadFieldValue,
  useLeadEmails,
  useLeadFiles,
  useLeadOpenTaskCount,
  useLeadTasksView,
  useStageTaskRule,
  useLeadTelegramMessages,
  useLeadTelegramLink,
  useLeadInstagramLink,
  useReactToChatMessage,
  usePbxCalls,
  isNativeStage,
  usePipelineStagesRaw,
  useProfilesRaw,
  getLeadCardLayout,
  orderLeadCardGroups,
  useOrgGeneralSettings,
  LEAD_CARD_BUILTIN_GROUP,
  type LeadCardContactKey,
  type LeadCardLeadKey,
  type LeadCardTopKey,
  useUpdateContact,
  useUpdateLead,
  useUploadLeadFile,
  type CrmLeadView,
} from "@/hooks/use-crm-data";
import type { Database, Json } from "@/integrations/supabase/types";
import { CARD, FEED_BG, dayWord, mmss, sameDay, stamp } from "@/components/lead/amo-utils";
import { Composer, OpenTasksDock, type ComposeMode } from "@/components/lead/AmoComposer";
import { LeadCardSetup } from "@/components/lead/LeadCardSetup";
import { LeadPaymentsSection, PaymentLinkDialog } from "@/components/lead/LeadPayments";
import { RecordingLink } from "@/components/audio/RecordingLink";
import { useRecordingUrl } from "@/hooks/use-recording-url";
import { ChatFile, ClientAvatar, ReactionPicker } from "@/components/lead/ChatParts";
import {
  builtInGroupLabel,
  contactLabel,
  contactRowKey,
  fieldRowKey,
  groupRowKey,
  leadLabel,
  leadRowPlace,
  topLabel,
} from "@/components/lead/lead-card-layout";

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
type ContactFieldKey = "phone" | "altPhone" | "email" | "telegram" | "position";
const CONTACT_COLUMN = {
  phone: "phone",
  altPhone: "alt_phone",
  email: "email",
  telegram: "telegram",
  position: "position",
} as const satisfies Record<ContactFieldKey, keyof Tables["contacts"]["Update"]>;

type ChatMsg = {
  id: string;
  at: string;
  out: boolean;
  text: string;
  sentBy: string | null;
  fileKind: string | null;
  fileName: string | null;
  reaction: string | null;
};

type FeedItem =
  | { kind: "created"; id: string; at: string }
  | { kind: "stage"; id: string; at: string; actor: string; from?: StageRow; to?: StageRow }
  | { kind: "owner"; id: string; at: string; actor: string; from: string; to: string }
  | {
      kind: "field";
      id: string;
      at: string;
      actor: string;
      label: string;
      value: string;
      // The value before the change, when there was one.
      from?: string;
    }
  | {
      kind: "note";
      id: string;
      at: string;
      actor: string;
      text: string;
      ai: boolean;
      pinned: boolean;
      authorId: string | null;
      edited: boolean;
    }
  | { kind: "call"; id: string; at: string; call: AmoCallRow }
  | { kind: "pbx"; id: string; at: string; call: PbxRow }
  | { kind: "email"; id: string; at: string; email: EmailRow }
  | {
      kind: "chat";
      id: string;
      at: string;
      channel: ChatChannel;
      messages: ChatMsg[];
    };

type ChatChannel = "telegram" | "instagram";

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
  campaign: "amo.field.campaign",
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

// Every change in the lead panel waits for "Save", like amoCRM's: inside
// the panel the fields write into the panel's draft as they change (see
// useLeadDraft) and a Save / Cancel bar appears; nothing reaches the
// database until Save. Outside the panel a field saves on its own.
const DraftMode = createContext(false);

// A value that reads as plain text and turns into an input on click.
function InlineText({
  value,
  placeholder,
  type = "text",
  display,
  inputClassName,
  startEditing = false,
  onClose,
  onSave,
}: {
  value: string;
  placeholder: string;
  type?: "text" | "number" | "email" | "tel";
  display?: ReactNode;
  inputClassName?: string;
  startEditing?: boolean;
  onClose?: () => void;
  onSave: (v: string) => void | Promise<void>;
}) {
  const live = useContext(DraftMode);
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(value);
  const openedWith = useRef(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    setEditing(false);
    if (!live && draft !== value) void onSave(draft);
    onClose?.();
  };
  const cancel = () => {
    setDraft(openedWith.current);
    if (live) void onSave(openedWith.current);
    setEditing(false);
    onClose?.();
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          openedWith.current = value;
          setEditing(true);
        }}
        className={cn(
          "-mx-1.5 block w-full truncate rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent",
          !value && "text-subtle",
        )}
      >
        {value ? (display ?? value) : placeholder}
      </button>
    );
  }
  return (
    <input
      autoFocus
      type={type}
      value={draft}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        setDraft(e.target.value);
        // In the panel every keystroke goes straight into the draft.
        if (live) void onSave(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") cancel();
      }}
      className={cn(
        "h-8 w-full rounded-md border border-primary/50 bg-background px-2 text-[14px] text-foreground outline-none ring-2 ring-primary/15",
        inputClassName,
      )}
    />
  );
}

// amoCRM's "Выбрать ⌄" picker: a list with a check on the current value,
// a search box once the list is long, and optional group headings (the
// owner list is grouped by role, like amoCRM's departments).
function InlinePick({
  value,
  options,
  placeholder,
  onPick,
  allowEmpty = true,
}: {
  value: string;
  options: { value: string; label: string; group?: string }[];
  placeholder: string;
  onPick: (v: string) => void;
  allowEmpty?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const searchable = options.length > 7;
  let lastGroup: string | undefined;
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "-mx-1.5 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent",
            !current && "text-subtle",
          )}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-subtle" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="amo-skin w-64 overflow-hidden p-0">
        {searchable && (
          <div className="flex items-center gap-2 border-b border-[var(--amo-divider)] px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("amo.pickSearch")}
              className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle"
            />
          </div>
        )}
        <div className="max-h-72 overflow-y-auto p-1">
          {allowEmpty && !q && (
            <PickRow
              label={placeholder}
              active={!current}
              onClick={() => {
                onPick("");
                setOpen(false);
              }}
            />
          )}
          {shown.map((o) => {
            const head = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <div key={o.value}>
                {head && (
                  <p className="mt-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
                    {head}
                  </p>
                )}
                <PickRow
                  label={o.label}
                  active={o.value === value}
                  onClick={() => {
                    onPick(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                />
              </div>
            );
          })}
          {shown.length === 0 && (
            <p className="px-2 py-3 text-center text-[12.5px] text-subtle">{t("amo.pickEmpty")}</p>
          )}
        </div>
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

const pad2 = (n: number) => String(n).padStart(2, "0");
/** ISO -> the "yyyy-mm-ddThh:mm" a datetime-local input wants, in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// A date / date-and-time value: the browser's own picker, saved when it closes.
function DateField({
  value,
  withTime,
  onSave,
}: {
  value: string;
  withTime: boolean;
  onSave: (v: string) => void;
}) {
  const live = useContext(DraftMode);
  const shown = withTime ? toLocalInput(value) : value.slice(0, 10);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const out = (v: string) => (withTime ? (v ? new Date(v).toISOString() : "") : v);
  const commit = () => {
    if (live || draft === shown) return;
    onSave(out(draft));
  };
  return (
    <input
      type={withTime ? "datetime-local" : "date"}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (live) onSave(out(e.target.value));
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className={cn(
        "-mx-1.5 h-8 w-full rounded-md border border-transparent bg-transparent px-1.5 text-[14px] outline-none transition-colors [color-scheme:light] hover:bg-accent focus:border-primary/50 focus:bg-background dark:[color-scheme:dark]",
        !draft && "text-subtle",
      )}
    />
  );
}

// amoCRM's "Мультисписок": several values ticked from the list.
function MultiPick({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string[];
  options: string[];
  placeholder: string;
  onChange: (v: string[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="-mx-1.5 flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent"
        >
          {value.length === 0 ? (
            <span className="text-subtle">{placeholder}</span>
          ) : (
            value.map((v) => (
              <span
                key={v}
                className="rounded-full border border-[var(--amo-chip-line)] px-2 py-px text-[12.5px]"
              >
                {v}
              </span>
            ))
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="amo-skin max-h-72 w-60 overflow-y-auto p-1">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
              className="flex w-full items-center gap-2.5 rounded px-2 py-2 text-left text-[13px] text-foreground hover:bg-accent"
            >
              <span
                className={cn(
                  "grid h-4 w-4 shrink-0 place-items-center rounded border",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              {o}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// One custom lead field, drawn by its type (see lead-field-types.ts).
function CustomFieldControl({
  def,
  value,
  onChange,
}: {
  def: LeadCustomFieldDefRow;
  value: LeadFieldValue | undefined;
  onChange: (v: LeadFieldValue) => void;
}) {
  const { t } = useI18n();
  const type = asFieldType(def.field_type);
  const options = Array.isArray(def.options) ? (def.options as string[]) : [];
  const text = typeof value === "string" ? value : "";
  switch (type) {
    case "toggle":
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-primary)]"
        />
      );
    case "select":
    case "radio":
      return (
        <InlinePick
          value={text}
          options={options.map((o) => ({ value: o, label: o }))}
          placeholder={t("amo.choose")}
          onPick={onChange}
        />
      );
    case "multiselect":
      return (
        <MultiPick
          value={Array.isArray(value) ? value : []}
          options={options}
          placeholder={t("amo.choose")}
          onChange={onChange}
        />
      );
    case "date":
    case "birthday":
      return <DateField value={text} withTime={false} onSave={onChange} />;
    case "datetime":
      return <DateField value={text} withTime onSave={onChange} />;
    case "number":
      return <InlineText value={text} type="number" placeholder="..." onSave={onChange} />;
    case "url":
      return (
        <InlineText
          value={text}
          placeholder="https://"
          display={<span className="text-primary underline underline-offset-2">{text}</span>}
          onSave={onChange}
        />
      );
    default:
      return <InlineText value={text} placeholder="..." onSave={onChange} />;
  }
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
  const src = useRecordingUrl(url);
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
        src={src ?? undefined}
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

// Leaving the lead with changes not saved yet: save, discard or stay.
function ConfirmUnsaved({
  busy,
  onSave,
  onDiscard,
  onStay,
}: {
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onStay()}>
      <DialogContent className="amo-skin max-w-sm gap-0 overflow-hidden p-0">
        <div className="px-5 pb-4 pt-5">
          <DialogTitle className="text-[15px] font-semibold">{t("amo.unsavedTitle")}</DialogTitle>
          <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
            {t("amo.unsavedDesc")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("amo.saveAndLeave")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDiscard}
            className="h-9 rounded-lg px-3 text-[13px] font-medium text-destructive hover:bg-destructive/10"
          >
            {t("amo.leaveWithoutSaving")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onStay}
            className="ml-auto h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("guard.stay")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Left panel                                                          */
/* ------------------------------------------------------------------ */

function LeadPanel({
  lead,
  actions,
  initialTab = "main",
  onComposeChat,
  onDeleted,
  phoneHidden = false,
}: {
  lead: CrmLeadView;
  actions: AmoLeadActions;
  initialTab?: "main" | "setup";
  /** On a phone the panel and the conversation take turns (see AmoLeadCard). */
  phoneHidden?: boolean;
  onComposeChat: (channel: ChatChannel) => void;
  /** Called before leaving for good, so the task rule doesn't hold back a deleted lead. */
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const crmEnabled = useCrmEnabled();
  const { data: igLink } = useLeadInstagramLink(lead.id);
  const [payOpen, setPayOpen] = useState(false);
  const { format: formatMoney } = useCurrency();
  const amoLinkFor = useAmoCrmLink();
  const amoLink = amoLinkFor(lead.amocrmId);
  const updateLead = useUpdateLead();
  const { guardMove, dialog: taskDialog } = useTaskGuardedMove();
  const updateContact = useUpdateContact();
  const createContact = useCreateContact();
  const phone = usePhone();
  const { data: stages = [] } = usePipelineStagesRaw();
  // A CRM lead moves between the CRM's own funnels only; a lead synced from
  // amoCRM/Bitrix24 (opened from analytics) just shows its own pipeline.
  const pickStages = useMemo(() => {
    const current = stages.find((s) => s.id === lead.stageId);
    if (current && !isNativeStage(current)) {
      return stages.filter(
        (s) =>
          s.amocrm_pipeline_id === current.amocrm_pipeline_id &&
          s.bitrix24_category_id === current.bitrix24_category_id,
      );
    }
    return stages.filter(isNativeStage);
  }, [stages, lead.stageId]);
  const { data: profiles = [] } = useProfilesRaw();
  const { data: fieldDefs = [] } = useLeadCustomFieldDefs();
  const { data: fieldGroups = [] } = useLeadFieldGroups();
  // Order, names and visibility of every row below, set up in "Sozlamalar".
  const { data: orgSettings } = useOrgGeneralSettings();
  const layout = getLeadCardLayout(orgSettings);
  const shown = (k: string) => !layout.hidden.includes(k);
  const [tab, setTab] = useState<"main" | "ai" | "files" | "setup">(initialTab);
  // amoCRM's "Настроить": the card's fields and groups are set up right
  // here (the only place they are), by whoever runs the CRM.
  const canSetUpFields = user?.role === "super_admin" || user?.role === "platform_owner";
  const [groups, setGroups] = useState<Record<string, boolean>>({});
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
  // Deleting a lead is for super admins only (RLS enforces the same).
  const canDeleteLead = user?.role === "super_admin" || user?.role === "platform_owner";
  const deleteLead = useDeleteLeadForever();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function removeLead() {
    try {
      await deleteLead.mutateAsync(lead.id);
      onDeleted();
      toast.success(t("amo.leadDeleted"));
      void navigate({ to: "/funnels" });
    } catch (err) {
      toast.error(describeError(err, t("amo.leadDeleteFailed")));
    }
  }

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

  async function saveContact(patch: Tables["contacts"]["Update"]): Promise<boolean> {
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
      return true;
    } catch (err) {
      toast.error(describeError(err, t("amo.saveFailed")));
      return false;
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

  // Through the phone widget, so the live call card shows in the corner.
  function call(number: string) {
    phone.call(number, {
      leadId: lead.id,
      ...(lead.contactId ? { contactId: lead.contactId } : {}),
      name: lead.contactName || lead.name,
    });
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
    const tags = draft.tags ?? lead.tags;
    if (!v || tags.includes(v)) return;
    edit({ tags: [...tags, v] });
  }

  const PhoneMenu = ({ number, onEdit }: { number: string; onEdit?: () => void }) => (
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
            if (onEdit) return onEdit();
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
  // A contact phone: the number opens the call/Telegram/copy menu, "Edit"
  // (or an empty field) turns it into an input.
  // (A render helper, not a component: a component declared here would be
  // a new type on every render and lose the input's focus on each key.)
  const phoneField = (k: "phone" | "altPhone") => {
    const value = contactValue(k);
    if (!value || editingPhone === k)
      return (
        <InlineText
          type="tel"
          value={value}
          placeholder="..."
          startEditing={editingPhone === k}
          onClose={() => {
            setEditingPhone(null);
            if (k === "altPhone") setAddingPhone(false);
          }}
          onSave={(v) => setContactEdits((d) => ({ ...d, [k]: v }))}
        />
      );
    return (
      <span className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 truncate">
          <PhoneMenu number={value} onEdit={() => setEditingPhone(k)} />
        </span>
        <CopyButton value={value} />
      </span>
    );
  };
  // The client's Telegram: "@name" opens the chat with them in Telegram,
  // with a copy button; the pencil (or an empty field) edits it.
  const telegramField = () => {
    const value = contactValue("telegram").trim();
    const handle = value.replace(/^@+/, "").replace(/^https?:\/\/t\.me\//, "");
    if (!value || editingTelegram || !/^[A-Za-z0-9_]{3,64}$/.test(handle))
      return (
        <InlineText
          value={value}
          placeholder="@username"
          startEditing={editingTelegram}
          onClose={() => setEditingTelegram(false)}
          onSave={(v) => setContactEdits((d) => ({ ...d, telegram: v }))}
        />
      );
    return (
      <span className="flex min-w-0 items-center gap-1">
        <a
          href={`https://t.me/${handle}`}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 truncate text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
        >
          @{handle}
        </a>
        <CopyButton value={`@${handle}`} />
        <button
          type="button"
          onClick={() => setEditingTelegram(true)}
          title={t("amo.phone.edit")}
          aria-label={t("amo.phone.edit")}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    );
  };

  const ROLE_ORDER = ["super_admin", "rop", "sotuv_menejeri"];
  const ROLE_KEY: Record<string, string> = {
    super_admin: "admin.roleAdmin",
    rop: "admin.roleRop",
    sotuv_menejeri: "admin.roleRep",
  };
  const ownerOptions = [...profiles]
    .sort(
      (a, b) =>
        (ROLE_ORDER.indexOf(a.role) + 1 || 9) - (ROLE_ORDER.indexOf(b.role) + 1 || 9) ||
        (a.full_name || a.email).localeCompare(b.full_name || b.email),
    )
    .map((p) => ({
      value: p.id,
      label: p.full_name || p.email,
      ...(ROLE_KEY[p.role] ? { group: t(ROLE_KEY[p.role]!) } : {}),
    }));

  // The panel's unsaved changes: shown in place of the saved values (view)
  // until Save writes them in one update. A stage change goes through the
  // stage's task/note rules on Save.
  const [draft, setDraft] = useState<Tables["leads"]["Update"]>({});
  const [savingDraft, setSavingDraft] = useState(false);
  useEffect(() => setDraft({}), [lead.id]);
  const edit = (patch: Tables["leads"]["Update"]) => setDraft((d) => ({ ...d, ...patch }));
  // The contact's fields edit in place too (amoCRM): typed values wait in
  // this draft and go out with the same Save as the lead's own fields.
  const [contactEdits, setContactEdits] = useState<Partial<Record<ContactFieldKey, string>>>({});
  const [editingPhone, setEditingPhone] = useState<"phone" | "altPhone" | null>(null);
  const [editingTelegram, setEditingTelegram] = useState(false);
  useEffect(() => setContactEdits({}), [lead.id]);
  const contactSaved: Record<ContactFieldKey, string> = {
    phone: lead.phone,
    altPhone: lead.altPhone,
    email: lead.email,
    telegram: lead.telegram,
    position: lead.position,
  };
  const contactValue = (k: ContactFieldKey) => contactEdits[k] ?? contactSaved[k] ?? "";
  const contactChanged = (Object.keys(contactEdits) as ContactFieldKey[]).filter(
    (k) => (contactEdits[k] ?? "").trim() !== (contactSaved[k] ?? "").trim(),
  );
  const saved: Tables["leads"]["Update"] = {
    name: lead.name,
    owner_id: lead.ownerId || null,
    budget: lead.budget || lead.expectedRevenue,
    expected_revenue: lead.budget || lead.expectedRevenue,
    source: lead.source || null,
    campaign: lead.campaign || null,
    priority: lead.priority,
    tags: lead.tags,
    custom_fields: lead.customFields as Json,
    stage_id: lead.stageId || null,
    funnel: lead.funnel || null,
  };
  const changed = (Object.keys(draft) as (keyof typeof draft)[]).filter(
    (k) => JSON.stringify(draft[k] ?? null) !== JSON.stringify(saved[k] ?? null),
  );
  const dirty = changed.length > 0 || contactChanged.length > 0;
  const view: CrmLeadView = {
    ...lead,
    name: draft.name ?? lead.name,
    ownerId: draft.owner_id !== undefined ? (draft.owner_id ?? "") : lead.ownerId,
    budget: draft.budget ?? lead.budget,
    expectedRevenue: draft.expected_revenue ?? lead.expectedRevenue,
    source: draft.source !== undefined ? (draft.source ?? "") : lead.source,
    campaign: draft.campaign !== undefined ? (draft.campaign ?? "") : lead.campaign,
    priority: draft.priority ?? lead.priority,
    tags: draft.tags ?? lead.tags,
    customFields:
      (draft.custom_fields as Record<string, LeadFieldValue> | undefined) ?? lead.customFields,
    stageId: draft.stage_id ?? lead.stageId,
    stage: draft.stage_id
      ? (stages.find((st) => st.id === draft.stage_id)?.name ?? lead.stage)
      : lead.stage,
    funnel: draft.funnel ?? lead.funnel,
  };

  async function saveDraft(after?: () => void) {
    if (!dirty) return after?.();
    if (contactChanged.length > 0) {
      const cpatch: Tables["contacts"]["Update"] = {};
      for (const k of contactChanged) cpatch[CONTACT_COLUMN[k]] = contactValue(k).trim() || null;
      setSavingDraft(true);
      try {
        if (!(await saveContact(cpatch))) return;
        setContactEdits({});
      } finally {
        setSavingDraft(false);
      }
      if (changed.length === 0) {
        toast.success(t("amo.savedChanges"));
        return after?.();
      }
    }
    const patch: Record<string, unknown> = {};
    for (const k of changed) patch[k] = draft[k];
    if (typeof patch["name"] === "string") {
      const name = patch["name"].trim();
      if (name) patch["name"] = name;
      else delete patch["name"];
    }
    for (const k of ["source", "campaign"]) {
      if (typeof patch[k] === "string") patch[k] = (patch[k] as string).trim() || null;
    }
    const write = async () => {
      await updateLead.mutateAsync({ id: lead.id, patch: patch as Tables["leads"]["Update"] });
      setDraft({});
      refresh();
      toast.success(t("amo.savedChanges"));
      after?.();
    };
    setSavingDraft(true);
    try {
      const stageId = patch["stage_id"];
      if (typeof stageId === "string" && stageId !== lead.stageId) {
        await guardMove(lead, stageId, write, t("amo.saveFailed"));
      } else {
        await write();
      }
    } catch (err) {
      toast.error(describeError(err, t("amo.saveFailed")));
    } finally {
      setSavingDraft(false);
    }
  }

  // Leaving with unsaved changes asks first, like amoCRM does.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const unsaved = useBlocker({
    shouldBlockFn: ({ next }) => dirtyRef.current && next.pathname !== `/crm/leads/${lead.id}`,
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true,
  });

  // Custom fields: each named group is a card of its own (amoCRM's field
  // groups), fields outside any group stay open under them.
  const fieldEl = (def: LeadCustomFieldDefRow) => (
    <FieldRow key={def.id} label={def.label}>
      <CustomFieldControl
        def={def}
        value={view.customFields[def.key]}
        onChange={(next) =>
          edit({ custom_fields: { ...view.customFields, [def.key]: next } as Json })
        }
      />
    </FieldRow>
  );
  const groupIds = new Set(fieldGroups.map((g) => g.id));
  const visibleDefs = fieldDefs
    .filter((d) => shown(fieldRowKey(d.id)))
    .sort((a, b) => a.position - b.position);
  const customFields = visibleDefs
    .filter((d) => !d.group_id || !groupIds.has(d.group_id))
    .map(fieldEl);

  const topRow: Record<LeadCardTopKey, () => ReactNode> = {
    owner: () => (
      <InlinePick
        value={view.ownerId}
        options={ownerOptions}
        placeholder={t("lead.info.unassigned")}
        onPick={(v) => edit({ owner_id: v || null })}
      />
    ),
    budget: () => (
      <InlineText
        type="number"
        value={
          view.budget || view.expectedRevenue ? String(view.budget || view.expectedRevenue) : ""
        }
        display={formatMoney(view.budget || view.expectedRevenue || 0)}
        placeholder={formatMoney(0)}
        onSave={(v) => {
          const n = Number(v.replace(/\s/g, "")) || 0;
          edit({ budget: n, expected_revenue: n });
        }}
      />
    ),
  };
  const leadRow: Record<LeadCardLeadKey, () => ReactNode> = {
    source: () => (
      <InlineText
        value={view.source}
        placeholder="..."
        onSave={(v) => edit({ source: v || null })}
      />
    ),
    campaign: () => (
      <InlineText
        value={view.campaign}
        placeholder="..."
        onSave={(v) => edit({ campaign: v || null })}
      />
    ),
    priority: () => (
      <InlinePick
        value={view.priority}
        allowEmpty={false}
        options={(["Low", "Normal", "High", "Urgent"] as const).map((p) => ({
          value: p,
          label: t(`amo.priority.${p}`),
        }))}
        placeholder={t("amo.choose")}
        onPick={(v) => edit({ priority: v as CrmLeadView["priority"] })}
      />
    ),
    created: () => <span className="text-muted-foreground">{stamp(lead.createdAtIso, t)}</span>,
  };
  // Built-in lead rows moved out of their own group (Sozlamalar -> pencil).
  const placeOf = (k: LeadCardLeadKey) => leadRowPlace(layout, k, groupIds);
  const builtInRowsIn = (placeId: string) =>
    layout.lead
      .filter((k) => shown(k) && placeOf(k) === placeId)
      .map((k) => (
        <FieldRow key={k} label={leadLabel(layout, k, t)}>
          {leadRow[k]()}
        </FieldRow>
      ));
  const groupBoxes = orderLeadCardGroups(layout, fieldGroups)
    .filter((id) => shown(groupRowKey(id)))
    .map((id) => {
      if (id === LEAD_CARD_BUILTIN_GROUP) {
        const keys = layout.lead.filter((k) => shown(k) && placeOf(k) === "lead");
        return keys.length === 0
          ? null
          : {
              id,
              title: builtInGroupLabel(layout, t),
              body: keys.map((k) => (
                <FieldRow key={k} label={leadLabel(layout, k, t)}>
                  {leadRow[k]()}
                </FieldRow>
              )),
            };
      }
      const group = fieldGroups.find((g) => g.id === id);
      const items = visibleDefs.filter((d) => d.group_id === id);
      const builtIns = builtInRowsIn(id);
      return !group || items.length + builtIns.length === 0
        ? null
        : { id, title: group.name, body: [...items.map(fieldEl), ...builtIns] };
    })
    .filter((x) => x !== null);

  // The second number: "+" next to the work phone opens it right under.
  const [addingPhone, setAddingPhone] = useState(false);
  useEffect(() => setAddingPhone(false), [lead.id]);
  const contactShown = (k: LeadCardContactKey) => {
    if (!shown(contactRowKey(k))) return false;
    if (k === "company" || k === "phone") return true;
    if (k === "altPhone" && addingPhone) return true;
    // Empty fields stay hidden until "yana", like amoCRM.
    return more || !!contactValue(k);
  };
  const contactRow = (k: LeadCardContactKey): ReactNode => {
    if (k === "company")
      return <span className={cn(!lead.company && "text-subtle")}>{lead.company || "..."}</span>;
    if (k === "phone")
      return (
        <span className="flex items-center gap-1.5">
          {shown(contactRowKey("altPhone")) && !contactValue("altPhone") && (
            <button
              type="button"
              title={t("amo.contact.addPhone")}
              aria-label={t("amo.contact.addPhone")}
              onClick={() => {
                setAddingPhone(true);
                setEditingPhone("altPhone");
              }}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[var(--amo-quiet-line)] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="min-w-0 flex-1">{phoneField("phone")}</span>
        </span>
      );
    if (k === "altPhone") return phoneField("altPhone");
    if (k === "telegram") return telegramField();
    const type = k === "email" ? "email" : "text";
    return (
      <InlineText
        type={type}
        value={contactValue(k)}
        placeholder="..."
        onSave={(v) => setContactEdits((d) => ({ ...d, [k]: v }))}
      />
    );
  };

  return (
    <DraftMode.Provider value={true}>
      <aside
        className={cn(
          "flex w-full shrink-0 flex-col border-b border-[var(--amo-divider)] bg-card lg:h-full lg:w-[432px] lg:overflow-y-auto lg:border-b-0 lg:border-r phone:min-h-0 phone:flex-1 phone:overflow-y-auto phone:border-b-0",
          phoneHidden && "phone:hidden",
        )}
      >
        <div className="bg-[var(--amo-head)] px-6 pb-0 pt-5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                window.history.length > 1
                  ? router.history.back()
                  : void navigate({ to: "/funnels" })
              }
              aria-label={t("amo.back")}
              className="-ml-2 grid h-7 w-7 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <InlineText
                value={view.name}
                placeholder={t("amo.field.name")}
                display={<span className="text-[22px] font-medium leading-8">{view.name}</span>}
                inputClassName="h-10 text-[20px] font-medium"
                onSave={(v) => edit({ name: v })}
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
                    <DropdownMenuItem onSelect={actions.openEmail}>
                      <Mail className="mr-2 h-4 w-4" /> {t("lead.actionEmail")}
                    </DropdownMenuItem>
                    <StartSalesbotMenuItems leadId={lead.id} />
                    <DropdownMenuItem onSelect={() => setPayOpen(true)}>
                      <CreditCard className="mr-2 h-4 w-4" /> {t("lpay.menu")}
                    </DropdownMenuItem>
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
                {canDeleteLead && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setConfirmDelete(true)}
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> {t("amo.deleteLead")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <ConfirmDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title={t("amo.deleteLeadTitle")}
              description={t("amo.deleteLeadDesc", { name: lead.name })}
              confirmLabel={t("bulk.deleteYes")}
              onConfirm={() => void removeLead()}
            />
          </div>

          {/* Tags */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {lead.repeatCount > 0 && (
              <span
                title={t("guard.repeatHint")}
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-[3px] text-[12.5px] font-semibold text-amber-700 dark:text-amber-400"
              >
                <Repeat2 className="h-3.5 w-3.5" />
                {t("guard.repeatBadge", { count: lead.repeatCount + 1 })}
              </span>
            )}
            {view.tags.map((tag) => (
              <span
                key={tag}
                className="group inline-flex max-w-[200px] items-center gap-1 rounded-full border border-[var(--amo-chip-line)] bg-transparent px-2 py-[3px] text-[13px] text-foreground"
              >
                <span className="truncate">{tag}</span>
                <button
                  type="button"
                  aria-label={t("amo.removeTag")}
                  onClick={() => edit({ tags: view.tags.filter((x) => x !== tag) })}
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
            lead={view}
            stages={pickStages}
            onPick={(st) =>
              edit({ stage_id: st.id, funnel: st.pipeline_name ?? lead.funnel ?? null })
            }
          />
          {taskDialog}

          {/* Tabs */}
          <div className="mt-5 flex gap-5">
            {(
              [
                ["main", t("amo.tab.main")],
                ["ai", t("amo.tab.ai")],
                ["files", t("amo.tab.files")],
                ...(canSetUpFields ? ([["setup", t("amo.tab.setup")]] as const) : []),
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
              {layout.top.filter(shown).map((k) => (
                <FieldRow key={k} label={topLabel(layout, k, t)}>
                  {topRow[k]()}
                </FieldRow>
              ))}

              {groupBoxes.length > 0 && (
                <div className="space-y-2.5 pt-3">
                  {groupBoxes.map((box) => (
                    <GroupBox
                      key={box.id}
                      title={box.title}
                      open={!!groups[box.id]}
                      onToggle={() => setGroups((g) => ({ ...g, [box.id]: !g[box.id] }))}
                    >
                      {box.body}
                    </GroupBox>
                  ))}
                </div>
              )}
              {/* Fields outside any group are always in view under the
                  groups, as in amoCRM -- no extra box to open. */}
              {(customFields.length > 0 || builtInRowsIn("none").length > 0) && (
                <div className="space-y-1 pt-2">
                  {customFields}
                  {builtInRowsIn("none")}
                </div>
              )}
            </div>

            {crmEnabled && (
              <LeadPaymentsSection leadId={lead.id} onCreate={() => setPayOpen(true)} />
            )}
            {payOpen && (
              <PaymentLinkDialog leadId={lead.id} open={payOpen} onOpenChange={setPayOpen} />
            )}

            {/* The client's Instagram Direct chat */}
            {igLink && (
              <div className="border-t border-[var(--amo-divider)] bg-[var(--amo-head)] px-6 py-4">
                <button
                  type="button"
                  disabled={!crmEnabled}
                  onClick={() => onComposeChat("instagram")}
                  className="flex w-full items-center gap-3 text-left disabled:cursor-default"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white">
                    <Instagram className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-foreground">
                      {igLink.name || (igLink.username ? `@${igLink.username}` : "Instagram")}
                    </span>
                    <span className="block truncate text-[12px] text-[var(--amo-label)]">
                      Instagram Direct{igLink.username ? ` · @${igLink.username}` : ""}
                    </span>
                  </span>
                  {crmEnabled && (
                    <span className="shrink-0 text-[13px] font-semibold text-primary">
                      {t("amo.ig.write")}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Contact */}
            {(lead.contactId || lead.phone || lead.contactName) && (
              <div className="border-t border-[var(--amo-divider)] bg-[var(--amo-head)] px-6 py-5">
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
                          onChange={(e) =>
                            setContactDraft((d) => ({ ...d, [key]: e.target.value }))
                          }
                          className="h-8 w-full rounded-lg border border-[var(--amo-quiet-line)] bg-background px-2 text-[14px] outline-none focus:border-primary/50"
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
                        className="h-8 rounded-lg bg-primary shadow-sm px-4 text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110"
                      >
                        {t("amo.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingContact(false)}
                        className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        {t("amo.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-1">
                    {layout.contact.filter(contactShown).map((k) => (
                      <FieldRow key={k} label={contactLabel(layout, k, t)}>
                        {contactRow(k)}
                      </FieldRow>
                    ))}
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
              <div className="border-t border-[var(--amo-divider)] bg-[var(--amo-head)] px-6 py-3">
                {addingContact ? (
                  <div className="space-y-2">
                    <FieldRow label={t("amo.contact.name")}>
                      <input
                        autoFocus
                        value={contactDraft.name}
                        onChange={(e) => setContactDraft((d) => ({ ...d, name: e.target.value }))}
                        className="h-8 w-full rounded-lg border border-[var(--amo-quiet-line)] bg-background px-2 text-[14px] outline-none focus:border-primary/50"
                      />
                    </FieldRow>
                    <FieldRow label={t("amo.contact.phone")}>
                      <input
                        type="tel"
                        value={contactDraft.phone}
                        onChange={(e) => setContactDraft((d) => ({ ...d, phone: e.target.value }))}
                        className="h-8 w-full rounded-lg border border-[var(--amo-quiet-line)] bg-background px-2 text-[14px] outline-none focus:border-primary/50"
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
                        className="h-8 rounded-lg bg-primary shadow-sm px-4 text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110"
                      >
                        {t("amo.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingContact(false)}
                        className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
              <div className="border-t border-[var(--amo-divider)] bg-[var(--amo-head)] px-6 py-3">
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
                      className="h-8 flex-1 rounded-lg border border-[var(--amo-quiet-line)] bg-background px-2 text-[13px] outline-none focus:border-primary/50"
                    />
                    <button
                      type="button"
                      disabled={!companyDraft.trim()}
                      onClick={() => {
                        setAddingCompany(false);
                        void patchLead({ company_name: companyDraft.trim() });
                      }}
                      className="h-8 rounded-lg bg-primary shadow-sm px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
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
        {tab === "setup" && canSetUpFields && <LeadCardSetup />}
        {dirty && (
          <div className="sticky bottom-0 z-10 mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--amo-divider)] bg-card/95 px-6 py-3 backdrop-blur">
            <button
              type="button"
              disabled={savingDraft}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void saveDraft()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-60"
            >
              {savingDraft && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("amo.save")}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setDraft({});
                setContactEdits({});
              }}
              className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t("amo.cancel")}
            </button>
            <span className="ml-auto text-[12px] text-subtle">
              {t("amo.unsavedCount", { count: changed.length + contactChanged.length })}
            </span>
          </div>
        )}
      </aside>
      {unsaved.status === "blocked" && (
        <ConfirmUnsaved
          busy={savingDraft}
          onStay={unsaved.reset}
          onDiscard={unsaved.proceed}
          onSave={() => {
            // A stage change may first need a task/note: stay and let its
            // dialog ask. Anything else saves, then the navigation goes on.
            if (draft.stage_id && draft.stage_id !== lead.stageId) {
              unsaved.reset();
              void saveDraft();
            } else {
              void saveDraft(unsaved.proceed);
            }
          }}
        />
      )}
    </DraftMode.Provider>
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
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary shadow-sm px-4 text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110"
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
  const { data: emails = [] } = useLeadEmails(lead.id);
  const { data: stages = [] } = usePipelineStagesRaw();
  const { data: profiles = [] } = useProfilesRaw();
  const { data: fieldDefs = [] } = useLeadCustomFieldDefs();

  // Platform calls waiting for AI analysis (the server starts it when the
  // recording is saved; this picks up any attempt that was cut short).
  useEffect(() => {
    const since = Date.now() - 2 * 24 * 3600_000;
    for (const c of calls) {
      if (
        c.source === "pbx" &&
        c.recording_url &&
        !c.analyzed_at &&
        (c.analysis_attempts ?? 0) < 3 &&
        new Date(c.occurred_at).getTime() > since
      ) {
        enqueueCallAnalysis(c.id);
      }
    }
  }, [calls]);

  return useMemo(() => {
    const stageById = new Map(stages.map((s) => [s.id, s]));
    const person = new Map(profiles.map((p) => [p.id, p.full_name]));
    const defLabel = new Map(fieldDefs.map((d) => [d.key, d.label]));
    const defType = new Map(fieldDefs.map((d) => [d.key, d.field_type]));
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
          const was = row.before?.[f];
          list.push({
            kind: "field",
            id: `${row.id}-${f}`,
            at: row.createdAt,
            actor,
            label: t(FIELD_LABEL_KEY[f]),
            value: v == null || v === "" ? "—" : String(v),
            ...(was == null || was === "" ? {} : { from: String(was) }),
          });
        }
      }
      if (row.changedFields.includes("custom_fields")) {
        const before = (row.before?.["custom_fields"] ?? {}) as Record<string, unknown>;
        const after = (row.after?.["custom_fields"] ?? {}) as Record<string, unknown>;
        for (const key of Object.keys(after)) {
          if (JSON.stringify(after[key]) === JSON.stringify(before[key])) continue;
          const v = after[key];
          const was = before[key];
          const show = (x: unknown) =>
            x === true
              ? t("amo.yes")
              : x === false
                ? t("amo.no")
                : fieldValueText(defType.get(key) ?? "text", x as LeadFieldValue) || "—";
          list.push({
            kind: "field",
            id: `${row.id}-cf-${key}`,
            at: row.createdAt,
            actor,
            label: defLabel.get(key) ?? key,
            value: show(v),
            ...(was == null || was === "" ? {} : { from: show(was) }),
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
        pinned: !!a.pinned,
        authorId: a.created_by,
        edited: !!a.updated_at,
      });
    }
    for (const c of calls) list.push({ kind: "call", id: c.id, at: c.occurred_at, call: c });
    // A talked platform call that went through AI analysis shows once, as
    // the analyzed call (recording, score, AI notes), not twice.
    const analyzedPbx = new Set(calls.map((c) => c.pbx_call_id).filter(Boolean));
    for (const c of pbx) {
      if (analyzedPbx.has(c.id)) continue;
      list.push({ kind: "pbx", id: c.id, at: c.created_at, call: c });
    }
    for (const e of emails) list.push({ kind: "email", id: e.id, at: e.created_at, email: e });

    // Chat messages become conversation blocks: consecutive messages on the
    // same channel less than 3 hours apart, like amoCRM's "Беседа №".
    const msgs = tg
      .map((m) => ({
        ch: (m.channel === "instagram" ? "instagram" : "telegram") as ChatChannel,
        m,
      }))
      .sort((x, y) => new Date(x.m.created_at).getTime() - new Date(y.m.created_at).getTime());
    let block: Extract<FeedItem, { kind: "chat" }> | null = null;
    for (const { ch, m } of msgs) {
      const msg: ChatMsg = {
        id: m.id,
        at: m.created_at,
        out: m.direction === "out",
        text: m.text,
        sentBy: m.sent_by ? (person.get(m.sent_by) ?? null) : null,
        fileKind: m.file_id ? (m.file_kind ?? "document") : null,
        fileName: m.file_name ?? null,
        reaction: m.reaction ?? null,
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
            <RecordingLink
              url={call.recording_url}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-primary underline underline-offset-2"
            >
              {t("amo.call.download")}
            </RecordingLink>
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
            <RecordingLink
              url={call.recording_url}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-primary underline underline-offset-2"
            >
              {t("amo.call.download")}
            </RecordingLink>
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
  const instagram = item.channel === "instagram";
  const { data: link } = useLeadTelegramLink(lead.id, { poll: false });
  const { data: igLink } = useLeadInstagramLink(lead.id);
  const hasPhoto = !!link?.photo_file_id || !!igLink?.photo_url;
  const react = useReactToChatMessage(lead.id);
  const avatar = (
    <ClientAvatar
      leadId={lead.id}
      name={contactName}
      hasPhoto={hasPhoto}
      className="h-9 w-9 text-[12px]"
      fallbackClassName="bg-[var(--amo-avatar)] text-[var(--amo-avatar-fg)]"
    />
  );
  return (
    <div className="my-2">
      {/* amoCRM draws a conversation as a small stack of sheets. */}
      <div className="mx-2 h-[5px] rounded-t-xl border border-b-0 border-[var(--amo-box-line)] bg-[var(--amo-box)]" />
      <div className={cn("rounded-xl px-5 pb-3 pt-3", CARD)}>
        <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-[var(--amo-soft)]">
          {instagram ? (
            <Instagram className="h-3.5 w-3.5 text-pink-500" />
          ) : (
            <Send className="h-3.5 w-3.5 text-sky-400" />
          )}
          {instagram ? "Instagram" : "Telegram"}
          {instagram && igLink?.username && (
            <span className="font-normal text-[var(--amo-label)]">@{igLink.username}</span>
          )}
        </p>
        <div className="mt-3 flex items-center gap-2.5">
          {avatar}
          <span className="text-[14px] text-[var(--amo-label)]">{contactName}</span>
        </div>
        <div className="mt-3 space-y-3">
          {item.messages.map((m) =>
            m.out ? (
              <div key={m.id} className="flex items-end justify-end gap-2.5">
                <div className="max-w-[70%] rounded-2xl bg-[var(--amo-bubble-out)] px-3 py-2">
                  <p className="text-[12px] text-[var(--amo-bubble-out-meta)]">
                    {stamp(m.at, t)} {m.sentBy ?? (instagram ? t("ig.fromApp") : t("amo.robot"))}{" "}
                    <Check className="inline h-3 w-3" /> {t("amo.delivered")}
                  </p>
                  {m.fileKind && (
                    <div className="mt-1.5">
                      <ChatFile messageId={m.id} kind={m.fileKind} name={m.fileName} />
                    </div>
                  )}
                  {m.text && (
                    <p className="mt-1 whitespace-pre-wrap text-[14px] text-[var(--amo-bubble-out-fg)]">
                      {m.text}
                    </p>
                  )}
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--amo-avatar)] text-[11px] font-bold text-[var(--amo-avatar-fg)]">
                  {((m.sentBy ?? "R").match(/\p{L}/u)?.[0] ?? "R").toUpperCase()}
                </span>
              </div>
            ) : (
              <div key={m.id} className="group/msg flex items-start gap-2.5">
                {avatar}
                <div className="relative max-w-[70%] rounded-2xl bg-[var(--amo-bubble-in)] px-3 py-2">
                  <p className="text-[12px] text-[var(--amo-label)]">
                    {stamp(m.at, t)} {contactName}
                  </p>
                  {m.fileKind && (
                    <div className="mt-1.5">
                      <ChatFile messageId={m.id} kind={m.fileKind} name={m.fileName} />
                    </div>
                  )}
                  {m.text && (
                    <p className="mt-1 whitespace-pre-wrap text-[14px] text-foreground">{m.text}</p>
                  )}
                  {m.reaction && !instagram && (
                    <button
                      type="button"
                      title={t("chat.removeReaction")}
                      onClick={() => react.mutate({ messageId: m.id, emoji: null })}
                      className="absolute -bottom-3 right-2 rounded-full border border-[var(--amo-box-line)] bg-card px-1.5 text-[14px] leading-6 shadow-sm"
                    >
                      {m.reaction}
                    </button>
                  )}
                </div>
                {!instagram && (
                  <ReactionPicker
                    current={m.reaction}
                    onPick={(emoji) => react.mutate({ messageId: m.id, emoji })}
                    className="mt-1 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-visible:opacity-100"
                  />
                )}
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
  openEmail: () => void;
  openUpload: () => void;
};

export function AmoLeadCard({
  lead,
  actions,
  initialTab,
}: {
  lead: CrmLeadView;
  actions: AmoLeadActions;
  /** "setup": open on the card's "Sozlamalar" tab. */
  initialTab?: "main" | "setup";
}) {
  const { t } = useI18n();
  const phone = usePhone();
  const crmEnabled = useCrmEnabled();
  const items = useFeed(lead);
  const { rows: taskRows } = useLeadTasksView(lead);
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<Set<FeedFilter>>(new Set());
  const [mode, setMode] = useState<ComposeMode>("chat");
  const [channel, setChannel] = useState<ChatChannel>("telegram");
  // The composer answers on the channel the client last wrote on.
  const lastChannel = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]!;
      if (it.kind === "chat") return it.channel;
    }
    return null;
  }, [items]);
  useEffect(() => {
    if (lastChannel) setChannel(lastChannel);
  }, [lastChannel]);
  const [focusKey, setFocusKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // "Zapret zadacha": in a stage whose rule applies to this user, a lead
  // with no open task can't be left -- every way out of the card (links,
  // back button, closing the tab) waits until a task is set.
  const needsTask = useStageTaskRule();
  const { data: openTaskCount } = useLeadOpenTaskCount(lead.id);
  const mustSetTask = needsTask(lead.stageId) && openTaskCount === 0;
  const deletedRef = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: ({ next }) =>
      mustSetTask && !deletedRef.current && next.pathname !== `/crm/leads/${lead.id}`,
    enableBeforeUnload: () => mustSetTask && !deletedRef.current,
    withResolver: true,
  });

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
  const matches = items.filter(
    (i) => !hidden.has(FILTER_OF[i.kind]) && (!q || itemText(i).toLowerCase().includes(q)),
  );
  // Pinned notes sit at the top of the feed, newest first, like amoCRM's.
  const pinned = matches
    .filter((i): i is Extract<FeedItem, { kind: "note" }> => i.kind === "note" && i.pinned)
    .reverse();
  const visible = matches.filter((i) => !(i.kind === "note" && i.pinned));
  // amoCRM folds a run of field changes from an earlier day into one line
  // ("Field changes: 3 events -- Expand"); today's stay spelled out.
  type FeedRow =
    { type: "item"; item: FeedItem } | { type: "group"; id: string; at: string; items: FeedItem[] };
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const now = new Date();
  const foldable = (i: FeedItem) => i.kind === "field" && !sameDay(new Date(i.at), now);
  const rows: FeedRow[] = [];
  for (const i of visible) {
    const last = rows[rows.length - 1];
    if (foldable(i) && last) {
      const lastAt = last.type === "item" ? last.item.at : last.at;
      const sameDayAsLast = sameDay(new Date(lastAt), new Date(i.at));
      if (last.type === "group" && sameDayAsLast) {
        last.items.push(i);
        continue;
      }
      if (last.type === "item" && foldable(last.item) && sameDayAsLast) {
        rows[rows.length - 1] = {
          type: "group",
          id: last.item.id,
          at: last.item.at,
          items: [last.item, i],
        };
        continue;
      }
    }
    rows.push({ type: "item", item: i });
  }

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

  // Phones show the lead's details or its conversation, one at a time.
  const [phonePane, setPhonePane] = useState<"info" | "chat">("chat");

  function compose(next: ComposeMode, ch?: ChatChannel) {
    setMode(next);
    if (ch) setChannel(ch);
    setPhonePane("chat");
    setFocusKey((k) => k + 1);
  }

  let lastDay = "";

  return (
    <div className="amo-skin flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden phone:overflow-hidden">
      {/* Phone: details | conversation */}
      <div className="hidden shrink-0 items-center gap-2 border-b border-[var(--amo-divider)] bg-[var(--amo-head)] px-3 py-2 phone:flex">
        <p
          className={cn(
            "min-w-0 flex-1 truncate text-[15px] font-bold text-foreground",
            phonePane === "info" && "invisible",
          )}
        >
          {lead.name}
        </p>
        {crmEnabled && lead.phone && (
          <button
            type="button"
            aria-label={t("amo.phone.call")}
            onClick={() =>
              phone.call(lead.phone, {
                leadId: lead.id,
                ...(lead.contactId ? { contactId: lead.contactId } : {}),
                name: lead.contactName || lead.name,
              })
            }
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-emerald-500/40 bg-card text-emerald-600 dark:text-emerald-400"
          >
            <Phone className="h-4 w-4" />
          </button>
        )}
        <div className="flex shrink-0 rounded-xl border border-[var(--amo-box-line)] bg-card p-0.5">
          {(["chat", "info"] as const).map((pane) => (
            <button
              key={pane}
              type="button"
              onClick={() => setPhonePane(pane)}
              className={cn(
                "h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors",
                phonePane === pane ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {t(pane === "chat" ? "amo.phone.chatPane" : "amo.phone.infoPane")}
            </button>
          ))}
        </div>
      </div>
      <LeadPanel
        lead={lead}
        actions={actions}
        phoneHidden={phonePane !== "info"}
        {...(initialTab ? { initialTab } : {})}
        onComposeChat={(ch) => compose("chat", ch)}
        onDeleted={() => {
          deletedRef.current = true;
        }}
      />

      {/* The feed keeps about a centimetre clear of the screen's right edge
          instead of running into it. */}
      <section
        className={cn(
          "flex min-h-[70dvh] min-w-0 flex-1 flex-col lg:min-h-0 lg:pr-[1cm] phone:min-h-0",
          FEED_BG,
          phonePane !== "chat" && "phone:hidden",
        )}
      >
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
            {pinned.length > 0 && (
              <div className="mb-3 border-b border-[var(--amo-divider)] pb-1">
                {pinned.map((n) => (
                  <NoteItem key={n.id} item={n} leadId={lead.id} />
                ))}
              </div>
            )}
            {rows.map((row) => {
              const at = row.type === "item" ? row.item.at : row.at;
              const day = dayWord(new Date(at), t);
              const sep = day !== lastDay;
              lastDay = day;
              return (
                <div key={row.type === "item" ? `${row.item.kind}-${row.item.id}` : `g-${row.id}`}>
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
                  {row.type === "item" ? (
                    <FeedEntry item={row.item} lead={lead} />
                  ) : openGroups.has(row.id) ? (
                    <>
                      {row.items.map((it) => (
                        <FeedEntry key={it.id} item={it} lead={lead} />
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setOpenGroups((g) => {
                            const next = new Set(g);
                            next.delete(row.id);
                            return next;
                          })
                        }
                        className="px-[52px] py-1 text-[12.5px] text-[var(--amo-label)] underline underline-offset-2 hover:text-foreground"
                      >
                        {t("amo.groupCollapse")}
                      </button>
                    </>
                  ) : (
                    <SystemLine at={row.at}>
                      {t("amo.groupFields", { count: row.items.length })}{" "}
                      <button
                        type="button"
                        onClick={() => setOpenGroups((g) => new Set(g).add(row.id))}
                        className="text-[var(--amo-label)] underline underline-offset-2 hover:text-foreground"
                      >
                        {t("amo.groupExpand")}
                      </button>
                    </SystemLine>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && pinned.length === 0 && openTasks.length === 0 && (
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

        {mustSetTask && (
          <div className="flex shrink-0 items-center gap-2.5 border-t border-destructive/30 bg-destructive/10 px-5 py-2 text-[12.5px] text-destructive">
            <AlarmClock className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{t("guard.banner", { stage: lead.stage })}</span>
            <button
              type="button"
              onClick={() => compose("task")}
              className="shrink-0 rounded-md bg-destructive px-2.5 py-1 text-[12px] font-semibold text-destructive-foreground hover:brightness-110"
            >
              {t("guard.setTask")}
            </button>
          </div>
        )}
        {blocker.status === "blocked" && (
          <RequiredTaskDialog
            lead={lead}
            stage={lead.stage}
            reason="leave"
            onCancel={blocker.reset}
            onDone={blocker.proceed}
          />
        )}

        <OpenTasksDock tasks={openTasks} leadId={lead.id} participants={participants} />

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

// A note in the feed, with amoCRM's hover actions: pin it to the top of
// the feed, edit it, delete it (the last two for its author, an admin or a
// ROP).
function NoteItem({ item, leadId }: { item: Extract<FeedItem, { kind: "note" }>; leadId: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const edit = useEditLeadNote();
  const remove = useDeleteLeadNote();
  const pin = usePinLeadNote();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canEdit =
    !!user &&
    (item.authorId === user.id ||
      user.role === "super_admin" ||
      user.role === "rop" ||
      user.role === "platform_owner");
  const fail = (err: unknown) =>
    toast.error(
      err instanceof Error && err.message === "not_allowed"
        ? t("amo.note.notAllowed")
        : describeError(err, t("amo.saveFailed")),
    );

  async function save() {
    const text = draft.trim();
    if (!text) return;
    try {
      await edit.mutateAsync({ id: item.id, leadId, content: text });
      setEditing(false);
    } catch (err) {
      fail(err);
    }
  }

  const action =
    "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <div
      className={cn(
        "group relative my-2 flex gap-3 rounded-xl px-4 py-3.5",
        CARD,
        item.pinned && "!border-amber-500/50",
      )}
    >
      <div className="shrink-0 pt-0.5">
        <span className="grid h-9 w-9 place-items-center rounded-full border border-[var(--amo-group-line)] text-[var(--amo-label)]">
          {item.ai ? <Bot className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-[12px] leading-5 text-muted-foreground">
            {item.pinned && <Pin className="mr-1 inline h-3 w-3 -rotate-45 text-amber-500" />}
            {stamp(item.at, t)} {item.actor}
            {item.ai && <> · {t("amo.aiNote")}</>}
            {item.edited && <> · {t("amo.note.edited")}</>}
          </p>
          {!editing && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              {confirmDelete ? (
                <>
                  <span className="mr-1 text-[12px] text-muted-foreground">
                    {t("amo.note.confirmDelete")}
                  </span>
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: item.id, leadId }, { onError: fail })}
                    className={cn(action, "text-destructive hover:text-destructive")}
                  >
                    {remove.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    {t("amo.yes")}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className={action}>
                    {t("amo.no")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={pin.isPending}
                    onClick={() =>
                      pin.mutate({ id: item.id, leadId, pinned: !item.pinned }, { onError: fail })
                    }
                    className={cn(action, item.pinned && "text-amber-600 dark:text-amber-400")}
                  >
                    {item.pinned ? (
                      <PinOff className="h-3.5 w-3.5" />
                    ) : (
                      <Pin className="h-3.5 w-3.5" />
                    )}
                    {item.pinned ? t("amo.note.unpin") : t("amo.note.pin")}
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(item.text);
                          setEditing(true);
                        }}
                        className={action}
                      >
                        <Pencil className="h-3.5 w-3.5" /> {t("amo.note.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className={cn(action, "hover:text-destructive")}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t("amo.note.delete")}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        {editing ? (
          <div className="mt-1.5">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
                if (e.key === "Escape") setEditing(false);
              }}
              rows={Math.min(8, Math.max(2, draft.split("\n").length))}
              className="w-full resize-y rounded-lg border border-primary/50 bg-background px-3 py-2 text-[14px] leading-relaxed text-foreground outline-none ring-2 ring-primary/15"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={edit.isPending || !draft.trim()}
                onClick={() => void save()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-60"
              >
                {edit.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t("amo.save")}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {t("amo.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
            {item.text}
          </p>
        )}
      </div>
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
          {item.actor}{" "}
          {item.from !== undefined ? (
            <>
              {t("amo.sys.fieldChanged", { field: item.label })} {t("amo.sys.fieldWas")}{" "}
              <span className="text-foreground">«{item.from}»</span>, {t("amo.sys.fieldNow")}{" "}
              <span className="text-foreground">«{item.value}»</span>
            </>
          ) : (
            <>
              {t("amo.sys.field", { field: item.label })}{" "}
              <span className="text-foreground">«{item.value}»</span>
            </>
          )}
        </SystemLine>
      );
    case "note":
      return <NoteItem item={item} leadId={lead.id} />;
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
