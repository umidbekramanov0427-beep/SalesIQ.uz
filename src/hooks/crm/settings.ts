// AI assistant history, notification preferences, business profile, general/work-schedule/security settings, amoCRM import settings, tags.
// Split out of src/hooks/use-crm-data.ts, which re-exports everything here.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RESOURCE_PAGE_SIZE, fetchAllPages, useLeadsRaw } from "./core";
import type { Tables } from "./core";
import type { CallAnalysis } from "./crm-views";

/* ------------------------------------------------------------------ */
/* AI Assistant chat history -- conversations used to live only in the  */
/* browser tab's React state (gone on refresh), so there was no "Tarix" */
/* (history) to show, search, or resume. Persisted the same way the     */
/* rest of the app's owner-scoped tables work.                          */
/* ------------------------------------------------------------------ */

export type AiChatConversationRow = Database["public"]["Tables"]["ai_chat_conversations"]["Row"];

export type AiChatMessageRow = Database["public"]["Tables"]["ai_chat_messages"]["Row"];

export function useAiConversations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ai_chat_conversations", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AiChatConversationRow[]> => {
      const { data, error } = await supabase
        .from("ai_chat_conversations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAiConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["ai_chat_messages", conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<AiChatMessageRow[]> => {
      const { data, error } = await supabase
        .from("ai_chat_messages")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateAiConversation() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title: string): Promise<AiChatConversationRow> => {
      if (!user?.id) throw new Error("Not signed in.");
      const { data, error } = await supabase
        .from("ai_chat_conversations")
        .insert({ profile_id: user.id, title: title.slice(0, 80) || "New chat" })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ai_chat_conversations"] });
    },
  });
}

export function useSaveAiMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      conversationId: string;
      role: "user" | "assistant";
      content: string;
    }) => {
      const { error: insertError } = await supabase.from("ai_chat_messages").insert({
        conversation_id: input.conversationId,
        role: input.role,
        content: input.content,
      });
      if (insertError) throw insertError;
      // Bumps updated_at so this conversation sorts back to the top of the
      // history panel the moment it gets a new message.
      const { error: touchError } = await supabase
        .from("ai_chat_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", input.conversationId);
      if (touchError) throw touchError;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["ai_chat_conversations"] });
      void qc.invalidateQueries({ queryKey: ["ai_chat_messages", vars.conversationId] });
    },
  });
}

export function useAnalyzeCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      callId: string,
    ): Promise<{
      transcript: string;
      summary: string;
      nextStep: string | null;
      taskWarning: string | null;
      score: number | null;
      mood: string | null;
      talkRatio: number | null;
      analysis: CallAnalysis | null;
    }> => {
      const res = await apiFetch("/audio-analytics/analyze", {
        method: "POST",
        body: JSON.stringify({ callId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Call analysis failed");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["amocrm_calls"] }),
  });
}

export type ManualCallUpload = {
  file: File;
  leadId: string | null;
  phone: string;
  direction: "in" | "out";
  connected: boolean;
};

// Reads an audio file's length in the browser (so a manual upload shows a
// real duration instead of 0:00). Resolves 0 if the browser can't tell.
function readAudioDuration(file: File): Promise<number> {
  if (typeof window === "undefined" || typeof Audio === "undefined") return Promise.resolve(0);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (v: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
    };
    const timer = setTimeout(() => done(0), 5000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      done(audio.duration);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      done(0);
    };
    audio.src = url;
  });
}

