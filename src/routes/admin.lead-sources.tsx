import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Loader2, Plus, ShieldAlert, Trash2, Webhook, Inbox } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill, ChannelActionButton } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { describeError, timeAgo } from "@/lib/utils";
import {
  useCreateLeadSource,
  useDeleteLeadSource,
  useIncomingLeadLog,
  useLeadSources,
  useCrmStages,
  useProfilesRaw,
  useUpdateLeadSource,
  type LeadSourceRow,
} from "@/hooks/use-crm-data";
import { CrmGate } from "@/components/CrmGate";

export const Route = createFileRoute("/admin/lead-sources")({
  head: () => ({
    meta: [
      { title: "Lid manbalari — SalesIQ" },
      {
        name: "description",
        content: "Vebhuk orqali lidlarni qabul qilish uchun manbalarni sozlang.",
      },
    ],
  }),
  component: () => (
    <CrmGate>
      <AdminLeadSourcesPage />
    </CrmGate>
  ),
});

const LOG_STATUS_TONE: Record<string, "success" | "danger" | "warning" | "info"> = {
  processed: "success",
  duplicate: "warning",
  failed: "danger",
  received: "info",
};

function webhookUrlFor(token: string): string {
  if (typeof window === "undefined") return `/leads/incoming/${token}`;
  return `${window.location.origin}/leads/incoming/${token}`;
}

function CreateSourceForm() {
  const { t } = useI18n();
  const { user } = useAuth();
  const create = useCreateLeadSource();
  const { data: stages } = useCrmStages();
  const { data: profiles } = useProfilesRaw();

  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<"webhook" | "meta_lead_ads">("webhook");
  const [defaultStageId, setDefaultStageId] = useState("");
  const [defaultOwnerId, setDefaultOwnerId] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await create.mutateAsync({
        name: name.trim(),
        source_type: sourceType,
        organization_id: user!.organizationId!,
        created_by: user!.id,
        default_stage_id: defaultStageId || null,
        default_owner_id: defaultOwnerId || null,
      });
      setName("");
      setDefaultStageId("");
      setDefaultOwnerId("");
      toast.success(t("leadSources.createSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("leadSources.saveFailed")));
    }
  }

  return (
    <SectionCard title={t("leadSources.addTitle")} icon={Plus} tone="amber">
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-xs font-semibold text-muted-foreground">
            {t("leadSources.nameLabel")}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("leadSources.namePlaceholder")}
            required
            className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {t("leadSources.typeLabel")}
          </span>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as "webhook" | "meta_lead_ads")}
            className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="webhook">{t("leadSources.typeWebhook")}</option>
            <option value="meta_lead_ads">{t("leadSources.typeMetaLeadAds")}</option>
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {t("leadSources.defaultOwnerLabel")}
          </span>
          <select
            value={defaultOwnerId}
            onChange={(e) => setDefaultOwnerId(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">{t("leadSources.unassigned")}</option>
            {(profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-xs font-semibold text-muted-foreground">
            {t("leadSources.defaultStageLabel")}
          </span>
          <select
            value={defaultStageId}
            onChange={(e) => setDefaultStageId(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">{t("leadSources.defaultStageAuto")}</option>
            {(stages ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.pipeline_name} — {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={create.isPending || !name.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {t("leadSources.addButton")}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function SourceRow({ source }: { source: LeadSourceRow }) {
  const { t } = useI18n();
  const update = useUpdateLeadSource();
  const remove = useDeleteLeadSource();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const url = webhookUrlFor(source.webhook_token);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("leadSources.copyFailed"));
    }
  }

  async function toggleActive() {
    try {
      await update.mutateAsync({ id: source.id, patch: { active: !source.active } });
    } catch (err) {
      toast.error(describeError(err, t("leadSources.saveFailed")));
    }
  }

  async function confirmRemove() {
    try {
      await remove.mutateAsync(source.id);
    } catch (err) {
      toast.error(describeError(err, t("leadSources.saveFailed")));
    } finally {
      setConfirmDelete(false);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-subtle" />
          <div>
            <p className="text-sm font-semibold text-foreground">{source.name}</p>
            <p className="text-xs text-subtle">
              {source.source_type === "meta_lead_ads"
                ? t("leadSources.typeMetaLeadAds")
                : t("leadSources.typeWebhook")}
            </p>
          </div>
          <Pill tone={source.active ? "success" : "neutral"}>
            {source.active ? t("leadSources.active") : t("leadSources.inactive")}
          </Pill>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {showLog ? t("leadSources.hideLog") : t("leadSources.viewLog")}
          </button>
          <button
            type="button"
            onClick={() => void toggleActive()}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
          >
            {source.active ? t("leadSources.disable") : t("leadSources.enable")}
          </button>
          <ChannelActionButton
            icon={Trash2}
            label={t("leadSources.delete")}
            tone="destructive"
            onClick={() => setConfirmDelete(true)}
          />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border bg-background px-2.5 py-1.5">
        <code className="flex-1 truncate text-xs text-muted-foreground">{url}</code>
        <button
          type="button"
          onClick={() => void copyUrl()}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? t("leadSources.copied") : t("leadSources.copyUrl")}
        </button>
      </div>

      {showLog && <SourceLog sourceId={source.id} />}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("leadSources.deleteConfirmTitle")}
        description={t("leadSources.deleteConfirmDesc")}
        confirmLabel={t("leadSources.delete")}
        onConfirm={() => void confirmRemove()}
      />
    </li>
  );
}

function SourceLog({ sourceId }: { sourceId: string }) {
  const { t } = useI18n();
  const { data: log, isLoading } = useIncomingLeadLog(sourceId);

  return (
    <div className="mt-3 border-t border-border pt-3">
      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("common.loading")}
        </div>
      )}
      {!isLoading && (log ?? []).length === 0 && (
        <p className="text-xs text-subtle">{t("leadSources.logEmpty")}</p>
      )}
      <ul className="space-y-1.5">
        {(log ?? []).slice(0, 20).map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-2 text-xs">
            <Pill tone={LOG_STATUS_TONE[entry.status] ?? "info"}>
              {t(`leadSources.logStatus.${entry.status}`)}
            </Pill>
            <span className="flex-1 truncate text-subtle">{entry.error ?? "—"}</span>
            <span className="shrink-0 text-subtle">{timeAgo(entry.created_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LeadSourcesSettingsPage() {
  const { t } = useI18n();
  const { data: sources, isLoading } = useLeadSources();
  const sorted = useMemo(
    () => [...(sources ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [sources],
  );

  return (
    <>
      <AdminBackLink />
      <PageHeader
        title={t("leadSources.title")}
        icon={Webhook}
        tone="amber"
        description={t("leadSources.desc")}
      />

      <div className="space-y-5">
        <CreateSourceForm />

        <SectionCard title={t("leadSources.listTitle")} icon={Inbox} tone="slate">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </div>
          )}
          {!isLoading && sorted.length === 0 && (
            <p className="py-6 text-center text-sm text-subtle">{t("leadSources.empty")}</p>
          )}
          <ul className="space-y-2">
            {sorted.map((s) => (
              <SourceRow key={s.id} source={s} />
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}

function AdminLeadSourcesPage() {
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

  return <LeadSourcesSettingsPage />;
}
