import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ShieldAlert, LayoutList, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { describeError } from "@/lib/utils";
import {
  getLeadInfoFieldOrder,
  getLeadWorkspaceSectionOrder,
  isLeadSectionVisible,
  useOrgGeneralSettings,
  useUpdateOrgGeneralSettings,
  type LeadInfoFieldKey,
  type LeadWorkspaceSectionKey,
} from "@/hooks/use-crm-data";
import { CrmGate } from "@/components/CrmGate";
import { LeadFieldsEditor } from "@/components/admin/LeadFieldsEditor";

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
  component: () => (
    <CrmGate>
      <AdminLeadFieldsPage />
    </CrmGate>
  ),
});

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
    <SectionCard
      title={t("leadFields.sectionsTitle")}
      icon={LayoutList}
      tone="violet"
      description={t("leadFields.sectionsDesc")}
    >
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
      icon={ListChecks}
      tone="slate"
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
  return (
    <>
      <AdminBackLink />
      <PageHeader
        title={t("leadFields.title")}
        icon={ListChecks}
        tone="violet"
        description={t("leadFields.desc")}
      />

      <div className="space-y-5">
        <LeadFieldsEditor />

        <LeadInfoFieldsVisibilityCard />

        <LeadWorkspaceSectionsCard />
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