export function useUploadManualCall() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ManualCallUpload) => {
      if (!user) throw new Error("Not signed in");
      const ext = input.file.name.split(".").pop() || "mp3";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("call-recordings")
        .upload(path, input.file, { contentType: input.file.type || "audio/mpeg" });
      if (uploadError) throw new Error(uploadError.message);

      const { data: pub } = supabase.storage.from("call-recordings").getPublicUrl(path);

      const row: Tables["amocrm_calls"]["Insert"] = {
        source: "manual",
        organization_id: user.organizationId!,
        created_by: user.id,
        amocrm_note_id: null,
        lead_id: input.leadId,
        direction: input.direction,
        phone: input.phone || null,
        connected: input.connected,
        recording_url: pub.publicUrl,
        duration_seconds: await readAudioDuration(input.file),
        occurred_at: new Date().toISOString(),
      };
      const { data: inserted, error } = await supabase
        .from("amocrm_calls")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: inserted.id };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["amocrm_calls"] }),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });
}

/* ------------------------------------------------------------------ */
/* Notification preferences — per-user opt-in for in-app notifications.*/
/* Readable by anyone (so the person creating a task can check whether */
/* the assignee wants to be notified); writable only by the owner.     */
/* ------------------------------------------------------------------ */

export type NotificationPreferencesRow = Tables["notification_preferences"]["Row"];

export function useNotificationPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notification_preferences", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<NotificationPreferencesRow> => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("profile_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (
        data ?? { profile_id: user!.id, task_assigned: true, updated_at: new Date().toISOString() }
      );
    },
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: { task_assigned: boolean }) => {
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({ profile_id: user!.id, ...patch }, { onConflict: "profile_id" });
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["notification_preferences", user?.id] }),
  });
}

// Called after a task is created with a real assignee — checks the
// assignee's preference (defaulting to on) before writing the notification,
// so the toggle in Settings actually controls something.
export async function notifyTaskAssigned(assigneeId: string, taskTitle: string): Promise<void> {
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("task_assigned")
    .eq("profile_id", assigneeId)
    .maybeSingle();
  if (prefs && prefs.task_assigned === false) return;
  await supabase.from("notifications").insert({
    user_id: assigneeId,
    type: "task_assigned",
    title: taskTitle,
    body: "Sizga yangi vazifa biriktirildi.",
    link: "/lead-tasks",
  });

  // The in-app bell above is done at this point (client insert, RLS-backed,
  // same as always) -- this is purely the extra push send, which needs the
  // VAPID private key and can only run server-side. Best-effort: if the
  // assignee has no push subscription (or push isn't configured at all),
  // the server route just reports 0 sent, nothing to handle here.
  try {
    await apiFetch("/notifications/send-push", {
      method: "POST",
      body: JSON.stringify({
        assigneeId,
        title: taskTitle,
        body: "Sizga yangi vazifa biriktirildi.",
        link: "/lead-tasks",
      }),
    });
  } catch {
    // Push is a nice-to-have on top of the in-app bell -- never let a
    // network hiccup here surface as a failure to the task-creation flow.
  }
}

/* ------------------------------------------------------------------ */
/* Business profile — a single shared row used as AI assistant context */
/* ------------------------------------------------------------------ */

export type BusinessProfileRow = Tables["business_profile"]["Row"];

export type ProductServiceItem = { name: string; description: string };

export type ObjectionItem = { objection: string; response: string };

export type GlossaryItem = { term: string; definition: string };

