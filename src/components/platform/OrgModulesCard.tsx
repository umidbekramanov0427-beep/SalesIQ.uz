// Kompaniya kartasi → Tarif: add-on modules the platform owner turns on
// for one company (today: Ombor). Hidden from the company until switched on.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const MODULES = [{ key: "warehouse", icon: Package }] as const;

export function OrgModulesCard({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["platform_org_modules", orgId],
    queryFn: async (): Promise<{ module: string; enabled: boolean }[]> => {
      const res = await apiFetch(`/platform/org-modules?org=${orgId}`);
      if (!res.ok) return [];
      return ((await res.json()) as { modules: { module: string; enabled: boolean }[] }).modules;
    },
  });
  const set = useMutation({
    mutationFn: async (v: { module: string; enabled: boolean }) => {
      const res = await apiFetch("/platform/org-modules", {
        method: "POST",
        body: JSON.stringify({ org: orgId, ...v }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "error");
    },
    onSuccess: () => {
      toast.success(t("wh.saved"));
      void qc.invalidateQueries({ queryKey: ["platform_org_modules", orgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  return (
    <SectionCard
      icon={Package}
      tone="amber"
      title={t("orgmod.title")}
      description={t("orgmod.desc")}
    >
      <div className="divide-y divide-border">
        {MODULES.map((m) => {
          const on = !!q.data?.find((x) => x.module === m.key && x.enabled);
          return (
            <div key={m.key} className="flex items-center justify-between gap-4 py-3">
              <div>
                <div className="text-[14px] font-semibold">{t(`orgmod.${m.key}`)}</div>
                <div className="text-[13px] text-muted-foreground">{t(`orgmod.${m.key}.desc`)}</div>
              </div>
              <Switch
                checked={on}
                disabled={q.isLoading || set.isPending}
                onCheckedChange={(v) => set.mutate({ module: m.key, enabled: v })}
                aria-label={t(`orgmod.${m.key}`)}
              />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
