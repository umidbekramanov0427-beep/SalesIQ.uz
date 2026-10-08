import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  Star,
  Trash2,
  Upload,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, ChannelActionButton } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { LeadImportDialog } from "@/components/crm/LeadImportDialog";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, stageColorProps, stageTintProps } from "@/lib/utils";
import {
  useCreatePipeline,
  useCreateStage,
  useDeletePipeline,
  useDeleteStage,
  usePipelines,
  usePipelineStagesRaw,
  useSetStageRule,
  useStageRules,
  useUpdatePipeline,
  useUpdateStage,
  type PipelineRow,
  type PipelineStageRuleRow,
} from "@/hooks/use-crm-data";
import { CrmGate } from "@/components/CrmGate";

export const Route = createFileRoute("/admin/pipelines")({
  head: () => ({
    meta: [
      { title: "Voronkalar va bosqichlar — SalesIQ" },
      { name: "description", content: "Savdo voronkalarini va ularning bosqichlarini boshqaring." },
    ],
  }),
  component: () => (
    <CrmGate>
      <AdminPipelinesPage />
    </CrmGate>
  ),
});

// Same fixed, theme-consistent swatch set used server-side for
// AmoCRM-synced stages (see STAGE_COLOR_ROTATION in client.server.ts) plus
// the chart palette -- every value here is a real CSS color token, not an
// arbitrary hex, so a stage always matches the rest of the platform's look.
const COLOR_SWATCHES = [
  "bg-primary",
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-success",
  "bg-warning",
  "bg-destructive",
  "bg-mint-border",
] as const;

function ColorSwatchPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110",
            c,
            value === c && "ring-2 ring-offset-2 ring-offset-background ring-foreground",
          )}
        >
          {value === c && <Check className="h-3 w-3 text-white" />}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Left column: pipelines list                                          */
/* ------------------------------------------------------------------ */

