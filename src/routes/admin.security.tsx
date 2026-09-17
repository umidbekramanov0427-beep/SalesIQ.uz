import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Lock, ShieldAlert, ShieldCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, timeAgo } from "@/lib/utils";
import {
  useProfilesRaw,
  useSecuritySettings,
  useUpdateSecuritySettings,
  useSecurityUsers,
  useToggleUserBan,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/admin/security")({
  head: () => ({
    meta: [
      { title: "Xavfsizlik markazi — SalesIQ" },
      {
        name: "description",
        content: "Parol siyosati, 2FA sozlamalari va xodimlar kirish holati.",
      },
    ],
  }),
  component: SecurityCenterPage,
});

function PolicyCard() {
  const { t } = useI18n();
  const { data: settings, isLoading } = useSecuritySettings();
  const update = useUpdateSecuritySettings();
  const [minLength, setMinLength] = useState(8);
  const [requireNumber, setRequireNumber] = useState(false);
  const [requireUppercase, setRequireUppercase] = useState(false);
  const [requireSymbol, setRequireSymbol] = useState(false);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setMinLength(settings.min_password_length);
    setRequireNumber(settings.require_number);
    setRequireUppercase(settings.require_uppercase);
    setRequireSymbol(settings.require_symbol);
    setTwoFactorRequired(settings.two_factor_required);
  }, [settings]);

  async function save() {
    setSaving(true);
    try {
      await update.mutateAsync({
        min_password_length: minLength,
        require_number: requireNumber,
        require_uppercase: requireUppercase,
        require_symbol: requireSymbol,
        two_factor_required: twoFactorRequired,
      });
      toast.success(t("admin.security.saved"));
    } catch (err) {
      toast.error(describeError(err, t("admin.security.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <SectionCard title={t("admin.security.policyTitle")}>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={t("admin.security.policyTitle")}
      description={t("admin.security.policyDesc")}
    >
      <div className="space-y-5">
        <label className="block max-w-xs">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("admin.security.minLength")}
          </span>
          <input
            type="number"
            min={4}
            max={32}
            value={minLength}
            onChange={(e) => setMinLength(Math.max(4, Math.min(32, Number(e.target.value) || 8)))}
            className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
          />
        </label>

        <div className="space-y-2.5">
          {[
            {
              label: t("admin.security.requireNumber"),
              checked: requireNumber,
              set: setRequireNumber,
            },
            {
              label: t("admin.security.requireUppercase"),
              checked: requireUppercase,
              set: setRequireUppercase,
            },
            {
              label: t("admin.security.requireSymbol"),
              checked: requireSymbol,
              set: setRequireSymbol,
            },
          ].map((row) => (
            <label key={row.label} className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={row.checked}
                onChange={(e) => row.set(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              {row.label}
            </label>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={twoFactorRequired}
              onChange={(e) => setTwoFactorRequired(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            />
            <span>
              <span className="font-medium text-foreground">{t("admin.security.twoFactor")}</span>
              <p className="mt-1 text-xs text-subtle">{t("admin.security.twoFactorNote")}</p>
            </span>
          </label>
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("common.save")}
        </button>
      </div>
    </SectionCard>
  );
}

function AccessCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: profiles, isLoading: profilesLoading } = useProfilesRaw();
  const { data: statuses, isLoading: statusesLoading } = useSecurityUsers();
  const toggleBan = useToggleUserBan();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const statusById = new Map((statuses ?? []).map((s) => [s.id, s]));
  const rows = (profiles ?? []).filter((p) => p.organization_id === user?.organizationId);

  async function toggle(id: string, ban: boolean) {
    setPendingId(id);
    try {
      await toggleBan.mutateAsync({ userId: id, ban });
      toast.success(ban ? t("admin.security.blocked") : t("admin.security.unblocked"));
    } catch (err) {
      toast.error(describeError(err, t("admin.security.saveFailed")));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <SectionCard
      title={t("admin.security.accessTitle")}
      description={t("admin.security.accessDesc")}
    >
      {profilesLoading || statusesLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-subtle">{t("admin.security.noUsers")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-3 py-2 font-medium">{t("admin.employee")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.security.lastLogin")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.security.status")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("admin.security.action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const status = statusById.get(p.id);
                const isBanned =
                  !!status?.banned_until && new Date(status.banned_until) > new Date();
                const isSelf = p.id === user?.id;
                return (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-3">
                      <p className="font-medium text-foreground">{p.full_name || p.email}</p>
                      <p className="text-xs text-subtle">{p.email}</p>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {status?.last_sign_in_at
                        ? timeAgo(status.last_sign_in_at)
                        : t("admin.security.never")}
                    </td>
                    <td className="px-3 py-3">
                      <Pill tone={isBanned ? "danger" : "success"}>
                        {isBanned ? t("admin.security.blockedPill") : t("common.active")}
                      </Pill>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {!isSelf && (
                        <button
                          type="button"
                          disabled={pendingId === p.id}
                          onClick={() => void toggle(p.id, !isBanned)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                            isBanned
                              ? "border-success/30 text-success hover:bg-success/10"
                              : "border-destructive/30 text-destructive hover:bg-destructive/10",
                          )}
                        >
                          {pendingId === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserX className="h-3.5 w-3.5" />
                          )}
                          {isBanned ? t("admin.security.unblock") : t("admin.security.block")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function SecurityCenterPage() {
  const { user } = useAuth();
  const { t } = useI18n();

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
          </div>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <AdminBackLink />
      <PageHeader
        title={t("admin.securityCenter")}
        description={t("admin.securityCenterDesc")}
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> <ShieldCheck className="h-3.5 w-3.5" />
          </div>
        }
      />
      <div className="space-y-6">
        <PolicyCard />
        <AccessCard />
      </div>
    </>
  );
}
