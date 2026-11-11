import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Globe2,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageHeader,
  SectionCard,
  SettingRow,
  SettingRows,
  StatusChip,
} from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { LoginHistoryCard } from "@/components/admin/LoginHistoryCard";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { ipAllowed, isValidIpEntry, parseIpRules, type IpRules } from "@/lib/ip-allowlist";
import { Button } from "@/components/ui/button";
import type { Json } from "@/integrations/supabase/types";
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

// IP oq ro'yxati: sign-in only from listed addresses (src/lib/ip-allowlist.ts).
function IpAllowlistCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: settings, isLoading } = useSecuritySettings();
  const update = useUpdateSecuritySettings();
  const saved = parseIpRules(settings);
  const savedKey = JSON.stringify(saved);
  const [draft, setDraft] = useState<IpRules>(saved);
  useEffect(() => setDraft(JSON.parse(savedKey) as IpRules), [savedKey]);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const { data: me } = useQuery({
    queryKey: ["my-ip"],
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const res = await apiFetch("/account/ip-check");
      if (!res.ok) return null;
      return ((await res.json()) as { ip: string | null }).ip;
    },
  });
  const dirty = JSON.stringify(draft) !== savedKey;
  const valid = isValidIpEntry(value);
  // Saving a list that would shut out the person saving it is refused.
  const locksMeOut =
    draft.enabled &&
    draft.entries.length > 0 &&
    !ipAllowed(draft, me ?? null, user?.role === "platform_owner" ? "super_admin" : user?.role);
  const myIpListed =
    !!me &&
    draft.entries.some((e) =>
      ipAllowed({ ...draft, enabled: true, admins: true, entries: [e] }, me, "rop"),
    );

  function add(v: string, n: string) {
    const clean = v.trim();
    if (!isValidIpEntry(clean) || draft.entries.some((e) => e.value === clean)) return;
    setDraft((d) => ({
      ...d,
      entries: [...d.entries, { value: clean, note: n.trim().slice(0, 60) }],
    }));
    setValue("");
    setNote("");
  }

  async function save() {
    try {
      await update.mutateAsync({
        ip_allowlist_enabled: draft.enabled,
        ip_allowlist: draft.entries as unknown as Json,
        ip_allowlist_admins: draft.admins,
      });
      toast.success(t("ipList.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error && /ip_allowlist/.test(err.message)
          ? t("ipList.migrationPending")
          : describeError(err, t("admin.security.saveFailed")),
      );
    }
  }

  const input =
    "h-10 min-w-0 rounded-xl border border-border bg-input px-3 text-[13.5px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary";
  return (
    <SectionCard
      icon={Globe2}
      tone="sky"
      title={t("ipList.title")}
      description={t("ipList.desc")}
      actions={
        <Button onClick={() => void save()} disabled={!dirty || locksMeOut || update.isPending}>
          {t("common.save")}
        </Button>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="space-y-4">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border px-3.5 py-3">
            <span>
              <span className="block text-[13.5px] font-semibold text-foreground">
                {t("ipList.enabled")}
              </span>
              <span className="block text-[12.5px] text-muted-foreground">
                {t("ipList.enabledHint")}
              </span>
            </span>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
            />
          </label>

          <ul className="space-y-2">
            {draft.entries.map((e) => (
              <li
                key={e.value}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5"
              >
                <span className="font-mono text-[14px] font-semibold tabular-nums text-foreground">
                  {e.value}
                </span>
                {e.note && (
                  <span className="truncate text-[13px] text-muted-foreground">{e.note}</span>
                )}
                {me &&
                  ipAllowed({ ...draft, enabled: true, admins: true, entries: [e] }, me, "rop") && (
                    <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      {t("ipList.youAreHere")}
                    </span>
                  )}
                <span className="flex-1" />
                <button
                  type="button"
                  aria-label={t("common.delete")}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      entries: d.entries.filter((x) => x.value !== e.value),
                    }))
                  }
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
            {draft.entries.length === 0 && (
              <li className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-[13px] text-muted-foreground">
                {t("ipList.empty")}
              </li>
            )}
          </ul>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              add(value, note);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="213.230.64.0/24"
              aria-label={t("ipList.address")}
              className={cn(input, "w-48 font-mono", value && !valid && "border-destructive")}
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("ipList.notePh")}
              aria-label={t("ipList.note")}
              className={cn(input, "w-40")}
            />
            <Button type="submit" variant="outline" disabled={!valid}>
              <Plus className="h-4 w-4" /> {t("ipList.add")}
            </Button>
            {me && !myIpListed && (
              <Button type="button" variant="ghost" onClick={() => add(me, t("ipList.myIpNote"))}>
                {t("ipList.addMine", { ip: me })}
              </Button>
            )}
          </form>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border px-3.5 py-3">
            <span>
              <span className="block text-[13.5px] font-semibold text-foreground">
                {t("ipList.admins")}
              </span>
              <span className="block text-[12.5px] text-muted-foreground">
                {t("ipList.adminsHint")}
              </span>
            </span>
            <Switch
              checked={draft.admins}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, admins: v }))}
            />
          </label>

          {locksMeOut && (
            <p className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-[13px] font-medium text-destructive">
              {t("ipList.lockout", { ip: me ?? "?" })}
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

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
      <SectionCard icon={KeyRound} tone="amber" title={t("admin.security.policyTitle")}>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={t("admin.security.policyTitle")}
      description={t("admin.security.policyDesc")}
      icon={KeyRound}
      tone="amber"
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
            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
        </label>

        <SettingRows>
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
            <SettingRow key={row.label} title={row.label}>
              <Switch checked={row.checked} onCheckedChange={row.set} />
            </SettingRow>
          ))}
          <SettingRow
            title={t("admin.security.twoFactor")}
            description={t("admin.security.twoFactorNote")}
          >
            <Switch checked={twoFactorRequired} onCheckedChange={setTwoFactorRequired} />
          </SettingRow>
        </SettingRows>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
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
      icon={Users}
      tone="sky"
    >
      {profilesLoading || statusesLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-subtle">{t("admin.security.noUsers")}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-y border-border bg-muted/30 text-left text-[13px] text-muted-foreground">
                <th className="px-5 py-3 font-medium sm:pl-6">{t("admin.employee")}</th>
                <th className="px-5 py-3 font-medium">{t("admin.security.lastLogin")}</th>
                <th className="px-5 py-3 font-medium">{t("admin.security.status")}</th>
                <th className="px-5 py-3 text-right font-medium sm:pr-6">
                  {t("admin.security.action")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const status = statusById.get(p.id);
                const isBanned =
                  !!status?.banned_until && new Date(status.banned_until) > new Date();
                const isSelf = p.id === user?.id;
                return (
                  <tr
                    key={p.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/30"
                  >
                    <td className="px-5 py-3.5 sm:pl-6">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/12 text-[13px] font-semibold text-primary">
                          {(p.full_name || p.email || "?")
                            .split(/\s+/)
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{p.full_name || p.email}</p>
                          <p className="text-[13px] text-muted-foreground">{p.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {status?.last_sign_in_at
                        ? timeAgo(status.last_sign_in_at)
                        : t("admin.security.never")}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusChip state={isBanned ? "error" : "ok"}>
                        {isBanned ? t("admin.security.blockedPill") : t("common.active")}
                      </StatusChip>
                    </td>
                    <td className="px-5 py-3.5 text-right sm:pr-6">
                      {!isSelf && (
                        <button
                          type="button"
                          disabled={pendingId === p.id}
                          onClick={() => void toggle(p.id, !isBanned)}
                          className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-60",
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

  return (
    <>
      <PageHeader
        title={t("admin.securityCenter")}
        description={t("admin.securityCenterDesc")}
        icon={ShieldCheck}
        tone="emerald"
      />
      <div className="space-y-5">
        <PolicyCard />
        <IpAllowlistCard />
        <AccessCard />
        <LoginHistoryCard />
      </div>
    </>
  );
}
