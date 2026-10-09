import { useMemo, useState, type ReactNode } from "react";
import {
  CheckSquare,
  ClipboardList,
  GitBranch,
  Loader2,
  MessageSquare,
  PencilLine,
  Search,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DatePick, TimePick, TypePicker, roundTime } from "@/components/lead/AmoComposer";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, stageColorProps } from "@/lib/utils";
import {
  useBulkCreateTasks,
  useBulkDeleteLeads,
  useBulkEditLeadTags,
  useBulkSetLeadCustomField,
  useBulkUpdateLeads,
  useLeadCustomFieldDefs,
  usePermission,
  useSendBulkMessage,
  type BulkMessageChannel,
  type CrmLeadView,
  type ProfileRow,
  type StageRow,
} from "@/hooks/use-crm-data";
import type { Database } from "@/integrations/supabase/types";

// amoCRM's "Массовые действия" for a funnel: tick leads on the board (or
// in the list) and this strip replaces nothing -- it sits under the funnel
// header with one button per action, each opening a small window that
// says how many leads it will touch. Salespeople and admins get the same
// actions (RLS only lets a salesperson change their own leads); deleting
// is the super admin's alone.

type Action = "owner" | "task" | "stage" | "field" | "tags" | "message" | "delete";
type LeadPatch = Database["public"]["Tables"]["leads"]["Update"];

const FIELD =
  "h-9 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-[13.5px] text-foreground outline-none transition-colors [color-scheme:light] placeholder:text-subtle hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/15 dark:[color-scheme:dark]";

const STANDARD_FIELDS = [
  "budget",
  "source",
  "temperature",
  "priority",
  "city",
  "region",
  "address",
] as const;
type StandardField = (typeof STANDARD_FIELDS)[number];
const TEMPERATURES = ["VeryHot", "Hot", "Warm", "Cold"] as const;
const PRIORITIES = ["Urgent", "High", "Normal", "Low"] as const;
const CHANNELS: BulkMessageChannel[] = ["telegram", "whatsapp", "sms", "email"];
const MESSAGE_CHUNK = 500;

