import { Link } from "@tanstack/react-router";
import { Radio } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { deviceIcon, pageLabel } from "@/lib/visit-labels";
import { usePlatformOnline } from "@/hooks/use-crm-data";

// "Online now" at the top of the visits report: everyone whose tab sent a
// heartbeat in the last couple of minutes, with the page they are on.
// Refreshes every 30 s.
export function OnlineNow() {
  const { t } = useI18n();
  const { data, isLoading } = usePlatformOnline();
  const sessions = data?.sessions ?? [];

  return (
    <section className="mb-4 rounded-2xl border border-border bg-card p-3.5">
      <div className="flex items-center gap-2">
        <span className="relative grid h-7 w-7 place-items-center rounded-lg bg-success/15 text-success">
          <Radio className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">{t("visits.onlineNow")}</h2>
        <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-success">
          {isLoading ? "…" : sessions.length}
        </span>
        <span className="ml-auto text-[11px] text-subtle">{t("visits.onlineHint")}</span>
      </div>
      {!isLoading && sessions.length === 0 ? (
        <p className="mt-2 text-xs text-subtle">{t("visits.onlineEmpty")}</p>
      ) : (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3 phone:grid-cols-2">
          {sessions.map((s) => {
            const Device = deviceIcon(s.device);
            return (
              <Link
                key={s.id}
                to="/platform/visit/$sessionId"
                params={{ sessionId: s.id }}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 transition-colors hover:border-success/50"
              >
                <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/10 text-violet-600">
                  <Device className="h-4 w-4" />
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-card" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-foreground">
                    {s.user?.name ?? t("visits.unknownUser")}
                  </span>
                  <span className="block truncate text-[11px] text-subtle">
                    {s.org?.name ?? t("visits.noCompany")}
                    {s.currentPath ? ` · ${pageLabel(s.currentPath, t)}` : ""}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
