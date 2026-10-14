import { useState, type ComponentType, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Flag,
  Globe,
  LayoutList,
  Lock,
  Mail,
  Megaphone,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Send,
  Trash2,
  UserRound,
  Wallet,
  X,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
import { AddFieldButton, FIELD_TYPE_ICON, FieldForm } from "@/components/lead/LeadFieldForm";
import {
  builtInGroupLabel,
  contactLabel,
  contactRowKey,
  defaultContactLabel,
  defaultLeadLabel,
  defaultTopLabel,
  fieldRowKey,
  groupRowKey,
  leadLabel,
  leadRowPlace,
  moveItem,
} from "@/components/lead/lead-card-layout";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { asFieldType, OPTION_FIELD_TYPES, type LeadFieldType } from "@/lib/lead-field-types";
import { cn, describeError } from "@/lib/utils";
import {
  getLeadCardLayout,
  getLeadInfoFieldOrder,
  getLeadWorkspaceSectionOrder,
  isLeadSectionVisible,
  LEAD_CARD_BUILTIN_GROUP,
  LEAD_INFO_ALWAYS_SHOWN,
  orderLeadCardGroups,
  useCreateLeadFieldGroup,
  useDeleteLeadFieldGroup,
  useLeadCustomFieldDefs,
  useLeadFieldGroups,
  useOrgGeneralSettings,
  useSaveLeadCardLayout,
  useUpdateLeadCustomFieldDef,
  useUpdateLeadFieldGroup,
  useUpdateOrgGeneralSettings,
  type LeadCardContactKey,
  type LeadCardLayout,
  type LeadCardLeadKey,
  type LeadCardTopKey,
  type LeadCustomFieldDefRow,
  type LeadInfoFieldKey,
  type LeadWorkspaceSectionKey,
} from "@/hooks/use-crm-data";

// amoCRM's "Настроить" for the lead card: the card itself, row for row, in
// set-up mode. Every row it shows -- the top fields, the built-in group,
// the company's own groups and fields, the contact block -- is here in the
// same order, and can be renamed (click the name), hidden (eye) and moved
// (arrows); groups and fields are added, edited and deleted in place.
// Changes save at once and show on every lead card for the whole company.

type Icon = ComponentType<{ className?: string }>;

const TOP_ICON: Record<LeadCardTopKey, Icon> = { owner: UserRound, budget: Wallet };
const LEAD_ICON: Record<LeadCardLeadKey, Icon> = {
  source: Globe,
  campaign: Megaphone,
  priority: Flag,
  created: CalendarClock,
};
const CONTACT_ICON: Record<LeadCardContactKey, Icon> = {
  company: Building2,
  phone: Phone,
  altPhone: Phone,
  email: Mail,
  telegram: Send,
  whatsapp: MessageCircle,
  position: Briefcase,
};

export function LeadCardSetup() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: settings } = useOrgGeneralSettings();
  const layout = getLeadCardLayout(settings);
  const saveLayout = useSaveLeadCardLayout();
  const { data: groups = [] } = useLeadFieldGroups();
  const { data: defs = [] } = useLeadCustomFieldDefs();
  const createGroup = useCreateLeadFieldGroup();
  const updateGroup = useUpdateLeadFieldGroup();
  const deleteGroup = useDeleteLeadFieldGroup();
  const updateDef = useUpdateLeadCustomFieldDef();

  const [openField, setOpenField] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ type: LeadFieldType; groupId: string | null } | null>(
    null,
  );
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);

  const fail = (err: unknown) => toast.error(describeError(err, t("leadFields.saveFailed")));
  const put = (patch: Partial<LeadCardLayout>) =>
    saveLayout.mutate({ ...layout, ...patch }, { onError: fail });
  const hidden = (k: string) => layout.hidden.includes(k);
  const toggle = (k: string) =>
    put({ hidden: hidden(k) ? layout.hidden.filter((x) => x !== k) : [...layout.hidden, k] });
  // An empty name or the default one drops the override.
  const rename = (k: string, value: string, fallback: string) => {
    const labels = { ...layout.labels };
    const v = value.trim();
    if (!v || v === fallback) delete labels[k];
    else labels[k] = v;
    put({ labels });
  };

  const groupIds = new Set(groups.map((g) => g.id));
  const fieldsIn = (groupId: string | null) =>
    defs
      .filter((d) => (groupId ? d.group_id === groupId : !d.group_id || !groupIds.has(d.group_id)))
      .sort((a, b) => a.position - b.position);
  const order = orderLeadCardGroups(layout, groups);

  async function moveField(list: LeadCustomFieldDefRow[], def: LeadCustomFieldDefRow, dir: -1 | 1) {
    const i = list.findIndex((d) => d.id === def.id);
    const other = list[i + dir];
    if (!other) return;
    // Equal positions would never swap; space them out first.
    const a = other.position === def.position ? def.position + dir : other.position;
    try {
      await Promise.all([
        updateDef.mutateAsync({ id: def.id, patch: { position: a } }),
        updateDef.mutateAsync({ id: other.id, patch: { position: def.position } }),
      ]);
    } catch (err) {
      fail(err);
    }
  }

  async function renameField(def: LeadCustomFieldDefRow, value: string) {
    const label = value.trim();
    if (!label || label === def.label) return;
    try {
      await updateDef.mutateAsync({ id: def.id, patch: { label } });
    } catch (err) {
      fail(err);
    }
  }

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
      put({ groups: [...order, g.id] });
    } catch (err) {
      fail(err);
    }
  }

  async function removeGroup(id: string) {
    try {
      await deleteGroup.mutateAsync(id);
      void qc.invalidateQueries({ queryKey: ["lead_custom_field_defs"] });
      put({ groups: order.filter((x) => x !== id) });
    } catch (err) {
      fail(err);
    } finally {
      setDeletingGroup(null);
    }
  }

  // A company field: its row, or its edit form when opened.
  const fieldRows = (list: LeadCustomFieldDefRow[], groupId: string | null) => (
    <>
      {list.map((def, i) => {
        if (openField === def.id)
          return (
            <li key={def.id}>
              <FieldForm
                def={def}
                groupId={groupId}
                groups={groups}
                onDone={() => setOpenField(null)}
              />
            </li>
          );
        const type = asFieldType(def.field_type);
        const options = Array.isArray(def.options) ? (def.options as string[]) : [];
        return (
          <SetupRow
            key={def.id}
            icon={FIELD_TYPE_ICON[type]}
            label={def.label}
            meta={`${t(`leadFields.type.${type}`)}${
              OPTION_FIELD_TYPES.has(type) && options.length > 0 ? ` · ${options.join(", ")}` : ""
            }`}
            hidden={hidden(fieldRowKey(def.id))}
            onToggle={() => toggle(fieldRowKey(def.id))}
            onRename={(v) => void renameField(def, v)}
            {...(i > 0 ? { onUp: () => void moveField(list, def, -1) } : {})}
            {...(i < list.length - 1 ? { onDown: () => void moveField(list, def, 1) } : {})}
            onEdit={() => {
              setAdding(null);
              setOpenField(def.id);
            }}
          />
        );
      })}
      {adding && adding.groupId === groupId && (
        <li>
          <FieldForm
            newType={adding.type}
            groupId={groupId}
            groups={groups}
            onDone={() => setAdding(null)}
          />
        </li>
      )}
    </>
  );
  const addField = (groupId: string | null) => (
    <AddFieldButton
      onPick={(type) => {
        setOpenField(null);
        setAdding({ type, groupId });
      }}
    />
  );

  const ungrouped = fieldsIn(null);

  // A built-in row being edited: "lead:<key>" or "c:<contact key>".
  const [editingBuiltIn, setEditingBuiltIn] = useState<string | null>(null);
  const placeOf = (k: LeadCardLeadKey) => leadRowPlace(layout, k, groupIds);
  const groupChoices = [
    { id: "lead", name: builtInGroupLabel(layout, t) },
    ...order
      .filter((id) => id !== LEAD_CARD_BUILTIN_GROUP)
      .map((id) => ({ id, name: groups.find((g) => g.id === id)?.name ?? "" }))
      .filter((g) => g.name),
    { id: "none", name: t("cardSetup.ungrouped") },
  ];
  // The built-in lead rows placed in a group ("lead", a group id or "none").
  const builtInLeadRows = (placeId: string) => {
    const keys = layout.lead.filter((k) => placeOf(k) === placeId);
    return keys.map((k, i) =>
      editingBuiltIn === `lead:${k}` ? (
        <li key={k}>
          <BuiltInForm
            label={leadLabel(layout, k, t)}
            fallback={defaultLeadLabel(k, t)}
            place={placeId}
            choices={groupChoices}
            onCancel={() => setEditingBuiltIn(null)}
            onSave={(name, place) => {
              const labels = { ...layout.labels };
              const v = name.trim();
              if (!v || v === defaultLeadLabel(k, t)) delete labels[k];
              else labels[k] = v;
              const nextPlace = { ...layout.place };
              if (!place || place === "lead") delete nextPlace[k];
              else nextPlace[k] = place;
              put({ labels, place: nextPlace });
              setEditingBuiltIn(null);
            }}
          />
        </li>
      ) : (
        <SetupRow
          key={k}
          icon={LEAD_ICON[k]}
          label={leadLabel(layout, k, t)}
          meta={t("cardSetup.builtIn")}
          hidden={hidden(k)}
          onToggle={() => toggle(k)}
          onRename={(v) => rename(k, v, defaultLeadLabel(k, t))}
          onEdit={() => setEditingBuiltIn(`lead:${k}`)}
          {...(i > 0 ? { onUp: () => put({ lead: moveItem(layout.lead, k, -1) }) } : {})}
          {...(i < keys.length - 1
            ? { onDown: () => put({ lead: moveItem(layout.lead, k, 1) }) }
            : {})}
        />
      ),
    );
  };

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3">
        <p className="text-[14px] font-bold text-foreground">{t("cardSetup.title")}</p>
        <p className="mt-0.5 text-[12.5px] leading-[18px] text-muted-foreground">
          {t("cardSetup.desc")}
        </p>
      </div>

      {/* Owner, budget: always first on the card. */}
      <SetupBox title={t("cardSetup.top")} hint={t("cardSetup.topHint")}>
        {layout.top.map((k) => (
          <LockedRow key={k} icon={TOP_ICON[k]} label={defaultTopLabel(k, t)} />
        ))}
      </SetupBox>

      {order.map((id, gi) => {
        const moves = {
          ...(gi > 0 ? { onUp: () => put({ groups: moveItem(order, id, -1) }) } : {}),
          ...(gi < order.length - 1
            ? { onDown: () => put({ groups: moveItem(order, id, 1) }) }
            : {}),
        };
        if (id === LEAD_CARD_BUILTIN_GROUP) {
          return (
            <SetupBox
              key={id}
              title={builtInGroupLabel(layout, t)}
              onRename={(v) => rename(groupRowKey(id), v, t("amo.group.lead"))}
              hidden={hidden(groupRowKey(id))}
              onToggle={() => toggle(groupRowKey(id))}
              count={layout.lead.filter((k) => placeOf(k) === "lead").length}
              {...moves}
            >
              {builtInLeadRows("lead")}
            </SetupBox>
          );
        }
        const group = groups.find((g) => g.id === id);
        if (!group) return null;
        const list = fieldsIn(id);
        return (
          <SetupBox
            key={id}
            title={group.name}
            onRename={(v) => {
              const name = v.trim();
              if (name && name !== group.name)
                updateGroup.mutate({ id, patch: { name } }, { onError: fail });
            }}
            hidden={hidden(groupRowKey(id))}
            onToggle={() => toggle(groupRowKey(id))}
            onDelete={() => setDeletingGroup(id)}
            count={list.length + layout.lead.filter((k) => placeOf(k) === id).length}
            footer={addField(id)}
            {...moves}
          >
            {fieldRows(list, id)}
            {builtInLeadRows(id)}
            {list.length === 0 &&
              !layout.lead.some((k) => placeOf(k) === id) &&
              !(adding && adding.groupId === id) && (
                <li className="rounded-lg border border-dashed border-[var(--amo-box-line)] px-3 py-4 text-center text-[12.5px] text-subtle">
                  {t("leadFields.emptyGroup")}
                </li>
              )}
          </SetupBox>
        );
      })}

      {/* Fields outside any group: always open under the groups on the card. */}
      <SetupBox
        title={t("cardSetup.ungrouped")}
        hint={t("cardSetup.ungroupedHint")}
        count={ungrouped.length + layout.lead.filter((k) => placeOf(k) === "none").length}
        footer={addField(null)}
      >
        {fieldRows(ungrouped, null)}
        {builtInLeadRows("none")}
      </SetupBox>

      {newGroup !== null ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addGroup();
          }}
          className="flex items-center gap-2 rounded-xl border border-primary/50 bg-card p-2"
        >
          <input
            autoFocus
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setNewGroup(null)}
            placeholder={t("leadFields.groupName")}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13.5px] outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!newGroup.trim() || createGroup.isPending}
            className="h-9 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {t("common.save")}
          </button>
          <button
            type="button"
            aria-label={t("amo.cancel")}
            onClick={() => setNewGroup(null)}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setNewGroup("")}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--amo-box-line)] py-2.5 text-[13px] font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.05]"
        >
          <Plus className="h-4 w-4" /> {t("cardSetup.addGroup")}
        </button>
      )}

      {/* The contact block under the lead's fields. */}
      <SetupBox
        title={t("cardSetup.contact")}
        hint={t("cardSetup.contactHint")}
        count={layout.contact.length}
      >
        {layout.contact.map((k, i) =>
          editingBuiltIn === `c:${k}` ? (
            <li key={k}>
              <BuiltInForm
                label={contactLabel(layout, k, t)}
                fallback={defaultContactLabel(k, t)}
                onCancel={() => setEditingBuiltIn(null)}
                onSave={(name) => {
                  rename(contactRowKey(k), name, defaultContactLabel(k, t));
                  setEditingBuiltIn(null);
                }}
              />
            </li>
          ) : (
            <SetupRow
              key={k}
              icon={CONTACT_ICON[k]}
              label={contactLabel(layout, k, t)}
              meta={t("cardSetup.builtIn")}
              hidden={hidden(contactRowKey(k))}
              onToggle={() => toggle(contactRowKey(k))}
              onRename={(v) => rename(contactRowKey(k), v, defaultContactLabel(k, t))}
              onEdit={() => setEditingBuiltIn(`c:${k}`)}
              {...(i > 0 ? { onUp: () => put({ contact: moveItem(layout.contact, k, -1) }) } : {})}
              {...(i < layout.contact.length - 1
                ? { onDown: () => put({ contact: moveItem(layout.contact, k, 1) }) }
                : {})}
            />
          ),
        )}
      </SetupBox>

      <AnalysisPageSetup />

      <ConfirmDialog
        open={!!deletingGroup}
        onOpenChange={(v) => !v && setDeletingGroup(null)}
        title={t("leadFields.deleteGroupTitle")}
        description={t("leadFields.deleteGroupDesc")}
        confirmLabel={t("leadFields.delete")}
        onConfirm={() => deletingGroup && void removeGroup(deletingGroup)}
      />
    </div>
  );
}

