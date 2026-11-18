import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { callDay, tashkentTime } from "@/lib/company-leads";

// The company owner's home page: the call it booked with SalesIQ when it
// signed up (/account/my-meeting). Gone once the call is two hours past.
export function MyMeetingCard() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin";
  const { data } = useQuery({
    queryKey: ["my_meeting", user?.organizationId],
    enabled: isAdmin && !!user?.organizationId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ at: string } | null> => {
      const res = await apiFetch("/account/my-meeting");
      if (!res.ok) return null;
      return ((await res.json()) as { meeting: { at: string } | null }).meeting;
    },
  });
  if (!data) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] px-4 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
        <CalendarClock className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-foreground">
          {t("wiz.homeCall", { day: callDay(data.at, lang), time: tashkentTime(data.at) })}
        </p>
        <p className="text-[12.5px] text-muted-foreground">{t("wiz.homeCallDesc")}</p>
      </div>
    </div>
  );
}
