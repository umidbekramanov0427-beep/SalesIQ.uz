import { createFileRoute } from "@tanstack/react-router";
import { SettingsTabbedLayout } from "@/components/settings/SettingsTabs";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  Lock,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill, SettingsLayout } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useCallCategories,
  useCreateCallCategory,
  useUpdateCallCategory,
  useDeleteCallCategory,
  useCallStagesRaw,
  useCreateCallStage,
  useUpdateCallStage,
  useDeleteCallStage,
  useCallStageStepsRaw,
  useCreateCallStageStep,
  useUpdateCallStageStep,
  useDeleteCallStageStep,
  useServiceLines,
  useCreateServiceLine,
  useUpdateServiceLine,
  useDeleteServiceLine,
  useIntakeQuestions,
  useCreateIntakeQuestion,
  useUpdateIntakeQuestion,
  useDeleteIntakeQuestion,
  useLeadQualityStages,
  useCreateLeadQualityStage,
  useUpdateLeadQualityStage,
  useDeleteLeadQualityStage,
  useAiAgents,
  useUpdateAiAgent,
  usePipelineStagesRaw,
  useUpdateStage,
  type CallCategoryRow,
  type CallStageRow,
  type CallStageStepRow,
  type ServiceLineRow,
  type IntakeQuestionRow,
  type LeadQualityStageRow,
} from "@/hooks/use-crm-data";

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message || fallback;
  }
  return fallback;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function linesToArray(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const TABS = [
  "rubric",
  "intake",
  "services",
  "families",
  "leadQuality",
  "aiInstructions",
  "leadAnalytics",
  "outcomes",
] as const;
export type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/scoring-criteria")({
  // Lets the main Settings sidebar deep-link straight into one tab (e.g.
  // /scoring-criteria?tab=aiInstructions) instead of always landing on
  // "Baholash mezonlari" and making the admin click again.
  validateSearch: (search: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: TABS.includes(search["tab"] as Tab) ? (search["tab"] as Tab) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Baholash mezoni — SalesIQ" },
      {
        name: "description",
        content: "AI qo'ng'iroq tahlili uchun baholash mezonlari, savollar va yo'riqnomalar.",
      },
    ],
  }),
  component: ScoringCriteriaPage,
});

const inputCls =
  "h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40";
const textareaCls =
  "w-full rounded-xl border border-border bg-accent px-3 py-2 text-sm outline-none focus:border-primary/40";

function useCanManage() {
  const { user } = useAuth();
  return user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";
}

/* ===================================================================== */
/* Tab 1 — Baholash mezonlari: weighted stages, each with graded steps    */
/* (code + 4-level rubric), optionally tagged to a category.              */
/* ===================================================================== */

type CriterionFormValues = {
  name: string;
  description: string;
  level0: string;
  level1: string;
  level2: string;
  level3: string;
};

function CriterionDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  initial: CriterionFormValues;
  onSave: (values: CriterionFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function set<K extends keyof CriterionFormValues>(key: K, v: string) {
    setValues((cur) => ({ ...cur, [key]: v }));
  }

  async function handleSave() {
    if (!values.name.trim()) return;
    setSaving(true);
    try {
      await onSave(values);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm text-muted-foreground">Nom</p>
            <input
              autoFocus
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm text-muted-foreground">Tavsif</p>
            <textarea
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="Bu mezon bo'yicha yaxshi xatti-harakat qanday ko'rinishini yozing."
              className={textareaCls}
            />
          </div>
          <div>
            <p className="mb-2 text-base font-semibold text-foreground">Ball mezoni</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["level0", "Ball 0", "Qachon umuman bajarilmagan hisoblanadi?"],
                  ["level1", "Ball 1", "Qachon zaif bajarilgan hisoblanadi?"],
                  ["level2", "Ball 2", "Qachon qoniqarli bajarilgan hisoblanadi?"],
                  ["level3", "Ball 3", "Qachon a'lo bajarilgan hisoblanadi?"],
                ] as const
              ).map(([key, label, placeholder]) => (
                <div key={key}>
                  <p className="mb-1.5 text-sm text-muted-foreground">{label}</p>
                  <textarea
                    value={values[key]}
                    onChange={(e) => set(key, e.target.value)}
                    rows={3}
                    placeholder={placeholder}
                    className={textareaCls}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-medium text-subtle hover:bg-accent"
          >
            Bekor qilish
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving || !values.name.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Saqlash
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RubricStepRow({
  step,
  index,
  lastIndex,
  onMove,
  canManage,
}: {
  step: CallStageStepRow;
  index: number;
  lastIndex: number;
  onMove: (index: number, dir: -1 | 1) => void;
  canManage: boolean;
}) {
  const updateStep = useUpdateCallStageStep();
  const deleteStep = useDeleteCallStageStep();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(values: CriterionFormValues) {
    try {
      await updateStep.mutateAsync({
        id: step.id,
        patch: {
          name: values.name.trim() || step.name,
          description: values.description,
          level_0_desc: values.level0,
          level_1_desc: values.level1,
          level_2_desc: values.level2,
          level_3_desc: values.level3,
        },
      });
      toast.success("Saqlandi");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
      throw err;
    }
  }

  async function remove() {
    try {
      await deleteStep.mutateAsync(step.id);
      toast.success("O'chirildi");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    } finally {
      setConfirmDelete(false);
    }
  }

  const levels = [
    step.level_0_desc,
    step.level_1_desc,
    step.level_2_desc,
    step.level_3_desc,
  ] as const;

  return (
    <tr
      className={cn(
        "group border-t border-border/60 align-top transition-colors hover:bg-accent/30",
        canManage && "cursor-pointer",
      )}
      onClick={canManage ? () => setEditing(true) : undefined}
    >
      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-muted-foreground">
        {step.code}
      </td>
      <td className="px-4 py-3.5">
        <p className="text-sm font-semibold leading-snug text-foreground">{step.name}</p>
        {step.description && (
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{step.description}</p>
        )}
      </td>
      {levels.map((text, n) => (
        <td
          key={n}
          className={cn(
            "px-4 py-3.5 text-[13px] leading-relaxed",
            n === 3 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {text || <span className="text-muted-foreground/50">—</span>}
        </td>
      ))}
      {canManage && (
        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
          <span className="flex items-center justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => onMove(index, -1)}
              disabled={index === 0}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
              aria-label="Yuqoriga"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onMove(index, 1)}
              disabled={index === lastIndex}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
              aria-label="Pastga"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setEditing(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Tahrirlash"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="O'chirish"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
          <CriterionDialog
            open={editing}
            onOpenChange={setEditing}
            title="Mezonni tahrirlash"
            initial={{
              name: step.name,
              description: step.description,
              level0: step.level_0_desc,
              level1: step.level_1_desc,
              level2: step.level_2_desc,
              level3: step.level_3_desc,
            }}
            onSave={save}
          />
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={`"${step.name}" o'chirilsinmi?`}
            description="Bu amalni ortga qaytarib bo'lmaydi."
            onConfirm={() => void remove()}
          />
        </td>
      )}
    </tr>
  );
}

function RubricStageCard({
  stage,
  categories,
  steps,
  canManage,
}: {
  stage: CallStageRow;
  categories: CallCategoryRow[];
  steps: CallStageStepRow[];
  canManage: boolean;
}) {
  const { user } = useAuth();
  const updateStage = useUpdateCallStage();
  const deleteStage = useDeleteCallStage();
  const createStep = useCreateCallStageStep();
  const updateStep = useUpdateCallStageStep();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(stage.name);
  const [weight, setWeight] = useState(String(stage.weight_percent));
  const [addingStep, setAddingStep] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const stageSteps = [...steps.filter((s) => s.stage_id === stage.id)].sort(
    (a, b) => a.position - b.position,
  );

  async function saveName() {
    try {
      await updateStage.mutateAsync({ id: stage.id, patch: { name: name.trim() || stage.name } });
      setEditingName(false);
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    }
  }

  async function saveWeight() {
    try {
      await updateStage.mutateAsync({
        id: stage.id,
        patch: { weight_percent: Number(weight) || 0 },
      });
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    }
  }

  async function changeCategory(id: string) {
    try {
      await updateStage.mutateAsync({ id: stage.id, patch: { category_id: id || null } });
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    }
  }

  async function moveStep(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= stageSteps.length) return;
    const a = stageSteps[index]!;
    const b = stageSteps[target]!;
    try {
      await Promise.all([
        updateStep.mutateAsync({ id: a.id, patch: { position: b.position } }),
        updateStep.mutateAsync({ id: b.id, patch: { position: a.position } }),
      ]);
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    }
  }

  async function addStep(values: CriterionFormValues) {
    const letter = String.fromCharCode(65 + (stage.position % 26));
    try {
      await createStep.mutateAsync({
        organization_id: user!.organizationId!,
        stage_id: stage.id,
        name: values.name.trim(),
        description: values.description,
        code: `${letter}${stageSteps.length + 1}`,
        points: 5,
        position: stageSteps.length,
        level_0_desc: values.level0,
        level_1_desc: values.level1,
        level_2_desc: values.level2,
        level_3_desc: values.level3,
      });
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
      throw err;
    }
  }

  async function removeStage() {
    try {
      await deleteStage.mutateAsync(stage.id);
      toast.success("O'chirildi");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    } finally {
      setConfirmDelete(false);
    }
  }

  const category = categories.find((c) => c.id === stage.category_id);
  const columns = canManage ? 7 : 6;

  return (
    <tbody>
      <tr className="border-t border-border bg-muted/30">
        <td colSpan={columns} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={collapsed ? "Ochish" : "Yopish"}
              aria-expanded={!collapsed}
            >
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")}
              />
            </button>
            {editingName ? (
              <span className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void saveName()}
                  className="h-9 min-w-[200px] rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/40"
                />
                <button
                  onClick={() => void saveName()}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Saqlash"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <span className="text-[15px] font-semibold text-foreground">{stage.name}</span>
            )}
            <span className="text-[13px] text-muted-foreground">
              {stageSteps.length} ta mezon{category ? ` · ${category.name}` : ""}
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {canManage ? (
                <>
                  <select
                    value={stage.category_id ?? ""}
                    onChange={(e) => void changeCategory(e.target.value)}
                    aria-label="Kategoriya"
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary/40"
                  >
                    <option value="">Kategoriyasiz</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-sm font-semibold text-foreground">
                    <input
                      type="number"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      onBlur={() => void saveWeight()}
                      aria-label="Og'irlik, %"
                      className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-right text-sm font-semibold outline-none focus:border-primary/40"
                    />
                    %
                  </label>
                  {!editingName && (
                    <>
                      <button
                        onClick={() => setEditingName(true)}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Nomini tahrirlash"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Bosqichni o'chirish"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </>
              ) : (
                <span className="text-sm font-semibold text-foreground">
                  {stage.weight_percent}%
                </span>
              )}
            </span>
          </div>
          <CriterionDialog
            open={addingStep}
            onOpenChange={setAddingStep}
            title="Mezon qo'shish"
            initial={{ name: "", description: "", level0: "", level1: "", level2: "", level3: "" }}
            onSave={addStep}
          />
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={`"${stage.name}" o'chirilsinmi?`}
            description="Ichidagi barcha mezonlar ham o'chib ketadi."
            onConfirm={() => void removeStage()}
          />
        </td>
      </tr>
      {!collapsed &&
        stageSteps.map((step, index) => (
          <RubricStepRow
            key={step.id}
            step={step}
            index={index}
            lastIndex={stageSteps.length - 1}
            onMove={(i, dir) => void moveStep(i, dir)}
            canManage={canManage}
          />
        ))}
      {!collapsed && (stageSteps.length === 0 || canManage) && (
        <tr className="border-t border-border/60">
          <td colSpan={columns} className="px-4 py-2.5">
            {stageSteps.length === 0 && (
              <span className="mr-3 text-[13px] text-muted-foreground">Mezon qo'shilmagan</span>
            )}
            {canManage && (
              <button
                onClick={() => setAddingStep(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Mezon qo'shish
              </button>
            )}
          </td>
        </tr>
      )}
    </tbody>
  );
}

// The exact rubric this org had configured before -- transcribed verbatim
// (stage names, weights, step codes and all four point-level descriptions)
// from the admin's own screenshots, so it doesn't have to be retyped by
// hand one field at a time. Only offered as a one-click "load" while the
// rubric is empty (see the button below) -- never runs automatically and
// never overwrites anything once at least one stage exists.
const STARTER_RUBRIC: {
  name: string;
  weight: number;
  steps: {
    code: string;
    name: string;
    description: string;
    level0: string;
    level1: string;
    level2: string;
    level3: string;
  }[];
}[] = [
  {
    name: "Salomlashish",
    weight: 12,
    steps: [
      {
        code: "A1",
        name: "Kompaniya va menejer tanishtiruvi",
        description: "O'zini va kompaniyasini aniq tanishtirdi.",
        level0: "Menejer o'zini ham, kompaniyani ham tanishtirmadi.",
        level1: "Faqat ismini yoki faqat kompaniyani aytdi.",
        level2: "O'zini va kompaniyasini aniq tanishtirdi.",
        level3: "O'zini, kompaniyasini va suhbatdagi rolini ishonchli tarzda tanishtirdi.",
      },
      {
        code: "A2",
        name: "Murojaat sababi aytildi",
        description: "Qo'ng'iroq sababi yoki mijoz so'rovi aniq aytildi.",
        level0: "Nima sababdan aloqaga chiqqani aytilmadi.",
        level1: "Sabab juda umumiy yoki noaniq aytildi.",
        level2: "Qo'ng'iroq sababi yoki mijoz so'rovi aniq aytildi.",
        level3:
          "Sabab mijozning oldingi qiziqishi yoki holati bilan bog'lab, aniq kontekst bilan tushuntirildi.",
      },
      {
        code: "A3",
        name: "Suhbatga qulaylik tekshirildi",
        description: "Hozir gaplashishga qulayligi aniq so'raldi.",
        level0: "Mijozning gaplashishga qulayligi so'ralmadi.",
        level1: "So'raldi, lekin javobi hisobga olinmadi.",
        level2: "Hozir gaplashishga qulayligi aniq so'raldi.",
        level3: "Qulay vaqt tekshirilib, noqulay bo'lsa keyingi aloqa vaqti ham kelishib olindi.",
      },
    ],
  },
  {
    name: "Ehtiyojlar",
    weight: 23,
    steps: [
      {
        code: "B1",
        name: "Mijoz vaziyati ochildi",
        description: "Jarayon, muammo yoki maqsadni aniqlash uchun yetarli savollar berildi.",
        level0: "Mijozning hozirgi holati yoki muammosi so'ralmadi.",
        level1: "Yuzaki bitta savol berildi.",
        level2: "Jarayon, muammo yoki maqsadni aniqlash uchun yetarli savollar berildi.",
        level3: "Vaziyat chuqur ochilib, muammo sababi va oqibati ham aniq tushunildi.",
      },
      {
        code: "B2",
        name: "Qaysi yo'nalish kerakligi aniqlandi",
        description: "Kerak bo'lgan xizmat yoki yechim aniq ajratildi.",
        level0: "Mijozga qaysi xizmat yoki yechim kerakligi aniqlanmadi.",
        level1: "Yo'nalish taxmin qilindi, lekin aniqlashtirilmadi.",
        level2: "Kerak bo'lgan xizmat yoki yechim aniq ajratildi.",
        level3:
          "Bir nechta variant orasidan eng mos yo'nalish mijoz ehtiyojiga qarab aniqlab olindi.",
      },
      {
        code: "B3",
        name: "Qaror va resurs holati aniqlashtirildi",
        description: "Qaror beruvchi, jamoa yoki joriy tizim bo'yicha asosiy kontekst aniqlandi.",
        level0: "Qaror beruvchi yoki resurs holati so'ralmadi.",
        level1: "Faqat bitta kontekst savoli berildi.",
        level2: "Qaror beruvchi, jamoa yoki joriy tizim bo'yicha asosiy kontekst aniqlandi.",
        level3: "Qaror jarayoni, jamoa imkoniyatlari va mavjud resurslar to'liq tushunib olindi.",
      },
    ],
  },
  {
    name: "Qiymat",
    weight: 18,
    steps: [
      {
        code: "C1",
        name: "Taklif ehtiyojga bog'landi",
        description: "Taklif mijoz aytgan ehtiyoj yoki muammoga bog'lab tushuntirildi.",
        level0: "Taklif mijoz ehtiyojiga bog'lanmadi.",
        level1: "Umumiy foydalar aytildi, lekin muammoga ulanmagan.",
        level2: "Taklif mijoz aytgan ehtiyoj yoki muammoga bog'lab tushuntirildi.",
        level3: "Taklifning aynan qaysi qismi qaysi muammoni hal qilishi aniq ko'rsatildi.",
      },
      {
        code: "C2",
        name: "Aniq foyda ko'rsatildi",
        description: "Xizmat yoki yechim qanday natija berishi biznes tili bilan tushuntirildi.",
        level0: "Hech qanday aniq foyda aytilmadi.",
        level1: "Faqat umumiy va'dalar berildi.",
        level2: "Xizmat yoki yechim qanday natija berishi biznes tili bilan tushuntirildi.",
        level3: "Foyda o'lchab bo'ladigan natija yoki amaliy ta'sir bilan ishonchli ko'rsatildi.",
      },
      {
        code: "C3",
        name: "Mos format tavsiya qilindi",
        description: "Mijoz holatiga mos format tavsiya qilindi.",
        level0: "Keyingi mos format tavsiya qilinmadi.",
        level1: "Demo, audit yoki taklif varianti aytildi, lekin mosligi tushuntirilmadi.",
        level2: "Mijoz holatiga mos format tavsiya qilindi.",
        level3: "Bir nechta variant orasidan eng mos format sabab bilan tanlab berildi.",
      },
    ],
  },
  {
    name: "E'tirozlar",
    weight: 12,
    steps: [
      {
        code: "D1",
        name: "E'tiroz sababi ochildi",
        description: "E'tiroz ortidagi haqiqiy sabab aniqlashtirildi.",
        level0: "E'tiroz sababi so'ralmadi.",
        level1: "E'tiroz yuzaki qabul qilindi.",
        level2: "E'tiroz ortidagi haqiqiy sabab aniqlashtirildi.",
        level3: "Sabab chuqur ochilib, qaror yoki xavotir manbasi aniq tushunildi.",
      },
      {
        code: "D2",
        name: "Dalil bilan javob berildi",
        description: "E'tirozga aniq dalil, izoh yoki misol bilan javob berildi.",
        level0: "E'tirozga javob berilmadi.",
        level1: "Faqat umumiy gap bilan javob berildi.",
        level2: "E'tirozga aniq dalil, izoh yoki misol bilan javob berildi.",
        level3: "Dalil mijoz holatiga moslab, e'tirozni susaytiradigan tarzda tushuntirildi.",
      },
      {
        code: "D3",
        name: "Ishonch va risklarni boshqarish",
        description: "Risk va xavotirlarga aniq, rasmiy va ishonchli javob berildi.",
        level0: "Ishonch, xavotir yoki risk savollari javobsiz qoldi.",
        level1: "Yuzaki tinchlantirish bilan cheklanildi.",
        level2: "Risk va xavotirlarga aniq, rasmiy va ishonchli javob berildi.",
        level3:
          "Risk sababi ochilib, uni kamaytirish yo'li va keyingi ishonch beruvchi dalillar aniq tushuntirildi.",
      },
    ],
  },
  {
    name: "Yakunlash",
    weight: 20,
    steps: [
      {
        code: "E1",
        name: "Keyingi qadam kelishildi",
        description: "Qo'ng'iroq oxirida keyingi aniq qadam kelishib olindi.",
        level0: "Keyingi qadam umuman kelishilmadi.",
        level1: "Umumiy davom variant aytildi, lekin aniq emas edi.",
        level2: "Qo'ng'iroq oxirida keyingi aniq qadam kelishib olindi.",
        level3: "Keyingi qadam, javobgarlik va natija aniq kelishib, mijoz tasdig'i olindi.",
      },
      {
        code: "E2",
        name: "Vaqt va format belgilandi",
        description: "Keyingi aloqa vaqti, formati yoki javob muddati aniq belgilandi.",
        level0: "Keyingi aloqa vaqti yoki formati belgilanmadi.",
        level1: "Faqat taxminiy vaqt aytildi.",
        level2: "Keyingi aloqa vaqti, formati yoki javob muddati aniq belgilandi.",
        level3: "Vaqt, format va aloqa egasi qat'iy kelishib olindi.",
      },
      {
        code: "E3",
        name: "Kelishuv yakunlab qaytarildi",
        description: "Kelishilgan narsalar qisqacha qayta aytildi yoki tasdiqlandi.",
        level0: "Suhbat xulosasiz tugadi.",
        level1: "Faqat qisqa xayrlashuv bo'ldi.",
        level2: "Kelishilgan narsalar qisqacha qayta aytildi yoki tasdiqlandi.",
        level3: "Yakunda barcha kelishuvlar tizimli qaytarilib, mijozdan aniq tasdiq olindi.",
      },
    ],
  },
  {
    name: "Muloqot sifati",
    weight: 15,
    steps: [
      {
        code: "F1",
        name: "Professional ohang",
        description: "Suhbat professional, hurmatli va tartibli ohangda olib borildi.",
        level0: "Ohang qo'pol, beparvo yoki noo'rin edi.",
        level1: "Ohang juda sust yoki ishonchsiz edi.",
        level2: "Suhbat professional, hurmatli va tartibli ohangda olib borildi.",
        level3: "Professional ohang butun suhbat davomida ishonchli va ishchan tarzda saqlandi.",
      },
      {
        code: "F2",
        name: "Faol tinglash",
        description: "Mijozning gaplari tinglanib, javoblar mantiqan davom ettirildi.",
        level0: "Mijozning gapi tinglanmadi yoki bo'lindi.",
        level1: "Tinglandi, lekin reaksiyalar sust bo'ldi.",
        level2: "Mijozning gaplari tinglanib, javoblar mantiqan davom ettirildi.",
        level3:
          "Menejer mijoz fikrlariga moslashib, faol tinglash orqali suhbatni samarali boshqardi.",
      },
    ],
  },
];

function RubricTab() {
  const canManage = useCanManage();
  const { user } = useAuth();
  const { data: stages = [], isLoading } = useCallStagesRaw();
  const { data: steps = [] } = useCallStageStepsRaw();
  const { data: categories = [] } = useCallCategories();
  const createStage = useCreateCallStage();
  const createStep = useCreateCallStageStep();
  const [newStageName, setNewStageName] = useState("");
  const [seeding, setSeeding] = useState(false);

  const totalWeight = stages.reduce((sum, s) => sum + s.weight_percent, 0);

  async function addStage(e: FormEvent) {
    e.preventDefault();
    if (!newStageName.trim()) return;
    try {
      await createStage.mutateAsync({
        organization_id: user!.organizationId!,
        name: newStageName.trim(),
        weight_percent: 0,
        position: stages.length,
      });
      setNewStageName("");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    }
  }

  async function loadStarterRubric() {
    setSeeding(true);
    try {
      for (let i = 0; i < STARTER_RUBRIC.length; i++) {
        const s = STARTER_RUBRIC[i]!;
        const stage = await createStage.mutateAsync({
          organization_id: user!.organizationId!,
          name: s.name,
          weight_percent: s.weight,
          position: i,
        });
        for (let j = 0; j < s.steps.length; j++) {
          const st = s.steps[j]!;
          await createStep.mutateAsync({
            organization_id: user!.organizationId!,
            stage_id: stage.id,
            code: st.code,
            name: st.name,
            description: st.description,
            level_0_desc: st.level0,
            level_1_desc: st.level1,
            level_2_desc: st.level2,
            level_3_desc: st.level3,
            points: 3,
            position: j,
          });
        }
      }
      toast.success("Standart mezonlar yuklandi");
    } catch (err) {
      toast.error(errorMessage(err, "Yuklab bo'lmadi"));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-[260px] flex-1 text-sm leading-relaxed text-muted-foreground">
          Har bir mezon uchun AI qaysi holatda necha ball berishini jadvalda ko'rasiz.
          {canManage && " Qatorni bosib tahrirlaysiz."}
        </p>
        <span
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium",
            totalWeight === 100
              ? "bg-success/10 text-success"
              : "bg-warning/12 text-warning-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              totalWeight === 100 ? "bg-success" : "bg-warning",
            )}
          />
          Jami og'irlik {totalWeight}%
        </span>
        {canManage && (
          <form onSubmit={(e) => void addStage(e)} className="flex items-center gap-2">
            <input
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              placeholder="Yangi bo'lim nomi"
              aria-label="Yangi bo'lim nomi"
              className="h-9 w-56 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
            <button
              type="submit"
              disabled={createStage.isPending || !newStageName.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {createStage.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Bo'lim qo'shish
            </button>
          </form>
        )}
      </div>

      {canManage && !isLoading && stages.length === 0 && (
        <button
          type="button"
          onClick={() => void loadStarterRubric()}
          disabled={seeding}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
        >
          {seeding && <Loader2 className="h-4 w-4 animate-spin" />}
          Standart mezonlarni yuklash (6 bo'lim, 17 mezon)
        </button>
      )}
      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
        </div>
      )}
      {!isLoading && stages.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">Hali bo'lim qo'shilmagan.</p>
      )}

      {stages.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[1000px] table-fixed border-collapse">
            <colgroup>
              <col className="w-16" />
              <col className="w-[22%]" />
              <col />
              <col />
              <col />
              <col />
              {canManage && <col className="w-36" />}
            </colgroup>
            <thead>
              <tr className="text-left text-[13px] text-muted-foreground">
                <th className="px-4 py-3 font-medium">Kod</th>
                <th className="px-4 py-3 font-medium">Mezon</th>
                <th className="px-4 py-3 font-medium">0 ball</th>
                <th className="px-4 py-3 font-medium">1 ball</th>
                <th className="px-4 py-3 font-medium">2 ball</th>
                <th className="px-4 py-3 font-semibold text-success">3 ball</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            {stages.map((stage) => (
              <RubricStageCard
                key={stage.id}
                stage={stage}
                categories={categories}
                steps={steps}
                canManage={canManage}
              />
            ))}
          </table>
        </div>
      )}
    </div>
  );
}

/* ===================================================================== */
/* Tab 2 — Anketa savollari                                               */
/* ===================================================================== */

function IntakeQuestionCard({
  item,
  groupLabel,
  lines,
  canManage,
}: {
  item: IntakeQuestionRow;
  groupLabel: string;
  lines: ServiceLineRow[];
  canManage: boolean;
}) {
  const updateItem = useUpdateIntakeQuestion();
  const deleteItem = useDeleteIntakeQuestion();
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(item.label);
  const [editLineId, setEditLineId] = useState(item.service_line_id ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    try {
      await updateItem.mutateAsync({
        id: item.id,
        patch: { label: editLabel.trim() || item.label, service_line_id: editLineId || null },
      });
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    }
  }

  async function remove() {
    try {
      await deleteItem.mutateAsync(item.id);
      toast.success("O'chirildi");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    } finally {
      setConfirmDelete(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-xl border border-primary/30 bg-accent p-4">
        <input
          autoFocus
          value={editLabel}
          onChange={(e) => setEditLabel(e.target.value)}
          className={inputCls}
        />
        <select
          value={editLineId}
          onChange={(e) => setEditLineId(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary/40"
        >
          <option value="">Umumiy</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void save()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Check className="h-3.5 w-3.5" /> Saqlash
          </button>
          <button
            onClick={() => setEditing(false)}
            className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs font-medium text-subtle hover:bg-accent"
          >
            Bekor qilish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-accent p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-subtle">
            <FileText className="h-4 w-4" />
          </span>
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <Pill tone="neutral">Matn</Pill>
              <Pill tone="info">{groupLabel}</Pill>
            </div>
            <p className="text-base font-semibold text-foreground">{item.label}</p>
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg p-2 text-subtle hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg p-2 text-subtle hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`"${item.label}" o'chirilsinmi?`}
        description="Bu amalni ortga qaytarib bo'lmaydi."
        onConfirm={() => void remove()}
      />
    </div>
  );
}

// Transcribed verbatim from the admin's own screenshot -- one general
// question plus one scoped to the "Rus tili kursi" service line (matched
// by name at seed time, since that line may or may not exist yet).
const STARTER_INTAKE_QUESTIONS: { label: string; serviceLineName: string | null }[] = [
  { label: "Lid necha yoshda ekan?", serviceLineName: null },
  { label: "Lid rus tilini qanday darajada biladi?", serviceLineName: "Rus tili kursi" },
];

function IntakeQuestionsTab() {
  const canManage = useCanManage();
  const { user } = useAuth();
  const { data: items = [], isLoading } = useIntakeQuestions();
  const { data: lines = [] } = useServiceLines();
  const createItem = useCreateIntakeQuestion();
  const [label, setLabel] = useState("");
  const [lineId, setLineId] = useState("");
  const [filterLineId, setFilterLineId] = useState("");
  const [seeding, setSeeding] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    try {
      await createItem.mutateAsync({
        organization_id: user!.organizationId!,
        label: label.trim(),
        service_line_id: lineId || null,
        position: items.length,
      });
      setLabel("");
      setLineId("");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    }
  }

  async function loadStarterQuestions() {
    setSeeding(true);
    try {
      for (let i = 0; i < STARTER_INTAKE_QUESTIONS.length; i++) {
        const q = STARTER_INTAKE_QUESTIONS[i]!;
        const matchedLine = q.serviceLineName
          ? (lines.find((l) => l.name === q.serviceLineName) ?? null)
          : null;
        await createItem.mutateAsync({
          organization_id: user!.organizationId!,
          label: q.label,
          service_line_id: matchedLine?.id ?? null,
          position: items.length + i,
        });
      }
      toast.success("Standart savollar yuklandi");
    } catch (err) {
      toast.error(errorMessage(err, "Yuklab bo'lmadi"));
    } finally {
      setSeeding(false);
    }
  }

  const visible = filterLineId ? items.filter((i) => i.service_line_id === filterLineId) : items;
  const groups: { key: string; label: string; items: IntakeQuestionRow[] }[] = [
    { key: "general", label: "Asosiy", items: visible.filter((i) => !i.service_line_id) },
    ...lines.map((l) => ({
      key: l.id,
      label: l.name,
      items: visible.filter((i) => i.service_line_id === l.id),
    })),
  ].filter((g) => g.items.length > 0);

  return (
    <SectionCard
      title="Anketa savollari"
      description="Hammasi ko'rinishi faqat ko'rish uchun. O'z savollarini tahrirlash uchun Asosiy yoki Asosiy + xizmat yo'nalishini tanlang."
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
        <div>
          <p className="mb-1 text-sm font-medium text-subtle">Xizmat yo'nalishi</p>
          <select
            value={filterLineId}
            onChange={(e) => setFilterLineId(e.target.value)}
            className="h-10 w-64 rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
          >
            <option value="">Hammasi</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        {canManage && (
          <form onSubmit={(e) => void add(e)} className="flex flex-wrap items-center gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Savol matni"
              className="h-10 min-w-[200px] rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            />
            <select
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
              className="h-10 rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            >
              <option value="">Umumiy</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={createItem.isPending || !label.trim()}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {createItem.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Savol qo'shish
            </button>
          </form>
        )}
      </div>
      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
        </div>
      )}
      {canManage && !isLoading && items.length === 0 && (
        <button
          type="button"
          onClick={() => void loadStarterQuestions()}
          disabled={seeding}
          className="mb-4 inline-flex h-10 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
        >
          {seeding && <Loader2 className="h-4 w-4 animate-spin" />}
          Standart savollarni yuklash
        </button>
      )}
      {!isLoading && groups.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">Hali savol qo'shilmagan.</p>
      )}
      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.key}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              {group.label}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <IntakeQuestionCard
                  key={item.id}
                  item={item}
                  groupLabel={group.label}
                  lines={lines}
                  canManage={canManage}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ===================================================================== */
/* Tab 3 — Xizmat yo'nalishlari                                           */
/* ===================================================================== */

function ServiceLineCard({ line, canManage }: { line: ServiceLineRow; canManage: boolean }) {
  const updateItem = useUpdateServiceLine();
  const deleteItem = useDeleteServiceLine();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(line.name);
  const [description, setDescription] = useState(line.description);
  const [aliases, setAliases] = useState(line.aliases.join("\n"));
  const [phrases, setPhrases] = useState(line.sample_phrases.join("\n"));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateItem.mutateAsync({
        id: line.id,
        patch: {
          name: name.trim() || line.name,
          description: description.trim(),
          aliases: linesToArray(aliases),
          sample_phrases: linesToArray(phrases),
        },
      });
      toast.success("Saqlandi");
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await deleteItem.mutateAsync(line.id);
      toast.success("O'chirildi");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    } finally {
      setConfirmDelete(false);
    }
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-border bg-accent p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-semibold text-foreground">{line.name}</p>
            {line.description && <p className="mt-1 text-sm text-subtle">{line.description}</p>}
            {line.aliases.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {line.aliases.map((a) => (
                  <Pill key={a} tone="neutral">
                    {a}
                  </Pill>
                ))}
              </div>
            )}
          </div>
          {canManage && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => setEditing(true)}
                className="rounded-lg p-2 text-subtle hover:bg-accent hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg p-2 text-subtle hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`"${line.name}" o'chirilsinmi?`}
          description="Bu amalni ortga qaytarib bo'lmaydi."
          onConfirm={() => void remove()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-accent p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputCls}
        placeholder="Nomi"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className={textareaCls}
        placeholder="Tavsif"
      />
      <div>
        <p className="mb-1 text-[11px] font-medium text-subtle">
          Sinonimlar (har birini yangi qatorga)
        </p>
        <textarea
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          rows={2}
          className={textareaCls}
        />
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-subtle">
          Namunaviy iboralar (har birini yangi qatorga)
        </p>
        <textarea
          value={phrases}
          onChange={(e) => setPhrases(e.target.value)}
          rows={2}
          className={textareaCls}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Saqlash
        </button>
        <button
          onClick={() => setEditing(false)}
          className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs font-medium text-subtle hover:bg-accent"
        >
          Bekor qilish
        </button>
      </div>
    </div>
  );
}

// Transcribed verbatim from the admin's own screenshot -- the "tags" shown
// under each service line there are its aliases (alternate names/keywords
// the AI should recognize as referring to this same line).
const STARTER_SERVICE_LINES: { name: string; description: string; aliases: string[] }[] = [
  {
    name: "Rus tili kursi",
    description: "Zarina Ismayilovna metodikasi bo'yicha onlayn rus tili o'rgatish darslari.",
    aliases: [
      "rus",
      "kursi",
      "rus tili",
      "til o'rganish",
      "tili",
      "Zarina Ismayilovna",
      "rus_tili_kursi",
    ],
  },
  {
    name: "IT kursi",
    description: "Zamonaviy IT mutaxassisliklari va kompyuter savodxonligi bo'yicha onlayn ta'lim.",
    aliases: ["kompyuter kursi", "dasturlash", "IT sohasida o'qish", "kursi", "it_kursi"],
  },
];

function ServiceLinesTab() {
  const canManage = useCanManage();
  const { user } = useAuth();
  const { data: lines = [], isLoading } = useServiceLines();
  const createItem = useCreateServiceLine();
  const [name, setName] = useState("");
  const [seeding, setSeeding] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createItem.mutateAsync({
        organization_id: user!.organizationId!,
        name: name.trim(),
        position: lines.length,
      });
      setName("");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    }
  }

  async function loadStarterLines() {
    setSeeding(true);
    try {
      for (let i = 0; i < STARTER_SERVICE_LINES.length; i++) {
        const l = STARTER_SERVICE_LINES[i]!;
        await createItem.mutateAsync({
          organization_id: user!.organizationId!,
          name: l.name,
          description: l.description,
          aliases: l.aliases,
          position: i,
        });
      }
      toast.success("Standart xizmat yo'nalishlari yuklandi");
    } catch (err) {
      toast.error(errorMessage(err, "Yuklab bo'lmadi"));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <SectionCard
      title="Xizmat yo'nalishlari"
      description="Kompaniyangiz sotadigan mahsulot/xizmat yo'nalishlari — AI qo'ng'iroqni shularga moslab tasniflaydi."
    >
      {canManage && (
        <form onSubmit={(e) => void add(e)} className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Yangi yo'nalish nomi"
            className={cn(inputCls, "min-w-[220px] flex-1")}
          />
          <button
            type="submit"
            disabled={createItem.isPending || !name.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {createItem.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Qo'shish
          </button>
        </form>
      )}
      {canManage && !isLoading && lines.length === 0 && (
        <button
          type="button"
          onClick={() => void loadStarterLines()}
          disabled={seeding}
          className="mb-4 inline-flex h-10 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
        >
          {seeding && <Loader2 className="h-4 w-4 animate-spin" />}
          Standart yo'nalishlarni yuklash
        </button>
      )}
      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
        </div>
      )}
      {!isLoading && lines.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Hali yo'nalish qo'shilmagan.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {lines.map((line) => (
          <ServiceLineCard key={line.id} line={line} canManage={canManage} />
        ))}
      </div>
    </SectionCard>
  );
}

/* ===================================================================== */
/* Tab 4 — Qo'ng'iroq oilalari (call classification / families)          */
/* ===================================================================== */

function CallFamilyRow({ category, canManage }: { category: CallCategoryRow; canManage: boolean }) {
  const updateItem = useUpdateCallCategory();
  const deleteItem = useDeleteCallCategory();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description);
  const [scored, setScored] = useState(category.scored);
  const [systemFamily, setSystemFamily] = useState(category.system_family);
  const [workflowFamily, setWorkflowFamily] = useState(category.workflow_family ?? "");
  const [conversationDomain, setConversationDomain] = useState(category.conversation_domain ?? "");
  const [temporary, setTemporary] = useState(category.temporary);
  const [exclusionReason, setExclusionReason] = useState(category.exclusion_reason ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateItem.mutateAsync({
        id: category.id,
        patch: {
          name: name.trim() || category.name,
          description: description.trim(),
          scored,
          system_family: systemFamily,
          workflow_family: workflowFamily.trim() || null,
          conversation_domain: conversationDomain.trim() || null,
          temporary,
          exclusion_reason: exclusionReason.trim() || null,
        },
      });
      toast.success("Saqlandi");
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await deleteItem.mutateAsync(category.id);
      toast.success("O'chirildi");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    } finally {
      setConfirmDelete(false);
    }
  }

  const metaEntries = [
    ["Ish oqimi oilasi", category.workflow_family],
    ["Suhbat domeni", category.conversation_domain],
    ["Chiqarish sababi", category.exclusion_reason],
  ].filter(([, v]) => !!v) as [string, string][];

  return (
    <div className="rounded-xl border border-border bg-accent p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-base font-semibold text-foreground">{category.name}</span>
            <Pill tone={category.scored ? "success" : "info"}>
              {category.scored
                ? "Baholash mezoni bo'yicha baholanadi"
                : "Baholash mezoni bo'yicha baholanmaydi"}
            </Pill>
            <Pill tone="neutral">{category.scored ? "Baholanadigan" : "Operatsion"}</Pill>
            {category.temporary && <Pill tone="warning">Vaqtinchalik</Pill>}
            {category.system_family && <Pill tone="warning">Tizim oilasi</Pill>}
          </div>
          {category.system_family && (
            <p className="mt-1 text-xs text-warning-foreground">
              Bu tizim oilasi majburiy va o'chirib bo'lmaydi.
            </p>
          )}
          {category.description && !editing && (
            <p className="mt-1.5 text-sm text-subtle">{category.description}</p>
          )}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setEditing((v) => !v)}
              className="rounded-lg p-2 text-subtle hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {category.system_family ? (
              <span className="rounded-lg p-2 text-subtle/50" title="Tizim oilasi o'chirilmaydi">
                <Lock className="h-3.5 w-3.5" />
              </span>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg p-2 text-subtle hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      {metaEntries.length > 0 && !editing && (
        <div className={cn("mt-3 grid gap-2", metaEntries.length === 1 ? "" : "sm:grid-cols-2")}>
          {metaEntries.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-background px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
                {label}
              </p>
              <p className="text-sm text-foreground">{value}</p>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder="Nomi"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={textareaCls}
            placeholder="Tavsif"
          />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-subtle">
              <input
                type="checkbox"
                checked={scored}
                onChange={(e) => setScored(e.target.checked)}
              />
              Baholanadi (og'irlikli mezonga kiradi)
            </label>
            <label className="flex items-center gap-2 text-sm text-subtle">
              <input
                type="checkbox"
                checked={systemFamily}
                onChange={(e) => setSystemFamily(e.target.checked)}
              />
              Tizim oilasi
            </label>
            <label className="flex items-center gap-2 text-sm text-subtle">
              <input
                type="checkbox"
                checked={temporary}
                onChange={(e) => setTemporary(e.target.checked)}
              />
              Vaqtinchalik
            </label>
          </div>
          <input
            value={workflowFamily}
            onChange={(e) => setWorkflowFamily(e.target.value)}
            className={inputCls}
            placeholder="Ish oqimi oilasi (masalan: Sotuv, Qayta aloqa)"
          />
          <input
            value={conversationDomain}
            onChange={(e) => setConversationDomain(e.target.value)}
            className={inputCls}
            placeholder="Suhbat domeni (masalan: Sotuv, Sotuvdan keyingi jarayon)"
          />
          <input
            value={exclusionReason}
            onChange={(e) => setExclusionReason(e.target.value)}
            className={inputCls}
            placeholder="Chiqarish sababi (agar 'Baholanadi' o'chirilgan bo'lsa)"
          />
          <button
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Saqlash
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`"${category.name}" o'chirilsinmi?`}
        description="Ushbu oilaga bog'langan bosqichlar kategoriyasiz qoladi."
        onConfirm={() => void remove()}
      />
    </div>
  );
}

// Transcribed verbatim from the admin's own screenshots of this org's
// previously configured call families -- same one-click, empty-state-only
// loading pattern as STARTER_RUBRIC above.
const STARTER_FAMILIES: {
  name: string;
  description: string;
  workflowFamily: string;
  conversationDomain: string | null;
  exclusionReason: string | null;
  scored: boolean;
}[] = [
  {
    name: "Yechim taqdimoti",
    description: "O'quv dasturi, dars o'tish uslubi va kutilayotgan natijalarni tushuntirish.",
    workflowFamily: "Taklif va yechim taqdimoti",
    conversationDomain: "Sotuv",
    exclusionReason: null,
    scored: true,
  },
  {
    name: "Qayta faollashtirish",
    description: "Avval qiziqish bildirgan lekin to'xtab qolgan o'quvchilarni qayta jalb qilish.",
    workflowFamily: "Qayta faollashtirish",
    conversationDomain: "Sotuv",
    exclusionReason: null,
    scored: true,
  },
  {
    name: "Lidni aniqlashtirish",
    description: "Mijozning til o'rganish maqsadi, darajasi va kursga mosligini aniqlash.",
    workflowFamily: "Lidni aniqlashtirish",
    conversationDomain: "Sotuv",
    exclusionReason: null,
    scored: true,
  },
  {
    name: "Mijoz bo'yicha qayta aloqa",
    description:
      "Telegramga yuborilgan ma'lumotlardan so'ng qarorni aniqlash uchun qayta bog'lanish.",
    workflowFamily: "Qayta aloqa",
    conversationDomain: "Sotuv",
    exclusionReason: null,
    scored: true,
  },
  {
    name: "Yopish / muzokara",
    description:
      "Narx bo'yicha kelishish, 'qimmat' yoki 'ishonchsizlik' kabi e'tirozlar bilan ishlash.",
    workflowFamily: "Yopish va muzokara",
    conversationDomain: "Sotuv",
    exclusionReason: null,
    scored: true,
  },
  {
    name: "Ulanmagan aloqa",
    description: "Go'shak ko'tarilmagan, band yoki xizmat doirasidan tashqaridagi qo'ng'iroqlar.",
    workflowFamily: "Bog'lanilmagan aloqa",
    conversationDomain: null,
    exclusionReason: "Bog'lanib bo'lmadi",
    scored: false,
  },
  {
    name: "To'lov bo'yicha aloqa",
    description: "Birlamchi to'lov (predoplata), to'liq to'lov bilan kelishuv.",
    workflowFamily: "Moliya va hujjatlar",
    conversationDomain: null,
    exclusionReason: "Sotuv jarayoni bo'lmaydi",
    scored: false,
  },
];

function CallFamiliesTab() {
  const canManage = useCanManage();
  const { user } = useAuth();
  const { data: items = [], isLoading } = useCallCategories();
  const createItem = useCreateCallCategory();
  const [name, setName] = useState("");
  const [seeding, setSeeding] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createItem.mutateAsync({
        organization_id: user!.organizationId!,
        name: name.trim(),
        position: items.length,
      });
      setName("");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    }
  }

  async function loadStarterFamilies() {
    setSeeding(true);
    try {
      for (let i = 0; i < STARTER_FAMILIES.length; i++) {
        const f = STARTER_FAMILIES[i]!;
        await createItem.mutateAsync({
          organization_id: user!.organizationId!,
          name: f.name,
          description: f.description,
          workflow_family: f.workflowFamily,
          conversation_domain: f.conversationDomain,
          exclusion_reason: f.exclusionReason,
          scored: f.scored,
          system_family: true,
          position: i,
        });
      }
      toast.success("Standart qo'ng'iroq oilalari yuklandi");
    } catch (err) {
      toast.error(errorMessage(err, "Yuklab bo'lmadi"));
    } finally {
      setSeeding(false);
    }
  }

  const scoredItems = items.filter((c) => c.scored);
  const unscoredItems = items.filter((c) => !c.scored);

  return (
    <SectionCard
      title="Qo'ng'iroq oilalari"
      description="AI qo'ng'iroqlarni to'g'ri turga ajratishi va qaysi suhbatlar baholash mezoni bilan baholanishini belgilovchi ro'yxat."
      actions={
        canManage && (
          <form onSubmit={(e) => void add(e)} className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Yangi oila nomi"
              className="h-10 w-56 rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            />
            <button
              type="submit"
              disabled={createItem.isPending || !name.trim()}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {createItem.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Qo'ng'iroq oilasini qo'shish
            </button>
          </form>
        )
      }
    >
      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
        </div>
      )}
      {!isLoading && (
        <p className="mb-4 border-b border-border pb-4 text-sm text-subtle">
          {items.length} ta qo'ng'iroq oilasi sozlangan
        </p>
      )}
      {canManage && !isLoading && items.length === 0 && (
        <button
          type="button"
          onClick={() => void loadStarterFamilies()}
          disabled={seeding}
          className="mb-4 inline-flex h-10 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
        >
          {seeding && <Loader2 className="h-4 w-4 animate-spin" />}
          Standart oilalarni yuklash (7 ta)
        </button>
      )}
      {!isLoading && items.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">Hali oila qo'shilmagan.</p>
      )}
      {scoredItems.length > 0 && (
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-success">
              Baholanadigan qo'ng'iroqlar
            </p>
            <Pill tone="success">{scoredItems.length} ta oila</Pill>
          </div>
          <p className="mb-2 text-sm text-subtle">
            Baholash mezonlari bilan baholanadigan qo'ng'iroq oilalari shu yerda ko'rinadi.
          </p>
          <div className="space-y-3">
            {scoredItems.map((c) => (
              <CallFamilyRow key={c.id} category={c} canManage={canManage} />
            ))}
          </div>
        </div>
      )}
      {unscoredItems.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
              Baholanmaydigan qo'ng'iroqlar
            </p>
            <Pill tone="neutral">{unscoredItems.length} ta oila</Pill>
          </div>
          <p className="mb-2 text-sm text-subtle">
            Baholash mezonidan chiqarilgan operatsion yoki boshqa oqimlarga tegishli oilalar shu
            yerda ko'rinadi.
          </p>
          <div className="space-y-3">
            {unscoredItems.map((c) => (
              <CallFamilyRow key={c.id} category={c} canManage={canManage} />
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/* ===================================================================== */
/* Tab 5 — Lid sifati bosqichlari                                         */
/* ===================================================================== */

// Transcribed verbatim from the admin's own screenshot -- the mandatory
// system "Yaroqsiz lid" catch-all (position 999, system_locked) already
// exists for every org via migration, so it's deliberately left out here.
const STARTER_LEAD_QUALITY_STAGES: { title: string; conditions: string[]; qualified: boolean }[] = [
  {
    title: "To'lov qilingan, chek yuborilgan, darsga kirishga tayyor",
    conditions: [
      "To'lov amalga oshirilganligi haqida ma'lumot berildi",
      "To'lov cheki botga yoki menejerga yuborildi",
      "Bonuslar va asosiy dars kanallariga kirish huquqi berilmoqda",
    ],
    qualified: true,
  },
  {
    title: "Motivatsiya yuqori, to'lov kuni aniq belgilangan",
    conditions: [
      "Bepul dars ko'rilganligi tasdiqlandi",
      "To'lov miqdori va muddati (masalan, 5-sana yoki 10-sana) kelishildi",
      "Mijoz darslar boshlanish sanasidan xabardor va qo'shilishga tayyor",
    ],
    qualified: true,
  },
  {
    title: "Ehtiyoj aniq, oila a'zolari bilan maslahatlashadi",
    conditions: [
      "Nega o'rganmoqchiligi va motivatsiyasi aniqlandi",
      "Turmush o'rtog'i yoki ota-onasi bilan maslahatlashishini aytdi",
      "Qaror qabul qiluvchi shaxsning roziligi kutilmoqda",
    ],
    qualified: true,
  },
  {
    title: "O'rganish istagi bor, vaqt yoki mablag' yetishmaydi",
    conditions: [
      "Mijoz kurs haqida ma'lumot oldi",
      "Hozirda puli yo'qligini yoki oylik kutayotganini bildirdi",
      "Vaqti yo'qligi sababli keyingi oylarda o'qishini aytdi",
    ],
    qualified: true,
  },
  {
    title: "Aloqa yo'q, noto'g'ri raqam, qiziqish bildirmadi",
    conditions: [
      "Mijoz qo'ng'iroqqa javob bermadi",
      "Raqam noto'g'ri tushgan",
      "Mijoz kursga qiziqmasligini va boshqa bezovta qilmaslikni so'radi",
    ],
    qualified: false,
  },
];

function LeadQualityTab() {
  const canManage = useCanManage();
  const { user } = useAuth();
  const { data: items = [], isLoading } = useLeadQualityStages();
  const createItem = useCreateLeadQualityStage();
  const updateItem = useUpdateLeadQualityStage();
  const deleteItem = useDeleteLeadQualityStage();
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editConditions, setEditConditions] = useState("");
  const [editQualified, setEditQualified] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<LeadQualityStageRow | null>(null);
  const [seeding, setSeeding] = useState(false);

  const sorted = [...items].sort((a, b) => a.position - b.position);
  const movable = sorted.filter((s) => !s.system_locked);
  const locked = sorted.filter((s) => s.system_locked);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await createItem.mutateAsync({
        organization_id: user!.organizationId!,
        title: title.trim(),
        qualified: true,
        position: movable.length,
      });
      setTitle("");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    }
  }

  async function loadStarterStages() {
    setSeeding(true);
    try {
      for (let i = 0; i < STARTER_LEAD_QUALITY_STAGES.length; i++) {
        const s = STARTER_LEAD_QUALITY_STAGES[i]!;
        await createItem.mutateAsync({
          organization_id: user!.organizationId!,
          title: s.title,
          conditions: s.conditions,
          qualified: s.qualified,
          position: i,
        });
      }
      toast.success("Standart bosqichlar yuklandi");
    } catch (err) {
      toast.error(errorMessage(err, "Yuklab bo'lmadi"));
    } finally {
      setSeeding(false);
    }
  }

  async function save(id: string) {
    try {
      await updateItem.mutateAsync({
        id,
        patch: {
          title: editTitle.trim(),
          conditions: linesToArray(editConditions),
          qualified: editQualified,
        },
      });
      setEditingId(null);
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    }
  }

  async function remove(id: string) {
    try {
      await deleteItem.mutateAsync(id);
      toast.success("O'chirildi");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    } finally {
      setConfirmDelete(null);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= movable.length) return;
    const a = movable[index]!;
    const b = movable[target]!;
    try {
      await Promise.all([
        updateItem.mutateAsync({ id: a.id, patch: { position: b.position } }),
        updateItem.mutateAsync({ id: b.id, patch: { position: a.position } }),
      ]);
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    }
  }

  function renderRow(stage: LeadQualityStageRow, index: number | null) {
    const isEditing = editingId === stage.id;
    return (
      <li key={stage.id} className="rounded-xl border border-border bg-accent px-4 py-3">
        {isEditing ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className={inputCls}
            />
            <textarea
              value={editConditions}
              onChange={(e) => setEditConditions(e.target.value)}
              rows={3}
              placeholder="Shartlar (har birini yangi qatorga)"
              className={textareaCls}
            />
            <label className="flex items-center gap-2 text-sm text-subtle">
              <input
                type="checkbox"
                checked={editQualified}
                onChange={(e) => setEditQualified(e.target.checked)}
              />
              Sifatli lid hisoblanadi
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void save(stage.id)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Check className="h-3.5 w-3.5" /> Saqlash
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs font-medium text-subtle hover:bg-accent"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-subtle">
                {index !== null ? index + 1 : movable.length + 1}
              </span>
              <div>
                <p className="text-base font-semibold text-foreground">{stage.title}</p>
                {stage.conditions.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-sm text-subtle">
                    {stage.conditions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-1.5">
                  <Pill tone={stage.qualified ? "success" : "warning"}>
                    {stage.qualified ? "Sifatli" : "Sifatsiz"}
                  </Pill>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {canManage && index !== null && (
                <div className="flex flex-col">
                  <button
                    onClick={() => void move(index, -1)}
                    disabled={index === 0}
                    className="text-subtle hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => void move(index, 1)}
                    disabled={index === movable.length - 1}
                    className="text-subtle hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
              )}
              {stage.system_locked ? (
                <span
                  className="rounded-lg p-2 text-subtle/50"
                  title="Tizimli bosqich o'zgartirilmaydi"
                >
                  <Lock className="h-3.5 w-3.5" />
                </span>
              ) : (
                canManage && (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(stage.id);
                        setEditTitle(stage.title);
                        setEditConditions(stage.conditions.join("\n"));
                        setEditQualified(stage.qualified);
                      }}
                      className="rounded-lg p-2 text-subtle hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(stage)}
                      className="rounded-lg p-2 text-subtle hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )
              )}
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <SectionCard
      title="Lid sifati bosqichlari"
      actions={<Pill tone="success">Bosqichli baholash</Pill>}
    >
      <p className="mb-4 -mt-2 text-sm text-muted-foreground">
        Kelajakdagi lid sifati qarorlarida AI ishlatadigan bosqichlarni sozlang. Eski raqamli
        natijalar o'zgarmaydi.
      </p>
      {canManage && (
        <form onSubmit={(e) => void add(e)} className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Yangi bosqich nomi"
            className={cn(inputCls, "min-w-[220px] flex-1")}
          />
          <button
            type="submit"
            disabled={createItem.isPending || !title.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {createItem.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Bosqich qo'shish
          </button>
        </form>
      )}
      {canManage && !isLoading && movable.length === 0 && (
        <button
          type="button"
          onClick={() => void loadStarterStages()}
          disabled={seeding}
          className="mb-4 inline-flex h-10 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
        >
          {seeding && <Loader2 className="h-4 w-4 animate-spin" />}
          Standart bosqichlarni yuklash (5 ta)
        </button>
      )}
      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
        </div>
      )}
      <ul className="space-y-2">
        {movable.map((s, i) => renderRow(s, i))}
        {locked.map((s) => renderRow(s, null))}
      </ul>
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={confirmDelete ? `"${confirmDelete.title}" o'chirilsinmi?` : ""}
        description="Bu amalni ortga qaytarib bo'lmaydi."
        onConfirm={() => confirmDelete && void remove(confirmDelete.id)}
      />
    </SectionCard>
  );
}

/* ===================================================================== */
/* Tab 6 — AI ko'rsatmalari                                                */
/* ===================================================================== */

function TagInput({
  values,
  onChange,
  disabled,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
          >
            {v}
            {!disabled && (
              <button
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`${v} olib tashlash`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        disabled={disabled}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  );
}

function GuidanceField({
  label,
  value,
  onChange,
  disabled,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm text-muted-foreground">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder}
        className={textareaCls}
      />
    </div>
  );
}

const AI_INSTRUCTIONS_DEFAULTS = {
  transcriptTerms: [] as string[],
  transcriptGuidance: "",
  companyContext: "",
  extractionGuidance: "",
  taskCreationGuidance: "",
  violationGuidance: "",
  coachingGuidance: "",
  scoringFocusGuidance: "",
  qualifiedLeadGuidance: "",
};

// Transcribed verbatim from the admin's own screenshot of this org's
// previously configured AI instructions -- same one-click, empty-state-
// only loading pattern as STARTER_RUBRIC/STARTER_FAMILIES above.
const AI_INSTRUCTIONS_STARTER: typeof AI_INSTRUCTIONS_DEFAULTS = {
  transcriptTerms: ["rus tili kursi", "it kursi", "amocrm"],
  transcriptGuidance:
    "Xizmat yo'nalishlarini aralashtirmang: Rus tili kursi, IT kursi alohida ma'noga ega. Transkriptda qaysi yo'nalish aytilgan bo'lsa, o'shani saqlang; boshqa yo'nalishga umumlashtirmang.",
  companyContext:
    "Rus tili va IT bo'yicha onlayn kurslar sotuvi. Asosiy xizmat yo'nalishlari: Rus tili kursi, IT kursi. Lid manbalari: Telegram kanal.",
  extractionGuidance:
    "Suhbat qaysi yo'nalish bilan bog'liqligini ajrating: Rus tili kursi, IT kursi. Transcriptda aytilsa albatta ajrating: Nega o'rganmoqchiligi, Qanchadan beri o'rganmoqchiligi, Nimalar qilib ko'rgani, O'rgansa nimalar o'zgarishi. Team size ma'lumoti transcriptdan doim chiqmaydi; bu maydon bo'yicha taxmin qilmang. CRM savollari uchun faqat transcriptda aniq aytilgan kontekstni to'ldiring; taxmin qilmang.",
  taskCreationGuidance:
    "Ixtiyoriy. Masalan: faqat mijoz bilan kelishilgan keyingi qadamlar uchun vazifa yaratsin, qayta qo'ng'iroq uchun esa qo'ng'iroq vazifasini tanlasin. Standart qoidalar uchun bo'sh qoldiring.",
  violationGuidance:
    "Bo'lmasligi kerak: 100% natija kafolatini berish, Dars yoqmasa pulingiz qaytariladi deb va'da berish.",
  coachingGuidance:
    "Yaxshi suhbat belgilari: Ehtiyojni chuqur aniqlash, E'tirozlarga to'g'ri yechim berish, Sotuvni yopish. Zaif suhbat belgilari: E'tirozga yechim berolmaslik, Ehtiyojlarni chuqur aniqlamaslik, Mijozga xato javob berish.",
  scoringFocusGuidance:
    "Quyidagi yo'nalish/oilalarni savdo bahosidan chiqarish kerak: Muammoli mijozlar bilan ishlash (servis qo'ng'iroqlari). Aralash xizmat biznesi: qo'ng'iroqda tilga olingan yo'nalish bo'yicha baholang; boshqa xizmat tilga olinmagan bo'lsa penalti bermang.",
  qualifiedLeadGuidance:
    "Sifatli lid ta'rifi: Bepul darsni ko'rgan va aniq o'rganish motivatsiyasiga ega bo'lgan shaxslar.",
};

function isAiInstructionsEmpty(form: typeof AI_INSTRUCTIONS_DEFAULTS): boolean {
  return (
    form.transcriptTerms.length === 0 &&
    !form.transcriptGuidance &&
    !form.companyContext &&
    !form.extractionGuidance &&
    !form.taskCreationGuidance &&
    !form.violationGuidance &&
    !form.coachingGuidance &&
    !form.scoringFocusGuidance &&
    !form.qualifiedLeadGuidance
  );
}

function AiInstructionsTab() {
  const canManage = useCanManage();
  const { data: agents, isLoading } = useAiAgents();
  const updateAgent = useUpdateAiAgent();
  const agent = agents?.find((a) => a.kind === "call");
  const stored = asRecord(asRecord(agent?.call_instructions)["aiInstructions"]);

  const [form, setForm] = useState(AI_INSTRUCTIONS_DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agent) return;
    setForm({
      transcriptTerms: asStringArray(stored["transcriptTerms"]),
      transcriptGuidance: asString(stored["transcriptGuidance"]),
      companyContext: asString(stored["companyContext"]),
      extractionGuidance: asString(stored["extractionGuidance"]),
      taskCreationGuidance: asString(stored["taskCreationGuidance"]),
      violationGuidance: asString(stored["violationGuidance"]),
      coachingGuidance: asString(stored["coachingGuidance"]),
      scoringFocusGuidance: asString(stored["scoringFocusGuidance"]),
      qualifiedLeadGuidance: asString(stored["qualifiedLeadGuidance"]),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(values: typeof form = form) {
    setSaving(true);
    try {
      const existing = asRecord(agent?.call_instructions);
      await updateAgent.mutateAsync({
        kind: "call",
        call_instructions: { ...existing, aiInstructions: values },
      });
      toast.success("Saqlandi");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    } finally {
      setSaving(false);
    }
  }

  async function loadStarter() {
    setForm(AI_INSTRUCTIONS_STARTER);
    await save(AI_INSTRUCTIONS_STARTER);
  }

  return (
    <SectionCard
      title="AI ko'rsatmalari"
      description="Bu maydonlar AI'ga ko'rinadi va transkripsiya, anketa, vazifa yaratish hamda baholash natijasiga ta'sir qiladi."
      actions={
        canManage && (
          <div className="flex items-center gap-2">
            {isAiInstructionsEmpty(form) && (
              <button
                onClick={() => void loadStarter()}
                disabled={saving}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Standart ko'rsatmalarni yuklash
              </button>
            )}
            <button
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Saqlash
            </button>
          </div>
        )
      }
    >
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-accent p-4">
            <p className="mb-3 text-base font-semibold text-foreground">
              1-bosqich: Transkripsiya sifati
            </p>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-sm text-muted-foreground">
                  Qaysi atamalarni aynan shu ko'rinishda yozsin?
                </p>
                <TagInput
                  values={form.transcriptTerms}
                  onChange={(v) => set("transcriptTerms", v)}
                  disabled={!canManage}
                  placeholder="Masalan: mahsulot nomlari, brendlar, qisqartmalar"
                />
              </div>
              <GuidanceField
                label="Transkripsiyada nimalarni hisobga olsin?"
                value={form.transcriptGuidance}
                onChange={(v) => set("transcriptGuidance", v)}
                disabled={!canManage}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-accent p-4">
            <p className="mb-3 text-base font-semibold text-foreground">
              2-bosqich: Anketa va ma'lumot ajratish
            </p>
            <div className="space-y-3">
              <GuidanceField
                label="Kompaniyangiz haqida nimalarni bilishi kerak?"
                value={form.companyContext}
                onChange={(v) => set("companyContext", v)}
                disabled={!canManage}
              />
              <GuidanceField
                label="Qo'ng'iroqdan aynan nimalarni ajratib olsin?"
                value={form.extractionGuidance}
                onChange={(v) => set("extractionGuidance", v)}
                disabled={!canManage}
              />
              <GuidanceField
                label="AI vazifalarni qanday yaratishi kerak?"
                value={form.taskCreationGuidance}
                onChange={(v) => set("taskCreationGuidance", v)}
                disabled={!canManage}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-accent p-4">
            <p className="mb-3 text-base font-semibold text-foreground">
              3-bosqich: Baholash va coaching
            </p>
            <div className="space-y-3">
              <GuidanceField
                label="Qaysi holatlarni qoida buzilgan deb hisoblansin?"
                value={form.violationGuidance}
                onChange={(v) => set("violationGuidance", v)}
                disabled={!canManage}
              />
              <GuidanceField
                label="Menejerga qanday tavsiyalar bersin?"
                value={form.coachingGuidance}
                onChange={(v) => set("coachingGuidance", v)}
                disabled={!canManage}
              />
              <GuidanceField
                label="Baholashda nimaga ko'proq e'tibor bersin?"
                value={form.scoringFocusGuidance}
                onChange={(v) => set("scoringFocusGuidance", v)}
                disabled={!canManage}
              />
              <GuidanceField
                label="Bu biznes uchun sifatli lid qanday bo'ladi?"
                value={form.qualifiedLeadGuidance}
                onChange={(v) => set("qualifiedLeadGuidance", v)}
                disabled={!canManage}
              />
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/* ===================================================================== */
/* Tab 7 — Lid analitikasi                                                */
/* ===================================================================== */

const LEAD_ANALYTICS_DEFAULTS = {
  businessContext: "",
  lossAnalysisGuidance: "",
  recommendationGuidance: "",
};

function LeadAnalyticsTab() {
  const canManage = useCanManage();
  const { data: agents, isLoading } = useAiAgents();
  const updateAgent = useUpdateAiAgent();
  const agent = agents?.find((a) => a.kind === "call");
  const stored = asRecord(asRecord(agent?.call_instructions)["leadAnalytics"]);

  const [form, setForm] = useState(LEAD_ANALYTICS_DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agent) return;
    setForm({
      businessContext: asString(stored["businessContext"]),
      lossAnalysisGuidance: asString(stored["lossAnalysisGuidance"]),
      recommendationGuidance: asString(stored["recommendationGuidance"]),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const existing = asRecord(agent?.call_instructions);
      await updateAgent.mutateAsync({
        kind: "call",
        call_instructions: { ...existing, leadAnalytics: form },
      });
      toast.success("Saqlandi");
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Lid analitikasi"
      description="Bu maydonlar AI'ga ko'rinadi va lid yo'qotilish sabablari hamda tavsiyalarni qanday yozishini boshqaradi."
      actions={
        canManage && (
          <button
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Saqlash
          </button>
        )
      }
    >
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
        </div>
      ) : (
        <div className="space-y-4">
          <GuidanceField
            label="Lidlar qaysi biznes kontekstida baholansin?"
            value={form.businessContext}
            onChange={(v) => set("businessContext", v)}
            disabled={!canManage}
            placeholder="Mahsulot, xizmat, auditoriya va savdo sikli haqida qisqacha yozing..."
          />
          <GuidanceField
            label="Yo'qotilgan lidni qanday tahlil qilsin?"
            value={form.lossAnalysisGuidance}
            onChange={(v) => set("lossAnalysisGuidance", v)}
            disabled={!canManage}
            placeholder="Masalan: narx, vaqt, qayta aloqa, raqobatchi yoki ehtiyoj mosligi bo'yicha nimalarga qarasin..."
          />
          <GuidanceField
            label="Menejer uchun qaysi tavsiyalarni ajratib ko'rsatsin?"
            value={form.recommendationGuidance}
            onChange={(v) => set("recommendationGuidance", v)}
            disabled={!canManage}
            placeholder="Masalan: keyingi safar nimani boshqacha qilish va qaysi ko'nikmalarni kuchaytirish kerakligini yozing..."
          />
        </div>
      )}
    </SectionCard>
  );
}

/* ===================================================================== */
/* Tab 8 — CRM natija bosqichlari (won/lost analytics override)           */
/* ===================================================================== */

type PipelineStageRow = ReturnType<typeof usePipelineStagesRaw>["data"] extends
  (infer T)[] | undefined
  ? T
  : never;

function OutcomeOverrideGroup({
  title,
  countLabel,
  description,
  tone,
  stages,
  overrideKey,
  canManage,
}: {
  title: string;
  countLabel: string;
  description: string;
  tone: "success" | "danger";
  stages: PipelineStageRow[];
  overrideKey: "counts_as_won_override" | "counts_as_lost_override";
  canManage: boolean;
}) {
  const updateStage = useUpdateStage();
  const [expanded, setExpanded] = useState(false);
  const count = stages.filter((s) => s[overrideKey]).length;

  async function toggle(stageId: string, checked: boolean) {
    try {
      await updateStage.mutateAsync({ id: stageId, patch: { [overrideKey]: checked } });
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    }
  }

  return (
    <div className="rounded-xl border border-border bg-accent p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-foreground">{title}</p>
            <Pill tone={tone}>
              {countLabel}: {count}
            </Pill>
          </div>
          <p className="mt-1 text-sm text-subtle">{description}</p>
        </div>
        <Switch
          checked={expanded}
          onCheckedChange={setExpanded}
          disabled={!canManage}
          className="mt-0.5 shrink-0"
        />
      </div>
      {expanded && (
        <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
          {stages.length === 0 && (
            <p className="text-sm text-subtle">Faol (yopilmagan) bosqichlar yo'q.</p>
          )}
          {stages.map((stage) => (
            <li
              key={stage.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm text-foreground">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                {stage.name}
              </span>
              <Switch
                checked={stage[overrideKey]}
                onCheckedChange={(v) => void toggle(stage.id, v)}
                disabled={!canManage}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OutcomesTab() {
  const canManage = useCanManage();
  const { data: stages = [], isLoading } = usePipelineStagesRaw();
  const activeStages = stages.filter((s) => !s.is_won && !s.is_lost);

  return (
    <SectionCard
      title="CRM natija bosqichlari"
      description="CRMda yopilmay qoladigan bosqichlarni analitikada yutilgan (won) yoki yutqazilgan (lost) sifatida hisoblashni sozlang. CRMdagi lid statusi o'zgarmaydi."
    >
      <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-4">
        <p className="text-sm font-semibold text-warning-foreground">
          Lidlar CRMda yopilmay qolsa ishlating
        </p>
        <p className="mt-1 text-xs text-warning-foreground/90">
          Agar jamoangiz lidlarni CRMda to'g'ri yutilgan (won) yoki yutqazilgan (lost) qilib yopsa,
          bu sozlamalarni yoqmang. Tanlangan bosqichlar faqat hisobot, analitika va konversiya
          raqamlariga ta'sir qiladi.
        </p>
      </div>
      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <OutcomeOverrideGroup
          title="Yutilgan (won) sifatida hisoblanadigan bosqichlar"
          countLabel="Yutilgan (won)"
          description="CRMdagi rasmiy yutilgan (won) lidlar doim hisoblanadi. Quyidagi bosqichlarda turgan faol lidlar ham analitikada yutilgan (won) sifatida qo'shiladi."
          tone="success"
          stages={activeStages}
          overrideKey="counts_as_won_override"
          canManage={canManage}
        />
        <OutcomeOverrideGroup
          title="Yutqazilgan (lost) sifatida hisoblanadigan bosqichlar"
          countLabel="Yutqazilgan (lost)"
          description="CRMdagi rasmiy yutqazilgan (lost) lidlar doim hisoblanadi. Quyidagi bosqichlarda turgan faol lidlar ham analitikada yutqazilgan (lost) sifatida qo'shiladi."
          tone="danger"
          stages={activeStages}
          overrideKey="counts_as_lost_override"
          canManage={canManage}
        />
      </div>
    </SectionCard>
  );
}

/* ===================================================================== */
/* Page shell                                                              */
/* ===================================================================== */

const TAB_LABEL: Record<Tab, string> = {
  rubric: "Baholash mezonlari",
  intake: "Anketa savollari",
  services: "Xizmat yo'nalishlari",
  families: "Qo'ng'iroq oilalari",
  leadQuality: "Lid sifati bosqichlari",
  aiInstructions: "AI ko'rsatmalari",
  leadAnalytics: "Lid analitikasi",
  outcomes: "CRM natija bosqichlari",
};

function ScoringCriteriaPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { tab: tabParam } = Route.useSearch();
  const tab: Tab = tabParam ?? "rubric";

  if (
    user &&
    user.role !== "super_admin" &&
    user.role !== "rop" &&
    user.role !== "platform_owner"
  ) {
    return (
      <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  return (
    <SettingsLayout>
      <SettingsTabbedLayout activeKey={tab}>
        <PageHeader
          title={TAB_LABEL[tab]}
          description="AI qo'ng'iroq tahlili qanday ishlashini shu yerdan sozlang: mezonlar, savollar, yo'riqnomalar."
        />
        {tab === "rubric" && <RubricTab />}
        {tab === "intake" && <IntakeQuestionsTab />}
        {tab === "services" && <ServiceLinesTab />}
        {tab === "families" && <CallFamiliesTab />}
        {tab === "leadQuality" && <LeadQualityTab />}
        {tab === "aiInstructions" && <AiInstructionsTab />}
        {tab === "leadAnalytics" && <LeadAnalyticsTab />}
        {tab === "outcomes" && <OutcomesTab />}
      </SettingsTabbedLayout>
    </SettingsLayout>
  );
}