function PipelineList({
  pipelines,
  selectedId,
  onSelect,
}: {
  pipelines: PipelineRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const create = useCreatePipeline();
  const update = useUpdatePipeline();
  const remove = useDeletePipeline();
  const { data: stages } = usePipelineStagesRaw();

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PipelineRow | null>(null);

  async function addPipeline(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await create.mutateAsync({
        name,
        position: pipelines.length,
        organization_id: user!.organizationId!,
        created_by: user!.id,
      });
      setNewName("");
    } catch (err) {
      toast.error(describeError(err, t("pipelinesSettings.saveFailed")));
    } finally {
      setCreating(false);
    }
  }

  async function saveRename(id: string) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    try {
      await update.mutateAsync({ id, patch: { name } });
    } catch (err) {
      toast.error(describeError(err, t("pipelinesSettings.saveFailed")));
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = pipelines[index + direction];
    const current = pipelines[index];
    if (!target || !current) return;
    try {
      await Promise.all([
        update.mutateAsync({ id: current.id, patch: { position: target.position } }),
        update.mutateAsync({ id: target.id, patch: { position: current.position } }),
      ]);
    } catch (err) {
      toast.error(describeError(err, t("pipelinesSettings.saveFailed")));
    }
  }

  async function setDefault(id: string) {
    try {
      await Promise.all(
        pipelines
          .filter((p) => p.is_default && p.id !== id)
          .map((p) => update.mutateAsync({ id: p.id, patch: { is_default: false } })),
      );
      await update.mutateAsync({ id, patch: { is_default: true } });
    } catch (err) {
      toast.error(describeError(err, t("pipelinesSettings.saveFailed")));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      if (selectedId === deleteTarget.id) {
        const remaining = pipelines.filter((p) => p.id !== deleteTarget.id);
        if (remaining[0]) onSelect(remaining[0].id);
      }
    } catch (err) {
      toast.error(describeError(err, t("pipelinesSettings.saveFailed")));
    } finally {
      setDeleteTarget(null);
    }
  }

  const stageCount = (pipelineId: string) =>
    (stages ?? []).filter((s) => s.pipeline_id === pipelineId).length;

  return (
    <SectionCard title={t("pipelinesSettings.pipelinesTitle")}>
      <form onSubmit={(e) => void addPipeline(e)} className="mb-3 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("pipelinesSettings.pipelineNamePlaceholder")}
          className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("pipelinesSettings.addPipeline")}
        </button>
      </form>

      {pipelines.length === 0 ? (
        <p className="py-6 text-center text-sm text-subtle">{t("pipelinesSettings.noPipelines")}</p>
      ) : (
        <ul className="space-y-1.5">
          {pipelines.map((p, i) => (
            <li key={p.id}>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                  selectedId === p.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-surface hover:bg-accent",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", p.color)} />
                  {renamingId === p.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void saveRename(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename(p.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                    />
                  ) : (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {p.name}
                      </span>
                      <span className="text-xs text-subtle">
                        {stageCount(p.id)} {t("pipelinesSettings.stagesCountSuffix")}
                      </span>
                    </span>
                  )}
                  {p.is_default && (
                    <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" />
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <ChannelActionButton
                    icon={ArrowUp}
                    label={t("pipelinesSettings.moveUp")}
                    disabled={i === 0}
                    onClick={() => void move(i, -1)}
                  />
                  <ChannelActionButton
                    icon={ArrowDown}
                    label={t("pipelinesSettings.moveDown")}
                    disabled={i === pipelines.length - 1}
                    onClick={() => void move(i, 1)}
                  />
                  {!p.is_default && (
                    <ChannelActionButton
                      icon={Star}
                      label={t("pipelinesSettings.setDefault")}
                      tone="warning"
                      onClick={() => void setDefault(p.id)}
                    />
                  )}
                  <ChannelActionButton
                    icon={Pencil}
                    label={t("pipelinesSettings.edit")}
                    onClick={() => {
                      setRenamingId(p.id);
                      setRenameValue(p.name);
                    }}
                  />
                  <ChannelActionButton
                    icon={Trash2}
                    label={t("pipelinesSettings.delete")}
                    tone="destructive"
                    onClick={() => setDeleteTarget(p)}
                  />
                </div>
              </div>
              <div className="ml-5 mt-1.5 pl-3">
                <ColorSwatchPicker
                  value={p.color}
                  onChange={(color) =>
                    void update
                      .mutateAsync({ id: p.id, patch: { color } })
                      .catch((err) =>
                        toast.error(describeError(err, t("pipelinesSettings.saveFailed"))),
                      )
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("pipelinesSettings.deletePipelineConfirmTitle")}
        description={t("pipelinesSettings.deletePipelineConfirmDesc", {
          count: String(deleteTarget ? stageCount(deleteTarget.id) : 0),
        })}
        confirmLabel={t("pipelinesSettings.delete")}
        onConfirm={() => void confirmDelete()}
      />
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Right column: stages of the selected pipeline                        */
/* ------------------------------------------------------------------ */

type StageRow = ReturnType<typeof usePipelineStagesRaw>["data"] extends (infer T)[] | undefined
  ? T
  : never;

function StageManager({ pipeline }: { pipeline: PipelineRow }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: allStages } = usePipelineStagesRaw();
  const { data: rules } = useStageRules();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const setRule = useSetStageRule();

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StageRow | null>(null);

  const stages = (allStages ?? [])
    .filter((s) => s.pipeline_id === pipeline.id)
    .sort((a, b) => a.position - b.position);

  const ruleByStage = new Map<string, PipelineStageRuleRow>(
    (rules ?? []).map((r) => [r.stage_id, r]),
  );

  async function addStage(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createStage.mutateAsync({
        name,
        key: `custom-${crypto.randomUUID()}`,
        organization_id: user!.organizationId!,
        pipeline_id: pipeline.id,
        pipeline_name: pipeline.name,
        color: pipeline.color,
        position: stages.length,
      });
      setNewName("");
    } catch (err) {
      toast.error(describeError(err, t("pipelinesSettings.saveFailed")));
    } finally {
      setCreating(false);
    }
  }

  async function saveRename(id: string) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    try {
      await updateStage.mutateAsync({ id, patch: { name } });
    } catch (err) {
      toast.error(describeError(err, t("pipelinesSettings.saveFailed")));
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = stages[index + direction];
    const current = stages[index];
    if (!target || !current) return;
    try {
      await Promise.all([
        updateStage.mutateAsync({ id: current.id, patch: { position: target.position } }),
        updateStage.mutateAsync({ id: target.id, patch: { position: current.position } }),
      ]);
    } catch (err) {
      toast.error(describeError(err, t("pipelinesSettings.saveFailed")));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteStage.mutateAsync(deleteTarget.id);
    } catch (err) {
      toast.error(describeError(err, t("pipelinesSettings.saveFailed")));
    } finally {
      setDeleteTarget(null);
    }
  }

  async function toggleRule(
    stageId: string,
    field: "requiresNote" | "requiresTask",
    value: boolean,
  ) {
    const existing = ruleByStage.get(stageId);
    try {
      await setRule.mutateAsync({
        stageId,
        requiresNote: field === "requiresNote" ? value : (existing?.requires_note ?? false),
        requiresTask: field === "requiresTask" ? value : (existing?.requires_task ?? false),
      });
    } catch (err) {
      toast.error(describeError(err, t("pipelinesSettings.saveFailed")));
    }
  }

  return (
    <SectionCard
      title={`${t("pipelinesSettings.stagesTitle")} — ${pipeline.name}`}
      description={t("pipelinesSettings.rulesHint")}
    >
      <form onSubmit={(e) => void addStage(e)} className="mb-3 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("pipelinesSettings.stageNamePlaceholder")}
          className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("pipelinesSettings.addStage")}
        </button>
      </form>

      {stages.length === 0 ? (
        <p className="py-6 text-center text-sm text-subtle">{t("pipelinesSettings.noStages")}</p>
      ) : (
        <ul className="space-y-2">
          {stages.map((s, i) => {
            const rule = ruleByStage.get(s.id);
            const colorProps = stageColorProps(s.color);
            const tintProps = stageTintProps(s.color);
            return (
              <li
                key={s.id}
                className={cn(
                  "rounded-xl border border-border p-3",
                  tintProps.className ?? "bg-surface",
                )}
                style={tintProps.style}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colorProps.className)}
                    style={colorProps.style}
                  />
                  {renamingId === s.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void saveRename(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename(s.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {s.name}
                      {s.is_won && (
                        <span className="ml-1.5 text-xs font-normal text-success">
                          ({t("pipelinesSettings.won")})
                        </span>
                      )}
                      {s.is_lost && (
                        <span className="ml-1.5 text-xs font-normal text-destructive">
                          ({t("pipelinesSettings.lost")})
                        </span>
                      )}
                    </span>
                  )}
                  <div className="flex shrink-0 items-center gap-0.5">
                    <ChannelActionButton
                      icon={ArrowUp}
                      label={t("pipelinesSettings.moveUp")}
                      disabled={i === 0}
                      onClick={() => void move(i, -1)}
                    />
                    <ChannelActionButton
                      icon={ArrowDown}
                      label={t("pipelinesSettings.moveDown")}
                      disabled={i === stages.length - 1}
                      onClick={() => void move(i, 1)}
                    />
                    <ChannelActionButton
                      icon={Pencil}
                      label={t("pipelinesSettings.edit")}
                      onClick={() => {
                        setRenamingId(s.id);
                        setRenameValue(s.name);
                      }}
                    />
                    <ChannelActionButton
                      icon={Trash2}
                      label={t("pipelinesSettings.delete")}
                      tone="destructive"
                      onClick={() => setDeleteTarget(s)}
                    />
                  </div>
                </div>
                <div className="ml-5 mt-2 pl-3">
                  <ColorSwatchPicker
                    value={s.color.startsWith("#") ? "" : s.color}
                    onChange={(color) =>
                      void updateStage
                        .mutateAsync({ id: s.id, patch: { color } })
                        .catch((err) =>
                          toast.error(describeError(err, t("pipelinesSettings.saveFailed"))),
                        )
                    }
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-5 border-t border-border pt-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Switch
                      checked={rule?.requires_note ?? false}
                      onCheckedChange={(v) => void toggleRule(s.id, "requiresNote", v)}
                    />
                    {t("pipelinesSettings.requiresNoteLabel")}
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Switch
                      checked={rule?.requires_task ?? false}
                      onCheckedChange={(v) => void toggleRule(s.id, "requiresTask", v)}
                    />
                    {t("pipelinesSettings.requiresTaskLabel")}
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("pipelinesSettings.deleteStageConfirmTitle")}
        description={t("pipelinesSettings.deleteStageConfirmDesc")}
        confirmLabel={t("pipelinesSettings.delete")}
        onConfirm={() => void confirmDelete()}
      />
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                                 */
/* ------------------------------------------------------------------ */

function PipelinesSettingsPage() {
  const { t } = useI18n();
  const { data: pipelines, isLoading } = usePipelines();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (selectedId || !pipelines || pipelines.length === 0) return;
    setSelectedId(pipelines.find((p) => p.is_default)?.id ?? pipelines[0]!.id);
  }, [pipelines, selectedId]);

  const selected = (pipelines ?? []).find((p) => p.id === selectedId) ?? null;

  return (
    <>
      <AdminBackLink />
      <PageHeader
        title={t("pipelinesSettings.title")}
        description={t("pipelinesSettings.desc")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/automations"
              {...(selected ? { search: { funnel: selected.name } } : {})}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:border-primary/40"
            >
              <Workflow className="h-4 w-4 text-primary" /> {t("pipeline.toolbar.automation")}
            </Link>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:border-primary/40"
            >
              <Upload className="h-4 w-4 text-primary" /> {t("import.title")}
            </button>
          </div>
        }
      />
      <LeadImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        {...(selected ? { defaultFunnel: selected.name } : {})}
      />

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <PipelineList
            pipelines={pipelines ?? []}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {selected ? (
            <StageManager pipeline={selected} />
          ) : (
            <SectionCard>
              <p className="py-6 text-center text-sm text-subtle">
                {t("pipelinesSettings.selectPipelineHint")}
              </p>
            </SectionCard>
          )}
        </div>
      )}
    </>
  );
}

function AdminPipelinesPage() {
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

  return <PipelinesSettingsPage />;
}
