// Marketing paneli: its figures from /marketing/data (src/lib/marketing.server.ts).
import { useMemo } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "./core";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { MarketingData } from "@/lib/marketing";
import type { ChannelAnalytics, TgStats } from "@/lib/channel-analytics";
import { parseMarketingRules, type MarketingRules } from "@/lib/marketing-rules";
import { useOrgGeneralSettings } from "./settings";

export function useMarketingData(
  period: { from: string; to: string },
  projectId: string | null = null,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing_data", user?.organizationId, period.from, period.to, projectId],
    enabled: !!user?.organizationId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<MarketingData> => {
      const qs = new URLSearchParams({ from: period.from, to: period.to });
      if (projectId) qs.set("project", projectId);
      const res = await apiFetch(`/marketing/data?${qs}`);
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
    queryFn: async (): Promise<
      {
        channel_id: string;
        day: string;
        members: number;
        joined?: number | null;
        left_count?: number | null;
      }[]
    > => {
      const q = (cols: string) =>
        supabase
          .from("marketing_channel_days")
          .select(cols)
          .eq("organization_id", user!.organizationId!)
          .gte("day", fromDay)
          .order("day");
      // joined / left_count come with the channel-analytics migration.
      let res = await q("channel_id, day, members, joined, left_count");
      if (res.error) res = await q("channel_id, day, members");
      if (res.error) return [];
      return (res.data ?? []) as unknown as {
        channel_id: string;
        day: string;
        members: number;
      }[];
    },
  });
}

export type NewChannel = {
  /** @username or a t.me link (public channel). */
  channel?: string;
  /** A chat the company bound with /bind (private channel). */
  chatId?: number;
  projectId: string | null;
  purpose: "main" | "ads" | "webinar";
  inviteLink?: string | null;
  note?: string | null;
  trackLive: boolean;
};

export type ChannelPatch = Partial<
  Pick<ChannelRow, "project_id" | "purpose" | "invite_link" | "note" | "track_live" | "title">
>;

type ArchivableTable = "marketing_channels" | "marketing_webinars" | "marketing_projects";

async function setArchived(table: ArchivableTable, id: string, archived: boolean) {
  const { error } = await supabase
    .from(table)
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
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
      mutationFn: (input: NewChannel) => postChannels({ action: "add", ...input }),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: ChannelPatch }) => {
        const { error } = await supabase.from("marketing_channels").update(patch).eq("id", id);
        if (error) throw error;
      },
      onSuccess: done,
    }),
    archive: useMutation({
      mutationFn: (id: string) => setArchived("marketing_channels", id, true),
      onSuccess: done,
    }),
    restore: useMutation({
      mutationFn: (id: string) => setArchived("marketing_channels", id, false),
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
    archive: useMutation({
      mutationFn: (id: string) => setArchived("marketing_webinars", id, true),
      onSuccess: done,
    }),
    restore: useMutation({
      mutationFn: (id: string) => setArchived("marketing_webinars", id, false),
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

/* ---- Loyihalar (src/lib/marketing-projects.ts) -------------------------- */

export type ProjectRow = Tables["marketing_projects"]["Row"];

/** Every project of the company, archived ones included (callers filter). */
export function useMarketingProjects() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing_projects", user?.organizationId],
    enabled: !!user?.organizationId,
    staleTime: 60_000,
    queryFn: async (): Promise<{ rows: ProjectRow[]; missing: boolean }> => {
      const { data, error } = await supabase
        .from("marketing_projects")
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

export type ProjectDraft = Pick<
  ProjectRow,
  "name" | "color" | "funnels" | "utm_campaigns" | "note"
>;

export function useProjectMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["marketing_projects"] });
    void qc.invalidateQueries({ queryKey: ["marketing_data"] });
  };
  return {
    save: useMutation({
      mutationFn: async ({ id, draft }: { id?: string; draft: ProjectDraft }) => {
        if (id) {
          const { error } = await supabase.from("marketing_projects").update(draft).eq("id", id);
          if (error) throw error;
          return id;
        }
        const { data, error } = await supabase
          .from("marketing_projects")
          .insert({ ...draft, organization_id: user!.organizationId!, created_by: user!.id })
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      },
      onSuccess: done,
    }),
    archive: useMutation({
      mutationFn: (id: string) => setArchived("marketing_projects", id, true),
      onSuccess: done,
    }),
    restore: useMutation({
      mutationFn: (id: string) => setArchived("marketing_projects", id, false),
      onSuccess: done,
    }),
    destroy: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from("marketing_projects").delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: done,
    }),
  };
}

/* ---- Screenshotlar (marketing_shots) ------------------------------------ */

export type ShotRow = Tables["marketing_shots"]["Row"] & { url: string | null };

