import { Link } from "@tanstack/react-router";
import { Plug, Workflow } from "lucide-react";
import { AmoWriteBackTab } from "@/components/admin/AmoWriteBackTab";
import { IconTile, InfoTip } from "@/components/layout/Primitives";
import { useAmoConnectionStatus } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";

// Settings → "amoCRM: vazifa va izoh": what the platform writes into an
// amoCRM lead after the AI analyses a call (a task with the next step, a
// note about the client). The "!" next to the title says, in short, how it
// works and how to set it up; the switches are AmoWriteBackTab's.
export function AmoCrmSettingsSection() {
  const { t } = useI18n();
  const amo = useAmoConnectionStatus();
  const connected = !!amo.data;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <IconTile icon={Workflow} tone="sky" />
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            {t("settings.amo.title")}
            <InfoTip text={t("settings.amo.info")} />
          </h2>
          <p className="text-sm text-muted-foreground">{t("settings.amo.desc")}</p>
        </div>
      </div>
      {amo.isFetched && !connected && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
          <Plug className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 flex-1">{t("settings.amo.notConnected")}</span>
          <Link
            to="/integrations/$slug"
            params={{ slug: "amocrm" }}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground"
          >
            {t("settings.amo.connect")}
          </Link>
        </div>
      )}
      <AmoWriteBackTab />
    </div>
  );
}
