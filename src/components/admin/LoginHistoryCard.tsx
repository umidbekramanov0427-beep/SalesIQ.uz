import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Laptop, Loader2, MapPin, Smartphone } from "lucide-react";
import { SectionCard, StatusChip } from "@/components/layout/Primitives";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";

// Xavfsizlik → Kirishlar tarixi: the company's sign-ins of the last 30
// days, and wrong-password attempts on its people's emails, newest first
// (from /admin/login-events, super admin only).

type LoginEvent = {
  id: string;
  kind: string;
  name: string;
  role: string | null;
  device: string | null;
  userAgent: string | null;
  ip: string | null;
  city: string | null;
  country: string | null;
  at: string;
  lastSeen: string | null;
  closed: boolean;
};

type Filter = "all" | "ok" | "failed";

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const isPhone = (e: LoginEvent) => /iphone|android|mobile/i.test(`${e.device} ${e.userAgent}`);

export function LoginHistoryCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(40);
  const q = useQuery({
    queryKey: ["admin-login-events", user?.organizationId],
    enabled: !!user?.organizationId,
    staleTime: 60_000,
    queryFn: async (): Promise<LoginEvent[]> => {
      const res = await apiFetch("/admin/login-events");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return ((await res.json()) as { events: LoginEvent[] }).events;
    },
  });
  const all = q.data ?? [];
  const failedCount = all.filter((e) => e.kind === "failed_login").length;
  const rows = all.filter((e) =>
    filter === "all"
      ? true
      : filter === "failed"
        ? e.kind === "failed_login"
        : e.kind !== "failed_login",
  );

  return (
    <SectionCard
      icon={History}
      tone="sky"
      title={t("loginlog.title")}
      description={t("loginlog.desc")}
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["all", "ok", "failed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "h-8 rounded-full border px-3.5 text-[12.5px] font-semibold transition-colors",
              filter === f
                ? "border-primary bg-primary/10 text-[var(--primary-ink)]"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`loginlog.f.${f}`)}
            {f === "failed" && failedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-[10.5px] text-destructive-foreground">
                {failedCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : q.isError ? (
        <p className="py-6 text-center text-sm text-destructive">{t("loginlog.error")}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-surface py-8 text-center text-sm text-muted-foreground">
          {t("loginlog.empty")}
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border">
            {rows.slice(0, limit).map((e) => {
              const failed = e.kind === "failed_login";
              const Device = isPhone(e) ? Smartphone : Laptop;
              const place = [e.city, e.country].filter(Boolean).join(", ");
              return (
                <div
                  key={e.id}
                  className={cn(
                    "flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-3 last:border-b-0",
                    failed && "bg-destructive/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                      failed
                        ? "bg-destructive/12 text-destructive"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Device className="h-4 w-4" />
                  </span>
                  <span className="min-w-[180px] flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">
                      {e.name}
                    </span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {e.device || t("loginlog.unknownDevice")}
                      {e.ip ? ` · ${e.ip}` : ""}
                    </span>
                  </span>
                  <span className="inline-flex min-w-[140px] items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{place || "—"}</span>
                  </span>
                  <span className="w-[150px] text-[12.5px] tabular-nums text-foreground">
                    {stamp(e.at)}
                    <span className="block text-[11.5px] text-subtle">{timeAgo(e.at)}</span>
                  </span>
                  <StatusChip state={failed ? "error" : e.closed ? "off" : "ok"}>
                    {t(failed ? "loginlog.failed" : e.closed ? "loginlog.closed" : "loginlog.ok")}
                  </StatusChip>
                </div>
              );
            })}
          </div>
          {rows.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + 40)}
              className="mt-3 w-full rounded-xl border border-border py-2 text-[13px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {t("loginlog.more", { n: rows.length - limit })}
            </button>
          )}
        </>
      )}
    </SectionCard>
  );
}