function Arrows({
  onUp,
  onDown,
}: {
  onUp?: (() => void) | undefined;
  onDown?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const btn =
    "grid h-4 w-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent";
  return (
    <span className="flex shrink-0 flex-col">
      <button
        type="button"
        disabled={!onUp}
        onClick={onUp}
        aria-label={t("leadFields.moveUp")}
        className={btn}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={!onDown}
        onClick={onDown}
        aria-label={t("leadFields.moveDown")}
        className={btn}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function EyeButton({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onToggle}
      title={hidden ? t("cardSetup.show") : t("cardSetup.hide")}
      aria-label={hidden ? t("cardSetup.show") : t("cardSetup.hide")}
      aria-pressed={!hidden}
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors",
        hidden
          ? "bg-foreground/[0.06] text-subtle hover:text-foreground"
          : "text-primary hover:bg-primary/10",
      )}
    >
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

/** A name that turns into an input on click; Enter/blur saves, Escape cancels. */
function EditableName({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave?: (v: string) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  if (!onSave) return <span className={cn("truncate", className)}>{value}</span>;
  if (draft !== null)
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onSave(draft);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(null);
        }}
        className="h-7 w-full min-w-0 rounded-md border border-primary bg-background px-2 text-[13.5px] font-semibold text-foreground outline-none ring-2 ring-primary/15"
      />
    );
  return (
    <button
      type="button"
      title={t("cardSetup.rename")}
      onClick={() => setDraft(value)}
      className={cn(
        "group/name flex min-w-0 max-w-full items-center gap-1.5 rounded-md text-left hover:text-primary",
        className,
      )}
    >
      <span className="truncate">{value}</span>
      <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/name:opacity-70" />
    </button>
  );
}

