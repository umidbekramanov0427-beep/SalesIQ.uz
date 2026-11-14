// Telefon (/phone): the period's calls computed on the server (/phone/data),
// and the lead lists the autodialer and voice messages work through.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { DialItem, PhoneCenterData } from "@/lib/phone-center";

export function usePhoneCenter(period: { from: string; to: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["phone_center", user?.organizationId, period.from, period.to],
    enabled: !!user?.organizationId,
    staleTime: 15_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await apiFetch(`/phone/data?from=${period.from}&to=${period.to}`);
      const json = (await res.json().catch(() => ({}))) as PhoneCenterData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load");
      return json;
    },
  });
}

/** The open leads of a funnel's chosen stages that have a phone (at most 300). */
export function useDialList(funnel: string | null, stageIds: string[]) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dial_list", user?.organizationId, funnel, stageIds.join(",")],
    enabled: !!user?.organizationId && !!funnel && stageIds.length > 0,
    queryFn: async (): Promise<DialItem[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, contact:contacts(full_name, phone)")
        .eq("funnel", funnel!)
        .in("stage_id", stageIds)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? [])
        .map((l) => {
          const c = l.contact as { full_name: string | null; phone: string | null } | null;
          return { leadId: l.id, name: c?.full_name || l.name || "", phone: c?.phone ?? "" };
        })
        .filter((l) => l.phone.replace(/\D/g, "").length >= 7);
    },
  });
}

/** Leads whose name or phone matches (the dialer's lookup, the voice message's recipients). */
export function useLeadLookup(q: string) {
  const { user } = useAuth();
  const needle = q.trim();
  const digits = needle.replace(/\D/g, "");
  return useQuery({
    queryKey: ["lead_lookup", user?.organizationId, needle],
    enabled: !!user?.organizationId && (digits.length >= 4 || needle.length >= 2),
    staleTime: 10_000,
    queryFn: async (): Promise<DialItem[]> => {
      const contacts =
        digits.length >= 4
          ? await supabase
              .from("contacts")
              .select("id, full_name, phone, leads(id, name)")
              .ilike("phone", `%${digits.slice(-9)}%`)
              .limit(8)
          : await supabase
              .from("contacts")
              .select("id, full_name, phone, leads(id, name)")
              .ilike("full_name", `%${needle.replace(/[%_]/g, "")}%`)
              .limit(8);
      if (contacts.error) throw contacts.error;
      const out: DialItem[] = [];
      for (const c of contacts.data ?? []) {
        const leads = (c.leads ?? []) as { id: string; name: string }[];
        for (const l of leads.slice(0, 2))
          out.push({ leadId: l.id, name: c.full_name || l.name, phone: c.phone ?? "" });
      }
      return out.slice(0, 10);
    },
  });
}
