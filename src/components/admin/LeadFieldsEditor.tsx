import { useMemo, useState, type ComponentType } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Cake,
  Calendar,
  CalendarClock,
  ChevronRight,
  CircleDot,
  Hash,
  Link2,
  List,
  ListChecks,
  Loader2,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  ToggleLeft,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  useCreateLeadFieldGroup,
  useDeleteLeadCustomFieldDef,
  useDeleteLeadFieldGroup,
  useLeadCustomFieldDefs,
  useLeadFieldGroups,
  useUpdateLeadCustomFieldDef,
  useUpdateLeadFieldGroup,
  type LeadCustomFieldDefRow,
} from "@/hooks/use-crm-data";

// amoCRM's "Настройка свойств полей и групп": the groups are tabs ("Asosiy"
// plus any the admin adds), each tab lists its fields, a click on a field
// opens it for editing (name, type, options, group) with an explicit
// Save / Cancel, and "+ Maydon qo'shish" starts with picking the type.

const MAIN = "main";

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

export function LeadFieldsEditor() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: groups = [] } = useLeadFieldGroups();
  const { data: defs = [], isLoading } = useLeadCustomFieldDefs();
  const createGroup = useCreateLeadFieldGroup();
  const updateGroup = useUpdateLeadFieldGroup();
  const deleteGroup = useDeleteLeadFieldGroup();
  const updateDef = useUpdateLeadCustomFieldDef();

  const [tab, setTab] = useState<string>(MAIN);
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const [openField, setOpenField] = useState<string | null>(null);
  const [adding, setAdding] = useState<LeadFieldType | null>(null);
  const [typesOpen, setTypesOpen] = useState(false);

  const activeGroup = groups.find((g) => g.id === tab) ?? null;
  const groupOf = (d: LeadCustomFieldDefRow) =>
    d.group_id && groups.some((g) => g.id === d.group_id) ? d.group_id : MAIN;
  const fields = useMemo(
    () => defs.filter((d) => groupOf(d) === tab).sort((a, b) => a.position - b.position),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- groupOf reads groups
    [defs, groups, tab],
  );
  const countIn = (id: string) => defs.filter((d) => groupOf(d) === id).length;

  async function addGroup() {
    const name = (newGroup ?? "").trim();
    if (!name || !user?.organizationId) return;
    try {
      const g = await createGroup.mutateAsync({
        organization_id: user.organizationId,
        name,
        position: Math.max(0, ...groups.map((x) => x.position)) + 1,
      });
      setNewGroup(null);
      setTab(g.id);
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  async function saveRename(id: string) {
    const name = renameDraft.trim();
    setRenaming(null);
    if (!name) return;
    try {
      await updateGroup.mutateAsync({ id, patch: { name } });
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  async function removeGroup(id: string) {
    try {
      await deleteGroup.mutateAsync(id);
      void qc.invalidateQueries({ queryKey: ["lead_custom_field_defs"] });
      setTab(MAIN);
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    } finally {
      setDeletingGroup(null);
    }
  }

  async function move(def: LeadCustomFieldDefRow, dir: -1 | 1) {
    const i = fields.findIndex((d) => d.id === def.id);
    const other = fields[i + dir];
    if (!other) return;
    // Equal positions would never swap; space them out first.
    const a = other.position === def.position ? def.position + dir : other.position;
    try {
      await Promise.all([
        updateDef.mutateAsync({ id: def.id, patch: { position: a } }),
        updateDef.mutateAsync({ id: other.id, patch: { position: def.position } }),
      ]);
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-5 pb-0 pt-4">
        <h2 className="text-[15px] font-bold text-foreground">{t("leadFields.editorTitle")}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{t("leadFields.editorDesc")}</p>

        {/* Group tabs */}
        <div className="-mb-px mt-4 flex flex-wrap items-end gap-1">
          {[{ id: MAIN, name: t("leadFields.mainGroup") }, ...groups].map((g) => {
            const on = tab === g.id;
            const custom = g.id !== MAIN;
            if (renaming === g.id) {
              return (
                <input
                  key={g.id}
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => void saveRename(g.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveRename(g.id);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="h-9 w-40 rounded-t-lg border border-b-0 border-primary bg-background px-3 text-[13px] outline-none"
                />
              );
            }
            return (
              <div
                key={g.id}
                className={cn(
                  "group/tab flex h-9 items-center rounded-t-lg border border-b-0 transition-colors",
                  on
                    ? "border-border bg-background text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setTab(g.id);
                    setOpenField(null);
                    setAdding(null);
                  }}
                  className="flex h-full items-center gap-1.5 pl-3 pr-2 text-[13px] font-semibold"
                >
                  {g.name}
                  <span className="rounded-md bg-foreground/[0.06] px-1.5 text-[11px] tabular-nums text-muted-foreground">
                    {countIn(g.id)}
                  </span>
                </button>
                {custom && on && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={t("leadFields.groupMenu")}
                        className="mr-1 grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuItem
                        onSelect={() => {
                          setRenameDraft(g.name);
                          setRenaming(g.id);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" /> {t("leadFields.renameGroup")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setDeletingGroup(g.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> {t("leadFields.deleteGroup")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
          {newGroup !== null ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void addGroup();
              }}
              className="flex h-9 items-center gap-1 rounded-t-lg border border-b-0 border-primary bg-background pl-2 pr-1"
            >
              <input
                autoFocus
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setNewGroup(null)}
                placeholder={t("leadFields.groupName")}
                className="w-40 bg-transparent text-[13px] outline-none placeholder:text-subtle"
              />
              <button
                type="submit"
                disabled={!newGroup.trim() || createGroup.isPending}
                className="h-7 rounded-md bg-primary px-2.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                {t("common.save")}
              </button>
              <button
                type="button"
                onClick={() => setNewGroup(null)}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setNewGroup("")}
              title={t("leadFields.addGroup")}
              className="mb-1 ml-1 inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-primary hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5" /> {t("leadFields.addGroup")}
            </button>
          )}
        </div>
      </div>

      <div className="bg-background p-4">
        {activeGroup && (
          <p className="mb-3 rounded-lg bg-primary/[0.06] px-3 py-2 text-[12.5px] text-muted-foreground">
            {t("leadFields.groupHint", { name: activeGroup.name })}
          </p>
        )}
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {fields.map((def, i) =>
              openField === def.id ? (
                <li key={def.id}>
                  <FieldForm
                    def={def}
                    groupId={tab === MAIN ? null : tab}
                    groups={groups}
                    onDone={() => setOpenField(null)}
                  />
                </li>
              ) : (
                <FieldLine
                  key={def.id}
                  def={def}
                  first={i === 0}
                  last={i === fields.length - 1}
                  onOpen={() => {
                    setAdding(null);
                    setOpenField(def.id);
                  }}
                  onMove={(dir) => void move(def, dir)}
                />
              ),
            )}
            {fields.length === 0 && !adding && (
              <li className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-subtle">
                {t("leadFields.emptyGroup")}
              </li>
            )}
            {adding && (
              <li>
                <FieldForm
                  newType={adding}
                  groupId={tab === MAIN ? null : tab}
                  groups={groups}
                  onDone={() => setAdding(null)}
                />
              </li>
            )}
          </ul>
        )}

        <Popover open={typesOpen} onOpenChange={setTypesOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-primary hover:bg-primary/10"
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
                      setOpenField(null);
                      setAdding(ft);
                      setTypesOpen(false);
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
      </div>

      <ConfirmDialog
        open={!!deletingGroup}
        onOpenChange={(v) => !v && setDeletingGroup(null)}
        title={t("leadFields.deleteGroupTitle")}
        description={t("leadFields.deleteGroupDesc")}
        confirmLabel={t("leadFields.delete")}
        onConfirm={() => deletingGroup && void removeGroup(deletingGroup)}
      />
    </section>
  );
}

function FieldLine({
  def,
  first,
  last,
  onOpen,
  onMove,
}: {
  def: LeadCustomFieldDefRow;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t } = useI18n();
  const type = asFieldType(def.field_type);
  const Icon = FIELD_TYPE_ICON[type];
  const options = Array.isArray(def.options) ? (def.options as string[]) : [];
  return (
    <li className="group flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 transition-colors hover:border-primary/40">
      <span className="flex shrink-0 flex-col">
        <button
          type="button"
          disabled={first}
          onClick={() => onMove(-1)}
          aria-label={t("leadFields.moveUp")}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-25"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={last}
          onClick={() => onMove(1)}
          aria-label={t("leadFields.moveDown")}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-25"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-foreground">
            {def.label}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {t(`leadFields.type.${type}`)}
            {OPTION_FIELD_TYPES.has(type) && options.length > 0 && ` · ${options.join(", ")}`}
          </span>
        </span>
        <span className="hidden items-center gap-1 text-[12px] font-medium text-primary group-hover:flex">
          <Pencil className="h-3.5 w-3.5" /> {t("leadFields.edit")}
        </span>
        <ChevronRight className="h-4 w-4 text-subtle" />
      </button>
    </li>
  );
}

function FieldForm({
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
