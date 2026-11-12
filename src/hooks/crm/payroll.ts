// Oylik (Nazorat -> Oylik): the company's pay schemes (payroll_schemes,
// see src/lib/payroll.ts) and the month's pay per employee, worked out
// from their sales (useKpiView), plan (profiles.monthly_target) and fines.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import {
  DEFAULT_PAYROLL,
  computePay,
  parseScheme,
  schemeFor,
  type PayLine,
  type PayScheme,
  type PayrollRules,
} from "@/lib/payroll";
import { useProfilesRaw } from "./config";
import { useFinesMatrix, useKpiView } from "./team";

const isMissing = (msg: string) => /payroll_schemes|does not exist|schema cache/i.test(msg);

/** The schemes the signed-in person may see; `missing` until the migration has run. */
export function usePayrollRules() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["payroll_schemes", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<{ rules: PayrollRules; missing: boolean }> => {
      const { data, error } = await supabase
        .from("payroll_schemes")
        .select("scope, scheme")
        .eq("organization_id", user!.organizationId!);
      if (error) {
        if (isMissing(error.message)) return { rules: DEFAULT_PAYROLL, missing: true };
        throw error;
      }
      const rules: PayrollRules = { base: DEFAULT_PAYROLL.base, people: {} };
      for (const r of data ?? []) {
        if (r.scope === "base") rules.base = parseScheme(r.scheme);
        else rules.people[r.scope] = parseScheme(r.scheme);
      }
      return { rules, missing: false };
    },
  });
  return {
    rules: q.data?.rules ?? DEFAULT_PAYROLL,
    missing: q.data?.missing ?? false,
    isLoading: q.isLoading,
  };
}

/** Saves one scheme ('base' or a profile id); null removes a person's own scheme. */
export function useSavePayrollScheme() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ scope, scheme }: { scope: string; scheme: PayScheme | null }) => {
      const org = user!.organizationId!;
      if (scheme === null) {
        const { error } = await supabase
          .from("payroll_schemes")
          .delete()
          .eq("organization_id", org)
          .eq("scope", scope);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("payroll_schemes").upsert(
        {
          organization_id: org,
          scope,
          scheme: scheme as unknown as Json,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,scope" },
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["payroll_schemes"] }),
  });
}

export type PayrollRow = PayLine & {
  profileId: string;
  name: string;
  initials: string;
  revenue: number;
  salesCount: number;
  planPct: number | null;
  /** Fines given this month, whether or not the scheme takes them off. */
  rawFines: number;
  scheme: PayScheme;
  ownScheme: boolean;
};

/** Everyone's pay for the range (a month), as far as the viewer may see. */
export function usePayrollView(range: { from: Date; to: Date }) {
  const { user } = useAuth();
  const kpi = useKpiView(range);
  const fines = useFinesMatrix(range);
  const { data: profiles } = useProfilesRaw();
  const { rules, missing, isLoading } = usePayrollRules();

  const rows = useMemo<PayrollRow[]>(() => {
    const finesBy = new Map(fines.rows.map((r) => [r.profileId, r.total]));
    const targetBy = new Map((profiles ?? []).map((p) => [p.id, p.monthly_target]));
    const seeAll =
      user?.role === "super_admin" || user?.role === "platform_owner" || user?.role === "rop";
    return kpi.rows
      .filter((r) => seeAll || r.profileId === user?.id)
      .map((r): PayrollRow => {
        const target = targetBy.get(r.profileId);
        const planPct = target && target > 0 ? Math.round((r.revenue / target) * 1000) / 10 : null;
        const scheme = schemeFor(rules, r.profileId);
        const rawFines = finesBy.get(r.profileId) ?? 0;
        const line = computePay(scheme, {
          revenue: r.revenue,
          salesCount: r.salesCount,
          planPct,
          fines: rawFines,
        });
        return {
          ...line,
          profileId: r.profileId,
          name: r.name,
          initials: r.initials,
          revenue: r.revenue,
          salesCount: r.salesCount,
          planPct,
          rawFines,
          scheme,
          ownScheme: !!rules.people[r.profileId],
        };
      });
  }, [kpi.rows, fines.rows, profiles, rules, user]);

  return { rows, rules, missing, isLoading: kpi.isLoading || fines.isLoading || isLoading };
}
