import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  Copy,
  FileText,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill, ChannelActionButton } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PlanGate } from "@/components/PlanGate";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, timeAgo } from "@/lib/utils";
import {
  defaultWebFormFields,
  parseWebFormFields,
  WEB_FORM_FIELD_KINDS,
  type WebFormField,
  type WebFormFieldKind,
} from "@/lib/forms/web-form-fields";
import {
  useCreateWebForm,
  useDeleteWebForm,
  usePipelineStagesRaw,
  useProfilesRaw,
  useUpdateWebForm,
  useWebForms,
  useWebFormSubmissions,
  type WebFormRow,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/admin/web-forms")({
  head: () => ({
    meta: [
      { title: "Veb formalar — SalesIQ" },
      {
        name: "description",
        content: "O'zingizning saytingizga joylashtiriladigan lid formalarini yarating.",
      },
    ],
  }),
  component: AdminWebFormsPage,
});

function publicUrlFor(slug: string): string {
  if (typeof window === "undefined") return `/f/${slug}`;
  return `${window.location.origin}/f/${slug}`;
}

function CreateFormCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const create = useCreateWebForm();
  const [name, setName] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await create.mutateAsync({
        name: name.trim(),
        organization_id: user!.organizationId!,
        created_by: user!.id,
        fields: defaultWebFormFields(),
      });
      setName("");
      toast.success(t("webForms.createSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("webForms.saveFailed")));
    }
  }

  return (
    <SectionCard title={t("webForms.addTitle")}>
      <form onSubmit={(e) => void onSubmit(e)} className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("webForms.namePlaceholder")}
          className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={create.isPending || !name.trim()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {t("webForms.addButton")}
        </button>
      </form>
    </SectionCard>
  );
}

