import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw, Search, ShieldAlert, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { TRASH_DAYS, trashDaysLeft } from "@/lib/file-rules";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, formatDate } from "@/lib/utils";

// Admin → Lidlar savati (amoCRM's deleted leads): every lead a person
// deleted in the last 30 days, restorable with its tasks, notes, chat,
// files and payments. Data from /leads/trash (super admin only).

export const Route = createFileRoute("/admin/trash")({
  head: () => ({ meta: [{ title: "Lidlar savati — SalesIQ" }] }),
  component: TrashPage,
});

type TrashedLead = {
  id: string;
  name: string;
  funnel: string | null;
  stage: string | null;
  budget: number;
  owner: string | null;
  phone: string | null;
  deletedAt: string;
  deletedBy: string | null;
};

const QK = ["leads-trash"] as const;

function useLeadsTrash() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...QK, user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<{ leads: TrashedLead[]; pending?: boolean }> => {
      const res = await apiFetch("/leads/trash");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { leads: TrashedLead[]; pending?: boolean };
    },
  });
}

function TrashPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard
          icon={ShieldAlert}
          tone="rose"
          title={t("admin.restrictedTitle")}
          description={t("admin.restrictedDesc")}
        >
          <p className="text-sm text-muted-foreground">{t("admin.restrictedHint")}</p>
        </SectionCard>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title={t("trash.title")}
        description={t("trash.desc", { n: TRASH_DAYS })}
        icon={Trash2}
        tone="amber"
      />
      <TrashList />
    </>
  );
}

