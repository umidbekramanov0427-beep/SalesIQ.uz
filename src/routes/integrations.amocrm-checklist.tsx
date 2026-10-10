import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, RotateCcw, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { PermissionGate } from "@/components/PermissionGate";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import {
  useAmoOnboardingChecklist,
  useToggleAmoOnboardingChecklistItem,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/integrations/amocrm-checklist")({
  head: () => ({
    meta: [
      { title: "AmoCRM checklist — SalesIQ" },
      {
        name: "description",
        content: "Internal step-by-step checklist for connecting a new company's AmoCRM.",
      },
    ],
  }),
  component: AmoCrmChecklistPageGated,
});

function AmoCrmChecklistPageGated() {
  return (
    <PermissionGate action="Manage integrations">
      <AmoCrmChecklistPage />
    </PermissionGate>
  );
}

// Section content lives in i18n (amocrmChecklist.s<N>.*) -- this table only
// says which item keys exist per section, so the page and the translated
// strings can't drift out of sync with each other. Covers the full
// get-live journey (AI calibration through handoff), not just the AmoCRM
// wiring -- that's only sections 2-6.
const SECTIONS: { key: string; items: string[] }[] = [
  { key: "s1", items: ["i1", "i2", "i3"] },
  { key: "s2", items: ["i1", "i2"] },
  { key: "s3", items: ["i1", "i2", "i3", "i4"] },
  { key: "s4", items: ["i1", "i2", "i3"] },
  { key: "s5", items: ["i1", "i2", "i3"] },
  { key: "s6", items: ["i1", "i2"] },
  { key: "s7", items: ["i1", "i2", "i3"] },
  { key: "s8", items: ["i1", "i2", "i3"] },
  { key: "s9", items: ["i1", "i2", "i3"] },
  { key: "s10", items: ["i1", "i2", "i3"] },
  { key: "s11", items: ["i1", "i2"] },
  { key: "s12", items: ["i1", "i2"] },
  { key: "s13", items: ["i1", "i2"] },
  { key: "s14", items: ["i1", "i2"] },
  { key: "s15", items: ["i1", "i2", "i3"] },
  { key: "s16", items: ["i1", "i2"] },
];

const TOTAL_ITEMS = SECTIONS.reduce((sum, s) => sum + s.items.length, 0);

function AmoCrmChecklistPage() {
  const { t } = useI18n();
  const { data: checked = {} } = useAmoOnboardingChecklist();
  const toggle = useToggleAmoOnboardingChecklistItem();

  const checkedCount = Object.values(checked).filter(Boolean).length;

  async function onToggle(itemKey: string, next: boolean) {
    try {
      await toggle.mutateAsync({ itemKey, checked: next });
    } catch (err) {
      toast.error(describeError(err, t("common.saveFailed")));
    }
  }

  async function onReset() {
    try {
      await Promise.all(
        Object.entries(checked)
          .filter(([, v]) => v)
          .map(([key]) => toggle.mutateAsync({ itemKey: key, checked: false })),
      );
    } catch (err) {
      toast.error(describeError(err, t("common.saveFailed")));
    }
  }

  return (
    <>
      <PageHeader
        icon={ListChecks}
        tone="sky"
        title={t("amocrmChecklist.pageTitle")}
        description={t("amocrmChecklist.pageDesc")}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/integrations"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {t("amocrmChecklist.back")}
            </Link>
            <button
              type="button"
              onClick={() => void onReset()}
              disabled={checkedCount === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> {t("amocrmChecklist.reset")}
            </button>
          </div>
        }
      />

      <p className="mb-5 text-sm font-semibold text-foreground">
        {t("amocrmChecklist.progress", {
          checked: String(checkedCount),
          total: String(TOTAL_ITEMS),
        })}
      </p>

      <div className="space-y-4">
        {SECTIONS.map((section, i) => (
          <SectionCard
            key={section.key}
            title={`${i + 1}. ${t(`amocrmChecklist.${section.key}.title`)}`}
          >
            <ul className="space-y-2.5">
              {section.items.map((itemKey) => {
                const fullKey = `${section.key}.${itemKey}`;
                return (
                  <li key={itemKey}>
                    <label className="flex items-start gap-2.5 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={checked[fullKey] ?? false}
                        onChange={(e) => void onToggle(fullKey, e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                      />
                      <span
                        className={
                          checked[fullKey] ? "text-muted-foreground line-through" : undefined
                        }
                      >
                        {t(`amocrmChecklist.${section.key}.${itemKey}`)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
              {t(`amocrmChecklist.${section.key}.note`)}
            </p>
          </SectionCard>
        ))}
      </div>
    </>
  );
}