function FieldEditor({
  fields,
  onChange,
}: {
  fields: WebFormField[];
  onChange: (fields: WebFormField[]) => void;
}) {
  const { t } = useI18n();
  const usedKinds = new Set(fields.map((f) => f.kind));
  const available = WEB_FORM_FIELD_KINDS.filter((k) => !usedKinds.has(k));

  function addField(kind: WebFormFieldKind) {
    onChange([...fields, { kind, label: t(`webForms.fieldKind.${kind}`), required: false }]);
  }
  function removeField(kind: WebFormFieldKind) {
    onChange(fields.filter((f) => f.kind !== kind));
  }
  function updateField(kind: WebFormFieldKind, patch: Partial<WebFormField>) {
    onChange(fields.map((f) => (f.kind === kind ? { ...f, ...patch } : f)));
  }

  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <div
          key={field.kind}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2.5"
        >
          <Pill tone="info">{t(`webForms.fieldKind.${field.kind}`)}</Pill>
          <input
            value={field.label}
            onChange={(e) => updateField(field.kind, { label: e.target.value })}
            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => updateField(field.kind, { required: e.target.checked })}
            />
            {t("webForms.required")}
          </label>
          <button
            type="button"
            onClick={() => removeField(field.kind)}
            aria-label={t("webForms.removeField")}
            className="rounded-lg p-1 text-destructive hover:bg-destructive/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {available.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => addField(kind)}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              <Plus className="h-3 w-3" /> {t(`webForms.fieldKind.${kind}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FormEditor({ form }: { form: WebFormRow }) {
  const { t } = useI18n();
  const update = useUpdateWebForm();
  const remove = useDeleteWebForm();
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();
  const { data: submissions, isLoading: logLoading } = useWebFormSubmissions(form.id);

  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fields = useMemo(() => parseWebFormFields(form.fields), [form.fields]);
  const url = publicUrlFor(form.slug);

  async function save(patch: Partial<WebFormRow>) {
    try {
      await update.mutateAsync({ id: form.id, patch });
    } catch (err) {
      toast.error(describeError(err, t("webForms.saveFailed")));
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("webForms.copyFailed"));
    }
  }

  async function confirmRemove() {
    try {
      await remove.mutateAsync(form.id);
    } catch (err) {
      toast.error(describeError(err, t("webForms.saveFailed")));
    } finally {
      setConfirmDelete(false);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-subtle transition-transform",
              expanded && "rotate-180",
            )}
          />
          <FileText className="h-4 w-4 shrink-0 text-subtle" />
          <p className="truncate text-sm font-semibold text-foreground">{form.name}</p>
          <Pill tone={form.active ? "success" : "neutral"}>
            {form.active ? t("webForms.active") : t("webForms.inactive")}
          </Pill>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void save({ active: !form.active })}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
          >
            {form.active ? t("webForms.disable") : t("webForms.enable")}
          </button>
          <ChannelActionButton
            icon={Trash2}
            label={t("webForms.delete")}
            tone="destructive"
            onClick={() => setConfirmDelete(true)}
          />
        </div>
      </div>

      {expanded && (
        <>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border bg-background px-2.5 py-1.5">
            <code className="flex-1 truncate text-xs text-muted-foreground">{url}</code>
            <button
              type="button"
              onClick={() => void copyUrl()}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? t("webForms.copied") : t("webForms.copyUrl")}
            </button>
          </div>

          <div className="mt-3 space-y-3 border-t border-border pt-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                {t("webForms.fieldsTitle")}
              </p>
              <FieldEditor fields={fields} onChange={(f) => void save({ fields: f })} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("webForms.defaultOwnerLabel")}
                </span>
                <select
                  value={form.default_owner_id ?? ""}
                  onChange={(e) => void save({ default_owner_id: e.target.value || null })}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value="">{t("webForms.unassigned")}</option>
                  {(profiles ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("webForms.defaultStageLabel")}
                </span>
                <select
                  value={form.default_stage_id ?? ""}
                  onChange={(e) => void save({ default_stage_id: e.target.value || null })}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value="">{t("webForms.defaultStageAuto")}</option>
                  {(stages ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.pipeline_name} — {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                {t("webForms.successMessageLabel")}
              </span>
              <input
                defaultValue={form.success_message ?? ""}
                onBlur={(e) => void save({ success_message: e.target.value || null })}
                placeholder={t("webForms.successMessagePlaceholder")}
                className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                {t("webForms.tagLabel")}
              </span>
              <input
                defaultValue={form.tag ?? ""}
                onBlur={(e) => void save({ tag: e.target.value.trim() || null })}
                placeholder={t("webForms.tagPlaceholder")}
                className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
              />
              <span className="block text-[11px] text-subtle">{t("webForms.tagHint")}</span>
            </label>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {showLog ? t("webForms.hideLog") : t("webForms.viewLog")}
            </button>
            {showLog && (
              <div className="mt-2">
                {logLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("common.loading")}
                  </div>
                )}
                {!logLoading && (submissions ?? []).length === 0 && (
                  <p className="text-xs text-subtle">{t("webForms.logEmpty")}</p>
                )}
                <ul className="space-y-1.5">
                  {(submissions ?? []).slice(0, 20).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <Pill tone={s.created_lead_id ? "success" : "danger"}>
                        {s.created_lead_id ? t("webForms.logCreated") : t("webForms.logFailed")}
                      </Pill>
                      <span className="shrink-0 text-subtle">{timeAgo(s.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("webForms.deleteConfirmTitle")}
        description={t("webForms.deleteConfirmDesc")}
        confirmLabel={t("webForms.delete")}
        onConfirm={() => void confirmRemove()}
      />
    </li>
  );
}

function WebFormsSettingsPage() {
  const { t } = useI18n();
  const { data: forms, isLoading } = useWebForms();
  const sorted = useMemo(
    () => [...(forms ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [forms],
  );

  return (
    <>
      <AdminBackLink />
      <PageHeader title={t("webForms.title")} description={t("webForms.desc")} />

      <div className="space-y-5">
        <CreateFormCard />

        <SectionCard title={t("webForms.listTitle")}>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </div>
          )}
          {!isLoading && sorted.length === 0 && (
            <p className="py-6 text-center text-sm text-subtle">{t("webForms.empty")}</p>
          )}
          <ul className="space-y-2">
            {sorted.map((f) => (
              <FormEditor key={f.id} form={f} />
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}

function AdminWebFormsPage() {
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

  return (
    <PlanGate feature="web_forms">
      <WebFormsSettingsPage />
    </PlanGate>
  );
}
