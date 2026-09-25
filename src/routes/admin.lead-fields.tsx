import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ListChecks,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { describeError } from "@/lib/utils";
import {
  getLeadInfoFieldOrder,
  getLeadWorkspaceSectionOrder,
  isLeadSectionVisible,
  useCreateLeadCustomFieldDef,
  useDeleteLeadCustomFieldDef,
  useLeadCustomFieldDefs,
  useOrgGeneralSettings,
  useUpdateLeadCustomFieldDef,
  useUpdateOrgGeneralSettings,
  type LeadCustomFieldDefRow,
  type LeadInfoFieldKey,
  type LeadWorkspaceSectionKey,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/admin/lead-fields")({
  head: () => ({
    meta: [
      { title: "Lid ma'lumotlari maydonlari — SalesIQ" },
      {
        name: "description",
        content: "Lid ish maydonida ko'rsatiladigan qo'shimcha maydonlarni sozlang.",
      },
    ],
  }),
  component: AdminLeadFieldsPage,
});

const FIELD_TYPES = ["text", "select", "toggle"] as const;
type FieldType = (typeof FIELD_TYPES)[number];

function slugify(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `field_${Date.now()}`;
}

function CreateFieldCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: defs } = useLeadCustomFieldDefs();
  const create = useCreateLeadCustomFieldDef();
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    const key = slugify(label);
    const position = Math.max(0, ...(defs ?? []).map((d) => d.position)) + 1;
    try {
      await create.mutateAsync({
        organization_id: user!.organizationId!,
        key,
        label: label.trim(),
        field_type: fieldType,
        options: fieldType === "select" ? [] : [],
        position,
      });
      setLabel("");
      setFieldType("text");
      toast.success(t("leadFields.createSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  return (
    <SectionCard title={t("leadFields.addTitle")}>
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-wrap items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("leadFields.labelPlaceholder")}
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
        />
        <select
          value={fieldType}
          onChange={(e) => setFieldType(e.target.value as FieldType)}
          className="h-10 shrink-0 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
        >
          {FIELD_TYPES.map((ft) => (
            <option key={ft} value={ft}>
              {t(`leadFields.type.${ft}`)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={create.isPending || !label.trim()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {t("leadFields.addButton")}
        </button>
      </form>
    </SectionCard>
  );
}

function OptionsEditor({ def }: { def: LeadCustomFieldDefRow }) {
  const { t } = useI18n();
  const update = useUpdateLeadCustomFieldDef();
  const [newOption, setNewOption] = useState("");
  const options = Array.isArray(def.options) ? (def.options as string[]) : [];

  async function save(next: string[]) {
    try {
      await update.mutateAsync({ id: def.id, patch: { options: next } });
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  function addOption() {
    const value = newOption.trim();
    if (!value || options.includes(value)) return;
    void save([...options, value]);
    setNewOption("");
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">{t("leadFields.optionsLabel")}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <Pill key={opt} tone="info">
            <span className="flex items-center gap-1">
              {opt}
              <button
                type="button"
                onClick={() => void save(options.filter((o) => o !== opt))}
                aria-label={t("leadFields.removeOption")}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </Pill>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addOption();
            }
          }}
          placeholder={t("leadFields.optionPlaceholder")}
          className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={addOption}
          disabled={!newOption.trim()}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-dashed border-border px-2 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
        >
          <Plus className="h-3 w-3" /> {t("leadFields.addOption")}
        </button>
      </div>
    </div>
  );
}

function FieldRow({
  def,
  isFirst,
  isLast,
  onMove,
}: {
  def: LeadCustomFieldDefRow;
  isFirst: boolean;
  isLast: boolean;
  onMove: (def: LeadCustomFieldDefRow, direction: "up" | "down") => void;
}) {
  const { t } = useI18n();
  const update = useUpdateLeadCustomFieldDef();
  const remove = useDeleteLeadCustomFieldDef();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function saveLabel(label: string) {
    if (!label.trim() || label.trim() === def.label) return;
    try {
      await update.mutateAsync({ id: def.id, patch: { label: label.trim() } });
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  async function saveType(fieldType: FieldType) {
    try {
      await update.mutateAsync({ id: def.id, patch: { field_type: fieldType } });
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  async function confirmRemove() {
    try {
      await remove.mutateAsync(def.id);
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    } finally {
      setConfirmDelete(false);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            onClick={() => onMove(def, "up")}
            disabled={isFirst}
            aria-label={t("leadFields.moveUp")}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(def, "down")}
            disabled={isLast}
            aria-label={t("leadFields.moveDown")}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <input
          defaultValue={def.label}
          onBlur={(e) => void saveLabel(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
        />
        <select
          value={FIELD_TYPES.includes(def.field_type as FieldType) ? def.field_type : "text"}
          onChange={(e) => void saveType(e.target.value as FieldType)}
          className="h-9 shrink-0 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
        >
          {FIELD_TYPES.map((ft) => (
            <option key={ft} value={ft}>
              {t(`leadFields.type.${ft}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label={t("leadFields.delete")}
          className="shrink-0 rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {def.field_type === "select" && (
        <div className="mt-3 border-t border-border pt-3">
          <OptionsEditor def={def} />
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("leadFields.deleteConfirmTitle")}
        description={t("leadFields.deleteConfirmDesc")}
        confirmLabel={t("leadFields.delete")}
        onConfirm={() => void confirmRemove()}
      />
    </li>
  );
}

function LeadWorkspaceSectionsCard() {
  const { t } = useI18n();
  const { data: settings } = useOrgGeneralSettings();
  const update = useUpdateOrgGeneralSettings();
  const order = getLeadWorkspaceSectionOrder(settings);

  async function toggle(key: LeadWorkspaceSectionKey, value: boolean) {
    const current = (settings?.lead_workspace_sections as Record<string, boolean> | null) ?? {};
    try {
      await update.mutateAsync({ lead_workspace_sections: { ...current, [key]: value } });
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  async function move(key: LeadWorkspaceSectionKey, direction: "up" | "down") {
    const idx = order.indexOf(key);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= order.length) return;
    const next = [...order];
    const a = next[idx];
    const b = next[swapWith];
    if (a === undefined || b === undefined) return;
    next[idx] = b;
    next[swapWith] = a;
    try {
      await update.mutateAsync({ lead_workspace_section_order: next });
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  return (
    <SectionCard title={t("leadFields.sectionsTitle")} description={t("leadFields.sectionsDesc")}>
      <ul className="divide-y divide-border">
        {order.map((key, i) => (
          <li
            key={key}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex items-center gap-2">
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => void move(key, "up")}
                  disabled={i === 0}
                  aria-label={t("leadFields.moveUp")}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void move(key, "down")}
                  disabled={i === order.length - 1}
                  aria-label={t("leadFields.moveDown")}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t(`leadFields.section.${key}`)}
                </p>
                <p className="text-xs text-subtle">{t(`leadFields.sectionDesc.${key}`)}</p>
              </div>
            </div>
            <Switch
              checked={isLeadSectionVisible(settings, key)}
              onCheckedChange={(v) => void toggle(key, v)}
            />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function LeadInfoFieldsVisibilityCard() {
  const { t } = useI18n();
  const { data: settings } = useOrgGeneralSettings();
  const update = useUpdateOrgGeneralSettings();
  const order = getLeadInfoFieldOrder(settings);

  async function toggle(key: LeadInfoFieldKey, value: boolean) {
    const current = (settings?.lead_workspace_sections as Record<string, boolean> | null) ?? {};
    try {
      await update.mutateAsync({ lead_workspace_sections: { ...current, [key]: value } });
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  async function move(key: LeadInfoFieldKey, direction: "up" | "down") {
    const idx = order.indexOf(key);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= order.length) return;
    const next = [...order];
    const a = next[idx];
    const b = next[swapWith];
    if (a === undefined || b === undefined) return;
    next[idx] = b;
    next[swapWith] = a;
    try {
      await update.mutateAsync({ lead_info_field_order: next });
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  return (
    <SectionCard
      title={t("leadFields.builtInFieldsTitle")}
      description={t("leadFields.builtInFieldsDesc")}
    >
      <ul className="divide-y divide-border">
        {order.map((key, i) => (
          <li
            key={key}
            className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <div className="flex items-center gap-2">
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => void move(key, "up")}
                  disabled={i === 0}
                  aria-label={t("leadFields.moveUp")}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void move(key, "down")}
                  disabled={i === order.length - 1}
                  aria-label={t("leadFields.moveDown")}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-sm font-medium text-foreground">{t(`lead.info.${key}`)}</p>
            </div>
            <Switch
              checked={isLeadSectionVisible(settings, key)}
              onCheckedChange={(v) => void toggle(key, v)}
            />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function LeadFieldsSettingsPage() {
  const { t } = useI18n();
  const { data: defs, isLoading } = useLeadCustomFieldDefs();
  const update = useUpdateLeadCustomFieldDef();
  const sorted = [...(defs ?? [])].sort((a, b) => a.position - b.position);

  async function move(def: LeadCustomFieldDefRow, direction: "up" | "down") {
    const idx = sorted.findIndex((d) => d.id === def.id);
    const swapWith = direction === "up" ? sorted[idx - 1] : sorted[idx + 1];
    if (!swapWith) return;
    try {
      await Promise.all([
        update.mutateAsync({ id: def.id, patch: { position: swapWith.position } }),
        update.mutateAsync({ id: swapWith.id, patch: { position: def.position } }),
      ]);
    } catch (err) {
      toast.error(describeError(err, t("leadFields.saveFailed")));
    }
  }

  return (
    <>
      <AdminBackLink />
      <PageHeader title={t("leadFields.title")} description={t("leadFields.desc")} />

      <div className="space-y-5">
        <LeadWorkspaceSectionsCard />

        <LeadInfoFieldsVisibilityCard />

        <CreateFieldCard />

        <SectionCard title={t("leadFields.listTitle")}>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </div>
          )}
          {!isLoading && sorted.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ListChecks className="h-6 w-6 text-subtle" />
              <p className="text-sm text-subtle">{t("leadFields.empty")}</p>
            </div>
          )}
          <ul className="space-y-2">
            {sorted.map((def, i) => (
              <FieldRow
                key={def.id}
                def={def}
                isFirst={i === 0}
                isLast={i === sorted.length - 1}
                onMove={move}
              />
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}

function AdminLeadFieldsPage() {
  const { user } = useAuth();
  const { t } = useI18n();

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
          </div>
        </SectionCard>
      </>
    );
  }

  return <LeadFieldsSettingsPage />;
}
