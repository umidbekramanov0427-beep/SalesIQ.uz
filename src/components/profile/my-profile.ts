import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";

// The signed-in person's own profile row for Sozlamalar → Profil. The new
// columns (20270206_profile_5crm) may not exist yet: saving them then says
// so instead of failing silently.

export type MyProfile = Database["public"]["Tables"]["profiles"]["Row"];
export type MyProfilePatch = Database["public"]["Tables"]["profiles"]["Update"];

export class NeedsMigrationError extends Error {
  constructor() {
    super("needs-migration");
  }
}

export function useMyProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<MyProfile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveMyProfile() {
  const qc = useQueryClient();
  const { user, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (patch: MyProfilePatch) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", user!.id);
      if (error) {
        // PostgREST: a column it does not know (the migration has not run).
        if (error.code === "PGRST204" || error.code === "42703") throw new NeedsMigrationError();
        throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-profile", user?.id] });
      await refreshProfile();
    },
  });
}
