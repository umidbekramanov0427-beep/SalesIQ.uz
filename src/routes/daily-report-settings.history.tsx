import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Calendar, Loader2, History } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDailyReportHistory, type DailyReportHistoryRow } from "@/hooks/use-crm-data";

export const Route = createFileRoute("/daily-report-settings/history")({
  head: () => ({
    meta: [{ title: "Hisobot tarixi — SalesIQ" }],
  }),
  component: DailyReportHistoryPage,
});

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function DailyReportHistoryPage() {
  const { data: history, isLoading } = useDailyReportHistory();
  const [selected, setSelected] = useState<DailyReportHistoryRow | null>(null);
  const rows = history ?? [];

  return (
    <>
      <Link
        to="/daily-report-settings"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-subtle transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Kunlik hisobot sozlamalariga qaytish
      </Link>
      <PageHeader
        icon={History}
        tone="sky"
        title="Hisobot tarixi"
        description="Har kuni avtomatik yuborilgan to'liq hisobotning saqlangan nusxalari, sana bo'yicha."
      />

      <SectionCard>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-subtle">
            <Calendar className="h-6 w-6" />
            Hozircha saqlangan hisobot yo'q. Birinchi kunlik hisobot yuborilgach shu yerda
            ko'rinadi.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                className="flex w-full items-center justify-between gap-4 py-3.5 text-left transition-colors hover:bg-accent"
              >
                <span className="text-sm font-semibold text-foreground">
                  {fmtDate(r.report_date)}
                </span>
                <span className="text-sm font-medium text-primary">Ko'rish →</span>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected ? fmtDate(selected.report_date) : ""}</DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap break-words text-sm text-foreground">
            {selected?.report_text}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}
