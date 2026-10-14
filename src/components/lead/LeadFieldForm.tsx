import { useState, type ComponentType } from "react";
import {
  AlignLeft,
  Cake,
  Calendar,
  CalendarClock,
  CircleDot,
  Hash,
  Link2,
  List,
  ListChecks,
  Loader2,
  MapPin,
  Plus,
  ToggleLeft,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  LEAD_FIELD_TYPES,
  OPTION_FIELD_TYPES,
  asFieldType,
  type LeadFieldType,
} from "@/lib/lead-field-types";
import {
  useCreateLeadCustomFieldDef,
  useDeleteLeadCustomFieldDef,
  useLeadCustomFieldDefs,
  useUpdateLeadCustomFieldDef,
  type LeadCustomFieldDefRow,
} from "@/hooks/use-crm-data";

// One custom lead field opened for editing (or a new one): name, type,
// options and group, with an explicit Save / Cancel / Delete -- used by the
// lead card's "Sozlamalar" tab (LeadCardSetup).

export const FIELD_TYPE_ICON: Record<LeadFieldType, ComponentType<{ className?: string }>> = {
  text: Type,
  number: Hash,
  textarea: AlignLeft,
  select: List,
  multiselect: ListChecks,
  radio: CircleDot,
  toggle: ToggleLeft,
  date: Calendar,
  datetime: CalendarClock,
  birthday: Cake,
  url: Link2,
  address: MapPin,
};

const INPUT =
  "h-9 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-[13.5px] text-foreground outline-none transition-colors [color-scheme:light] placeholder:text-subtle hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/15 dark:[color-scheme:dark]";

function keyFor(label: string, taken: Set<string>): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field";
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  return key;
}

/** "+ Maydon qo'shish": picks the new field's type first, like amoCRM. */
export function AddFieldButton({
  onPick,
  className,
}: {
  onPick: (type: LeadFieldType) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-primary hover:bg-primary/10",
            className,
          )}
        >
          <Plus className="h-4 w-4" /> {t("leadFields.addButton")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
          {t("leadFields.pickType")}
        </p>
        <div className="max-h-80 overflow-y-auto">
          {LEAD_FIELD_TYPES.map((ft) => {
            const Icon = FIELD_TYPE_ICON[ft];
            return (
              <button
                key={ft}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(ft);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-accent"
              >
                <Icon className="h-4 w-4 text-primary" />
                {t(`leadFields.type.${ft}`)}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FieldForm({
  def,
  newType,
  groupId,
  groups,
  onDone,
}: {
  def?: LeadCustomFieldDefRow;
  newType?: LeadFieldType;
  groupId: string | null;
  groups: { id: string; name: string }[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: defs = [] } = useLeadCustomFieldDefs();
  const create = useCreateLeadCustomFieldDef();
  const update = useUpdateLeadCustomFieldDef();
  const remove = useDeleteLeadCustomFieldDef();
  const [label, setLabel] = useState(def?.label ?? "");
  const [type, setType] = useState<LeadFieldType>(
    def ? asFieldType(def.field_type) : (newType ?? "text"),
  );
  const [options, setOptions] = useState<string[]>(
    def && Array.isArray(def.options) ? (def.options as string[]) : [],
  );
  const [option, setOption] = useState("");
  const [group, setGroup] = useState<string>(def?.group_id ?? groupId ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = create.isPending || update.isPending || remove.isPending;
  const needsOptions = OPTION_FIELD_TYPES.has(type);
  const Icon = FIELD_TYPE_ICON[type];

  function addOption() {
    const v = option.trim();
    setOption("");
    if (v && !options.includes(v)) setOptions([...options, v]);
  }

  async function save() {
    const name = label.trim();
    if (!name) return;
    const pending = option.trim() && !options.includes(option.trim()) ? [option.trim()] : [];
    const opts = [...options, ...pending];
    try {
      if (def) {
        await update.mutateAsync({
          id: def.id,
          patch: { label: name, field_type: type, options: opts, group_id: group || null },
        });
      } else {
        await create.mutateAsync({
          organization_id: user!.organizationId!,
          key: keyFor(name, new Set(defs.map((d) => d.key))),
          label: name,
          field_type: type,
          options: opts,
          group_id: group || null,
          position: Math.max(0, ...defs.map((d) => d.position)) + 1,
        });
      }
      toast.success(t(def ? "leadFields.saved" : "leadFields.createSuccess"));
      onDone();
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  async function del() {
    if (!def) return;
    try {
      await remove.mutateAsync(def.id);
      onDone();
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  return (
    <div className="rounded-xl border border-primary/50 bg-card shadow-[0_6px_24px_rgba(16,24,40,0.10)]">
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") onDone();
            }}
            placeholder={t("leadFields.labelPlaceholder")}
            className={cn(INPUT, "h-10 text-[14.5px] font-semibold")}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
              {t("leadFields.typeLabel")}
            </span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as LeadFieldType)}
              className={INPUT}
            >
              {LEAD_FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {t(`leadFields.type.${ft}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
              {t("leadFields.groupLabel")}
            </span>
            <select value={group} onChange={(e) => setGroup(e.target.value)} className={INPUT}>
              <option value="">{t("leadFields.mainGroup")}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {needsOptions && (
          <div>
            <span className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
              {t("leadFields.optionsLabel")}
            </span>
            <div className="space-y-1.5">
              {options.map((o, i) => (
                <div key={`${o}-${i}`} className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center text-[11px] tabular-nums text-subtle">
                    {i + 1}
                  </span>
                  <input
                    value={o}
                    onChange={(e) =>
                      setOptions(options.map((x, j) => (j === i ? e.target.value : x)))
                    }
                    className={cn(INPUT, "h-8 text-[13px]")}
                  />
                  <button
                    type="button"
                    aria-label={t("leadFields.removeOption")}
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center text-subtle">
                  <Plus className="h-3.5 w-3.5" />
                </span>
                <input
                  value={option}
                  onChange={(e) => setOption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addOption();
                    }
                  }}
                  onBlur={addOption}
                  placeholder={t("leadFields.optionPlaceholder")}
                  className={cn(INPUT, "h-8 border-dashed text-[13px]")}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
        <button
          type="button"
          disabled={busy || !label.trim()}
          onClick={() => void save()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-50"
        >
          {(create.isPending || update.isPending) && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )}
          {t("common.save")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {t("amo.cancel")}
        </button>
        {def && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("leadFields.delete")}
          </button>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("leadFields.deleteConfirmTitle")}
        description={t("leadFields.deleteConfirmDesc")}
        confirmLabel={t("leadFields.delete")}
        onConfirm={() => void del()}
      />
    </div>
  );
}
