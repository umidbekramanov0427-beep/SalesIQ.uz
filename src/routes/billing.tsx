import { CreditCard } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/Primitives";
import { BillingStore } from "@/components/settings/BillingStore";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [{ title: "Hisob va to'lov — SalesIQ" }],
  }),
  component: BillingPage,
});

function BillingPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        icon={CreditCard}
        tone="emerald"
        title={t("billing.pageTitle")}
        description={t("billing.pageDesc")}
      />
      <BillingStore />
    </>
  );
}