function SetupBox({
  title,
  hint,
  count,
  hidden,
  onToggle,
  onRename,
  onDelete,
  onUp,
  onDown,
  footer,
  children,
}: {
  title: string;
  hint?: string;
  count?: number;
  hidden?: boolean;
  onToggle?: () => void;
  onRename?: (v: string) => void;
  onDelete?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const movable = onUp !== undefined || onDown !== undefined;
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--amo-box-line)] bg-card",
        hidden && "opacity-60",
      )}
    >
      <header className="flex items-center gap-2 border-b border-[var(--amo-box-line)] bg-[var(--amo-head)] px-2.5 py-2">
        {movable ? (
          <Arrows {...{ onUp, onDown }} />
        ) : (
          <LayoutList className="ml-1 h-4 w-4 text-subtle" />
        )}
        <div className="min-w-0 flex-1">
          <EditableName
            value={title}
            {...(onRename ? { onSave: onRename } : {})}
            className="text-[12.5px] font-extrabold uppercase tracking-wide text-foreground"
          />
          {hint && <p className="truncate text-[11.5px] text-muted-foreground">{hint}</p>}
        </div>
        {hidden && (
          <span className="rounded-md bg-foreground/[0.07] px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {t("cardSetup.hidden")}
          </span>
        )}
        {count !== undefined && (
          <span className="min-w-[24px] rounded-full bg-foreground/[0.08] px-1.5 text-center text-[11.5px] font-bold tabular-nums text-foreground">
            {count}
          </span>
        )}
        {onToggle && <EyeButton hidden={!!hidden} onToggle={onToggle} />}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title={t("leadFields.deleteGroup")}
            aria-label={t("leadFields.deleteGroup")}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>
      <ul className="space-y-1.5 p-2">{children}</ul>
      {footer && <div className="border-t border-[var(--amo-box-line)] px-2 py-1.5">{footer}</div>}
    </section>
  );
}

