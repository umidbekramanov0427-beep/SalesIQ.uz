import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  CalendarPlus,
  Check,
  Copy,
  Gift,
  Loader2,
  Send,
  ShieldAlert,
  UserPlus,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { PageHeader, Pill, SectionCard, StatCard } from "@/components/layout/Primitives";
import { useMyReferrals } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { describeError, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/admin/referrals")({
  head: () => ({ meta: [{ title: "Taklif dasturi — SalesIQ" }] }),
  component: AdminReferralsPage,
});

// Admin panel → Taklif dasturi: the company's own invitation link, how the
// rewards work, and the companies it brought in.
function AdminReferralsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const q = useMyReferrals();
  const [copied, setCopied] = useState(false);

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
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
          </div>
        </SectionCard>
      </>
    );
  }

  const data = q.data;

  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      toast.success(t("ref.copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("ref.copyFailed"));
    }
  }

  const shareText = data ? t("ref.shareText", { n: data.referredBonusDays }) : "";
  const telegramShare = data
    ? `https://t.me/share/url?url=${encodeURIComponent(data.link)}&text=${encodeURIComponent(shareText)}`
    : "#";

  return (
    <>
      <PageHeader icon={Gift} tone="emerald" title={t("ref.title")} description={t("ref.desc")} />

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
          {/* The link */}
          <section className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-card to-card p-5 sm:p-6">
            <p className="text-[13px] font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-300">
              {t("ref.yourLink")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-border bg-background px-4 py-3 font-mono text-[15px] text-foreground">
                {data.link}
              </code>
              <button
                type="button"
                onClick={() => void copy()}
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t("ref.copiedShort") : t("ref.copy")}
              </button>
              <a
                href={telegramShare}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                <Send className="h-4 w-4 text-sky-500" />
                {t("ref.shareTelegram")}
              </a>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {t("ref.codeLine")}{" "}
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono font-semibold text-foreground">
                {data.code}
              </span>
            </p>
          </section>

          {/* How it works: a real sequence */}
          <SectionCard icon={CalendarPlus} tone="violet" title={t("ref.howTitle")}>
            <ol className="grid gap-3 md:grid-cols-3">
              {[
                { icon: Send, text: t("ref.step1") },
                { icon: UserPlus, text: t("ref.step2", { n: data.referredBonusDays }) },
                { icon: Wallet, text: t("ref.step3", { n: data.referrerBonusDays }) },
              ].map((s, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-foreground/90"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[13px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{s.text}</span>
                </li>
              ))}
            </ol>
          </SectionCard>

          <div className="grid grid-cols-3 gap-3 phone:gap-2">
            <StatCard
              icon={UserPlus}
              iconTone="sky"
              label={t("ref.statInvited")}
              value={String(data.invited.length)}
            />
            <StatCard
              icon={Wallet}
              iconTone="emerald"
              label={t("ref.statPaid")}
              value={String(data.invited.filter((i) => i.status === "paid").length)}
            />
            <StatCard
              icon={Gift}
              iconTone="amber"
              label={t("ref.statDays")}
              value={t("ref.days", { n: data.daysEarned })}
            />
          </div>

          <SectionCard icon={Building2} tone="sky" title={t("ref.invitedTitle")}>
            {data.invited.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("ref.invitedEmpty")}</p>
            ) : (
              <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
                {data.invited.map((i, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-4 py-3">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{i.name}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {t("ref.joined", { date: formatDate(i.createdAt) })}
                      </p>
                    </div>
                    <Pill tone={i.status === "paid" ? "success" : "neutral"}>
                      {i.status === "paid" ? t("ref.status.paid") : t("ref.status.signed_up")}
                    </Pill>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}
    </>
  );
}
