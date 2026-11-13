import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, LogOut, MessagesSquare, Send, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SectionCard, SettingRow, SettingRows, StatusChip } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import {
  useWorkTelegramTeam,
  useWorkTelegramTeamAction,
  type TeamWorkAccount,
  type WorkTeamState,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { WORK_ROLES } from "@/lib/telegram-user/work-account";
import { cn, describeError, formatDate } from "@/lib/utils";

// Integratsiyalar → «Telegram (sotuvchi akkaunti)»: the company's rules for
// salespeople's work Telegram accounts, and everyone's account -- connected
// or not, working or not, how many client chats it brought -- with
// «Uzish» for an admin or ROP. Each person connects their own account in
// Sozlamalar → «Telegram akkauntim».

export function WorkTelegramTeamCard() {
  const { t } = useI18n();
  const { data, isLoading, error } = useWorkTelegramTeam();
  const action = useWorkTelegramTeamAction();
  const [target, setTarget] = useState<TeamWorkAccount | null>(null);

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {describeError(error, t("tgu.failed"))}
      </p>
    );
  }

  const connected = data.team.filter((p) => p.account);
  const broken = connected.filter((p) => p.account?.status === "error");

  function savePolicy(patch: Partial<WorkTeamState["policy"]>) {
    action.mutate(
      { action: "policy", policy: { ...data!.policy, ...patch } },
      {
        onSuccess: () => toast.success(t("fs.saved")),
        onError: (e) => toast.error(describeError(e, t("tgu.failed"))),
      },
    );
  }

  return (
    <div className="space-y-4">
      {!data.configured && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-200">
          {t("tgu.notConfigured")}
        </p>
      )}

      <SectionCard
        icon={ShieldCheck}
        tone="sky"
        title={t("tguT.rulesTitle")}
        description={t("tguT.rulesDesc")}
        actions={
          <StatusChip state={data.policy.enabled ? "ok" : "off"}>
            {data.policy.enabled ? t("tguT.on") : t("tguT.off")}
          </StatusChip>
        }
      >
        <SettingRows>
          <SettingRow title={t("tguT.enabled")} description={t("tguT.enabledDesc")}>
            <Switch
              checked={data.policy.enabled}
              disabled={!data.canEdit || action.isPending}
              onCheckedChange={(v) => savePolicy({ enabled: v })}
            />
          </SettingRow>
          <SettingRow title={t("tguT.createLeads")} description={t("tguT.createLeadsDesc")}>
            <Switch
              checked={data.policy.createLeads}
              disabled={!data.canEdit || !data.policy.enabled || action.isPending}
              onCheckedChange={(v) => savePolicy({ createLeads: v })}
            />
          </SettingRow>
        </SettingRows>
        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">{t("tguT.roles")}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{t("tguT.rolesDesc")}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {WORK_ROLES.map((r) => {
              const on = data.policy.roles.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={on}
                  disabled={!data.canEdit || !data.policy.enabled || action.isPending}
                  onClick={() =>
                    savePolicy({
                      roles: on
                        ? data.policy.roles.filter((x) => x !== r)
                        : [...data.policy.roles, r],
                    })
                  }
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-60",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {t(`tguT.role.${r}`)}
                </button>
              );
            })}
          </div>
        </div>
        {!data.canEdit && (
          <p className="mt-3 text-[12.5px] text-muted-foreground">{t("tguT.adminOnly")}</p>
        )}
      </SectionCard>

      <SectionCard
        icon={Users}
        tone="sky"
        title={t("tguT.teamTitle")}
        description={t("tguT.teamDesc", { n: connected.length, total: data.team.length })}
        actions={
          broken.length > 0 ? (
            <StatusChip state="warn">{t("tguT.broken", { n: broken.length })}</StatusChip>
          ) : undefined
        }
      >
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="py-2.5 pl-4 pr-2 font-bold sm:pl-5">{t("tguT.colPerson")}</th>
                <th className="px-3 py-2.5 font-bold">{t("tguT.colAccount")}</th>
                <th className="px-3 py-2.5 text-right font-bold">{t("tguT.colChats")}</th>
                <th className="px-3 py-2.5 font-bold">{t("tguT.colLast")}</th>
                <th className="py-2.5 pl-3 pr-4 sm:pr-5" />
              </tr>
            </thead>
            <tbody>
              {data.team.map((p) => (
                <tr key={p.profileId} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pl-4 pr-2 sm:pl-5">
                    <p className="font-semibold text-foreground">{p.name}</p>
                    <p className="text-xs text-subtle">{p.role ? t(`tguT.role.${p.role}`) : "—"}</p>
                  </td>
                  <td className="px-3 py-3">
                    {p.account ? (
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-full text-white",
                            p.account.status === "ok" ? "bg-sky-500" : "bg-amber-500",
                          )}
                        >
                          <Send className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">
                            {p.account.name ||
                              (p.account.username ? `@${p.account.username}` : "—")}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[p.account.phone, p.account.username && `@${p.account.username}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {p.account.status === "error" && (
                            <span className="block text-xs font-medium text-amber-700 dark:text-amber-300">
                              {p.account.lastError || t("tgu.stateError")}
                            </span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">
                        {t("tguT.notConnected")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {p.account ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                        <MessagesSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        {p.account.chats}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3 text-[13px] text-muted-foreground">
                    {p.account?.lastEventAt
                      ? formatDate(p.account.lastEventAt)
                      : p.account
                        ? t("tguT.since", { date: formatDate(p.account.connectedAt) })
                        : "—"}
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right sm:pr-5">
                    {p.account && (
                      <button
                        type="button"
                        onClick={() => setTarget(p)}
                        className="ctl-soft inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-rose-600 dark:text-rose-300"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        {t("tgu.disconnect")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[12.5px] text-muted-foreground">
          {t("tguT.howTo")}{" "}
          <Link
            to="/settings"
            search={{ section: "tgAccount" } as never}
            className="font-semibold text-primary hover:underline"
          >
            {t("tgu.title")}
          </Link>
        </p>
      </SectionCard>

      <ConfirmDialog
        open={!!target}
        onOpenChange={(v) => !v && setTarget(null)}
        title={t("tguT.disconnectTitle", { name: target?.name ?? "" })}
        description={t("tguT.disconnectDesc")}
        confirmLabel={t("tgu.disconnect")}
        destructive
        onConfirm={() => {
          const p = target;
          setTarget(null);
          if (!p) return;
          action.mutate(
            { action: "disconnect", profileId: p.profileId },
            {
              onSuccess: () => toast.success(t("tgu.disconnected")),
              onError: (e) => toast.error(describeError(e, t("tgu.failed"))),
            },
          );
        }}
      />
    </div>
  );
}
