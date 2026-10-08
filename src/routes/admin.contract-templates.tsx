import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileSignature, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill, ChannelActionButton } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PlanGate } from "@/components/PlanGate";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { describeError } from "@/lib/utils";
import { CONTRACT_TOKENS } from "@/lib/contracts";
import {
  useContractTemplatesRaw,
  useCreateContractTemplate,
  useDeleteContractTemplate,
  useUpdateContractTemplate,
  type ContractTemplateRow,
} from "@/hooks/use-crm-data";
import { CrmGate } from "@/components/CrmGate";

export const Route = createFileRoute("/admin/contract-templates")({
  head: () => ({
    meta: [
      { title: "Shartnoma shablonlari — SalesIQ" },
      {
        name: "description",
        content: "Lidlar uchun shartnoma shablonlarini yarating va boshqaring.",
      },
    ],
  }),
  component: () => (
    <CrmGate>
      <AdminContractTemplatesPage />
    </CrmGate>
  ),
});

function AdminContractTemplatesPage() {
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
    <PlanGate feature="esignature">
      <ContractTemplatesSettingsPage />
    </PlanGate>
  );
}

function ContractTemplatesSettingsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: templates, isLoading } = useContractTemplatesRaw();
  const createTemplate = useCreateContractTemplate();

  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim() || !user?.organizationId) return;
    try {
      await createTemplate.mutateAsync({
        organization_id: user.organizationId,
        name: name.trim(),
        body: body.trim(),
        created_by: user.id,
      });
      setName("");
      setBody("");
      toast.success(t("contractTemplates.createdToast"));
    } catch (err) {
      toast.error(describeError(err, t("contractTemplates.createFailed")));
    }
  }

  return (
    <>
      <AdminBackLink />
      <PageHeader title={t("contractTemplates.title")} description={t("contractTemplates.desc")} />

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <SectionCard title={t("contractTemplates.listTitle")}>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </div>
          )}
          {!isLoading && (templates ?? []).length === 0 && (
            <p className="text-sm text-subtle">{t("contractTemplates.empty")}</p>
          )}
          <ul className="space-y-3">
            {(templates ?? []).map((tpl) => (
              <TemplateRow key={tpl.id} template={tpl} />
            ))}
          </ul>
        </SectionCard>

        <SectionCard title={t("contractTemplates.newTitle")}>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("contractTemplates.namePlaceholder")}
              className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none placeholder:text-subtle focus:border-primary/40"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("contractTemplates.bodyPlaceholder")}
              rows={8}
              className="w-full resize-y rounded-xl border border-border bg-surface p-3 text-sm outline-none placeholder:text-subtle focus:border-primary/40"
            />
            <div className="flex flex-wrap gap-1.5">
              {CONTRACT_TOKENS.map((tok) => (
                <Pill key={tok} tone="neutral">{`{{${tok}}}`}</Pill>
              ))}
            </div>
            <button
              type="submit"
              disabled={createTemplate.isPending || !name.trim() || !body.trim()}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {createTemplate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {t("contractTemplates.createButton")}
            </button>
          </form>
        </SectionCard>
      </div>
    </>
  );
}

function TemplateRow({ template }: { template: ContractTemplateRow }) {
  const { t } = useI18n();
  const updateTemplate = useUpdateContractTemplate();
  const deleteTemplate = useDeleteContractTemplate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    await updateTemplate.mutateAsync({
      id: template.id,
      patch: { name: name.trim(), body: body.trim() },
    });
    setEditing(false);
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileSignature className="h-4 w-4 shrink-0 text-muted-foreground" />
          {editing ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary/40"
            />
          ) : (
            <p className="truncate text-sm font-semibold text-foreground">{template.name}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <button
              type="button"
              onClick={() => void save()}
              disabled={updateTemplate.isPending}
              className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {t("common.save")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              {t("contractTemplates.edit")}
            </button>
          )}
          <ChannelActionButton
            icon={Trash2}
            label={t("contractTemplates.delete")}
            tone="destructive"
            onClick={() => setConfirmDelete(true)}
          />
        </div>
      </div>
      {editing ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="mt-3 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary/40"
        />
      ) : (
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-subtle">{template.body}</p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("contractTemplates.deleteConfirmTitle")}
        description={t("contractTemplates.deleteConfirmDesc")}
        confirmLabel={t("contractTemplates.delete")}
        onConfirm={() => void deleteTemplate.mutateAsync(template.id)}
      />
    </li>
  );
}
