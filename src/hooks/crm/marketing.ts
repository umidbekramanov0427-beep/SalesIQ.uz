// Marketing paneli: its figures from /marketing/data (src/lib/marketing.server.ts).
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "./core";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { MarketingData } from "@/lib/marketing";

export function useMarketingData(period: { from: string; to: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing_data", user?.organizationId, period.from, period.to],
    enabled: !!user?.organizationId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<MarketingData> => {
      const res = await apiFetch(
        `/marketing/data?${new URLSearchParams({ from: period.from, to: period.to })}`,
      );
      const json = (await res.json().catch(() => ({}))) as MarketingData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load marketing data");
      return json;
    },
  });
}

/* ---- Kanallar va vebinarlar (src/lib/webinars.ts) ---------------------- */

export type ChannelRow = Tables["marketing_channels"]["Row"];
export type WebinarRow = Tables["marketing_webinars"]["Row"];
export type WebinarSampleRow = Tables["marketing_webinar_samples"]["Row"];
export type WebinarMarkRow = Tables["marketing_webinar_marks"]["Row"];

const tableMissing = (msg: string) => /marketing_|does not exist|schema cache/i.test(msg);

export function useChannels() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing_channels", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<{ rows: ChannelRow[]; missing: boolean }> => {
      const { data, error } = await supabase
        .from("marketing_channels")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .order("created_at");
      if (error) {
        if (tableMissing(error.message)) return { rows: [], missing: true };
        throw error;
      }
      return { rows: data ?? [], missing: false };
    },
  });
}

/** Subscribers per day for the company's channels since a day ("YYYY-MM-DD"). */
export function useChannelDays(fromDay: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing_channel_days", user?.organizationId, fromDay],
    enabled: !!user?.organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_channel_days")
        .select("channel_id, day, members")
        .eq("organization_id", user!.organizationId!)
        .gte("day", fromDay)
        .order("day");
      if (error) return [];
      return data ?? [];
    },
  });
}

async function postChannels(body: Record<string, unknown>) {
  const res = await apiFetch("/marketing-api/channels", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Xatolik");
  return json;
}

export function useChannelMutations() {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["marketing_channels"] });
    void qc.invalidateQueries({ queryKey: ["marketing_channel_days"] });
  };
  return {
    add: useMutation({
      mutationFn: (channel: string) => postChannels({ action: "add", channel }),
      onSuccess: done,
    }),
    refresh: useMutation({
      mutationFn: (id: string) => postChannels({ action: "refresh", id }),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from("marketing_channels").delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: done,
    }),
  };
}

export function useWebinars() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing_webinars", user?.organizationId],
    enabled: !!user?.organizationId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<{
      rows: WebinarRow[];
      samples: Pick<WebinarSampleRow, "webinar_id" | "at" | "viewers">[];
      missing: boolean;
    }> => {
      const { data, error } = await supabase
        .from("marketing_webinars")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        if (tableMissing(error.message)) return { rows: [], samples: [], missing: true };
        throw error;
      }
      const ids = (data ?? []).map((w) => w.id);
      const { data: samples } = ids.length
        ? await supabase
            .from("marketing_webinar_samples")
            .select("webinar_id, at, viewers")
            .in("webinar_id", ids)
            .limit(20_000)
        : { data: [] };
      return { rows: data ?? [], samples: samples ?? [], missing: false };
    },
  });
}

/** One webinar with its counts and marks; refreshed every 20 s while live. */
export function useWebinar(id: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing_webinar", id],
    enabled: !!user?.organizationId && !!id,
    refetchInterval: (q) =>
      (q.state.data as { webinar?: WebinarRow } | undefined)?.webinar?.status === "live"
        ? 20_000
        : false,
    queryFn: async () => {
      const [w, s, m] = await Promise.all([
        supabase.from("marketing_webinars").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("marketing_webinar_samples")
          .select("*")
          .eq("webinar_id", id)
          .order("at")
          .limit(5000),
        supabase.from("marketing_webinar_marks").select("*").eq("webinar_id", id).order("at"),
      ]);
      if (w.error) throw w.error;
      return {
        webinar: w.data as WebinarRow | null,
        samples: (s.data ?? []) as WebinarSampleRow[],
        marks: (m.data ?? []) as WebinarMarkRow[],
      };
    },
  });
}

export function useWebinarMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["marketing_webinars"] });
    void qc.invalidateQueries({ queryKey: ["marketing_webinar"] });
  };
  const org = () => user!.organizationId!;
  return {
    save: useMutation({
      mutationFn: async ({
        id,
        patch,
      }: {
        id?: string;
        patch: Partial<Tables["marketing_webinars"]["Insert"]>;
      }) => {
        if (id) {
          const { error } = await supabase.from("marketing_webinars").update(patch).eq("id", id);
          if (error) throw error;
          return id;
        }
        const { data, error } = await supabase
          .from("marketing_webinars")
          .insert({ title: "", ...patch, organization_id: org(), created_by: user!.id })
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from("marketing_webinars").delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: done,
    }),
    addSample: useMutation({
      mutationFn: async ({ webinarId, viewers }: { webinarId: string; viewers: number }) => {
        const { error } = await supabase.from("marketing_webinar_samples").upsert(
          {
            webinar_id: webinarId,
            organization_id: org(),
            at: new Date().toISOString(),
            viewers,
            source: "manual",
          },
          { onConflict: "webinar_id,at" },
        );
        if (error) throw error;
      },
      onSuccess: done,
    }),
    addMark: useMutation({
      mutationFn: async (m: { webinarId: string; kind: string; label?: string | null }) => {
        const { error } = await supabase.from("marketing_webinar_marks").insert({
          webinar_id: m.webinarId,
          organization_id: org(),
          kind: m.kind,
          label: m.label ?? null,
        });
        if (error) throw error;
      },
      onSuccess: done,
    }),
    removeMark: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from("marketing_webinar_marks").delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: done,
    }),
  };
}
