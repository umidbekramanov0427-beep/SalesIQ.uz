import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Plus, Video } from "lucide-react";
import { PageHeader } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useWebinars, type WebinarRow } from "@/hooks/use-crm-data";
import { StatusChip, WebinarDialog } from "@/components/marketing/WebinarParts";

// Marketing paneli -> Vebinarlar: every live webinar, with its peak and
// average viewers; a new one is a title, the platform, the YouTube link
// (counted by itself) and the start time.

export const Route = createFileRoute("/marketing/webinars/")({
  head: () => ({ meta: [{ title: "Vebinarlar — SalesIQ Marketing" }] }),
  component: WebinarsPage,
});

function WebinarsPage() {
  const { t } = useI18n();
  const q = useWebinars();
  const [creating, setCreating] = useState(false);
  const rows = q.data?.rows ?? [];
  const stats = (id: string) => {
    const s = (q.data?.samples ?? []).filter((x) => x.webinar_id === id);
    if (!s.length) return null;
    return {
      peak: Math.max(...s.map((x) => x.viewers)),
      avg: Math.round(s.reduce((a, x) => a + x.viewers, 0) / s.length),
    };
  };
  return (
    <div className="space-y-5">
      <PageHeader
        back={false}
        icon={Video}
        tone="violet"
        title={t("mkt.nav.webinars")}
        description={t("mkt.wb.desc")}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            {t("mkt.wb.new")}
          </Button>
        }
      />
      {q.data?.missing && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
          {t("mkt.migrationPending")}
        </p>
      )}
      {q.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card grid place-items-center gap-3 py-14 text-center">
          <Video className="h-8 w-8 text-muted-foreground" />
          <p className="max-w-md text-sm text-muted-foreground">{t("mkt.wb.empty")}</p>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            {t("mkt.wb.new")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((w) => (
            <WebinarCard key={w.id} w={w} stats={stats(w.id)} />
          ))}
        </div>
      )}
      {creating && <WebinarDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function WebinarCard({ w, stats }: { w: WebinarRow; stats: { peak: number; avg: number } | null }) {
  const { t } = useI18n();
  return (
    <Link
      to="/marketing/webinars/$id"
      params={{ id: w.id }}
      className="surface-card block p-5 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-foreground">{w.title}</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {t(`mkt.wb.platform.${w.platform}`)}
            {w.starts_at &&
              ` · ${new Date(w.starts_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <StatusChip status={w.status} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { k: t("mkt.wb.peak"), v: stats ? String(stats.peak) : "—" },
          { k: t("mkt.wb.avg"), v: stats ? String(stats.avg) : "—" },
          { k: t("mkt.wb.registered"), v: w.registrations != null ? String(w.registrations) : "—" },
        ].map((c) => (
          <div key={c.k} className="rounded-lg bg-surface px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">{c.k}</p>
            <p className="font-mono text-[17px] font-bold tabular-nums text-foreground">{c.v}</p>
          </div>
        ))}
      </div>
    </Link>
  );
}
