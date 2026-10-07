import { Bot } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import { useSalesbots, useStartSalesbot } from "@/hooks/use-automations";

/** Lead page "..." menu: run one of the org's salesbots for this lead now. */
export function StartSalesbotMenuItems({ leadId }: { leadId: string }) {
  const { t } = useI18n();
  const { data: bots } = useSalesbots();
  const start = useStartSalesbot();
  const enabled = (bots ?? []).filter((b) => b.enabled);
  if (enabled.length === 0) return null;
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-subtle">{t("sb.startOnLead")}</DropdownMenuLabel>
      {enabled.map((b) => (
        <DropdownMenuItem
          key={b.id}
          disabled={start.isPending}
          onSelect={() =>
            start.mutate(
              { botId: b.id, leadId },
              {
                onSuccess: () => toast.success(t("sb.started")),
                onError: (err) => toast.error(describeError(err, t("dp.saveFailed"))),
              },
            )
          }
        >
          <Bot className="mr-2 h-4 w-4" /> {b.name}
        </DropdownMenuItem>
      ))}
    </>
  );
}
