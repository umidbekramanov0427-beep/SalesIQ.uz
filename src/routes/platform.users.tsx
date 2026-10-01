import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, ShieldAlert, Trash2, Users2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill, ChannelActionButton } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditUserDialog } from "@/components/EditUserDialog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { roleTone } from "@/lib/utils";
import { useAllProfiles, useDeleteUserAsOwner, type OwnerProfileRow } from "@/hooks/use-crm-data";

export const Route = createFileRoute("/platform/users")({
  head: () => ({
    meta: [{ title: "Users — SalesIQ" }],
  }),
  component: PlatformUsersPage,
});

function PlatformUsersPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: profiles, isLoading } = useAllProfiles();
  const deleteUser = useDeleteUserAsOwner();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OwnerProfileRow | null>(null);

  if (user && user.role !== "platform_owner") {
    return (
      <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  async function applyDelete(profile: OwnerProfileRow) {
    setDeletingId(profile.id);
    try {
      await deleteUser.mutateAsync(profile.id);
      toast.success(t("admin.employeeDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.employeeDeleteFailed"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader title={t("platform.usersTitle")} description={t("platform.usersDesc")} />

      <SectionCard title={t("platform.usersTitle")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !profiles?.length ? (
          <p className="flex items-center gap-2 text-sm text-subtle">
            <Users2 className="h-4 w-4" /> {t("platform.noUsers")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-4 py-3 font-medium">{t("admin.colEmployee")}</th>
                  <th className="px-4 py-3 font-medium">{t("admin.colEmail")}</th>
                  <th className="px-4 py-3 font-medium">{t("platform.orgsTitle")}</th>
                  <th className="px-4 py-3 font-medium">{t("admin.colRole")}</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface">
                    <td className="px-4 py-3 font-medium">{p.full_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.organizations?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={roleTone(p.role)}>{p.role}</Pill>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.role !== "platform_owner" && (
                        <div className="flex items-center justify-end gap-1">
                          <EditUserDialog profile={p} />
                          <ChannelActionButton
                            icon={Trash2}
                            label={t("admin.deleteEmployee")}
                            tone="destructive"
                            loading={deletingId === p.id}
                            onClick={() => setPendingDelete(p)}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("admin.confirmDeleteTitle")}
        description={
          pendingDelete
            ? t("admin.confirmDeleteDesc", {
                name: pendingDelete.full_name || pendingDelete.email,
              })
            : undefined
        }
        onConfirm={() => {
          if (pendingDelete) void applyDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </>
  );
}