function SetupRow({
  icon: RowIcon,
  label,
  meta,
  hidden,
  onToggle,
  onRename,
  onUp,
  onDown,
  onEdit,
}: {
  icon: Icon;
  label: string;
  meta?: string;
  hidden: boolean;
  onToggle: () => void;
  onRename: (v: string) => void;
  onUp?: () => void;
  onDown?: () => void;
  onEdit?: () => void;
}) {
  const { t } = useI18n();
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-lg border border-[var(--amo-quiet-line)] bg-card px-1.5 py-1.5 transition-colors hover:border-primary/40",
        hidden && "bg-[var(--amo-quiet)]",
      )}
    >
      <Arrows {...{ onUp, onDown }} />
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
          hidden ? "bg-foreground/[0.06] text-subtle" : "bg-primary/10 text-primary",
        )}
      >
        <RowIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <EditableName
          value={label}
          onSave={onRename}
          className={cn(
            "text-[13.5px] font-semibold",
            hidden ? "text-muted-foreground line-through decoration-1" : "text-foreground",
          )}
        />
        {meta && <span className="block truncate text-[11.5px] text-muted-foreground">{meta}</span>}
      </span>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          title={t("leadFields.edit")}
          aria-label={t("leadFields.edit")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <EyeButton hidden={hidden} onToggle={onToggle} />
    </li>
  );
}