/** Proof pictures of a project or of one webinar, with short-lived links. */
export function useShots(filter: { projectId?: string | null; webinarId?: string | null }) {
  const { user } = useAuth();
  const qs = new URLSearchParams();
  if (filter.projectId) qs.set("project", filter.projectId);
  if (filter.webinarId) qs.set("webinar", filter.webinarId);
  return useQuery({
    queryKey: ["marketing_shots", user?.organizationId, qs.toString()],
    enabled: !!user?.organizationId && (!!filter.projectId || !!filter.webinarId),
    staleTime: 60_000,
    queryFn: async (): Promise<ShotRow[]> => {
      const res = await apiFetch(`/marketing-api/shots?${qs}`);
      const json = (await res.json().catch(() => ({}))) as { shots?: ShotRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load pictures");
      return json.shots ?? [];
    },
  });
}

export function useShotUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      file: File;
      webinarId?: string | null;
      projectId?: string | null;
      viewers?: number | null;
    }) => {
      const form = new FormData();
      form.set("file", input.file);
      if (input.webinarId) form.set("webinar", input.webinarId);
      if (input.projectId) form.set("project", input.projectId);
      if (input.viewers != null) form.set("viewers", String(input.viewers));
      const res = await apiFetch("/marketing-api/shots", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["marketing_shots"] }),
  });
}

export function useShotDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/marketing-api/shots?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["marketing_shots"] }),
  });
}

/* ---- Manbalar: Telegram akkaunt (efirlar) va Meta reklama --------------- */

export type TgAccountStatus = {
  /** The live-stream service is set up on the server. */
  configured: boolean;
  account: {
    phone: string | null;
    user: string | null;
    status: string;
    lastError: string | null;
    connectedAt: string;
  } | null;
};

export function useTgAccount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing_tg_account", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<TgAccountStatus> => {
      const res = await apiFetch("/marketing-api/tg-account");
      if (!res.ok) return { configured: false, account: null };
      return (await res.json()) as TgAccountStatus;
    },
  });
}

/** Where Telegram sent the sign-in code and where a resend would go. */
export type TgCodeInfo = { via: string; next: string | null; timeout: number | null };

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Xatolik");
  return json;
}

export function useTgAccountActions() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["marketing_tg_account"] });
  return {
    start: useMutation({
      mutationFn: (phone: string) =>
        postJson<{ loginId: string } & TgCodeInfo>("/marketing-api/tg-account", {
          action: "start",
          phone,
        }),
    }),
    resend: useMutation({
      mutationFn: (loginId: string) =>
        postJson<TgCodeInfo>("/marketing-api/tg-account", { action: "resend", loginId }),
    }),
    code: useMutation({
      mutationFn: (b: { loginId: string; code: string; password?: string; phone: string }) =>
        postJson<{ ok?: boolean; needPassword?: boolean }>("/marketing-api/tg-account", {
          action: "code",
          ...b,
        }),
      onSuccess: done,
    }),
    disconnect: useMutation({
      mutationFn: () => postJson("/marketing-api/tg-account", { action: "disconnect" }),
      onSuccess: done,
    }),
  };
}

export type MetaAdAccount = { id: string; name: string; currency: string };
export type MetaStatus = {
  configured: boolean;
  account: {
    user: string | null;
    expiresAt: string | null;
    adAccounts: MetaAdAccount[];
    selected: string[];
    lastSyncAt: string | null;
    lastError: string | null;
  } | null;
};

export function useMetaAccount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing_meta", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<MetaStatus> => {
      const res = await apiFetch("/marketing-api/meta");
      if (!res.ok) return { configured: false, account: null };
      return (await res.json()) as MetaStatus;
    },
  });
}

export function useMetaActions() {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["marketing_meta"] });
    void qc.invalidateQueries({ queryKey: ["marketing_data"] });
  };
  return {
    start: useMutation({
      mutationFn: () => postJson<{ url: string }>("/marketing-api/meta", { action: "start" }),
    }),
    select: useMutation({
      mutationFn: (accounts: string[]) =>
        postJson("/marketing-api/meta", { action: "select", accounts }),
      onSuccess: done,
    }),
    sync: useMutation({
      mutationFn: () => postJson<{ rows: number }>("/marketing-api/meta", { action: "sync" }),
      onSuccess: done,
    }),
    disconnect: useMutation({
      mutationFn: () => postJson("/marketing-api/meta", { action: "disconnect" }),
      onSuccess: done,
    }),
  };
}

/* ---- Kanal analitikasi va Kuzatuv sozlamalari -------------------------- */

export type ChannelAnalyticsResponse = {
  migrated: boolean;
  rules: MarketingRules;
  analytics: ChannelAnalytics;
  stats: TgStats | null;
  source: {
    botAdmin: boolean | null;
    account: string | null;
    statsAt: string | null;
    statsError: string | null;
  };
};

/** One channel's analytics for days [from, to] (Tashkent), from the server. */
export function useChannelAnalytics(id: string, from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing_channel_analytics", user?.organizationId, id, from, to],
    enabled: !!user?.organizationId && !!id,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ChannelAnalyticsResponse> => {
      const res = await apiFetch(
        `/marketing-api/channel-analytics?id=${encodeURIComponent(id)}&from=${from}&to=${to}`,
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as ChannelAnalyticsResponse;
    },
  });
}

/** Marketing -> Sozlash -> Kuzatuv; the defaults until saved. */
export function useMarketingRules(): MarketingRules {
  const { data } = useOrgGeneralSettings();
  const raw = (data as { marketing_rules?: unknown } | null | undefined)?.marketing_rules;
  return useMemo(() => parseMarketingRules(raw), [raw]);
}

export function useSaveMarketingRules() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (rules: MarketingRules) =>
      postJson<{ rules: MarketingRules }>("/marketing-api/settings", { rules }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["org_general_settings", user?.organizationId] });
      void qc.invalidateQueries({ queryKey: ["marketing_channel_analytics"] });
    },
  });
}
