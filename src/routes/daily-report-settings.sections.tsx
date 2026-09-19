import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard, Pill } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import {
  useDailyReportSettings,
  useUpdateDailyReportSettings,
  useDailyReportPreview,
  useReportStageTransitionRules,
  useCreateReportStageTransitionRule,
  useDeleteReportStageTransitionRule,
  useProfilesRaw,
  useFunnelNames,
  useLeadQualityStages,
  useIntakeQuestions,
  usePipelineStagesRaw,
  useCallStageStepsRaw,
  useMiniAppAudioRules,
  useCreateMiniAppAudioRule,
  useDeleteMiniAppAudioRule,
  type DailyReportSettingsRow,
} from "@/hooks/use-crm-data";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/daily-report-settings/sections")({
  head: () => ({
    meta: [
      { title: "Kunlik hisobot tarkibi — SalesIQ" },
      {
        name: "description",
        content:
          "Yaratiladigan kunlik hisobotga qaysi bo'limlar, menejerlar, CRM voronkalari, lid sifati guruhlari, anketa javoblari va bosqich o'tishlari kirishini tanlang.",
      },
    ],
  }),
  component: DailyReportSectionsPage,
});

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message || fallback;
  }
  return fallback;
}

type PickItem = { id: string; label: string };

/* A toggle-row picker used identically for managers / funnels / lead-quality
 * groups / intake questions -- null selection means "hammasi tanlangan", so
 * newly added items automatically show up in an "all" selection without any
 * extra bookkeeping. Every toggle saves immediately (no separate Save
 * button), matching the reference exactly. */
