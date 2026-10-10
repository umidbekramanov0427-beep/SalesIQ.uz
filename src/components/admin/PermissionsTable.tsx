import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Save, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, roleTone } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  useCreateRolePermission,
  useRolePermissions,
  useUpdateRolePermission,
} from "@/hooks/use-crm-data";

type Role = "super_admin" | "rop" | "sotuv_menejeri";

const ROLES: Role[] = ["super_admin", "rop", "sotuv_menejeri"];

// Every real action a role can be gated on, grouped by the part of the
// product it belongs to -- mirrors the app's actual pages, not a generic
// template. super_admin is shown for context but is never editable: it's
// always fully allowed everywhere else in the app.
const CATEGORIES: { id: string; labelKey: string; actions: string[] }[] = [
  {
    id: "leads",
    labelKey: "rbac.cat.leads",
    actions: [
      "View leads",
      "Edit leads",
      "Delete leads",
      "Export leads",
      "Assign leads",
      "Merge leads",
      "Restore leads",
    ],
  },
  {
    id: "pipeline",
    labelKey: "rbac.cat.pipeline",
    actions: ["View pipeline", "Move deals", "View revenue"],
  },
  {
    id: "tasks",
    labelKey: "rbac.cat.tasks",
    actions: ["Create tasks", "Assign tasks", "Delete tasks", "Complete tasks"],
  },
  {
    id: "reports",
    labelKey: "rbac.cat.reports",
    actions: ["View reports", "Export reports"],
  },
  {
    id: "audio",
    labelKey: "rbac.cat.audio",
    actions: ["View recordings", "AI call analysis", "Delete recordings"],
  },
  {
    id: "leaderboard",
    labelKey: "rbac.cat.leaderboard",
    actions: ["View leaderboard", "View revenue data", "View bonuses"],
  },
  {
    id: "ai",
    labelKey: "rbac.cat.ai",
    actions: ["Use AI assistant", "Generate messages"],
  },
  {
    id: "admin",
    labelKey: "rbac.cat.admin",
    actions: ["View admin panel", "Manage users", "Manage permissions", "Manage integrations"],
  },
];

const ACTION_LABEL_KEY: Record<string, string> = {
  "View leads": "stages.permission.viewLeads",
  "Edit leads": "stages.permission.editLeads",
  "Delete leads": "stages.permission.deleteLeads",
  "Export leads": "stages.permission.exportLeads",
  "Assign leads": "stages.permission.assignLeads",
  "Merge leads": "stages.permission.mergeLeads",
  "Restore leads": "stages.permission.restoreLeads",
  "View pipeline": "rbac.action.viewPipeline",
  "Move deals": "rbac.action.moveDeals",
  "View revenue": "rbac.action.viewRevenue",
  "Create tasks": "rbac.action.createTasks",
  "Assign tasks": "rbac.action.assignTasks",
  "Delete tasks": "rbac.action.deleteTasks",
  "Complete tasks": "rbac.action.completeTasks",
  "View reports": "rbac.action.viewReports",
  "Export reports": "rbac.action.exportReports",
  "View recordings": "rbac.action.viewRecordings",
  "AI call analysis": "rbac.action.aiCallAnalysis",
  "Delete recordings": "rbac.action.deleteRecordings",
  "View leaderboard": "rbac.action.viewLeaderboard",
  "View revenue data": "rbac.action.viewRevenueData",
  "View bonuses": "rbac.action.viewBonuses",
  "Use AI assistant": "rbac.action.useAiAssistant",
  "Generate messages": "rbac.action.generateMessages",
  "View admin panel": "rbac.action.viewAdminPanel",
  "Manage users": "rbac.action.manageUsers",
  "Manage permissions": "rbac.action.managePermissions",
  "Manage integrations": "rbac.action.manageIntegrations",
};

const ROLE_LABEL_KEY: Record<Role, string> = {
  super_admin: "admin.roleAdmin",
  rop: "admin.roleRop",
  sotuv_menejeri: "admin.roleRep",
};

