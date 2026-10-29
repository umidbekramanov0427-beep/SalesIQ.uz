import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Building2,
  Copy,
  Gift,
  Handshake,
  Loader2,
  Plus,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Pill, SectionCard, StatCard } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import { usePartnerAction, usePartnersOverview } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { referralLink } from "@/lib/referral";
import { describeError, formatDate } from "@/lib/utils";
import { copyText } from "@/lib/clipboard";

export const Route = createFileRoute("/platform/partners")({
  head: () => ({ meta: [{ title: "Hamkorlar — SalesIQ" }] }),
  component: PlatformPartnersPage,
});

const som = (n: number) => `${Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ")} so'm`;

const ERRORS: Record<string, string> = {
  NAME_REQUIRED: "partners.err.name",
  BAD_CODE: "partners.err.code",
  CODE_TAKEN: "partners.err.taken",
  MIGRATION_PENDING: "ref.migrationPending",
  ALREADY_REWARDED: "partners.err.rewarded",
};

// Platforma → Hamkorlar: partners (agencies, consultants) with their own
// codes and commission, what they're owed, and every invitation on the
// platform -- companies inviting companies included.
function PlatformPartnersPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const q = usePartnersOverview();
  const action = usePartnerAction();
  const [form, setForm] = useState({ name: "", phone: "", code: "", pct: "20" });

  if (user && user.role !== "platform_owner") {
    return (
      <SectionCard
        icon={ShieldAlert}
        tone="rose"
        title={t("admin.restrictedTitle")}
        description={t("admin.restrictedDesc")}
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  const fail = (err: unknown) => {
    const code = err instanceof Error ? err.message : "";
    toast.error(ERRORS[code] ? t(ERRORS[code]) : describeError(err, t("partners.failed")));
  };

  async function run(body: Record<string, unknown>, done: string) {
    try {
      await action.mutateAsync(body);
      toast.success(done);
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      {
        action: "create",
        name: form.name,
        phone: form.phone,
        code: form.code,
        commissionPct: Number(form.pct),
      },
      t("partners.created"),
    );
    if (ok) setForm({ name: "", phone: "", code: "", pct: "20" });
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://salesiq.uz";
  const publicOrigin = /localhost|127\.0\.0\.1/.test(origin) ? origin : "https://salesiq.uz";
  const data = q.data;

  return (
    <>
      <PageHeader
        icon={Handshake}
        tone="amber"
        title={t("partners.title")}
        description={t("partners.desc")}
      />
      {q.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      ) : q.error ? (
        <SectionCard icon={ShieldAlert} tone="amber" title={t("ref.notReady")}>
          <p className="text-sm text-muted-foreground">
            {(q.error as Error).message === "MIGRATION_PENDING"
              ? t("ref.migrationPending")
              : describeError(q.error, "")}
          </p>
        </SectionCard>
      ) : data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 phone:gap-2">
            <StatCard
              icon={Gift}
              iconTone="emerald"
              label={t("partners.statReferrals")}
              value={String(data.totals.referrals)}
            />
            <StatCard
              icon={BadgeCheck}
              iconTone="sky"
              label={t("partners.statPaid")}
              value={String(data.totals.paid)}
              hint={
                data.totals.referrals
                  ? t("partners.statPaidHint", {
                      p: Math.round((data.totals.paid / data.totals.referrals) * 100),
                    })
                  : ""
              }
            />
            <StatCard
              icon={Building2}
              iconTone="violet"
              label={t("partners.statCompanies")}
              value={String(data.totals.topCompanies)}
            />
            <StatCard
              icon={Wallet}
              iconTone="amber"
              label={t("partners.statUnpaid")}
              value={som(data.totals.unpaid)}
              info={t("partners.statUnpaidInfo")}
            />
          </div>

          <SectionCard
            icon={Plus}
            tone="primary"
            title={t("partners.newTitle")}
            description={t("partners.newDesc")}
          >
            <form
              onSubmit={(e) => void create(e)}
              className="grid gap-3 md:grid-cols-[2fr_1.4fr_1.2fr_0.8fr_auto]"
            >
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("partners.name")}
                className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50"
              />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder={t("partners.phone")}
                className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50"
              />
              <input
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })
                }
                placeholder={t("partners.codeAuto")}
                maxLength={16}
                className="h-11 rounded-xl border border-border bg-background px-3 font-mono text-sm uppercase outline-none focus:border-primary/50"
              />
              <label className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.pct}
                  onChange={(e) => setForm({ ...form, pct: e.target.value })}
                  aria-label={t("partners.pct")}
                  className="h-11 w-full rounded-xl border border-border bg-background pl-3 pr-8 text-sm tabular-nums outline-none focus:border-primary/50"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </label>
              <button
                type="submit"
                disabled={action.isPending || !form.name.trim()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> {t("partners.add")}
              </button>
            </form>
          </SectionCard>

          <SectionCard icon={Handshake} tone="amber" title={t("partners.listTitle")}>
            {data.partners.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("partners.listEmpty")}</p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.partners.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-foreground">
                          {p.name}
                        </p>
                        <p className="text-[13px] text-muted-foreground">
                          {p.phone || "—"} · {t("partners.pctLine", { n: p.commissionPct })}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        {p.active ? t("partners.active") : t("partners.paused")}
                        <Switch
                          checked={p.active}
                          onCheckedChange={(v) =>
                            void run(
                              { action: "update", id: p.id, active: v },
                              v ? t("partners.resumed") : t("partners.pausedDone"),
                            )
                          }
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void copyText(referralLink(p.code, publicOrigin)).then(
                          () => toast.success(t("ref.copied")),
                          () => toast.error(t("common.copyFailed")),
                        );
                      }}
                      className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-background px-3 py-2 text-left font-mono text-[13px] text-foreground transition-colors hover:bg-accent"
                    >
                      <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{referralLink(p.code, publicOrigin)}</span>
                    </button>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        [t("partners.invited"), String(p.invited)],
                        [t("partners.paying"), String(p.paying)],
                        [t("partners.earned"), som(p.earned)],
                        [t("partners.unpaid"), som(p.unpaid)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-background/60 px-2 py-2">
                          <p className="text-[11px] text-muted-foreground">{label}</p>
                          <p className="truncate text-sm font-semibold tabular-nums text-foreground">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                    {p.unpaid > 0 && (
                      <button
                        type="button"
                        disabled={action.isPending}
                        onClick={() =>
                          void run({ action: "paid-out", id: p.id }, t("partners.paidOutDone"))
                        }
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        <Wallet className="h-4 w-4" />
                        {t("partners.markPaid", { v: som(p.unpaid) })}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            icon={Users}
            tone="sky"
            title={t("partners.refTitle")}
            description={t("partners.refDesc")}
          >
            {data.referrals.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("partners.refEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">{t("partners.col.company")}</th>
                      <th className="py-2 pr-3 font-medium">{t("partners.col.by")}</th>
                      <th className="py-2 pr-3 font-medium">{t("partners.col.date")}</th>
                      <th className="py-2 pr-3 font-medium">{t("partners.col.status")}</th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {data.referrals.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2.5 pr-3">
                          <Link
                            to="/platform/organizations/$orgId"
                            params={{ orgId: r.referredOrgId }}
                            className="font-medium text-foreground hover:text-primary"
                          >
                            {r.referredName}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="inline-flex items-center gap-1.5 text-foreground/90">
                            {r.byKind === "partner" ? (
                              <Handshake className="h-3.5 w-3.5 text-amber-500" />
                            ) : (
                              <Building2 className="h-3.5 w-3.5 text-sky-500" />
                            )}
                            {r.by}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">
                          {formatDate(r.createdAt)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <Pill tone={r.status === "paid" ? "success" : "neutral"}>
                            {r.status === "paid" ? t("ref.status.paid") : t("ref.status.signed_up")}
                          </Pill>
                        </td>
                        <td className="py-2.5 text-right">
                          {r.status === "signed_up" && (
                            <button
                              type="button"
                              disabled={action.isPending}
                              onClick={() =>
                                void run({ action: "reward", id: r.id }, t("partners.rewarded"))
                              }
                              title={t("partners.rewardHint")}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                            >
                              <Gift className="h-3.5 w-3.5 text-emerald-500" />
                              {t("partners.reward")}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}
    </>
  );
}