export function FunnelBulkBar({
  ids,
  allIds,
  leads,
  stages,
  owners,
  onSelectAll,
  onDone,
  onCancel,
}: {
  /** The ticked leads. */
  ids: string[];
  /** Every lead the funnel's filters currently show ("all found"). */
  allIds: string[];
  leads: CrmLeadView[];
  /** Every stage of every funnel -- "change stage" can move to another funnel. */
  stages: StageRow[];
  owners: ProfileRow[];
  onSelectAll: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { user } = useAuth();
  const canMove = usePermission("Move deals");
  const canViewRevenue = usePermission("View revenue");
  const canDelete = user?.role === "super_admin" || user?.role === "platform_owner";
  const [action, setAction] = useState<Action | null>(null);

  const picked = useMemo(() => {
    const set = new Set(ids);
    return leads.filter((l) => set.has(l.id));
  }, [ids, leads]);
  const sum = picked.reduce((s, l) => s + (l.expectedRevenue || 0), 0);

  const buttons: { key: Action; icon: typeof User; label: string; show: boolean }[] = [
    { key: "owner", icon: User, label: t("bulk.owner"), show: true },
    { key: "task", icon: ClipboardList, label: t("bulk.task"), show: true },
    { key: "stage", icon: GitBranch, label: t("bulk.stage"), show: canMove },
    { key: "field", icon: PencilLine, label: t("bulk.field"), show: true },
    { key: "tags", icon: Tag, label: t("bulk.tags"), show: true },
    { key: "message", icon: MessageSquare, label: t("bulk.message"), show: true },
    { key: "delete", icon: Trash2, label: t("bulk.delete"), show: canDelete },
  ];

  // Results: RLS may let a salesperson change only some of the ticked leads.
  function report(changed: number, total: number) {
    if (changed >= total) toast.success(t("bulk.done", { count: changed }));
    else if (changed > 0) toast.warning(t("bulk.partial", { done: changed, total }));
    else toast.error(t("bulk.noneAllowed"));
    setAction(null);
    onDone();
  }

  const props = { ids, onClose: () => setAction(null), report };

  return (
    <>
      <div className="mt-2.5 flex flex-wrap items-center gap-1 rounded-2xl border border-primary/30 bg-card px-2 py-1.5 shadow-[0_6px_24px_rgba(16,24,40,0.10)]">
        <span className="flex items-center gap-2 px-2 text-[13px] font-semibold text-foreground">
          <CheckSquare className="h-4 w-4 text-primary" />
          {ids.length ? t("bulk.selected", { count: ids.length }) : t("bulk.pick")}
          {canViewRevenue && ids.length > 0 && (
            <span className="font-medium tabular-nums text-muted-foreground">· {format(sum)}</span>
          )}
        </span>
        <span className="mx-1 h-5 w-px bg-border" />
        {buttons
          .filter((b) => b.show)
          .map((b) => (
            <button
              key={b.key}
              type="button"
              disabled={!ids.length && b.key !== "message"}
              onClick={() => setAction(b.key)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors disabled:opacity-40",
                b.key === "delete"
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground/85 hover:bg-accent hover:text-foreground",
              )}
            >
              <b.icon className="h-3.5 w-3.5" /> {b.label}
            </button>
          ))}
        <span className="flex-1" />
        {ids.length < allIds.length && (
          <button
            type="button"
            onClick={onSelectAll}
            className="h-8 rounded-lg px-2.5 text-[12.5px] font-medium text-primary hover:bg-primary/10"
          >
            {t("bulk.selectAllCount", { count: allIds.length })}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" /> {t("bulk.exit")}
        </button>
      </div>

      {action === "owner" && <OwnerAction {...props} owners={owners} />}
      {action === "task" && <TaskAction {...props} owners={owners} leads={picked} />}
      {action === "stage" && <StageAction {...props} stages={stages} />}
      {action === "field" && <FieldAction {...props} />}
      {action === "tags" && <TagsAction {...props} leads={leads} />}
      {action === "message" && <MessageAction {...props} allIds={allIds} />}
      {action === "delete" && <DeleteAction {...props} />}
    </>
  );
}

type ActionProps = {
  ids: string[];
  onClose: () => void;
  report: (changed: number, total: number) => void;
};

/** The small amoCRM window: title, the controls, Save / Cancel, "touches N leads". */
function BulkWindow({
  title,
  count,
  busy,
  canSave = true,
  saveLabel,
  danger,
  onSave,
  onClose,
  children,
  wide,
}: {
  title: string;
  count: number;
  busy: boolean;
  canSave?: boolean;
  saveLabel?: string;
  danger?: boolean;
  onSave: () => void;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent
        className={cn("amo-skin gap-0 overflow-hidden p-0", wide ? "max-w-xl" : "max-w-md")}
      >
        <div className="px-5 pb-4 pt-5">
          <DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>
          <div className="mt-4 space-y-3 text-[13.5px]">{children}</div>
        </div>
        <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <button
            type="button"
            disabled={busy || !canSave}
            onClick={onSave}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-50",
              danger
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground",
            )}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saveLabel ?? t("common.save")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("amo.cancel")}
          </button>
          <span className="ml-auto text-[12px] text-muted-foreground">
            {t("bulk.affects", { count })}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useRun(report: ActionProps["report"], total: number) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (fn: () => Promise<number>) => {
      setBusy(true);
      try {
        report(await fn(), total);
      } catch (err) {
        toast.error(describeError(err, t("bulk.failed")));
      } finally {
        setBusy(false);
      }
    },
  };
}

