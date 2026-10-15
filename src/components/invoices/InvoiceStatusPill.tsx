import { Pill } from "@/components/layout/Primitives";
import { useI18n } from "@/lib/i18n";

const TONE = {
  draft: "neutral",
  sent: "info",
  paid: "success",
  cancelled: "danger",
} as const;

export function InvoiceStatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  const tone = TONE[status as keyof typeof TONE] ?? "neutral";
  return <Pill tone={tone}>{t(`inv.status.${status}`)}</Pill>;
}