export function PermissionsTable() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage = user?.role === "super_admin" || user?.role === "platform_owner";
  const { data: permissions, isLoading } = useRolePermissions();
  const updatePermission = useUpdateRolePermission();
  const createPermission = useCreateRolePermission();
  const [selectedRole, setSelectedRole] = useState<Role>("rop");
  // Toggling used to save on every click. Edits now stay local (keyed
  // "action::role" so switching roles mid-edit doesn't lose anything) until
  // the admin explicitly hits Saqlash -- one batch of writes, not one per
  // click.
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);

  const byActionRole = new Map((permissions ?? []).map((p) => [`${p.action}::${p.role}`, p]));

  const isLocked = selectedRole === "super_admin";
  const editable = canManage && !isLocked;

  function toggle(action: string) {
    if (!editable) return;
    const key = `${action}::${selectedRole}`;
    const current = pending.get(key) ?? byActionRole.get(key)?.allowed ?? false;
    setPending((prev) => {
      const next = new Map(prev);
      next.set(key, !current);
      return next;
    });
  }

  function isAllowed(action: string, role: Role = selectedRole): boolean {
    if (role === "super_admin") return true;
    const key = `${action}::${role}`;
    if (pending.has(key)) return pending.get(key)!;
    return byActionRole.get(key)?.allowed ?? false;
  }

  async function saveAll() {
    if (!user?.organizationId || pending.size === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        Array.from(pending.entries()).map(async ([key, allowed]) => {
          const [action, role] = key.split("::");
          const row = byActionRole.get(key);
          if (row) {
            await updatePermission.mutateAsync({ id: row.id, patch: { allowed } });
          } else {
            await createPermission.mutateAsync({
              organization_id: user.organizationId!,
              role: role!,
              action: action!,
              allowed,
            });
          }
        }),
      );
      setPending(new Map());
      toast.success(t("rbac.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("stages.permissionUpdateFailed"));
    } finally {
      setSaving(false);
    }
  }

  function discardAll() {
    setPending(new Map());
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </div>
    );
  }

  const totalActions = CATEGORIES.reduce((sum, c) => sum + c.actions.length, 0);
  const allowedCount = CATEGORIES.reduce(
    (sum, c) => sum + c.actions.filter((a) => isAllowed(a)).length,
    0,
  );
  const dirty = pending.size > 0;

  return (
    <div className="space-y-5">
      {canManage && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors",
            dirty ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                dirty ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              <Save className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {dirty ? t("rbac.unsavedTitle", { count: pending.size }) : t("rbac.savedTitle")}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {dirty ? t("rbac.unsavedDesc") : t("rbac.savedDesc")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <button
                type="button"
                onClick={discardAll}
                disabled={saving}
                className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                {t("rbac.discard")}
              </button>
            )}
            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={!dirty || saving}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("rbac.save")}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-1">
          <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("rbac.rolesHeading")}
          </p>
          {ROLES.map((role) => {
            const tone = roleTone(role);
            const active = role === selectedRole;
            const roleDirtyCount = Array.from(pending.keys()).filter((k) =>
              k.endsWith(`::${role}`),
            ).length;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setSelectedRole(role)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "bg-accent font-semibold text-foreground ring-1 ring-border"
                    : "font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    tone === "gold" && "bg-amber-500",
                    tone === "blue" && "bg-blue-500",
                    tone === "success" && "bg-success",
                    tone === "danger" && "bg-destructive",
                    tone === "neutral" && "bg-subtle",
                  )}
                />
                <span className="flex-1 truncate">{t(ROLE_LABEL_KEY[role])}</span>
                {roleDirtyCount > 0 && (
                  <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                    {roleDirtyCount}
                  </span>
                )}
                {role === "super_admin" && <Lock className="h-3.5 w-3.5 shrink-0 opacity-60" />}
              </button>
            );
          })}
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground">
                  {t(ROLE_LABEL_KEY[selectedRole])}
                </p>
                {isLocked && (
                  <p className="text-[13px] text-muted-foreground">{t("rbac.lockedHint")}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted sm:block">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${totalActions ? (allowedCount / totalActions) * 100 : 0}%` }}
                />
              </div>
              <span className="text-sm font-medium tabular-nums text-muted-foreground">
                {allowedCount}/{totalActions} {t("rbac.permissionsWord")}
              </span>
            </div>
          </div>

          {CATEGORIES.map((cat) => {
            const allowedInCat = cat.actions.filter((a) => isAllowed(a)).length;
            return (
              <div key={cat.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                  <span className="text-sm font-semibold text-foreground">{t(cat.labelKey)}</span>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {allowedInCat}/{cat.actions.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                  {cat.actions.map((action) => {
                    const allowed = isAllowed(action);
                    const key = `${action}::${selectedRole}`;
                    const isDirty = pending.has(key);
                    const label = t(ACTION_LABEL_KEY[action] ?? action);
                    return (
                      <label
                        key={action}
                        className={cn(
                          "flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 text-sm transition-colors sm:border-r",
                          editable ? "cursor-pointer hover:bg-accent/40" : "cursor-default",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "truncate",
                              allowed ? "font-medium text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {label}
                          </span>
                          {isDirty && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                              aria-label={t("rbac.unsavedDesc")}
                            />
                          )}
                        </span>
                        <Switch
                          checked={allowed}
                          disabled={!editable}
                          onCheckedChange={() => toggle(action)}
                          aria-label={label}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
