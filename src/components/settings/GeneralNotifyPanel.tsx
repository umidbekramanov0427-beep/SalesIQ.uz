import { Inbox } from "lucide-react";
import { useNotificationsRaw } from "@/hooks/use-crm-data";
import { NotifyCenter } from "@/components/funnel-settings/FunnelNotifyDialog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useOpenNotificationLink } from "@/components/notifications/open-link";
import { cn } from "@/lib/utils";

// Sozlamalar → Bildirishnomalar, 5CRM's «Umumiy bildirishnomalar»: the
// company-wide notifications (task reminders, the AI's alert on a client's
// objection, the morning boost) in the same list-and-detail window as a
// funnel's, and «Pochta» -- this person's notifications, newest first.

const stamp = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function GeneralNotifyPanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage = user?.role === "super_admin" || user?.role === "platform_owner";
  const { data: rows = [] } = useNotificationsRaw();
  const open = useOpenNotificationLink();
  const mine = rows.filter((r) => r.user_id === user?.id).slice(0, 30);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[8px] border border-border bg-card">
        <header className="border-b border-border px-6 py-4">
          <h2 className="text-[17px] font-medium text-foreground">{t("gn.title")}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{t("gn.desc")}</p>
        </header>
        <div className="flex h-[620px] flex-col phone:h-auto">
          <NotifyCenter canManage={canManage} />
        </div>
      </section>

      <section className="overflow-hidden rounded-[8px] border border-border bg-card">
        <header className="border-b border-border px-6 py-4">
          <h2 className="text-[17px] font-medium text-foreground">{t("gn.mail")}</h2>
        </header>
        {mine.length === 0 ? (
          <div className="grid place-items-center gap-2 px-6 py-12 text-center text-muted-foreground">
            <Inbox className="h-7 w-7" />
            <p className="text-[13px]">{t("gn.mailEmpty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {mine.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => n.link && open(n.link)}
                  className={cn(
                    "flex w-full items-start gap-3 px-6 py-3 text-left transition-colors hover:bg-accent/50",
                    !n.read && "bg-primary/[0.06]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      n.read ? "bg-transparent" : "bg-primary",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-foreground">
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="line-clamp-2 block text-[12.5px] text-muted-foreground">
                        {n.body}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                    {stamp(n.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