function Tick({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "grid h-[20px] w-[20px] shrink-0 place-items-center rounded-md border transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:border-primary/60",
      )}
    >
      {on && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

function TrashList() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { format } = useCurrency();
  const { data, isLoading, isError } = useLeadsTrash();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmPurge, setConfirmPurge] = useState<string[] | null>(null);

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return leads;
    const digits = s.replace(/\D/g, "");
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(s) ||
        (l.funnel ?? "").toLowerCase().includes(s) ||
        (l.owner ?? "").toLowerCase().includes(s) ||
        (digits.length >= 3 && (l.phone ?? "").replace(/\D/g, "").includes(digits)),
    );
  }, [leads, q]);
  const pickedShown = shown.filter((l) => picked.has(l.id));
  const allOn = shown.length > 0 && pickedShown.length === shown.length;

  const act = useMutation({
    mutationFn: async ({ action, ids }: { action: "restore" | "purge"; ids: string[] }) => {
      const res = await apiFetch("/leads/trash", {
        method: "POST",
        body: JSON.stringify({ action, ids }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        restored?: number;
        failed?: number;
        purged?: number;
      };
      if (!res.ok) {
        throw new Error(
          json.error === "MIGRATION_PENDING" ? t("trash.pending") : (json.error ?? "failed"),
        );
      }
      return { action, ...json };
    },
    onSuccess: (r) => {
      setPicked(new Set());
      void qc.invalidateQueries({ queryKey: QK });
      if (r.action === "restore") {
        void qc.invalidateQueries({ queryKey: ["leads"] });
        void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
        if (r.restored) toast.success(t("trash.restored", { n: r.restored }));
        if (r.failed) toast.error(t("trash.restoreSome", { n: r.failed }));
      } else {
        toast.success(t("trash.purged", { n: r.purged ?? 0 }));
      }
    },
    onError: (e) => toast.error(describeError(e, t("trash.failed"))),
  });

  function toggle(id: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setPicked(allOn ? new Set() : new Set(shown.map((l) => l.id)));
  }

  return (
    <SectionCard
      icon={RotateCcw}
      tone="amber"
      title={t("trash.listTitle")}
      description={t("trash.listDesc")}
    >
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : isError ? (
        <p className="py-6 text-center text-sm text-destructive">{t("trash.failed")}</p>
      ) : data?.pending ? (
        <p className="rounded-xl bg-surface py-8 text-center text-sm text-muted-foreground">
          {t("trash.pending")}
        </p>
      ) : leads.length === 0 ? (
        <div className="rounded-xl bg-surface px-6 py-10 text-center">
          <Trash2 className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 text-[14px] font-semibold text-foreground">{t("trash.empty")}</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
            {t("trash.emptyHint", { n: TRASH_DAYS })}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("trash.search")}
                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[13.5px] outline-none focus:border-primary/60"
              />
            </label>
            <span className="text-[12.5px] tabular-nums text-muted-foreground">
              {t("trash.count", { n: leads.length })}
            </span>
          </div>

          {pickedShown.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3.5 py-2.5">
              <span className="mr-auto text-[13px] font-semibold text-foreground">
                {t("trash.picked", { n: pickedShown.length })}
              </span>
              <button
                type="button"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: "restore", ids: pickedShown.map((l) => l.id) })}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {act.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Undo2 className="h-3.5 w-3.5" />
                )}
                {t("trash.restore")}
              </button>
              <button
                type="button"
                disabled={act.isPending}
                onClick={() => setConfirmPurge(pickedShown.map((l) => l.id))}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-destructive/40 px-3.5 text-[13px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> {t("trash.purge")}
              </button>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">
              <Tick on={allOn} onChange={toggleAll} label={t("trash.pickAll")} />
              <span className="min-w-[200px] flex-1">{t("trash.colLead")}</span>
              <span className="hidden w-[170px] md:block">{t("trash.colFunnel")}</span>
              <span className="hidden w-[110px] text-right md:block">{t("trash.colBudget")}</span>
              <span className="w-[170px]">{t("trash.colDeleted")}</span>
              <span className="w-[86px]">{t("trash.colLeft")}</span>
              <span className="w-[92px]" />
            </div>
            {shown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("trash.noMatch")}</p>
            ) : (
              shown.map((l) => {
                const left = trashDaysLeft(l.deletedAt);
                const on = picked.has(l.id);
                return (
                  <div
                    key={l.id}
                    className={cn(
                      "flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 transition-colors",
                      on ? "bg-primary/[0.05]" : "hover:bg-accent/40",
                    )}
                  >
                    <Tick on={on} onChange={() => toggle(l.id)} label={l.name} />
                    <span className="min-w-[200px] flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-foreground">
                        {l.name}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {[l.phone, l.owner].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                    <span className="hidden w-[170px] md:block">
                      <span className="block truncate text-[13px] text-foreground">
                        {l.funnel || "—"}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {l.stage || "—"}
                      </span>
                    </span>
                    <span className="hidden w-[110px] text-right text-[13px] font-semibold tabular-nums text-foreground md:block">
                      {l.budget ? format(l.budget) : "—"}
                    </span>
                    <span className="w-[170px]">
                      <span className="block text-[12.5px] tabular-nums text-foreground">
                        {formatDate(l.deletedAt)}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {l.deletedBy ?? "—"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "w-[86px] text-[12.5px] font-semibold tabular-nums",
                        left <= 3 ? "text-destructive" : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {t("files.daysLeft", { n: left })}
                    </span>
                    <span className="flex w-[92px] justify-end">
                      <button
                        type="button"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ action: "restore", ids: [l.id] })}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:opacity-50"
                      >
                        <Undo2 className="h-3.5 w-3.5" /> {t("trash.restoreOne")}
                      </button>
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <p className="text-[12px] text-subtle">{t("trash.note")}</p>
        </div>
      )}
      <ConfirmDialog
        open={!!confirmPurge}
        onOpenChange={(o) => !o && setConfirmPurge(null)}
        title={t("trash.purgeTitle", { n: confirmPurge?.length ?? 0 })}
        description={t("trash.purgeDesc")}
        confirmLabel={t("trash.purge")}
        destructive
        onConfirm={() => {
          if (confirmPurge) act.mutate({ action: "purge", ids: confirmPurge });
          setConfirmPurge(null);
        }}
      />
    </SectionCard>
  );
}