/** Owner and budget: always on the card, nothing to set. */
function LockedRow({ icon: RowIcon, label }: { icon: Icon; label: string }) {
  const { t } = useI18n();
  return (
    <li className="flex items-center gap-2 rounded-lg border border-[var(--amo-quiet-line)] bg-[var(--amo-quiet)] px-2.5 py-1.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <RowIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-foreground">{label}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground">
          {t("cardSetup.required")}
        </span>
      </span>
      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
    </li>
  );
}

/** A built-in row opened with the pencil: its name, and for lead rows its group. */
function BuiltInForm({
  label,
  fallback,
  place,
  choices,
  onSave,
  onCancel,
}: {
  label: string;
  fallback: string;
  place?: string;
  choices?: { id: string; name: string }[];
  onSave: (name: string, place?: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(label);
  const [group, setGroup] = useState(place ?? "lead");
  const input =
    "h-9 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-[13.5px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
  return (
    <div className="rounded-xl border border-primary/50 bg-card shadow-[0_6px_24px_rgba(16,24,40,0.10)]">
      <div className="space-y-3 p-3.5">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
            {t("cardSetup.fieldName")}
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(name, choices ? group : undefined);
              if (e.key === "Escape") onCancel();
            }}
            className={cn(input, "font-semibold")}
          />
        </label>
        {choices && (
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
              {t("leadFields.groupLabel")}
            </span>
            <select value={group} onChange={(e) => setGroup(e.target.value)} className={input}>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {name.trim() !== fallback && (
          <button
            type="button"
            onClick={() => setName(fallback)}
            className="text-[12px] font-semibold text-primary hover:underline"
          >
            {t("cardSetup.resetName", { name: fallback })}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => onSave(name, choices ? group : undefined)}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110"
        >
          {t("common.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {t("amo.cancel")}
        </button>
      </div>
    </div>
  );
}

// The analysis-first lead page (opened from Audio tahlil) has its own cards
// and info rows; they are set up here too, folded away by default.
function AnalysisPageSetup() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { data: settings } = useOrgGeneralSettings();
  const update = useUpdateOrgGeneralSettings();
  const sectionOrder = getLeadWorkspaceSectionOrder(settings);
  const fieldOrder = getLeadInfoFieldOrder(settings);
  const fail = (err: unknown) => toast.error(describeError(err, t("leadFields.saveFailed")));

  function setVisible(key: LeadWorkspaceSectionKey | LeadInfoFieldKey, value: boolean) {
    const current = (settings?.lead_workspace_sections as Record<string, unknown> | null) ?? {};
    update.mutate(
      { lead_workspace_sections: { ...current, [key]: value } as never },
      { onError: fail },
    );
  }

  const list = <K extends LeadWorkspaceSectionKey | LeadInfoFieldKey>(
    keys: K[],
    label: (k: K) => string,
    save: (next: K[]) => void,
  ) => (
    <ul className="space-y-1">
      {keys.map((k, i) => (
        <li key={k} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-accent/50">
          <Arrows
            {...(i > 0 ? { onUp: () => save(moveItem(keys, k, -1)) } : {})}
            {...(i < keys.length - 1 ? { onDown: () => save(moveItem(keys, k, 1)) } : {})}
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
            {label(k)}
          </span>
          {(LEAD_INFO_ALWAYS_SHOWN as readonly string[]).includes(k) ? (
            <span
              title={t("cardSetup.required")}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground"
            >
              <Lock className="h-3.5 w-3.5" /> {t("cardSetup.alwaysShown")}
            </span>
          ) : (
            <Switch
              checked={isLeadSectionVisible(settings, k)}
              onCheckedChange={(v) => setVisible(k, v)}
            />
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--amo-box-line)] bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-[var(--amo-head)] px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-extrabold uppercase tracking-wide text-foreground">
            {t("cardSetup.analysis")}
          </span>
          <span className="block text-[11.5px] text-muted-foreground">
            {t("cardSetup.analysisHint")}
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="space-y-4 border-t border-[var(--amo-box-line)] p-3">
          <div>
            <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-subtle">
              {t("cardSetup.analysisFields")}
            </p>
            {list(
              fieldOrder,
              (k) => t(`lead.info.${k}`),
              (next) => update.mutate({ lead_info_field_order: next }, { onError: fail }),
            )}
          </div>
          <div>
            <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-subtle">
              {t("cardSetup.analysisSections")}
            </p>
            {list(
              sectionOrder,
              (k) => t(`leadFields.section.${k}`),
              (next) => update.mutate({ lead_workspace_section_order: next }, { onError: fail }),
            )}
          </div>
        </div>
      )}
    </section>
  );
}