function PersonList({
  owners,
  value,
  onChange,
  extra,
}: {
  owners: ProfileRow[];
  value: string;
  onChange: (id: string) => void;
  extra?: { id: string; label: string };
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const list = owners.filter((o) =>
    `${o.full_name ?? ""} ${o.email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const row = (id: string, label: string, sub?: string) => (
    <button
      key={id}
      type="button"
      onClick={() => onChange(id)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
        value === id ? "bg-primary/10 text-foreground" : "hover:bg-accent",
      )}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
        {label.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{label}</span>
        {sub && <span className="block truncate text-[11.5px] text-subtle">{sub}</span>}
      </span>
    </button>
  );
  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="h-3.5 w-3.5 text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("bulk.searchPeople")}
          className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
        />
      </div>
      <div className="max-h-60 overflow-y-auto p-1">
        {extra && !q && row(extra.id, extra.label)}
        {list.map((o) => row(o.id, o.full_name || o.email || "—", o.email ?? undefined))}
      </div>
    </div>
  );
}

function OwnerAction({ ids, onClose, report, owners }: ActionProps & { owners: ProfileRow[] }) {
  const { t } = useI18n();
  const update = useBulkUpdateLeads();
  const { busy, run } = useRun(report, ids.length);
  const [owner, setOwner] = useState("");
  return (
    <BulkWindow
      title={t("bulk.ownerTitle")}
      count={ids.length}
      busy={busy}
      canSave={!!owner}
      onClose={onClose}
      onSave={() => void run(() => update.mutateAsync({ ids, patch: { owner_id: owner } }))}
    >
      <PersonList owners={owners} value={owner} onChange={setOwner} />
    </BulkWindow>
  );
}

function TaskAction({
  ids,
  onClose,
  report,
  owners,
  leads,
}: ActionProps & { owners: ProfileRow[]; leads: CrmLeadView[] }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const create = useBulkCreateTasks();
  const { busy, run } = useRun(report, ids.length);
  const [date, setDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [time, setTime] = useState(() => roundTime(new Date(Date.now() + 15 * 60_000)));
  const [type, setType] = useState("contact");
  const [assignee, setAssignee] = useState("__owner__");
  const [text, setText] = useState("");
  const ownerOf = new Map(leads.map((l) => [l.id, l.ownerId]));

  function save() {
    const [h = 9, m = 0] = time.split(":").map(Number);
    const due = new Date(date);
    due.setHours(h, m, 0, 0);
    const label = t(`amo.taskType.${type}`);
    const body = text.trim();
    void run(() =>
      create.mutateAsync(
        ids.map((id) => ({
          organization_id: user!.organizationId!,
          lead_id: id,
          title: body ? `${label}: ${body}` : label,
          description: body || null,
          due_date: due.toISOString(),
          assignee_id:
            assignee === "__owner__" ? ownerOf.get(id) || user?.id || null : assignee || null,
          created_by: user?.id ?? null,
        })),
      ),
    );
  }

  return (
    <BulkWindow
      title={t("bulk.taskTitle")}
      count={ids.length}
      busy={busy}
      onClose={onClose}
      onSave={save}
      wide
    >
      <div className="flex flex-wrap items-center gap-2">
        <DatePick
          value={date}
          onChange={(d, tm) => {
            setDate(d);
            if (tm) setTime(tm);
          }}
        />
        <TimePick value={time} onChange={setTime} />
        <TypePicker value={type} onChange={setType} />
      </div>
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
          {t("bulk.taskFor")}
        </span>
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={FIELD}>
          <option value="__owner__">{t("bulk.taskEachOwner")}</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.full_name || o.email}
            </option>
          ))}
        </select>
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={t("bulk.taskComment")}
        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] outline-none placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
    </BulkWindow>
  );
}

function StageAction({ ids, onClose, report, stages }: ActionProps & { stages: StageRow[] }) {
  const { t } = useI18n();
  const update = useBulkUpdateLeads();
  const { busy, run } = useRun(report, ids.length);
  const [stageId, setStageId] = useState("");
  // Every funnel with its stages, so leads can move to another funnel too.
  const groups = useMemo(() => {
    const map = new Map<string, StageRow[]>();
    for (const s of [...stages].sort((a, b) => a.position - b.position)) {
      const key = s.pipeline_name || "Direct Sales";
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map];
  }, [stages]);
  const target = stages.find((s) => s.id === stageId);
  return (
    <BulkWindow
      title={t("bulk.stageTitle")}
      count={ids.length}
      busy={busy}
      canSave={!!target}
      onClose={onClose}
      onSave={() =>
        target &&
        void run(() =>
          update.mutateAsync({
            ids,
            patch: { stage_id: target.id, funnel: target.pipeline_name || "Direct Sales" },
          }),
        )
      }
    >
      <div className="max-h-[52dvh] space-y-3 overflow-y-auto pr-1">
        {groups.map(([funnel, list]) => (
          <div key={funnel}>
            <p className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wider text-subtle">
              {funnel}
            </p>
            <div className="space-y-0.5">
              {list.map((s) => {
                const c: ReturnType<typeof stageColorProps> = s.is_won
                  ? { className: "bg-success" }
                  : s.is_lost
                    ? { className: "bg-destructive" }
                    : stageColorProps(s.color);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStageId(s.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      stageId === s.id
                        ? "bg-primary/10 font-semibold text-foreground ring-1 ring-primary/40"
                        : "hover:bg-accent",
                    )}
                  >
                    <span
                      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", c.className)}
                      style={c.style}
                    />
                    <span className="truncate">{s.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </BulkWindow>
  );
}

function FieldAction({ ids, onClose, report }: ActionProps) {
  const { t } = useI18n();
  const update = useBulkUpdateLeads();
  const setCustom = useBulkSetLeadCustomField();
  const { data: defs = [] } = useLeadCustomFieldDefs();
  const { busy, run } = useRun(report, ids.length);
  const [field, setField] = useState("");
  const [value, setValue] = useState("");

  const def = field.startsWith("custom:") ? defs.find((d) => d.key === field.slice(7)) : null;
  const options: string[] | null =
    field === "temperature"
      ? [...TEMPERATURES]
      : field === "priority"
        ? [...PRIORITIES]
        : def?.field_type === "toggle"
          ? ["yes", "no"]
          : def && Array.isArray(def.options) && def.options.length
            ? (def.options as string[])
            : null;
  const optionLabel = (o: string) =>
    field === "temperature"
      ? t(`bulk.temp.${o}`)
      : field === "priority"
        ? t(`bulk.priority.${o}`)
        : def?.field_type === "toggle"
          ? t(o === "yes" ? "amo.yes" : "amo.no")
          : o;

  function save() {
    if (def) {
      const v = value.trim();
      void run(() =>
        setCustom.mutateAsync({
          ids,
          key: def.key,
          value:
            def.field_type === "multiselect"
              ? v
                ? [v]
                : []
              : def.field_type === "toggle"
                ? v === "yes"
                : def.field_type === "datetime" && v
                  ? new Date(v).toISOString()
                  : v,
        }),
      );
      return;
    }
    const f = field as StandardField;
    const v = value.trim();
    let patch: LeadPatch;
    if (f === "budget") {
      const n = Number(v.replace(/\s/g, "")) || 0;
      patch = { budget: n, expected_revenue: n };
    } else if (f === "temperature") patch = { temperature: v as (typeof TEMPERATURES)[number] };
    else if (f === "priority") patch = { priority: v as (typeof PRIORITIES)[number] };
    else patch = { [f]: v || null } as LeadPatch;
    void run(() => update.mutateAsync({ ids, patch }));
  }

  return (
    <BulkWindow
      title={t("bulk.fieldTitle")}
      count={ids.length}
      busy={busy}
      canSave={!!field && (!options || !!value)}
      onClose={onClose}
      onSave={save}
    >
      <select
        value={field}
        onChange={(e) => {
          setField(e.target.value);
          setValue("");
        }}
        className={FIELD}
      >
        <option value="">{t("bulk.pickField")}</option>
        <optgroup label={t("bulk.standardFields")}>
          {STANDARD_FIELDS.map((f) => (
            <option key={f} value={f}>
              {t(`bulk.fieldName.${f}`)}
            </option>
          ))}
        </optgroup>
        {defs.length > 0 && (
          <optgroup label={t("import.group.custom")}>
            {defs.map((d) => (
              <option key={d.id} value={`custom:${d.key}`}>
                {d.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {field &&
        (options ? (
          <select value={value} onChange={(e) => setValue(e.target.value)} className={FIELD}>
            <option value="">{t("amo.choose")}</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {optionLabel(o)}
              </option>
            ))}
          </select>
        ) : (
          <input
            autoFocus
            type={
              def?.field_type === "date" || def?.field_type === "birthday"
                ? "date"
                : def?.field_type === "datetime"
                  ? "datetime-local"
                  : "text"
            }
            inputMode={field === "budget" || def?.field_type === "number" ? "numeric" : undefined}
            value={value}
            onChange={(e) =>
              setValue(field === "budget" ? e.target.value.replace(/[^\d\s]/g, "") : e.target.value)
            }
            placeholder={t("bulk.fieldValue")}
            className={FIELD}
          />
        ))}
      {field && !options && <p className="text-[12px] text-subtle">{t("bulk.fieldEmptyHint")}</p>}
    </BulkWindow>
  );
}

function TagsAction({ ids, onClose, report, leads }: ActionProps & { leads: CrmLeadView[] }) {
  const { t } = useI18n();
  const edit = useBulkEditLeadTags();
  const { busy, run } = useRun(report, ids.length);
  const [add, setAdd] = useState<string[]>([]);
  const [remove, setRemove] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  // The funnel's tags, most used first -- amoCRM's "Общие теги" cloud.
  const known = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leads) for (const tag of l.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  }, [leads]);
  const cloud = [...new Set([...add, ...known])].filter((x) =>
    x.toLowerCase().includes(draft.trim().toLowerCase()),
  );

  // Click once: add to the ticked leads; again: take it off them; again: leave it.
  function cycle(tag: string) {
    if (add.includes(tag)) {
      setAdd(add.filter((x) => x !== tag));
      setRemove([...remove, tag]);
    } else if (remove.includes(tag)) {
      setRemove(remove.filter((x) => x !== tag));
    } else setAdd([...add, tag]);
  }

  function addDraft() {
    const v = draft.trim();
    setDraft("");
    if (v && !add.includes(v)) {
      setAdd([...add, v]);
      setRemove(remove.filter((x) => x !== v));
    }
  }

  return (
    <BulkWindow
      title={t("bulk.tagsTitle")}
      count={ids.length}
      busy={busy}
      canSave={add.length + remove.length > 0}
      onClose={onClose}
      onSave={() => void run(() => edit.mutateAsync({ ids, add, remove }))}
      wide
    >
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addDraft();
          }
        }}
        placeholder={t("bulk.tagsPlaceholder")}
        className={FIELD}
      />
      <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
        {cloud.map((tag) => {
          const on = add.includes(tag);
          const off = remove.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => cycle(tag)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] transition-colors",
                on
                  ? "border-primary bg-primary/12 font-semibold text-primary"
                  : off
                    ? "border-destructive/50 bg-destructive/10 text-destructive line-through"
                    : "border-border text-foreground hover:border-primary/40",
              )}
            >
              {on ? "+" : off ? "−" : ""}
              {tag}
            </button>
          );
        })}
        {cloud.length === 0 && <p className="text-[12.5px] text-subtle">{t("bulk.tagsNone")}</p>}
      </div>
      <p className="text-[12px] text-subtle">{t("bulk.tagsHint")}</p>
    </BulkWindow>
  );
}

function MessageAction({ ids, onClose, report, allIds }: ActionProps & { allIds: string[] }) {
  const { t } = useI18n();
  const send = useSendBulkMessage();
  const [channel, setChannel] = useState<BulkMessageChannel>("telegram");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [everyone, setEveryone] = useState(ids.length === 0);
  const [confirm, setConfirm] = useState(false);
  const targets = everyone ? allIds : ids;
  const { busy, run } = useRun(report, targets.length);

  function go() {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    void run(async () => {
      let sent = 0;
      for (let i = 0; i < targets.length; i += MESSAGE_CHUNK) {
        const r = await send.mutateAsync({
          leadIds: targets.slice(i, i + MESSAGE_CHUNK),
          channel,
          text: text.trim(),
          ...(channel === "email" && subject.trim() ? { subject: subject.trim() } : {}),
        });
        sent += r.sent;
      }
      return sent;
    });
  }

  return (
    <BulkWindow
      title={confirm ? t("bulk.messageConfirm", { count: targets.length }) : t("bulk.messageTitle")}
      count={targets.length}
      busy={busy}
      canSave={!!text.trim() && targets.length > 0}
      saveLabel={t("bulk.send")}
      onClose={confirm ? () => setConfirm(false) : onClose}
      onSave={go}
      wide
    >
      {!confirm ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={cn(
                  "h-8 rounded-lg border px-3 text-[12.5px] font-medium transition-colors",
                  channel === c
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`bulk.channel.${c}`)}
              </button>
            ))}
          </div>
          {channel === "email" && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("bulk.subject")}
              className={FIELD}
            />
          )}
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={t("bulk.messagePlaceholder")}
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] outline-none placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={everyone}
              onChange={(e) => setEveryone(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            {t("bulk.everyone", { count: allIds.length })}
          </label>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-subtle">
            {t(`bulk.channel.${channel}`)}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-foreground">{text}</p>
        </div>
      )}
    </BulkWindow>
  );
}

function DeleteAction({ ids, onClose, report }: ActionProps) {
  const { t } = useI18n();
  const remove = useBulkDeleteLeads();
  const { busy, run } = useRun(report, ids.length);
  return (
    <BulkWindow
      title={t("bulk.confirmDelete", { count: ids.length })}
      count={ids.length}
      busy={busy}
      danger
      saveLabel={t("bulk.deleteYes")}
      onClose={onClose}
      onSave={() =>
        void run(async () => {
          await remove.mutateAsync(ids);
          return ids.length;
        })
      }
    >
      <p className="text-muted-foreground">{t("bulk.deleteHint")}</p>
    </BulkWindow>
  );
}
