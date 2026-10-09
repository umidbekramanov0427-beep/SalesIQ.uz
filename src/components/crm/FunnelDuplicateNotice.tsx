import { useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { fetchFunnelDuplicate, type FunnelDuplicate } from "@/hooks/use-crm-data";

/** Looks the typed phone/email up in the funnel, half a second after typing stops. */
export function useFunnelDuplicate(
  funnel: string,
  phone: string,
  email: string,
  enabled: boolean,
): FunnelDuplicate | null {
  const [dup, setDup] = useState<FunnelDuplicate | null>(null);
  useEffect(() => {
    if (!enabled) return setDup(null);
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7 && !email.includes("@")) return setDup(null);
    let live = true;
    const timer = setTimeout(() => {
      void fetchFunnelDuplicate(funnel, phone, email).then((d) => live && setDup(d));
    }, 450);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [funnel, phone, email, enabled]);
  return dup;
}

/**
 * "This client is already a lead in this funnel": who has them and in which
 * stage, with a way to open that lead -- a second lead isn't created.
 */
export function FunnelDuplicateNotice({
  dup,
  funnel,
  onOpen,
}: {
  dup: FunnelDuplicate;
  funnel: string;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[13px]">
      <Copy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground">{t("guard.dupTitle", { funnel })}</p>
        <p className="mt-0.5 text-muted-foreground">
          {dup.name}
          {dup.stage_name ? ` · ${dup.stage_name}` : ""}
          {` · ${dup.owner_name || t("guard.noOwner")}`}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-foreground/90 px-2.5 py-1.5 text-[12px] font-semibold text-background hover:bg-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" /> {t("guard.openLead")}
      </button>
    </div>
  );
}
