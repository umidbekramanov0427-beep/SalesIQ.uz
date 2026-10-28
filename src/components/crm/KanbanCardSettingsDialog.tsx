import { useEffect, useState, type ReactNode } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KanbanLeadCard } from "@/components/crm/KanbanLeadCard";
import { cardFieldLabel, type CardCtx } from "@/components/crm/kanban-card-fields";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import {
  ALL_FUNNELS_LAYOUT,
  KANBAN_COMPANY_FIELDS,
  KANBAN_CONTACT_FIELDS,
  KANBAN_LEAD_FIELDS,
  kanbanCardLayout,
  kanbanCardLayouts,
  useLeadCustomFieldDefs,
  useOrgGeneralSettings,
  usePermission,
  useUpdateOrgGeneralSettings,
  type CrmLeadView,
  type KanbanCardLayout,
  type KanbanCardSlot,
} from "@/hooks/use-crm-data";

// amoCRM's "Внешний вид карточки": the card drawn as a set of dropdowns,
// one per slot, in the order they appear on the board -- pick what each
// line shows, see a real lead rendered with it, save for this funnel or
// for all of them.

const SAMPLE: CrmLeadView = {
  id: "sample",
  name: "Sayt orqali so'rov",
  initials: "SO",
  company: "",
  companyId: "",
  position: "Direktor",
  phone: "+998 90 123 45 67",
  altPhone: "",
  email: "client@example.com",
  telegram: "@client",
  source: "Instagram",
  campaign: "",
  stream: "",
  utm: "",
  owner: "Aziz Karimov",
  ownerId: "",
  manager: "",
  managerId: null,
  contactId: null,
  contactName: "Dilnoza Rahimova",
  priority: "Normal",
  score: 0,
  temperature: "Warm",
  budget: 0,
  expectedRevenue: 4_500_000,
  country: "",
  region: "",
  city: "",
  address: "",
  stage: "",
  stageId: "",
  stageIsWon: false,
  stageIsLost: false,
  funnel: "",
  nextFollowUp: "",
  nextFollowUpIso: null,
  lastContact: "",
  lastContactIso: null,
  created: "",
  createdAtIso: new Date().toISOString(),
  updated: "",
  updatedAtIso: new Date().toISOString(),
  tags: ["Yangi"],
  amocrmId: null,
  aiCustomerProfile: null,
  customFields: {},
  repeatCount: 0,
};