function MultiSelectDialog({
  open,
  onOpenChange,
  title,
  description,
  items,
  selectedIds,
  onToggle,
  busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  items: PickItem[];
  selectedIds: string[] | null;
  onToggle: (id: string, checked: boolean) => void;
  busy?: boolean;
}) {
  const allSelected = selectedIds === null;
  const selectedSet = allSelected ? null : new Set(selectedIds);
  const selectedCount = allSelected ? items.length : selectedIds!.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-subtle">{description}</p>
        <Pill>
          {selectedCount}/{items.length} tanlangan
        </Pill>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {items.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Hozircha bo'sh.</p>
          )}
          {items.map((item) => {
            const checked = allSelected ? true : selectedSet!.has(item.id);
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-accent px-4 py-3"
              >
                <span className="text-sm font-medium text-foreground">{item.label}</span>
                <Switch
                  checked={checked}
                  disabled={busy}
                  onCheckedChange={(v) => onToggle(item.id, v)}
                />
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            Yopish
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionToggleRow({
  title,
  description,
  enabled,
  onToggleEnabled,
  selectedCount,
  totalCount,
  pickerLabel,
  onOpenPicker,
  disabled,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggleEnabled: (v: boolean) => void;
  selectedCount: number;
  totalCount: number;
  pickerLabel: string;
  onOpenPicker: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-accent p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-2.5">
          <Switch checked={enabled} disabled={disabled} onCheckedChange={onToggleEnabled} />
          <span className="text-sm text-muted-foreground">
            {enabled ? "Yoqilgan" : "Yoqilmagan"}
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm text-subtle">{description}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Pill>
          {selectedCount}/{totalCount} tanlangan
        </Pill>
        <button
          type="button"
          onClick={onOpenPicker}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          {pickerLabel}
        </button>
      </div>
    </div>
  );
}

function SimpleToggleRow({
  title,
  description,
  enabled,
  onToggleEnabled,
  disabled,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggleEnabled: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-accent p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-2.5">
          <Switch checked={enabled} disabled={disabled} onCheckedChange={onToggleEnabled} />
          <span className="text-sm text-muted-foreground">
            {enabled ? "Yoqilgan" : "Yoqilmagan"}
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm text-subtle">{description}</p>
    </div>
  );
}

function selectedCountOf(ids: string[] | null | undefined, total: number): number {
  return ids == null ? total : ids.length;
}

// Toggling one item off an implicit "all selected" (null) state has to
// materialize the full id list first; toggling the last missing one back on
// collapses back to null so items added later are included automatically.
function nextSelection(
  current: string[] | null | undefined,
  allIds: string[],
  id: string,
  checked: boolean,
): string[] | null {
  const base = current == null ? allIds : current;
  const next = checked ? Array.from(new Set([...base, id])) : base.filter((x) => x !== id);
  return next.length === allIds.length ? null : next;
}

function ReportSectionsCard() {
  const { data: settings } = useDailyReportSettings();
  const updateSettings = useUpdateDailyReportSettings();
  const { data: profiles } = useProfilesRaw();
  const { names: funnelNames } = useFunnelNames();
  const { data: leadQualityStages } = useLeadQualityStages();
  const { data: intakeQuestions } = useIntakeQuestions();

  const managers = useMemo(
    () => (profiles ?? []).filter((p) => p.role === "sotuv_menejeri"),
    [profiles],
  );
  const managerItems: PickItem[] = managers.map((m) => ({
    id: m.id,
    label: m.full_name || m.email,
  }));
  const funnelItems: PickItem[] = funnelNames.map((name) => ({ id: name, label: name }));
  const leadQualityItems: PickItem[] = (leadQualityStages ?? []).map((s) => ({
    id: s.id,
    label: s.title,
  }));
  const intakeQuestionItems: PickItem[] = (intakeQuestions ?? []).map((q) => ({
    id: q.id,
    label: q.label,
  }));

  const [openPicker, setOpenPicker] = useState<
    "managers" | "funnels" | "leadQuality" | "intakeQuestions" | null
  >(null);

  async function patch(next: Partial<DailyReportSettingsRow>) {
    try {
      await updateSettings.mutateAsync(next);
    } catch (err) {
      toast.error(errorMessage(err, "Saqlashda xatolik yuz berdi."));
    }
  }

  return (
    <SectionCard
      title="Hisobot bo'limlari"
      description="Kunlik hisobotda qaysi bo'limlar ko'rinishini va har biri qanday qamrovda hisoblanishini boshqaring."
    >
      <div className="space-y-4">
        <SimpleToggleRow
          title="CRM faolligi"
          description="Qo'ng'iroqlar soni, bog'langan qo'ng'iroqlar, bog'lanish darajasi, suhbat vaqti va oldingi ish kuni bilan taqqoslash."
          enabled={settings?.crm_activity_enabled ?? true}
          disabled={updateSettings.isPending}
          onToggleEnabled={(v) => void patch({ crm_activity_enabled: v })}
        />

        <SimpleToggleRow
          title="Vazifalar rejasi"
          description="Bugun bajarilishi kerak bo'lgan vazifalar, ulardan nechtasi bajarilgani, qolgan qismi va har bir menejer bo'yicha ixcham qator."
          enabled={settings?.tasks_plan_enabled ?? true}
          disabled={updateSettings.isPending}
          onToggleEnabled={(v) => void patch({ tasks_plan_enabled: v })}
        />

        <SimpleToggleRow
          title="Qo'ng'iroqlar sifati"
          description="Tahlil qilingan qo'ng'iroqlar, savdo ssenariysi ulushi, chiqarilgan qo'ng'iroqlar, audio muammolari va o'rtacha ball."
          enabled={settings?.call_quality_enabled ?? true}
          disabled={updateSettings.isPending}
          onToggleEnabled={(v) => void patch({ call_quality_enabled: v })}
        />

        <SectionToggleRow
          title="Menejerlar faoliyati"
          description="Menejerlar kesimidagi qo'ng'iroq ko'rsatkichlari, kuchli tomonlar va e'tibor kerak bo'lgan jihatlar."
          enabled={settings?.managers_activity_enabled ?? true}
          disabled={updateSettings.isPending}
          onToggleEnabled={(v) => void patch({ managers_activity_enabled: v })}
          selectedCount={selectedCountOf(
            settings?.managers_activity_manager_ids,
            managerItems.length,
          )}
          totalCount={managerItems.length}
          pickerLabel="Menejerlarni tanlash"
          onOpenPicker={() => setOpenPicker("managers")}
        />

        <SectionToggleRow
          title="Lidlar harakati"
          description="Yangi lidlar, yutilgan bitimlar, yo'qotilgan lidlar, yutilgan qiymat va tanlangan CRM voronkalari."
          enabled={settings?.leads_movement_enabled ?? true}
          disabled={updateSettings.isPending}
          onToggleEnabled={(v) => void patch({ leads_movement_enabled: v })}
          selectedCount={selectedCountOf(settings?.leads_movement_funnels, funnelItems.length)}
          totalCount={funnelItems.length}
          pickerLabel="Voronkalarni tanlash"
          onOpenPicker={() => setOpenPicker("funnels")}
        />

        <SectionToggleRow
          title="Lid sifati"
          description="Lid sifati qismida qaysi faol guruhlar bo'yicha lead soni ko'rinishini tanlang."
          enabled={settings?.lead_quality_enabled ?? true}
          disabled={updateSettings.isPending}
          onToggleEnabled={(v) => void patch({ lead_quality_enabled: v })}
          selectedCount={selectedCountOf(settings?.lead_quality_stage_ids, leadQualityItems.length)}
          totalCount={leadQualityItems.length}
          pickerLabel="Lid sifati guruhlarini tanlash"
          onOpenPicker={() => setOpenPicker("leadQuality")}
        />

        <SimpleToggleRow
          title="Xizmat yo'nalishlari"
          description="Tahlil qilingan suhbatlardan aniqlangan mahsulot yoki xizmat yo'nalishlari."
          enabled={settings?.service_lines_enabled ?? true}
          disabled={updateSettings.isPending}
          onToggleEnabled={(v) => void patch({ service_lines_enabled: v })}
        />

        <SectionToggleRow
          title="Anketa savollari"
          description="Anketa savollari qismida qaysi savollar bo'yicha kunlik javoblar ko'rinishini tanlang."
          enabled={settings?.intake_questions_enabled ?? true}
          disabled={updateSettings.isPending}
          onToggleEnabled={(v) => void patch({ intake_questions_enabled: v })}
          selectedCount={selectedCountOf(settings?.intake_question_ids, intakeQuestionItems.length)}
          totalCount={intakeQuestionItems.length}
          pickerLabel="Savollarni tanlash"
          onOpenPicker={() => setOpenPicker("intakeQuestions")}
        />

        <SimpleToggleRow
          title="Tavsiyalar"
          description="Hisobot ma'lumotlari asosidagi ertangi kun uchun aniq harakatlar."
          enabled={settings?.recommendations_enabled ?? true}
          disabled={updateSettings.isPending}
          onToggleEnabled={(v) => void patch({ recommendations_enabled: v })}
        />

        <SimpleToggleRow
          title="Xulosa"
          description="Hisobot oxiridagi qisqa yakuniy xulosa."
          enabled={settings?.summary_enabled ?? true}
          disabled={updateSettings.isPending}
          onToggleEnabled={(v) => void patch({ summary_enabled: v })}
        />
      </div>

      <MultiSelectDialog
        open={openPicker === "managers"}
        onOpenChange={(v) => !v && setOpenPicker(null)}
        title="Hisobotdagi menejerlar"
        description="Menejerlar faoliyati qismida qaysi sotuvchilar ko'rinishini tanlang."
        items={managerItems}
        selectedIds={settings?.managers_activity_manager_ids ?? null}
        busy={updateSettings.isPending}
        onToggle={(id, checked) =>
          void patch({
            managers_activity_manager_ids: nextSelection(
              settings?.managers_activity_manager_ids,
              managerItems.map((m) => m.id),
              id,
              checked,
            ),
          })
        }
      />
      <MultiSelectDialog
        open={openPicker === "funnels"}
        onOpenChange={(v) => !v && setOpenPicker(null)}
        title="Lidlar harakatidagi voronkalar"
        description="Lidlar harakati qismida ishlatiladigan CRM voronkalarini tanlang."
        items={funnelItems}
        selectedIds={settings?.leads_movement_funnels ?? null}
        busy={updateSettings.isPending}
        onToggle={(id, checked) =>
          void patch({
            leads_movement_funnels: nextSelection(
              settings?.leads_movement_funnels,
              funnelItems.map((f) => f.id),
              id,
              checked,
            ),
          })
        }
      />
      <MultiSelectDialog
        open={openPicker === "leadQuality"}
        onOpenChange={(v) => !v && setOpenPicker(null)}
        title="Hisobotdagi lid sifati guruhlari"
        description="Lid sifati qismida qaysi faol guruhlar bo'yicha lead soni ko'rinishini tanlang."
        items={leadQualityItems}
        selectedIds={settings?.lead_quality_stage_ids ?? null}
        busy={updateSettings.isPending}
        onToggle={(id, checked) =>
          void patch({
            lead_quality_stage_ids: nextSelection(
              settings?.lead_quality_stage_ids,
              leadQualityItems.map((s) => s.id),
              id,
              checked,
            ),
          })
        }
      />
      <MultiSelectDialog
        open={openPicker === "intakeQuestions"}
        onOpenChange={(v) => !v && setOpenPicker(null)}
        title="Hisobotdagi anketa savollari"
        description="Anketa savollari qismida qaysi savollar bo'yicha kunlik javoblar ko'rinishini tanlang."
        items={intakeQuestionItems}
        selectedIds={settings?.intake_question_ids ?? null}
        busy={updateSettings.isPending}
        onToggle={(id, checked) =>
          void patch({
            intake_question_ids: nextSelection(
              settings?.intake_question_ids,
              intakeQuestionItems.map((q) => q.id),
              id,
              checked,
            ),
          })
        }
      />
    </SectionCard>
  );
}

function StageTransitionRuleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const { data: rules } = useReportStageTransitionRules();
  const createRule = useCreateReportStageTransitionRule();
  const deleteRule = useDeleteReportStageTransitionRule();
  const { data: profiles } = useProfilesRaw();
  const { names: funnelNames } = useFunnelNames();
  const { data: stages } = usePipelineStagesRaw();

  const managers = useMemo(
    () => (profiles ?? []).filter((p) => p.role === "sotuv_menejeri"),
    [profiles],
  );
  const stageById = useMemo(() => new Map((stages ?? []).map((s) => [s.id, s.name])), [stages]);
  const managerById = useMemo(
    () => new Map(managers.map((m) => [m.id, m.full_name || m.email])),
    [managers],
  );

  const [scope, setScope] = useState<"all" | "specific">("all");
  const [managerId, setManagerId] = useState("");
  const [funnel, setFunnel] = useState("");
  const [fromStageId, setFromStageId] = useState("");
  const [toStageId, setToStageId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function resetForm() {
    setScope("all");
    setManagerId("");
    setFunnel("");
    setFromStageId("");
    setToStageId("");
  }

  async function addRule() {
    if (!funnel || !toStageId || (scope === "specific" && !managerId)) return;
    try {
      await createRule.mutateAsync({
        organization_id: user!.organizationId!,
        manager_scope: scope,
        manager_id: scope === "specific" ? managerId : null,
        funnel,
        from_stage_id: fromStageId || null,
        to_stage_id: toStageId,
        position: rules?.length ?? 0,
      });
      resetForm();
    } catch (err) {
      toast.error(errorMessage(err, "Qoida qo'shishda xatolik yuz berdi."));
    }
  }

  async function removeRule(id: string) {
    try {
      await deleteRule.mutateAsync(id);
    } catch (err) {
      toast.error(errorMessage(err, "Qoidani o'chirishda xatolik yuz berdi."));
    } finally {
      setConfirmDeleteId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Voronka bosqichlari harakati</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-subtle">
          Hisobotda alohida ko'rinishi kerak bo'lgan CRM bosqich o'tishlarini tanlang: qaysi
          menejer, qaysi voronka va qaysi bosqichdan qaysi bosqichga.
        </p>

        <div>
          <span className="text-[13px] font-medium text-muted-foreground">Menejer qamrovi</span>
          <div className="mt-2">
            <SegmentedControl
              value={scope}
              options={["all", "specific"] as const}
              render={(v) => (v === "all" ? "Barcha menejerlar" : "Alohida menejer")}
              onChange={setScope}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {scope === "specific" && (
            <label className="block">
              <span className="text-[13px] font-medium text-muted-foreground">Menejer</span>
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
              >
                <option value="">Menejerni tanlang</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">Voronka</span>
            <select
              value={funnel}
              onChange={(e) => setFunnel(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            >
              <option value="">Voronkani tanlang</option>
              {funnelNames.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">Qaysi bosqichdan</span>
            <select
              value={fromStageId}
              onChange={(e) => setFromStageId(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            >
              <option value="">Hamma bosqichdan</option>
              {(stages ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">Qaysi bosqichga</span>
            <select
              value={toStageId}
              onChange={(e) => setToStageId(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            >
              <option value="">Bosqichni tanlang</option>
              {(stages ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={() => void addRule()}
          disabled={
            createRule.isPending || !funnel || !toStageId || (scope === "specific" && !managerId)
          }
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-semibold text-subtle transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createRule.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Qo'shish
        </button>

        {(rules ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Hali bosqich o'tishi qoidasi qo'shilmagan.
          </p>
        ) : (
          <ul className="space-y-2">
            {(rules ?? []).map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-accent px-4 py-3"
              >
                <div className="text-sm text-foreground">
                  <span className="font-medium">
                    {rule.manager_scope === "specific"
                      ? (managerById.get(rule.manager_id ?? "") ?? "Noma'lum menejer")
                      : "Barcha menejerlar"}
                  </span>
                  {" · "}
                  {rule.funnel}
                  {" · "}
                  {rule.from_stage_id
                    ? (stageById.get(rule.from_stage_id) ?? "?")
                    : "Hamma bosqichdan"}
                  {" → "}
                  {stageById.get(rule.to_stage_id) ?? "?"}
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(rule.id)}
                  className="shrink-0 rounded-lg p-2 text-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label="O'chirish"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <ConfirmDialog
          open={confirmDeleteId !== null}
          onOpenChange={(o) => !o && setConfirmDeleteId(null)}
          title="Qoidani o'chirish"
          description="Ushbu bosqich o'tishi qoidasi hisobotdan olib tashlanadi."
          onConfirm={() => confirmDeleteId && void removeRule(confirmDeleteId)}
        />

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            Yopish
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StageTransitionCard() {
  const { data: rules } = useReportStageTransitionRules();
  const [open, setOpen] = useState(false);

  return (
    <SectionCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
            <FileText className="h-4 w-4" />
          </span>
          <h3 className="text-base font-semibold text-foreground">Voronka bosqichlari harakati</h3>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          Sozlash
        </button>
      </div>
      <p className="mt-3 text-sm text-subtle">
        Hisobotda alohida ko'rinishi kerak bo'lgan CRM bosqich o'tishlarini tanlang: qaysi menejer,
        qaysi voronka va qaysi bosqichdan qaysi bosqichga.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        {(rules ?? []).length === 0
          ? "Hali bosqich o'tishi qoidasi qo'shilmagan."
          : `${rules!.length} ta bosqich o'tishi qoidasi qo'shilgan.`}
      </p>

      <StageTransitionRuleDialog open={open} onOpenChange={setOpen} />
    </SectionCard>
  );
}

function AdvancedToggleRow({
  title,
  description,
  enabled,
  onToggle,
  disabled,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-base font-semibold text-foreground">{title}</span>
        <div className="flex items-center gap-2.5">
          <Switch checked={enabled} disabled={disabled} onCheckedChange={onToggle} />
          <span className="text-sm text-muted-foreground">
            {enabled ? "Yoqilgan" : "O'chirilgan"}
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-sm text-subtle">{description}</p>
      {children}
    </div>
  );
}

function ManagerConversionCriteria({
  criterionIds,
  onChange,
  disabled,
}: {
  criterionIds: string[] | null;
  onChange: (ids: string[] | null) => void;
  disabled?: boolean;
}) {
  const { data: steps } = useCallStageStepsRaw();
  const all = steps ?? [];
  const selectedSet = criterionIds === null ? null : new Set(criterionIds);

  function toggle(id: string, checked: boolean) {
    const base = criterionIds === null ? all.map((s) => s.id) : criterionIds;
    const next = checked ? Array.from(new Set([...base, id])) : base.filter((x) => x !== id);
    onChange(next.length === all.length ? null : next);
  }

  if (all.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-4">
      <p className="text-base font-semibold text-foreground">
        Hisobot tavsiyasida ishlatiladigan mezonlar
      </p>
      <p className="mt-1 text-sm text-subtle">
        Belgini olib tashlagan mezon faqat shu konversiya tavsiyasi blokida ko'rsatilmaydi.
      </p>
      <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
        {all.map((s) => {
          const checked = selectedSet === null ? true : selectedSet.has(s.id);
          return (
            <label
              key={s.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => toggle(s.id, e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-base text-foreground">
                {s.code ? `${s.code} — ` : ""}
                {s.name}
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-subtle">
        Bu tanlov Playbook va qo'ng'iroq analizlariga ta'sir qilmaydi. Barcha mezonlar
        qo'ng'iroqlarni baholashda faol qoladi.
      </p>
    </div>
  );
}

function MiniAppAudioRules() {
  const { user } = useAuth();
  const { data: rules } = useMiniAppAudioRules();
  const createRule = useCreateMiniAppAudioRule();
  const deleteRule = useDeleteMiniAppAudioRule();
  const { names: funnelNames } = useFunnelNames();
  const { data: stages } = usePipelineStagesRaw();

  const [funnel, setFunnel] = useState("");
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const stageById = new Map((stages ?? []).map((s) => [s.id, s.name]));

  function toggleStage(id: string, checked: boolean) {
    setStageIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  async function addRule() {
    if (!funnel || stageIds.length === 0) return;
    try {
      await createRule.mutateAsync({
        organization_id: user!.organizationId!,
        funnel,
        stage_ids: stageIds,
        position: rules?.length ?? 0,
      });
      setFunnel("");
      setStageIds([]);
    } catch (err) {
      toast.error(errorMessage(err, "Qoida qo'shishda xatolik yuz berdi."));
    }
  }

  async function removeRule(id: string) {
    try {
      await deleteRule.mutateAsync(id);
    } catch (err) {
      toast.error(errorMessage(err, "Qoidani o'chirishda xatolik yuz berdi."));
    } finally {
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-border bg-background p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-muted-foreground">Voronka tanlang</span>
          <select
            value={funnel}
            onChange={(e) => setFunnel(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
          >
            <option value="">Voronkani tanlang</option>
            {funnelNames.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="text-sm font-medium text-muted-foreground">Bosqichlarni tanlang</span>
          <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border bg-accent p-2">
            {(stages ?? []).length === 0 && (
              <p className="px-2 py-1 text-sm text-subtle">Bosqichlarni tanlang</p>
            )}
            {(stages ?? []).map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={stageIds.includes(s.id)}
                  onChange={(e) => toggleStage(s.id, e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-base text-foreground">{s.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void addRule()}
        disabled={createRule.isPending || !funnel || stageIds.length === 0}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-dashed border-border px-4 text-sm font-semibold text-subtle transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {createRule.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Qo'shish
      </button>

      {(rules ?? []).map((rule) => (
        <div
          key={rule.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-accent px-4 py-3"
        >
          <div>
            <p className="text-base font-semibold text-foreground">{rule.funnel}</p>
            <p className="text-sm text-subtle">
              {rule.stage_ids.map((id) => stageById.get(id) ?? "?").join(" | ")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmDeleteId(rule.id)}
            className="shrink-0 rounded-lg p-2 text-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="O'chirish"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
        title="Qoidani o'chirish"
        description="Ushbu voronka/bosqich qoidasi Mini App audio ko'rib chiqishdan olib tashlanadi."
        onConfirm={() => confirmDeleteId && void removeRule(confirmDeleteId)}
      />
    </div>
  );
}

function GoogleSheetsUrlField() {
  const { data: settings } = useDailyReportSettings();
  const updateSettings = useUpdateDailyReportSettings();
  const [url, setUrl] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (settings === undefined || hydrated) return;
    setUrl(settings?.google_sheets_url ?? "");
    setHydrated(true);
  }, [settings, hydrated]);

  async function save() {
    try {
      await updateSettings.mutateAsync({ google_sheets_url: url.trim() || null });
      toast.success("Saqlandi.");
    } catch (err) {
      toast.error(errorMessage(err, "Saqlashda xatolik yuz berdi."));
    }
  }

  return (
    <div>
      <span className="text-base font-semibold text-foreground">
        Google Sheets bilan avtomatik sinxronlash
      </span>
      <p className="mt-1.5 text-sm text-subtle">
        Har kuni yuboriladigan to'liq hisobot shu havoladagi jadvalga sana va matn ustunlari bilan
        avtomatik qo'shiladi. Jadvalni "Muharrir" huquqi bilan platforma xizmat hisobiga ulashish
        kerak — bu bir martalik texnik sozlash bo'lib, uni administratsiya bilan birga amalga
        oshiramiz.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          className="h-11 flex-1 rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={updateSettings.isPending}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {updateSettings.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Saqlash
        </button>
      </div>
    </div>
  );
}

function AdvancedSettingsCard() {
  const { data: settings } = useDailyReportSettings();
  const updateSettings = useUpdateDailyReportSettings();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  async function patch(next: Partial<DailyReportSettingsRow>) {
    try {
      await updateSettings.mutateAsync(next);
    } catch (err) {
      toast.error(errorMessage(err, "Saqlashda xatolik yuz berdi."));
    }
  }

  return (
    <SectionCard
      actions={
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          {advancedOpen ? "Kengaytirilgan sozlamalarni yopish" : "Kengaytirilgan sozlamalar"}
          {advancedOpen ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      }
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
          <FileText className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-foreground">Kengaytirilgan sozlamalar</h3>
          <p className="text-sm text-subtle">
            Kunlik hisobotni yanada batafsil boshqarish uchun qo'shimcha sozlamalar.
          </p>
        </div>
      </div>

      {advancedOpen && (
        <div className="mt-4 space-y-4">
          <div className="border-t border-border pt-4">
            <AdvancedToggleRow
              title="Menejer konversiyasini oshirish bo'yicha tavsiyalar"
              description="Yoqilganda, rahbarning kunlik hisobotiga har bir menejerning barcha sotuvlari bo'yicha lid konversiyasi, barcha tahlil qilingan qo'ng'iroqlaridan aniqlangan haqiqiy muammolar va menejerlarning jami umumiy konversiyasi qo'shiladi. Odatiy holatda o'chirilgan. Sozlama faqat joriy biznesga qo'llanadi."
              enabled={settings?.manager_conversion_recommendations_enabled ?? false}
              disabled={updateSettings.isPending}
              onToggle={(v) => void patch({ manager_conversion_recommendations_enabled: v })}
            >
              {(settings?.manager_conversion_recommendations_enabled ?? false) && (
                <ManagerConversionCriteria
                  criterionIds={settings?.manager_conversion_recommendation_criterion_ids ?? null}
                  onChange={(ids) =>
                    void patch({ manager_conversion_recommendation_criterion_ids: ids })
                  }
                  disabled={updateSettings.isPending}
                />
              )}
            </AdvancedToggleRow>
          </div>

          <div className="border-t border-border pt-4">
            <AdvancedToggleRow
              title="Qo'ng'iroq audiolarini Telegram Mini App'da ko'rib chiqish"
              description="Tanlangan CRM voronka va bosqichlariga mos qo'ng'iroqlar uchun rahbarning kunlik Telegram hisobotida har bir menejerga alohida ko'k Mini App havolasi chiqadi. Har bir havolada shu hisobot kunidagi eng so'nggi 5 tagacha yaroqli audio Mini App ichida tinglanadi. Odatiy holatda o'chirilgan."
              enabled={settings?.call_audio_mini_app_enabled ?? false}
              disabled={updateSettings.isPending}
              onToggle={(v) => void patch({ call_audio_mini_app_enabled: v })}
            >
              {(settings?.call_audio_mini_app_enabled ?? false) && <MiniAppAudioRules />}
            </AdvancedToggleRow>
          </div>

          <div className="border-t border-border pt-4">
            <GoogleSheetsUrlField />
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function ReportSampleEditDialog({
  open,
  onOpenChange,
  initialText,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialText: string;
}) {
  const updateSettings = useUpdateDailyReportSettings();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [draft, setDraft] = useState(initialText);

  useEffect(() => {
    if (open) setDraft(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    try {
      await updateSettings.mutateAsync({ report_sample_override: draft });
      void qc.invalidateQueries({ queryKey: ["daily_report_preview", user?.organizationId] });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Saqlashda xatolik yuz berdi."));
    }
  }

  async function resetToDefault() {
    try {
      await updateSettings.mutateAsync({ report_sample_override: null });
      void qc.invalidateQueries({ queryKey: ["daily_report_preview", user?.organizationId] });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Standart holatga qaytarishda xatolik yuz berdi."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hisobot namunasini tahrirlash</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-subtle">
          Bu matn "Hisobot namunasi" qismida ko'rsatiladi va shu holatda saqlanib qoladi (kunlik
          real ma'lumotlar bilan avtomatik yangilanmaydi, toki standart holatga qaytarilmaguncha).
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={18}
          className="w-full resize-y rounded-xl border border-border bg-accent p-3 font-mono text-xs outline-none focus:border-primary/40"
        />
        <DialogFooter className="sm:justify-between">
          <button
            type="button"
            onClick={() => void resetToDefault()}
            disabled={updateSettings.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-subtle transition-colors hover:bg-accent disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Standart holatga qaytarish
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={updateSettings.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {updateSettings.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Saqlash
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportSamplePreview() {
  const { data, isLoading, isError } = useDailyReportPreview();
  const [editing, setEditing] = useState(false);
  const text = data?.text ?? "";
  const blocks = text.split("\n\n").filter((b) => b.trim());

  return (
    <SectionCard
      title="Hisobot namunasi"
      description="Tanlangan qismlar bilan kunlik hisobot qanday ko'rinishini ko'rsatadigan namunaviy ma'lumotlar."
      actions={
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Tahrirlash"
        >
          <Pencil className="h-4 w-4" />
        </button>
      }
    >
      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
        </div>
      )}
      {isError && (
        <p className="py-6 text-center text-sm text-destructive">
          Hisobot namunasini yuklab bo'lmadi.
        </p>
      )}
      {!isLoading && !isError && blocks.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Hozircha ko'rsatiladigan ma'lumot yo'q.
        </p>
      )}
      {!isLoading && !isError && blocks.length > 0 && (
        <div className="space-y-4 rounded-xl border border-border bg-accent p-4">
          {blocks.map((block, i) => {
            const [header, ...rest] = block.split("\n");
            return (
              <div key={i} className="border-l-2 border-primary/40 pl-3">
                <p className="text-lg font-semibold text-foreground">{header}</p>
                {rest.map((line, j) => (
                  <p key={j} className="whitespace-pre-wrap text-base text-subtle">
                    {line}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <ReportSampleEditDialog open={editing} onOpenChange={setEditing} initialText={text} />
    </SectionCard>
  );
}

function DailyReportSectionsPage() {
  return (
    <>
      <Link
        to="/daily-report-settings"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-subtle transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Kunlik hisobot sozlamalariga qaytish
      </Link>
      <h1 className="font-semibold text-foreground">Kunlik hisobot tarkibi</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Yaratiladigan kunlik hisobotga qaysi bo'limlar, menejerlar, CRM voronkalari, lid sifati
        guruhlari, anketa javoblari va bosqich o'tishlari kirishini tanlang.
      </p>
      <div className="mt-6 grid gap-5 xl:grid-cols-2 xl:items-start">
        <div className="grid gap-5">
          <ReportSectionsCard />
          <StageTransitionCard />
          <AdvancedSettingsCard />
        </div>
        <ReportSamplePreview />
      </div>
    </>
  );
}