export function useBusinessProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["business_profile", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<BusinessProfileRow | null> => {
      const { data, error } = await supabase
        .from("business_profile")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateBusinessProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Pick<
          BusinessProfileRow,
          | "company_name"
          | "description"
          | "competitors"
          | "terminology"
          | "tone"
          | "value_proposition"
          | "target_customer"
          | "qualified_lead_definition"
          | "products_services"
          | "objections"
          | "glossary"
          | "competitors_list"
        >
      >,
    ) => {
      const { data, error } = await supabase
        .from("business_profile")
        .upsert(
          { organization_id: user!.organizationId!, ...patch, updated_by: user?.id ?? null },
          { onConflict: "organization_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["business_profile", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* "Umumiy" (General) settings -- the read-only account info card      */
/* reads straight from organizations (existing RLS already allows a    */
/* member to select their own org row); everything editable lives in   */
/* org_general_settings.                                               */
/* ------------------------------------------------------------------ */

export type MyOrganizationRow = Pick<
  Tables["organizations"]["Row"],
  "id" | "name" | "active" | "created_at"
>;

export function useMyOrganization() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["organizations", "mine", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<MyOrganizationRow | null> => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, active, created_at")
        .eq("id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type OrgGeneralSettingsRow = Tables["org_general_settings"]["Row"];

// Every optional/extra card on the lead workspace (crm.leads.$leadId.tsx)
// a super admin can hide org-wide -- core CRM primitives (the lead info
// card itself, the Voqealar/Eslatmalar/Vazifalar tabs) aren't in this list
// and always show, since hiding those would break the page's basic
// purpose. Shared between the /admin/lead-fields settings UI and the lead
// workspace page itself so both agree on the same key names.
export const LEAD_WORKSPACE_SECTION_KEYS = [
  "tags",
  "customerProfile",
  "aiSummary",
  "customerRemark",
  "nextSteps",
  "actionHistory",
  "leadScore",
  "audioAnalysis",
  "telephonyCalls",
  "aiAssistant",
] as const;

export type LeadWorkspaceSectionKey = (typeof LEAD_WORKSPACE_SECTION_KEYS)[number];

// The individual built-in rows inside the lead info card itself (phone,
// email, budget, ...) -- a level below LEAD_WORKSPACE_SECTION_KEYS, which
// only covers whole cards. Kept in the same jsonb map (org_general_settings
// .lead_workspace_sections) since both are the same "hide this piece of the
// lead page" shape, just at a different granularity; the key names don't
// collide with the section keys above so one map safely holds both.
//
// No separate "expectedRevenue" key -- the DB still has both a `budget`
// and an `expected_revenue` column (every stage/funnel/dashboard revenue
// total sums expected_revenue), but AmoCRM/Bitrix24 sync always write the
// same amount into both (they only ever had one "Бюджет"/"deal amount"
// concept), and having them independently editable here just meant a
// budget edit silently left every revenue total unchanged. The one
// "Byudjet" field below now writes both columns together.
export const LEAD_INFO_FIELD_KEYS = [
  "phone",
  "altPhone",
  "email",
  "telegram",
  "source",
  "campaign",
  "manager",
  "budget",
  "funnel",
  "nextFollowUp",
  "lastContact",
  "created",
  "updated",
] as const;

export type LeadInfoFieldKey = (typeof LEAD_INFO_FIELD_KEYS)[number];

// Missing/unset means visible -- only an explicit `false` hides a section
// or field, so every org that never touched this setting keeps today's
// full page.
export function isLeadSectionVisible(
  settings: OrgGeneralSettingsRow | null | undefined,
  key: LeadWorkspaceSectionKey | LeadInfoFieldKey,
): boolean {
  const sections = (settings?.lead_workspace_sections as Record<string, boolean> | null) ?? {};
  return sections[key] ?? true;
}

// The lead info card's built-in rows in display order -- an admin can
// reorder them (not just show/hide) from /admin/lead-fields. Falls back to
// LEAD_INFO_FIELD_KEYS' own order when unset, and appends any key missing
// from a stored (possibly stale, e.g. after a new built-in field shipped)
// order at the end so nothing silently disappears.
export function getLeadInfoFieldOrder(
  settings: OrgGeneralSettingsRow | null | undefined,
): LeadInfoFieldKey[] {
  const stored = settings?.lead_info_field_order;
  if (!Array.isArray(stored)) return [...LEAD_INFO_FIELD_KEYS];
  const known = new Set(LEAD_INFO_FIELD_KEYS as readonly string[]);
  const ordered = stored.filter(
    (k): k is LeadInfoFieldKey => typeof k === "string" && known.has(k),
  );
  const missing = LEAD_INFO_FIELD_KEYS.filter((k) => !ordered.includes(k));
  return [...ordered, ...missing];
}

// Same reordering idea as getLeadInfoFieldOrder, but for the whole-card
// sections on the lead workspace (LEAD_WORKSPACE_SECTION_KEYS) instead of
// the individual rows inside the lead info card.
export function getLeadWorkspaceSectionOrder(
  settings: OrgGeneralSettingsRow | null | undefined,
): LeadWorkspaceSectionKey[] {
  const stored = settings?.lead_workspace_section_order;
  if (!Array.isArray(stored)) return [...LEAD_WORKSPACE_SECTION_KEYS];
  const known = new Set(LEAD_WORKSPACE_SECTION_KEYS as readonly string[]);
  const ordered = stored.filter(
    (k): k is LeadWorkspaceSectionKey => typeof k === "string" && known.has(k),
  );
  const missing = LEAD_WORKSPACE_SECTION_KEYS.filter((k) => !ordered.includes(k));
  return [...ordered, ...missing];
}

// The optional fields a funnel's Kanban cards can show or hide (AmoCRM's
// own "Внешний вид карточки" dialog) -- company/name/avatar are the card's
// core identity and always show, everything else here is toggleable per
// org. Same missing/unset-means-visible convention as
// isLeadSectionVisible above, stored in the same shape of jsonb map but
// its own column (kanban_card_fields) since these keys describe a
// different surface (the Kanban card, not the lead workspace page).
// Superseded by the slot layouts below; still read as their defaults.
export const KANBAN_CARD_FIELD_KEYS = [
  "owner",
  "contactName",
  "phone",
  "temperature",
  "tags",
  "amount",
  "source",
  "task",
] as const;

export type KanbanCardFieldKey = (typeof KANBAN_CARD_FIELD_KEYS)[number];

export function isKanbanCardFieldVisible(
  settings: OrgGeneralSettingsRow | null | undefined,
  key: KanbanCardFieldKey,
): boolean {
  const fields = (settings?.kanban_card_fields as Record<string, boolean> | null) ?? {};
  return fields[key] ?? true;
}

// The kanban card's own layout -- amoCRM's "Внешний вид карточки": the card
// is a fixed set of slots (top line, one chosen field, the big title, a
// contact line, the footer), and each slot shows whichever lead / contact /
// company field the company picked, or nothing. Stored alongside the old
// on/off flags in kanban_card_fields as `layouts`, keyed by funnel name,
// with "*" applying to every funnel that has no layout of its own.
export const KANBAN_CARD_SLOTS = ["top", "second", "title", "line", "footer"] as const;

export type KanbanCardSlot = (typeof KANBAN_CARD_SLOTS)[number];

export const KANBAN_LEAD_FIELDS = [
  "name",
  "owner",
  "amount",
  "budget",
  "source",
  "campaign",
  "utm",
  "temperature",
  "priority",
  "created",
  "nextFollowUp",
  "amocrmId",
] as const;

export const KANBAN_CONTACT_FIELDS = [
  "contactName",
  "phone",
  "altPhone",
  "email",
  "telegram",
  "position",
] as const;

export const KANBAN_COMPANY_FIELDS = ["company"] as const;

// A slot holds one of the fields above, `custom:<key>` for a lead custom
// field, or "none".
export type KanbanCardLayout = Record<KanbanCardSlot, string> & {
  showTask: boolean;
  showTags: boolean;
  showDate: boolean;
};

export const ALL_FUNNELS_LAYOUT = "*";

// Before layouts existed the card had on/off flags only -- a company that
// hid, say, the phone keeps it hidden.
function legacyKanbanLayout(settings: OrgGeneralSettingsRow | null | undefined): KanbanCardLayout {
  const on = (key: KanbanCardFieldKey) => isKanbanCardFieldVisible(settings, key);
  return {
    top: on("owner") ? "owner" : "none",
    second: on("source") ? "source" : "none",
    title: on("contactName") ? "contactName" : "name",
    line: on("phone") ? "phone" : "none",
    footer: on("amount") ? "amount" : "none",
    showTask: on("task"),
    showTags: on("tags"),
    showDate: true,
  };
}

export function kanbanCardLayouts(
  settings: OrgGeneralSettingsRow | null | undefined,
): Record<string, Partial<KanbanCardLayout>> {
  const fields = (settings?.kanban_card_fields as Record<string, unknown> | null) ?? {};
  const layouts = fields["layouts"];
  return layouts && typeof layouts === "object"
    ? (layouts as Record<string, Partial<KanbanCardLayout>>)
    : {};
}

export function kanbanCardLayout(
  settings: OrgGeneralSettingsRow | null | undefined,
  funnel: string,
): KanbanCardLayout {
  const layouts = kanbanCardLayouts(settings);
  const own = layouts[funnel] ?? layouts[ALL_FUNNELS_LAYOUT];
  return { ...legacyKanbanLayout(settings), ...own };
}

export function useOrgGeneralSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org_general_settings", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<OrgGeneralSettingsRow | null> => {
      const { data, error } = await supabase
        .from("org_general_settings")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateOrgGeneralSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Pick<
          OrgGeneralSettingsRow,
          | "industry"
          | "business_language"
          | "timezone"
          | "crm_task_forwarding_enabled"
          | "ai_task_creation_enabled"
          | "dedupe_match_phone"
          | "dedupe_match_name"
          | "dedupe_match_email"
          | "dedupe_funnel_merge"
          | "dedupe_auto_merge"
          | "lead_workspace_sections"
          | "lead_info_field_order"
          | "lead_workspace_section_order"
          | "kanban_card_fields"
        >
      >,
    ) => {
      const { data, error } = await supabase
        .from("org_general_settings")
        .upsert(
          { organization_id: user!.organizationId!, ...patch, updated_by: user?.id ?? null },
          { onConflict: "organization_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org_general_settings", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* "Ish jadvali" (Work schedule) -- working hours + alert toggle.       */
/* ------------------------------------------------------------------ */

export type OrgWorkScheduleRow = Tables["org_work_schedule"]["Row"];

export function useOrgWorkSchedule() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org_work_schedule", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<OrgWorkScheduleRow | null> => {
      const { data, error } = await supabase
        .from("org_work_schedule")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateOrgWorkSchedule() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Pick<
          OrgWorkScheduleRow,
          "alerts_enabled" | "start_time" | "end_time" | "work_days" | "manager_specific_schedule"
        >
      >,
    ) => {
      const { data, error } = await supabase
        .from("org_work_schedule")
        .upsert(
          { organization_id: user!.organizationId!, ...patch, updated_by: user?.id ?? null },
          { onConflict: "organization_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org_work_schedule", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* "Muammo haqida xabar berish" (Report a problem) -- a plain feedback  */
/* inbox; any org member can send, only admins/managers can read.      */
/* ------------------------------------------------------------------ */

export function useSendFeedbackReport() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (message: string) => {
      const { error } = await supabase.from("feedback_reports").insert({
        organization_id: user!.organizationId!,
        user_id: user!.id,
        message,
      });
      if (error) throw error;
    },
  });
}

/* ------------------------------------------------------------------ */
/* "Bildirishnomalar" (org-wide notification routing matrix) -- which   */
/* alert types fire and where (Veb/Telegram bot/guruh/kanal), plus the  */
/* low-call-quality sub-settings and bound Telegram groups/channels.    */
/* ------------------------------------------------------------------ */

export type OrgNotificationSettingsRow = Tables["org_notification_settings"]["Row"];

export function useOrgNotificationSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org_notification_settings", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<OrgNotificationSettingsRow | null> => {
      const { data, error } = await supabase
        .from("org_notification_settings")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateOrgNotificationSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Omit<OrgNotificationSettingsRow, "organization_id" | "updated_at" | "updated_by">
      >,
    ) => {
      const { data, error } = await supabase
        .from("org_notification_settings")
        .upsert(
          { organization_id: user!.organizationId!, ...patch, updated_by: user?.id ?? null },
          { onConflict: "organization_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org_notification_settings", user?.organizationId] }),
  });
}

export type TelegramBoundChatRow = Tables["telegram_bound_chats"]["Row"];

export function useTelegramBoundChats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["telegram_bound_chats", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<TelegramBoundChatRow[]> => {
      const { data, error } = await supabase
        .from("telegram_bound_chats")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .order("bound_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUnbindTelegramChat() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("telegram_bound_chats").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["telegram_bound_chats", user?.organizationId] }),
  });
}

// Generates a one-time /bind code for connecting a Telegram group or
// channel — server-side (service role), same pattern as useLinkTelegram
// for a personal chat, since the code has to be looked up by the webhook
// without any RLS-visible table backing it from the client.
export function useLinkTelegramGroup() {
  return useMutation({
    mutationFn: async (): Promise<{
      code: string;
      botUsername: string | null;
      expiresAt?: string;
    }> => {
      const res = await apiFetch("/telegram/link-group", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate a link code");
      return json;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Security Center — per-org password policy + 2FA-required flag.      */
/* ------------------------------------------------------------------ */

export type SecuritySettingsRow = Tables["security_settings"]["Row"];

const DEFAULT_SECURITY_SETTINGS: Omit<SecuritySettingsRow, "organization_id"> = {
  min_password_length: 8,
  require_number: false,
  require_uppercase: false,
  require_symbol: false,
  two_factor_required: false,
  updated_at: "",
  updated_by: null,
};

/** Falls back to the platform default policy when the org hasn't saved custom settings yet. */
export function useSecuritySettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["security_settings", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<SecuritySettingsRow> => {
      const { data, error } = await supabase
        .from("security_settings")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? { organization_id: user!.organizationId!, ...DEFAULT_SECURITY_SETTINGS };
    },
  });
}

export function useUpdateSecuritySettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Pick<
          SecuritySettingsRow,
          | "min_password_length"
          | "require_number"
          | "require_uppercase"
          | "require_symbol"
          | "two_factor_required"
        >
      >,
    ) => {
      const { data, error } = await supabase
        .from("security_settings")
        .upsert(
          { organization_id: user!.organizationId!, ...patch, updated_by: user?.id ?? null },
          { onConflict: "organization_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["security_settings", user?.organizationId] }),
  });
}

export type SecurityUserStatus = {
  id: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
};

/** Login activity + block status for the org's employees — lives on auth.users, so it's fetched via a service-role route rather than a direct table read. */
export function useSecurityUsers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["security_users", user?.organizationId],
    enabled:
      !!user?.organizationId && (user.role === "super_admin" || user.role === "platform_owner"),
    queryFn: async (): Promise<SecurityUserStatus[]> => {
      const res = await apiFetch("/admin/security-users");
      const json = (await res.json()) as { users?: SecurityUserStatus[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load login activity.");
      return json.users ?? [];
    },
  });
}

export function useToggleUserBan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ userId, ban }: { userId: string; ban: boolean }) => {
      const res = await apiFetch("/admin/security-ban", {
        method: "POST",
        body: JSON.stringify({ userId, ban }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not update the account.");
      return json;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["security_users", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* AmoCRM import settings — pick which pipelines/operators to sync.    */
/* ------------------------------------------------------------------ */

export type AmoCatalogPipeline = { id: number; name: string; is_main: boolean };

export type AmoCatalogOperator = {
  id: number;
  name: string;
  email: string | null;
  existingProfileEmail: string | null;
};

export type AmoCatalog = {
  subdomain: string;
  pipelines: AmoCatalogPipeline[];
  operators: AmoCatalogOperator[];
  enabledPipelineIds: number[] | null;
  enabledUserIds: number[] | null;
};

export function useAmoCatalog() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["amocrm_catalog", user?.organizationId],
    enabled:
      !!user?.organizationId && (user.role === "super_admin" || user.role === "platform_owner"),
    // The server route now hard-caps the whole request at 25s
    // (CATALOG_FETCH_CEILING_MS in admin.amocrm-catalog.ts) regardless of
    // which AmoCRM call is slow -- react-query's own default retry (3
    // attempts, exponential backoff) used to silently multiply that ceiling
    // by up to 4x on top of it, which is exactly why the page could still
    // look stuck on "Yuklanmoqda…" for several minutes even after every
    // individual network call already had its own timeout. A hung/broken
    // connection isn't fixed by retrying it, so one attempt is enough.
    retry: false,
    queryFn: async (): Promise<AmoCatalog> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      let res: Response;
      try {
        res = await fetch("/admin/amocrm-catalog", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error("AmoCRM javob bermadi (timeout). Qayta urinib ko'ring.");
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
      const json = (await res.json()) as AmoCatalog & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load AmoCRM catalog.");
      return json;
    },
  });
}

export function useSaveAmoImportSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ pipelineIds, userIds }: { pipelineIds: number[]; userIds: number[] }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/admin/amocrm-import-settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ pipelineIds, userIds }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
      return json;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["amocrm_catalog", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* Tags — aggregated across every lead, with rename/delete that touch  */
/* every lead carrying that tag.                                       */
/* ------------------------------------------------------------------ */

export type TagSummary = { name: string; count: number };

export function useTagsSummary(funnel?: string | null) {
  const { user } = useAuth();
  const rpc = useQuery({
    queryKey: ["leads", "tag_counts", user?.organizationId, funnel ?? null],
    enabled: !!user?.organizationId,
    retry: false,
    queryFn: () =>
      fetchAllPages(async (from): Promise<TagSummary[]> => {
        const { data, error } = await supabase
          .rpc("lead_tag_counts", { p_funnel: funnel ?? null })
          .order("tag")
          .range(from, from + RESOURCE_PAGE_SIZE - 1);
        if (error) throw error;
        return (data ?? []).map((r) => ({ name: r.tag, count: Number(r.n) }));
      }),
  });
  // Until 20261018020000_lead_stats_rpcs.sql is applied: count in the browser.
  const { data: leads, ...rest } = useLeadsRaw({ enabled: rpc.isError });
  const tags = useMemo<TagSummary[]>(() => {
    if (rpc.data) return [...rpc.data].sort((a, b) => b.count - a.count);
    if (!rpc.isError) return [];
    const counts = new Map<string, number>();
    for (const l of leads ?? []) {
      if (funnel && (l.funnel || "Direct Sales") !== funnel) continue;
      for (const tag of l.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [rpc.data, rpc.isError, leads, funnel]);
  return { tags, ...rest, isLoading: rpc.isLoading || (rpc.isError && rest.isLoading) };
}

export function useRenameTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const { data: leads, error: fetchErr } = await supabase
        .from("leads")
        .select("id, tags")
        .contains("tags", [from]);
      if (fetchErr) throw fetchErr;
      for (const lead of leads ?? []) {
        const next = Array.from(new Set((lead.tags ?? []).map((t) => (t === from ? to : t))));
        const { error } = await supabase.from("leads").update({ tags: next }).eq("id", lead.id);
        if (error) throw error;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tag: string) => {
      const { data: leads, error: fetchErr } = await supabase
        .from("leads")
        .select("id, tags")
        .contains("tags", [tag]);
      if (fetchErr) throw fetchErr;
      for (const lead of leads ?? []) {
        const next = (lead.tags ?? []).filter((t) => t !== tag);
        const { error } = await supabase.from("leads").update({ tags: next }).eq("id", lead.id);
        if (error) throw error;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}
