// Sozlamalar → Huquqlar: the company's access rules (org_access_rules,
// lib/access-rules.ts). Everyone reads them -- the menu, the funnel list
// and whose leads you see follow them -- only a super admin saves them.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { parseAccessRules, type AccessRules } from "@/lib/access-rules";

const EMPTY: AccessRules = {};

export function useAccessRules(): { rules: AccessRules; isLoading: boolean } {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["org_access_rules", user?.organizationId],
    enabled: !!user?.organizationId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AccessRules> => {
      const { data, error } = await supabase
        .from("org_access_rules")
        .select("rules")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      // Before the migration runs the table is missing: no rules, defaults apply.
      if (error) return EMPTY;
      return parseAccessRules(data?.rules);
    },
  });
  return { rules: q.data ?? EMPTY, isLoading: q.isLoading };
}

export function useSaveAccessRules() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (rules: AccessRules) => {
      const { error } = await supabase.from("org_access_rules").upsert({
        organization_id: user!.organizationId!,
        rules: rules as unknown as Json,
        updated_by: user!.id,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        if (/org_access_rules/.test(error.message)) throw new Error("MIGRATION_PENDING");
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org_access_rules"] }),
  });
}
