import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/Primitives";
import { BillingSection } from "@/components/settings/BillingSection";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [{ title: "Obuna — SalesIQ" }],
  }),
  component: BillingPage,
});

function BillingPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("trial.billingTitle")} description={t("trial.billingDesc")} />
      <BillingSection />
    </>
  );
}
