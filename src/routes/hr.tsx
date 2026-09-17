import { useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Loader2, Settings2, ShieldAlert, Users } from "lucide-react";
import { PageHeader, SectionCard, Pill, ExportButton } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { HR_STATUS_META } from "@/lib/hr-status";
import {
  useHrCandidates,
  useHrCandidatesExportRows,
  HR_CANDIDATE_STATUSES,
  type HrCandidateStatus,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/hr")({
  head: () => ({
    meta: [
      { title: "Kadrlar bo'limi — SalesIQ" },
      { name: "description", content: "Vakansiyalarga tushgan nomzodlarni ko'rib chiqing." },
    ],
  }),
  component: HrPage,
});

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HrPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { data: candidates, isLoading, error } = useHrCandidates();
  const { data: exportRows } = useHrCandidatesExportRows();
  const [statusFilter, setStatusFilter] = useState<HrCandidateStatus | "all">("all");
  const rows = candidates ?? [];
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of candidates ?? []) map.set(c.status, (map.get(c.status) ?? 0) + 1);
    return map;
  }, [candidates]);

  // "/hr/settings" and "/hr/$candidateId" are child routes (hr.settings.tsx,
  // hr.$candidateId.tsx) -- this file is their layout, so it has to yield
  // via Outlet on those paths instead of always rendering its own list
  // content, or the child route's page silently never appears (see
  // daily-report-settings.tsx for the same pattern). This check has to come
  // after every hook above so hook order stays fixed across renders.
  if (pathname !== "/hr") {
    return <Outlet />;
  }

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <SectionCard title="Ruxsat cheklangan" description="Bu bo'lim faqat Super Admin uchun.">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> Kirish huquqingiz yo'q.
        </div>
      </SectionCard>
    );
  }

  const filtered = statusFilter === "all" ? rows : rows.filter((c) => c.status === statusFilter);

  return (
    <>
      <PageHeader
        title="Kadrlar bo'limi"
        description="Telegram bot orqali vakansiyalarga tushgan nomzodlar va ularning javoblari."
        actions={
          <div className="flex items-center gap-2">
            <ExportButton filename="kadrlar-arizalari" rows={exportRows ?? []} />
            <Link
              to="/hr/settings"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              <Settings2 className="h-4 w-4" /> Vakansiyalar va savollar
            </Link>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors ${
            statusFilter === "all"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          Hammasi
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs">{rows.length}</span>
        </button>
        {HR_CANDIDATE_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors ${
              statusFilter === s
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {HR_STATUS_META[s].label}
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs">
              {counts.get(s) ?? 0}
            </span>
          </button>
        ))}
      </div>

      <SectionCard>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-subtle">
            <Users className="h-6 w-6" />
            Hozircha nomzod yo'q.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
                  <th className="py-2.5 pr-4">Nomzod</th>
                  <th className="px-4 py-2.5">Vakansiya</th>
                  <th className="px-4 py-2.5">Murojaat sanasi</th>
                  <th className="px-4 py-2.5">Holat</th>
                  <th className="py-2.5 pl-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3.5 pr-4">
                      <p className="text-sm font-semibold text-foreground">
                        {c.telegram_username
                          ? `@${c.telegram_username}`
                          : `Chat #${c.telegram_chat_id}`}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-foreground">
                      {c.hr_vacancies?.title ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-muted-foreground">
                      {fmtDate(c.created_at)}
                    </td>
                    <td className="px-4 py-3.5">
                      <Pill tone={HR_STATUS_META[c.status as HrCandidateStatus]?.tone ?? "neutral"}>
                        {HR_STATUS_META[c.status as HrCandidateStatus]?.label ?? c.status}
                      </Pill>
                    </td>
                    <td className="py-3.5 pl-4 text-right">
                      <Link
                        to="/hr/$candidateId"
                        params={{ candidateId: c.id }}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                      >
                        Ko'rish <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
