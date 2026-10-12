import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Network, ShieldAlert, Building2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { OrgStructureChart } from "@/components/content-library/OrgStructureChart";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { initialsOf } from "@/lib/utils";
import { useProfilesRaw, useUpdateProfile, type ProfileRow } from "@/hooks/use-crm-data";

export const Route = createFileRoute("/admin/org-structure")({
  head: () => ({
    meta: [
      { title: "Org structure — SalesIQ" },
      { name: "description", content: "Company reporting structure, admin only." },
    ],
  }),
  component: OrgStructurePage,
});

function name(p: ProfileRow): string {
  return p.full_name || p.email;
}

function descendantIds(id: string, childrenMap: Map<string, ProfileRow[]>): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of childrenMap.get(cur) ?? []) {
      if (!out.has(child.id)) {
        out.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return out;
}

function OrgNode({
  profile,
  childrenMap,
  allProfiles,
  depth,
  ancestorIds,
}: {
  profile: ProfileRow;
  childrenMap: Map<string, ProfileRow[]>;
  allProfiles: ProfileRow[];
  depth: number;
  // Chain of ids from the root down to (and including) this node. The
  // manager-picker dropdown already refuses to let an admin create a new
  // cycle (see `blocked` below via descendantIds), but that only guards
  // future edits -- it did nothing about a cycle already sitting in the
  // data (bad import, a manual DB edit, a since-fixed bug). Rendering such
  // a cycle recursed forever and blew the call stack, which is exactly
  // what showed up as a blank white screen. Any child already in this
  // node's own ancestor chain is a cycle -- render it as a flagged leaf
  // instead of recursing into it again.
  ancestorIds: Set<string>;
}) {
  const { t } = useI18n();
  const updateProfile = useUpdateProfile();
  const kids = childrenMap.get(profile.id) ?? [];
  const blocked = useMemo(() => descendantIds(profile.id, childrenMap), [profile.id, childrenMap]);
  const managerOptions = allProfiles.filter((p) => p.id !== profile.id && !blocked.has(p.id));

  async function setManager(managerId: string) {
    try {
      await updateProfile.mutateAsync({ id: profile.id, patch: { manager_id: managerId || null } });
      toast.success(t("admin.org.updated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.org.updateFailed"));
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint text-xs font-bold text-mint-foreground">
          {initialsOf(name(profile))}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{name(profile)}</p>
          <p className="truncate text-xs text-subtle">{profile.position || profile.role}</p>
        </div>
        {profile.department && <Pill tone="info">{profile.department}</Pill>}
        <select
          value={profile.manager_id ?? ""}
          onChange={(e) => void setManager(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <option value="">{t("admin.org.noManager")}</option>
          {managerOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {name(m)}
            </option>
          ))}
        </select>
      </div>
      {kids.length > 0 && (
        <div className="ml-5 mt-2 space-y-2 border-l border-border pl-5">
          {kids.map((k) =>
            ancestorIds.has(k.id) ? (
              <div
                key={k.id}
                className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs font-medium text-destructive"
              >
                <ShieldAlert className="h-4 w-4 shrink-0" />
                {t("admin.org.cycleWarning", { name: name(k) })}
              </div>
            ) : (
              <OrgNode
                key={k.id}
                profile={k}
                childrenMap={childrenMap}
                allProfiles={allProfiles}
                depth={depth + 1}
                ancestorIds={new Set(ancestorIds).add(k.id)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function OrgStructurePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: profiles, isLoading } = useProfilesRaw();

  const rows = useMemo(() => profiles ?? [], [profiles]);
  const childrenMap = useMemo(() => {
    const m = new Map<string, ProfileRow[]>();
    for (const p of rows) {
      if (p.manager_id) {
        if (!m.has(p.manager_id)) m.set(p.manager_id, []);
        m.get(p.manager_id)!.push(p);
      }
    }
    return m;
  }, [rows]);
  const roots = useMemo(() => {
    const idSet = new Set(rows.map((p) => p.id));
    return rows.filter((p) => !p.manager_id || !idSet.has(p.manager_id));
  }, [rows]);

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
        icon={Network}
        tone="violet"
        title={t("admin.orgStructure")}
        description={t("admin.orgStructureDesc")}
      />
      <SectionCard
        icon={Building2}
        tone="primary"
        title={t("admin.org.companyLabel")}
        description={t("admin.org.employeesCount", { count: rows.length })}
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : roots.length === 0 ? (
          <p className="flex items-center gap-2 py-6 text-center text-sm text-subtle">
            <Network className="h-4 w-4" /> {t("admin.noSignups")}
          </p>
        ) : (
          <div className="space-y-3">
            {roots.map((r) => (
              <OrgNode
                key={r.id}
                profile={r}
                childrenMap={childrenMap}
                allProfiles={rows}
                depth={0}
                ancestorIds={new Set([r.id])}
              />
            ))}
          </div>
        )}
      </SectionCard>
      {/* The role chart new hires read in Sinfxona -- edited only here. */}
      <div className="mt-5">
        <OrgStructureChart canEdit />
      </div>
    </>
  );
}