export function KanbanCardSettingsDialog({
  open,
  onOpenChange,
  funnel,
  leads,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  funnel: string;
  leads: CrmLeadView[];
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const canViewRevenue = usePermission("View revenue");
  const { data: orgSettings } = useOrgGeneralSettings();
  const { data: fieldDefs = [] } = useLeadCustomFieldDefs();
  const updateOrgSettings = useUpdateOrgGeneralSettings();

  const [draft, setDraft] = useState<KanbanCardLayout>(() => kanbanCardLayout(orgSettings, funnel));
  const [applyAll, setApplyAll] = useState(true);

  // Fresh from what's saved every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setDraft(kanbanCardLayout(orgSettings, funnel));
    setApplyAll(!kanbanCardLayouts(orgSettings)[funnel]);
  }, [open, orgSettings, funnel]);

  const ctx: CardCtx = {
    t,
    format,
    canViewRevenue,
    customLabels: Object.fromEntries(fieldDefs.map((d) => [d.key, d.label])),
    customTypes: Object.fromEntries(fieldDefs.map((d) => [d.key, d.field_type])),
  };
  // A lead that actually has a client name and phone shows the layout best.
  const sample = leads.find((l) => l.contactName && l.phone) ?? leads[0] ?? SAMPLE;

  const set = <K extends keyof KanbanCardLayout>(key: K, value: KanbanCardLayout[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    const current = (orgSettings?.kanban_card_fields as Record<string, unknown> | null) ?? {};
    const layouts = applyAll
      ? { [ALL_FUNNELS_LAYOUT]: draft }
      : { ...kanbanCardLayouts(orgSettings), [funnel]: draft };
    try {
      await updateOrgSettings.mutateAsync({ kanban_card_fields: { ...current, layouts } });
      toast.success(t("pipeline.cardLayout.saved"));
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, t("pipeline.cardFieldsSaveFailed")));
    }
  }

  const slotSelect = (slot: KanbanCardSlot, big = false) => (
    <select
      value={draft[slot]}
      onChange={(e) => set(slot, e.target.value)}
      aria-label={t(`pipeline.cardLayout.slot.${slot}`)}
      className={
        "w-full min-w-0 cursor-pointer truncate rounded-lg border border-input bg-background px-2.5 text-foreground outline-none transition-colors [color-scheme:light] hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:[color-scheme:dark] " +
        (big ? "h-10 text-[15px] font-semibold" : "h-9 text-[13px]")
      }
    >
      <option value="none">{t("pipeline.cardLayout.none")}</option>
      <optgroup label={t("pipeline.cardLayout.groupLead")}>
        {KANBAN_LEAD_FIELDS.map((f) => (
          <option key={f} value={f}>
            {cardFieldLabel(f, ctx)}
          </option>
        ))}
        {fieldDefs.map((d) => (
          <option key={d.key} value={`custom:${d.key}`}>
            {d.label}
          </option>
        ))}
      </optgroup>
      <optgroup label={t("pipeline.cardLayout.groupContact")}>
        {KANBAN_CONTACT_FIELDS.map((f) => (
          <option key={f} value={f}>
            {cardFieldLabel(f, ctx)}
          </option>
        ))}
      </optgroup>
      <optgroup label={t("pipeline.cardLayout.groupCompany")}>
        {KANBAN_COMPANY_FIELDS.map((f) => (
          <option key={f} value={f}>
            {cardFieldLabel(f, ctx)}
          </option>
        ))}
      </optgroup>
    </select>
  );

  const toggle = (
    key: "showTask" | "showTags" | "showProfile" | "showLastMessage",
    label: string,
  ) => (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12.5px] font-medium text-foreground">
      <Checkbox checked={draft[key]} onCheckedChange={(v) => set(key, !!v)} />
      {label}
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" /> {t("pipeline.cardAppearance.title")}
          </DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-sm text-muted-foreground">{t("pipeline.cardLayout.desc")}</p>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
          {/* The card, drawn as its slots. */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-muted/40 px-3 py-2.5">
              {toggle("showProfile", t("pipeline.cardLayout.profile"))}
              {toggle("showLastMessage", t("pipeline.cardLayout.lastMessage"))}
            </div>
            <Slot n={1} label={t("pipeline.cardLayout.slot.top")}>
              {slotSelect("top")}
            </Slot>
            <Slot n={2} label={t("pipeline.cardLayout.slot.second")}>
              {slotSelect("second")}
            </Slot>
            <Slot n={3} label={t("pipeline.cardLayout.slot.title")}>
              {slotSelect("title", true)}
            </Slot>
            <Slot n={4} label={t("pipeline.cardLayout.slot.line")}>
              {slotSelect("line")}
            </Slot>
            <div className="mt-3 pl-7">{toggle("showTags", t("pipeline.cardField.tags"))}</div>
            <div className="mt-3 border-t border-border pt-1">
              <Slot n={5} label={t("pipeline.cardLayout.slot.footer")}>
                {slotSelect("footer")}
              </Slot>
              <div className="mt-3 flex items-center gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/12 text-[10.5px] font-bold text-primary">
                  6
                </span>
                {toggle("showTask", t("pipeline.cardLayout.task"))}
              </div>
            </div>
          </div>

          {/* What it'll look like, on a real lead from this funnel. */}
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
              {t("pipeline.cardLayout.preview")}
            </p>
            <div className="rounded-xl border border-border bg-card p-3 text-[13px]">
              <KanbanLeadCard lead={sample} layout={draft} ctx={ctx} preview />
            </div>
            <label className="mt-auto flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3">
              <Checkbox
                className="mt-0.5"
                checked={applyAll}
                onCheckedChange={(v) => setApplyAll(!!v)}
              />
              <span className="text-[13px] leading-snug">
                <span className="block font-semibold text-foreground">
                  {t("pipeline.cardLayout.applyAll")}
                </span>
                <span className="text-muted-foreground">
                  {applyAll
                    ? t("pipeline.cardLayout.applyAllHint")
                    : t("pipeline.cardLayout.onlyFunnel", { name: funnel })}
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={updateOrgSettings.isPending}>
            {t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Slot({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/12 text-[10.5px] font-bold normal-case tracking-normal text-primary">
          {n}
        </span>
        {label}
      </p>
      <div className="pl-7">{children}</div>
    </div>
  );
}
