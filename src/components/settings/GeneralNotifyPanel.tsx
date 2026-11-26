import { NotifyCenter } from "@/components/funnel-settings/FunnelNotifyDialog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

// Sozlamalar → Bildirishnomalar, 5CRM's «Umumiy bildirishnomalar»: the
// company-wide notifications (task reminders, the AI's alert on a client's
// objection, the morning boost) in the same list-and-detail window as a
// funnel's. A person's own notifications are in the bell's center.

export function GeneralNotifyPanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage = user?.role === "super_admin" || user?.role === "platform_owner";

  return (
    <section className="overflow-hidden rounded-[8px] border border-border bg-card">
      <header className="border-b border-border px-6 py-4">
        <h2 className="text-[17px] font-medium text-foreground">{t("gn.title")}</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{t("gn.desc")}</p>
      </header>
      <div className="flex h-[620px] flex-col phone:h-auto">
        <NotifyCenter canManage={canManage} />
      </div>
    </section>
  );
}
