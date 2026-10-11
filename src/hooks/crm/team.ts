// Attendance, call pickup, quotas, fines, KPIs, Telegram report bot, office location, error logs, auto-responders, AI agents, funnel names and stats.
// Split out of src/hooks/use-crm-data.ts, which re-exports everything here.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api";
import { DEFAULT_REPORT_HOURS, zonedDayTime } from "@/lib/manager-report";
import { useAuth } from "@/lib/auth";
import { initialsOf } from "@/lib/utils";
import { RESOURCE_PAGE_SIZE, fetchAllPages, makeResource, useLeadsRaw } from "./core";
import type { LeadRow, Tables } from "./core";
import {
  useCreateCallLog,
  useCreateWorkSession,
  usePipelineStagesRaw,
  useProfilesRaw,
  useUpdateWorkSession,
  useWorkSessionsRaw,
} from "./config";
import { byId, profileName, useVisibleOwnerIds } from "./crm-views";
import { isSalesStageName, useCallsWithLead, useLeadCube, useRowsBetween } from "./dashboard";
import type { PbxCallRow } from "./integrations";
import { useOrgGeneralSettings } from "./settings";
import { startOfDay } from "./lead-analytics";

/* ------------------------------------------------------------------ */
/* Attendance — manual clock-in/out and call logging, aggregated into  */
/* a per-employee daily roster. A future telephony integration can     */
/* insert into call_logs the same way and this keeps working as-is.    */
/* ------------------------------------------------------------------ */

export type WorkSessionRow = Tables["work_sessions"]["Row"];

export type CallLogRow = Tables["call_logs"]["Row"];

function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function isToday(iso: string): boolean {
  return isSameDay(iso, new Date());
}

export function useMyOpenSession() {
  const { user } = useAuth();
  const { data: sessions, ...rest } = useWorkSessionsRaw({ enabled: !!user });
  const open = (sessions ?? []).find(
    (s) => s.profile_id === user?.id && !s.clock_out && isToday(s.clock_in),
  );
  return { session: open ?? null, ...rest };
}

export function useClockIn() {
  const create = useCreateWorkSession();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      return create.mutateAsync({ profile_id: user.id });
    },
  });
}

export function useClockOut() {
  const update = useUpdateWorkSession();
  return useMutation({
    mutationFn: async (sessionId: string) =>
      update.mutateAsync({ id: sessionId, patch: { clock_out: new Date().toISOString() } }),
  });
}

export function useLogCall() {
  const create = useCreateCallLog();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      leadId?: string | null;
      contactId?: string | null;
      phone?: string;
      connected: boolean;
      durationSeconds: number;
    }) => {
      if (!user) throw new Error("Not signed in");
      return create.mutateAsync({
        profile_id: user.id,
        lead_id: input.leadId ?? null,
        contact_id: input.contactId ?? null,
        phone: input.phone ?? null,
        connected: input.connected,
        duration_seconds: input.durationSeconds,
      });
    },
  });
}

export type AttendanceRow = {
  profileId: string;
  managerId: string | null;
  name: string;
  initials: string;
  position: string;
  clockIn: string | null;
  clockOut: string | null;
  sessionMinutes: number;
  callsMade: number;
  callsConnected: number;
  totalCallMinutes: number;
};

// A call gap wider than this ends a continuous work stretch -- "Ish vaqti"
// means time actually spent working the phone (AmoCRM or this platform's
// own telephony), not the raw span from first call to last, which would
// count a long lunch/meeting gap as "work".
const AMO_CONTINUOUS_WORK_GAP_MS = 60 * 60 * 1000;

type WorkCallEvent = { occurredAt: string; durationSeconds: number };

// Sums the duration of continuous call-activity stretches for one rep's day
// (events must already be sorted ascending by occurredAt). A stretch keeps
// extending across calls less than the gap threshold apart; a bigger gap
// starts a new stretch. On today's date, a stretch still within the gap
// threshold of now is extended to now (they're still actively on a call
// streak), so "Ish vaqti" keeps counting up live during the day.
function continuousAmoWorkMinutes(calls: WorkCallEvent[], isToday: boolean): number {
  if (calls.length === 0) return 0;
  let total = 0;
  let segStart = new Date(calls[0]!.occurredAt).getTime();
  let segEnd = segStart + calls[0]!.durationSeconds * 1000;
  for (let i = 1; i < calls.length; i++) {
    const start = new Date(calls[i]!.occurredAt).getTime();
    const end = start + calls[i]!.durationSeconds * 1000;
    if (start - segEnd > AMO_CONTINUOUS_WORK_GAP_MS) {
      total += segEnd - segStart;
      segStart = start;
      segEnd = end;
    } else {
      segEnd = Math.max(segEnd, end);
    }
  }
  if (isToday && Date.now() - segEnd <= AMO_CONTINUOUS_WORK_GAP_MS) {
    segEnd = Date.now();
  }
  total += segEnd - segStart;
  return total / 60000;
}

// pbx_calls has no boolean "connected" column (unlike amocrm_calls/call_logs)
// -- these are the statuses telephony-data.server.ts ever writes for a call
// that was actually answered.
const PBX_CONNECTED_STATUSES = new Set(["answered", "completed"]);

export function useAttendanceView(asOf?: Date | null) {
  const profiles = useProfilesRaw();
  const { data: orgSettings } = useOrgGeneralSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- asOf?.getTime() is the stable key
  const refDate = useMemo(() => asOf ?? new Date(), [asOf?.getTime()]);
  const today = isSameDay(new Date().toISOString(), refDate);
  // Only the selected day's sessions and calls -- not the org's whole history.
  const dayStartMs = startOfDay(refDate).getTime();
  const { dayStart, dayEnd } = useMemo(() => {
    const start = new Date(dayStartMs);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { dayStart: start, dayEnd: end };
  }, [dayStartMs]);
  const sessionsQ = useRowsBetween<WorkSessionRow>({
    table: "work_sessions",
    column: "clock_in",
    columns: "*",
    from: dayStart,
    to: dayEnd,
    exclusiveTo: true,
  });
  const callsQ = useRowsBetween<CallLogRow>({
    table: "call_logs",
    column: "created_at",
    columns: "id, profile_id, created_at, connected, duration_seconds",
    from: dayStart,
    to: dayEnd,
    exclusiveTo: true,
  });
  const pbxQ = useRowsBetween<
    Pick<PbxCallRow, "id" | "initiated_by" | "created_at" | "duration_seconds" | "status">
  >({
    table: "pbx_calls",
    column: "created_at",
    columns: "id, initiated_by, created_at, duration_seconds, status",
    from: dayStart,
    to: dayEnd,
    exclusiveTo: true,
  });
  const amoQ = useCallsWithLead(dayStart, dayEnd);
  const sessions = sessionsQ.data;
  const calls = callsQ.data;

  const hours = (orgSettings?.manager_report_hours ?? null) as { auto_close?: string } | null;
  const autoCloseAt = useMemo(
    () =>
      zonedDayTime(
        refDate,
        hours?.auto_close || DEFAULT_REPORT_HOURS.autoClose,
        orgSettings?.timezone || "Asia/Tashkent",
      ),
    [refDate, hours?.auto_close, orgSettings?.timezone],
  );

  const rows = useMemo<AttendanceRow[]>(() => {
    return (profiles.data ?? []).map((p): AttendanceRow => {
      const mySessions = (sessions ?? []).filter(
        (s) => s.profile_id === p.id && isSameDay(s.clock_in, refDate),
      );
      const manualClockIn = mySessions[0]?.clock_in ?? null;
      const manualClockOut = mySessions[0]?.clock_out ?? null;

      // A rep rarely presses "Ishni boshlash" -- the real signal that
      // they've arrived and started working is their first call of the
      // day, whether that call was synced from AmoCRM or placed through
      // this platform's own telephony (pbx_calls -- OnlinePBX/Sipuni/
      // MoiZvonki click-to-call). Take whichever of manual clock-in /
      // first call happened earliest, so the manual button still counts
      // when someone actually uses it.
      const myAmoCalls = (amoQ.data ?? []).filter(
        (c) => c.lead?.owner_id === p.id && isSameDay(c.occurred_at, refDate),
      );
      const myPbxCalls = (pbxQ.data ?? []).filter(
        (c) => c.initiated_by === p.id && isSameDay(c.created_at, refDate),
      );
      const myCallEvents: WorkCallEvent[] = [
        ...myAmoCalls.map((c) => ({
          occurredAt: c.occurred_at,
          durationSeconds: c.duration_seconds,
        })),
        ...myPbxCalls.map((c) => ({
          occurredAt: c.created_at,
          durationSeconds: c.duration_seconds,
        })),
      ].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
      const firstCallAt = myCallEvents[0]?.occurredAt ?? null;
      const lastCallAt = myCallEvents.length
        ? myCallEvents[myCallEvents.length - 1]!.occurredAt
        : null;

      const clockInCandidates = [manualClockIn, firstCallAt].filter((v): v is string => v != null);
      const clockIn = clockInCandidates.length
        ? clockInCandidates.reduce((earliest, v) =>
            new Date(v).getTime() < new Date(earliest).getTime() ? v : earliest,
          )
        : null;
      // No manual clock-out: once the company's auto-close time has passed
      // (e.g. 20:00 for a 19:00 work day, set in the daily report window)
      // the work day counts as finished at exactly that time. Before then
      // today it's still ongoing; a day with only late (after auto-close)
      // activity falls back to its last call.
      const autoCloseOk = !!clockIn && Date.now() >= autoCloseAt.getTime();
      const clockOut =
        manualClockOut ??
        (autoCloseOk && new Date(clockIn).getTime() < autoCloseAt.getTime()
          ? autoCloseAt.toISOString()
          : today
            ? null
            : lastCallAt);

      // "Ish vaqti" is about real call activity, not office arrival -- once
      // there's any call data for the day (AmoCRM or this platform's own
      // telephony), it wins over the manual clock session entirely
      // (continuous stretches, gaps excluded). The manual clock-in/out span
      // is only a fallback for a day with no calls at all.
      const sessionMinutes =
        myCallEvents.length > 0
          ? continuousAmoWorkMinutes(myCallEvents, today)
          : clockIn
            ? Math.max(
                0,
                ((clockOut ? new Date(clockOut).getTime() : Date.now()) -
                  new Date(clockIn).getTime()) /
                  60000,
              )
            : 0;

      const myManualCalls = (calls ?? []).filter(
        (c) => c.profile_id === p.id && isSameDay(c.created_at, refDate),
      );
      const callsMade = myManualCalls.length + myAmoCalls.length + myPbxCalls.length;
      const callsConnected =
        myManualCalls.filter((c) => c.connected).length +
        myAmoCalls.filter((c) => c.connected).length +
        myPbxCalls.filter((c) => PBX_CONNECTED_STATUSES.has(c.status)).length;
      const totalCallMinutes = Math.round(
        (myManualCalls.reduce((s, c) => s + c.duration_seconds, 0) +
          myAmoCalls.reduce((s, c) => s + c.duration_seconds, 0) +
          myPbxCalls.reduce((s, c) => s + c.duration_seconds, 0)) /
          60,
      );

      return {
        profileId: p.id,
        managerId: p.manager_id,
        name: profileName(p),
        initials: initialsOf(p.full_name || p.email),
        position: p.position,
        clockIn,
        clockOut,
        sessionMinutes: Math.round(sessionMinutes),
        callsMade,
        callsConnected,
        totalCallMinutes,
      };
    });
  }, [profiles.data, sessions, calls, amoQ.data, pbxQ.data, refDate, today, autoCloseAt]);

  return {
    rows,
    isLoading:
      profiles.isLoading ||
      sessionsQ.isLoading ||
      callsQ.isLoading ||
      amoQ.isLoading ||
      pbxQ.isLoading,
  };
}

/* ------------------------------------------------------------------ */
/* Call pickup by hour — when do customers actually answer, and what    */
/* hour range is most effective for reps to be calling in. Shared by    */
/* Lid tahlili and Boshqaruv paneli (CallPickupByHourCard).             */
/* ------------------------------------------------------------------ */

export type HourPickupRow = {
  hour: number; // 0-23, local time
  total: number;
  connected: number;
  rate: number; // 0-100, percent of `total` that connected
};

// A single connected call at 3am shouldn't win "best hour" over 40 calls at
// 60% during the day -- require some minimum volume before an hour is
// eligible, falling back to whatever volume exists if the whole day is thin.
const BEST_HOUR_MIN_SAMPLE = 3;

export function useCallPickupByHour(range: { from: Date | null; to: Date | null } | null) {
  // Calls of the period with their lead's owner -- no transcripts, no full
  // lead list. The range end is inclusive here, as useAmoCrmCallsSince had it.
  const to = range?.to ? new Date(range.to.getTime() + 1) : null;
  const { data: calls, isLoading: callsLoading } = useCallsWithLead(range?.from ?? null, to);
  const visibleOwnerIds = useVisibleOwnerIds();

  const rows = useMemo<HourPickupRow[]>(() => {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, connected: 0 }));
    for (const c of calls ?? []) {
      const ownerId = c.lead?.owner_id ?? null;
      if (visibleOwnerIds && (!ownerId || !visibleOwnerIds.has(ownerId))) continue;
      const bucket = buckets[new Date(c.occurred_at).getHours()]!;
      bucket.total += 1;
      if (c.connected) bucket.connected += 1;
    }
    return buckets.map((b) => ({
      ...b,
      rate: b.total > 0 ? Math.round((b.connected / b.total) * 1000) / 10 : 0,
    }));
  }, [calls, visibleOwnerIds]);

  const bestHour = useMemo(() => {
    const withVolume = rows.filter((r) => r.total > 0);
    if (withVolume.length === 0) return null;
    const eligible = withVolume.filter((r) => r.total >= BEST_HOUR_MIN_SAMPLE);
    const pool = eligible.length > 0 ? eligible : withVolume;
    return pool.reduce((best, r) => (r.rate > best.rate ? r : best), pool[0]!);
  }, [rows]);

  return { rows, bestHour, isLoading: callsLoading };
}

/* ------------------------------------------------------------------ */
/* Normativlar (quotas) — real revenue vs. each employee's daily/       */
/* monthly target from profiles + deals, no new tables needed.          */
/* ------------------------------------------------------------------ */

export type NormativeStatus = "onTrack" | "atRisk" | "behind";

export type NormativeRow = {
  profileId: string;
  name: string;
  initials: string;
  department: string;
  dailyTarget: number | null;
  monthlyTarget: number | null;
  revenueToday: number;
  revenueMonth: number;
  monthlyPct: number;
  pacePct: number;
  status: NormativeStatus;
};

export function useNormativesView() {
  const { user } = useAuth();
  const { data: profiles, isLoading: profilesLoading } = useProfilesRaw();
  // Revenue used to come from the `deals` table — but this AmoCRM-synced
  // setup never populates deals (leads carry the real revenue), so every
  // rep's revenueToday/revenueMonth here was silently always 0. Compute it
  // from won leads instead, same as Dashboard/Reyting already do. Leads
  // have no close_date of their own, so updated_at is used as a proxy for
  // "when it closed" — the same snapshot-proxy approach used elsewhere in
  // this schema (there's no per-lead stage-change history to read instead).
  // Only leads touched this month: today's and this month's figures are
  // all this page shows.
  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, []);
  const { data: leads, isLoading: leadsLoading } = useRowsBetween<
    Pick<LeadRow, "id" | "owner_id" | "stage_id" | "updated_at" | "expected_revenue">
  >({
    table: "leads",
    column: "updated_at",
    columns: "id, owner_id, stage_id, updated_at, expected_revenue",
    from: monthStart,
    to: null,
  });
  const { data: stages, isLoading: stagesLoading } = usePipelineStagesRaw();

  const rows = useMemo<NormativeRow[]>(() => {
    const stagesById = byId(stages);
    const wonLeads = (leads ?? []).filter((l) => {
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      return stage?.is_won ?? false;
    });
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const expectedPaceFraction = dayOfMonth / daysInMonth;

    // Super admins see the whole company. A ROP sees their own reports; a
    // sotuv_menejeri sees every teammate under the same ROP (including
    // themselves) so they can see who's ahead/behind, per spec — not the
    // full company.
    const roster = (profiles ?? []).filter((p) => {
      if (p.role === "super_admin" || p.role === "platform_owner") return false;
      if (!user || user.role === "super_admin" || user.role === "platform_owner") return true;
      if (user.role === "rop") return p.manager_id === user.id;
      return p.manager_id === user.managerId;
    });

    return roster.map((p): NormativeRow => {
      const won = wonLeads.filter((l) => l.owner_id === p.id);
      const revenueToday = won
        .filter((l) => new Date(l.updated_at) >= startOfToday)
        .reduce((s, l) => s + Number(l.expected_revenue), 0);
      const revenueMonth = won
        .filter((l) => new Date(l.updated_at) >= startOfMonth)
        .reduce((s, l) => s + Number(l.expected_revenue), 0);
      const monthlyTarget = p.monthly_target;
      const monthlyPct =
        monthlyTarget && monthlyTarget > 0
          ? Math.round((revenueMonth / monthlyTarget) * 1000) / 10
          : 0;
      const expectedByNow = monthlyTarget ? monthlyTarget * expectedPaceFraction : 0;
      const pacePct =
        expectedByNow > 0 ? Math.round((revenueMonth / expectedByNow) * 1000) / 10 : 0;
      const status: NormativeStatus =
        pacePct >= 90 ? "onTrack" : pacePct >= 60 ? "atRisk" : "behind";
      return {
        profileId: p.id,
        name: profileName(p),
        initials: initialsOf(p.full_name || p.email),
        department: p.department,
        dailyTarget: p.daily_target,
        monthlyTarget: p.monthly_target,
        revenueToday,
        revenueMonth,
        monthlyPct,
        pacePct,
        status,
      };
    });
  }, [profiles, leads, stages, user]);

  return { rows, isLoading: profilesLoading || leadsLoading || stagesLoading };
}

/* ------------------------------------------------------------------ */
/* Jarimalar (fines) — admin-managed fine types (per org) + the actual  */
/* fine records, normally written by the daily AI cron but also        */
/* addable by hand. Same roster-scoping rule as Normativ (super_admin  */
/* sees everyone, a ROP sees their team, a rep sees their team too so   */
/* they can see where they stand).                                     */
/* ------------------------------------------------------------------ */

export type FineTypeRow = Tables["fine_types"]["Row"];

const fineTypesResource = makeResource("fine_types", ["fine_types"]);

export const useFineTypes = (opts?: Parameters<typeof fineTypesResource.useList>[0]) =>
  fineTypesResource.useList({ orderBy: "position", ...opts });

export const useCreateFineType = fineTypesResource.useCreate;

export const useUpdateFineType = fineTypesResource.useUpdate;

export const useDeleteFineType = fineTypesResource.useRemove;

export type FineRow = Tables["fines"]["Row"];

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function useRosterScope() {
  const { user } = useAuth();
  const { data: profiles, isLoading } = useProfilesRaw();
  const roster = useMemo(() => {
    return (profiles ?? []).filter((p) => {
      if (p.role === "super_admin" || p.role === "platform_owner") return false;
      if (!user || user.role === "super_admin" || user.role === "platform_owner") return true;
      if (user.role === "rop") return p.manager_id === user.id;
      return p.manager_id === user.managerId;
    });
  }, [profiles, user]);
  return { roster, isLoading };
}

export function useFinesInRange(range: { from: Date | null; to: Date | null }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["fines", user?.organizationId, range.from?.getTime(), range.to?.getTime()],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<FineRow[]> => {
      let query = supabase.from("fines").select("*").eq("organization_id", user!.organizationId!);
      if (range.from) query = query.gte("occurred_on", toDateOnly(range.from));
      if (range.to) query = query.lte("occurred_on", toDateOnly(range.to));
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateFine() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      fineTypeId: string;
      profileId: string;
      amount: number;
      occurredOn: string;
      reason?: string | undefined;
    }) => {
      const { error } = await supabase.from("fines").insert({
        organization_id: user!.organizationId!,
        fine_type_id: input.fineTypeId,
        profile_id: input.profileId,
        amount: input.amount,
        occurred_on: input.occurredOn,
        reason: input.reason ?? null,
        source: "manual",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fines"] }),
  });
}

export function useDeleteFine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fines").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fines"] }),
  });
}

export type FinesMatrixRow = {
  profileId: string;
  name: string;
  initials: string;
  amountsByType: Record<string, number>;
  total: number;
};

export function useFinesMatrix(range: { from: Date | null; to: Date | null }) {
  const { roster, isLoading: rosterLoading } = useRosterScope();
  const { data: fineTypes, isLoading: typesLoading } = useFineTypes();
  const { data: fines, isLoading: finesLoading } = useFinesInRange(range);

  const rows = useMemo<FinesMatrixRow[]>(() => {
    return roster.map((p): FinesMatrixRow => {
      const mine = (fines ?? []).filter((f) => f.profile_id === p.id);
      const amountsByType: Record<string, number> = {};
      for (const f of mine) {
        amountsByType[f.fine_type_id] = (amountsByType[f.fine_type_id] ?? 0) + Number(f.amount);
      }
      return {
        profileId: p.id,
        name: profileName(p),
        initials: initialsOf(p.full_name || p.email),
        amountsByType,
        total: mine.reduce((s, f) => s + Number(f.amount), 0),
      };
    });
  }, [roster, fines]);

  return {
    rows,
    fineTypes: fineTypes ?? [],
    isLoading: rosterLoading || typesLoading || finesLoading,
  };
}

/* ------------------------------------------------------------------ */
/* KPI lar — per-rep performance readout for the selected period: what */
/* each rep is doing well (conversion, sales, calls, meetings), used   */
/* for monthly pay/bonus review so it's computed deterministically     */
/* from the same synced data every other page uses, not guessed by AI. */
/* ------------------------------------------------------------------ */

export type KpiRow = {
  profileId: string;
  name: string;
  initials: string;
  callsMade: number;
  callsConnected: number;
  totalCallMinutes: number;
  totalLeads: number;
  salesCount: number;
  revenue: number;
  conversionPct: number;
  meetingsCount: number;
};

const MEETING_TAG_HINTS = ["uchrashuv", "ofis", "meeting"];

function isInRange(iso: string | null, range: { from: Date | null; to: Date | null }): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (range.from && t < range.from.getTime()) return false;
  if (range.to && t > range.to.getTime()) return false;
  return true;
}

export function useKpiView(range: { from: Date | null; to: Date | null }) {
  const { roster, isLoading: rosterLoading } = useRosterScope();
  // Leads updated / calls logged inside the range only.
  const { data: leads, isLoading: leadsLoading } = useRowsBetween<
    Pick<LeadRow, "id" | "owner_id" | "stage_id" | "updated_at" | "expected_revenue" | "tags">
  >({
    table: "leads",
    column: "updated_at",
    columns: "id, owner_id, stage_id, updated_at, expected_revenue, tags",
    from: range.from,
    to: range.to,
  });
  const { data: stages, isLoading: stagesLoading } = usePipelineStagesRaw();
  const { data: calls, isLoading: callsLoading } = useRowsBetween<
    Pick<CallLogRow, "id" | "profile_id" | "created_at" | "connected" | "duration_seconds">
  >({
    table: "call_logs",
    column: "created_at",
    columns: "id, profile_id, created_at, connected, duration_seconds",
    from: range.from,
    to: range.to,
  });

  const rows = useMemo<KpiRow[]>(() => {
    const stagesById = byId(stages);
    return roster.map((p): KpiRow => {
      const myLeads = (leads ?? []).filter(
        (l) => l.owner_id === p.id && isInRange(l.updated_at, range),
      );
      const won = myLeads.filter((l) => {
        const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
        return stage?.is_won ?? false;
      });
      const meetingsCount = myLeads.filter((l) =>
        (l.tags ?? []).some((tag) =>
          MEETING_TAG_HINTS.some((hint) => tag.toLowerCase().includes(hint)),
        ),
      ).length;
      const myCalls = (calls ?? []).filter(
        (c) => c.profile_id === p.id && isInRange(c.created_at, range),
      );
      return {
        profileId: p.id,
        name: profileName(p),
        initials: initialsOf(p.full_name || p.email),
        callsMade: myCalls.length,
        callsConnected: myCalls.filter((c) => c.connected).length,
        totalCallMinutes: Math.round(myCalls.reduce((s, c) => s + c.duration_seconds, 0) / 60),
        totalLeads: myLeads.length,
        salesCount: won.length,
        revenue: won.reduce((s, l) => s + Number(l.expected_revenue), 0),
        conversionPct:
          myLeads.length > 0 ? Math.round((won.length / myLeads.length) * 1000) / 10 : 0,
        meetingsCount,
      };
    });
  }, [roster, leads, stages, calls, range]);

  return {
    rows,
    isLoading: rosterLoading || leadsLoading || stagesLoading || callsLoading,
  };
}

/* ------------------------------------------------------------------ */
/* Telegram "hisobotchi_bot" — link-code flow + daily report send.     */
/* ------------------------------------------------------------------ */

export function useLinkTelegram() {
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (): Promise<{ code: string; botUsername: string | null }> => {
      const res = await apiFetch("/telegram/link", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate a link code");
      return json;
    },
    onSuccess: () => void refreshProfile(),
  });
}

export function useSendTestReport() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/telegram/send-test", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send");
      return json;
    },
  });
}

export function usePublishFines() {
  return useMutation({
    mutationFn: async (range: { from: string | null; to: string | null; label: string }) => {
      const res = await apiFetch("/fines/publish", {
        method: "POST",
        body: JSON.stringify(range),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to publish");
      return json;
    },
  });
}

export function useGenerateDailyReportNow() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (): Promise<{ sent: number; failed: number }> => {
      const res = await apiFetch("/daily-report-settings/generate-now", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Hisobotni yaratib bo'lmadi.");
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["daily_report_history", user?.organizationId] });
      void qc.invalidateQueries({ queryKey: ["daily_report_preview", user?.organizationId] });
    },
  });
}

// A private AmoCRM integration is created inside one specific account and
// can't be installed from a different one -- a platform with several
// companies, each running its own AmoCRM account, needs one client_id/secret
// pair per organization. Read-modify-write, then upsert (not a blind
// update): a company setting this up before ever connecting AmoCRM has no
// integration_settings row yet, and a plain .update() silently matches zero
// rows in that case -- it "succeeds" without persisting anything. The
// read+merge still avoids clobbering subdomain/last_synced_at/lead_count,
// which the OAuth callback and sync routes write into the same config
// column, for orgs that already have a row.
export function useSetAmoCrmCredentials() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { clientId: string; clientSecret: string }) => {
      const { data: existing, error: fetchError } = await supabase
        .from("integration_settings")
        .select("config")
        .eq("organization_id", user!.organizationId!)
        .eq("key", "amocrm")
        .maybeSingle();
      if (fetchError) throw new Error(fetchError.message);
      const currentConfig = (existing?.config as Record<string, unknown> | null) ?? {};
      const { error } = await supabase.from("integration_settings").upsert(
        {
          organization_id: user!.organizationId!,
          key: "amocrm",
          config: {
            ...currentConfig,
            client_id: input.clientId.trim(),
            client_secret: input.clientSecret.trim(),
          },
        },
        { onConflict: "organization_id,key" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["integration_settings", "amocrm"] }),
  });
}

export function useSetTelegramBotUsername() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (username: string) => {
      const { error } = await supabase.from("integration_settings").upsert(
        {
          organization_id: user!.organizationId!,
          key: "telegram_bot",
          config: { username },
          enabled: true,
        },
        { onConflict: "organization_id,key" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["integration_settings", "telegram_bot"] }),
  });
}

/* ------------------------------------------------------------------ */
/* Office location — a single precise address (OpenStreetMap search/    */
/* embed, no maps API key needed) shown in the header, admin-editable.  */
/* ------------------------------------------------------------------ */

export type OfficeLocationConfig = { label: string; address: string; lat: number; lon: number };

export function useSetOfficeLocation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (config: OfficeLocationConfig) => {
      const { error } = await supabase
        .from("integration_settings")
        .upsert(
          { organization_id: user!.organizationId!, key: "office_location", config, enabled: true },
          { onConflict: "organization_id,key" },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["integration_settings", "office_location"] }),
  });
}

/* ------------------------------------------------------------------ */
/* Error logs — everything caught by the global client-side handlers   */
/* and server routes, surfaced in Admin Panel so issues get fixed fast.*/
/* ------------------------------------------------------------------ */

export type ErrorLogRow = Tables["error_logs"]["Row"];

const errorLogsResource = makeResource("error_logs", ["error_logs"]);

export const useErrorLogsRaw = (opts?: Parameters<typeof errorLogsResource.useList>[0]) =>
  errorLogsResource.useList({ orderBy: "created_at", ascending: false, ...opts });

export const useResolveErrorLog = errorLogsResource.useUpdate;

/* ------------------------------------------------------------------ */
/* Auto-responders — admin-configured "ask this, save the answer to    */
/* this CRM field" scripts. Config only: actually sending needs a      */
/* connected messaging channel, which isn't wired up yet.              */
/* ------------------------------------------------------------------ */

export type AutoResponderRow = Tables["auto_responders"]["Row"];

const autoRespondersResource = makeResource("auto_responders", ["auto_responders"]);

export const useAutoRespondersRaw = (opts?: Parameters<typeof autoRespondersResource.useList>[0]) =>
  autoRespondersResource.useList({ orderBy: "created_at", ascending: false, ...opts });

export const useCreateAutoResponder = autoRespondersResource.useCreate;

export const useUpdateAutoResponder = autoRespondersResource.useUpdate;

export const useDeleteAutoResponder = autoRespondersResource.useRemove;

/* ------------------------------------------------------------------ */
/* AI Agents — two fixed presets (chat / call analysis). Config only:  */
/* actually running one needs a live model API key wired up server-    */
/* side, which this workspace does not have yet — the UI says so.      */
/* ------------------------------------------------------------------ */

export type AiAgentRow = Tables["ai_agents"]["Row"];

export function useAiAgents() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ai_agents", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<AiAgentRow[]> => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*")
        .eq("organization_id", user!.organizationId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateAiAgent() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: {
      kind: "chat" | "call";
      model?: string | undefined;
      system_prompt?: string | undefined;
      channels?: string[] | undefined;
      active?: boolean | undefined;
      call_instructions?: Record<string, unknown> | undefined;
    }) => {
      // Goes through a server route (service-role write) instead of a
      // direct client upsert -- ai_agents_write kept rejecting a confirmed
      // super_admin's own-org write with "violates row-level security
      // policy" across two policy-shape fixes, so this sidesteps that
      // mystery entirely rather than depending on it being solved.
      const res = await apiFetch("/admin/ai-agents/update", {
        method: "POST",
        body: JSON.stringify(patch),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `Save failed (${res.status})`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai_agents", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* Which funnel (pipeline) names are enabled for import — every funnel  */
/* filter in the app (sidebar, Dashboard, Reyting, Funnels, AmoCRM      */
/* board) consults this so a pipeline unchecked in "Import qilinadigan  */
/* voronkalar" never appears as a filter option. null = no restriction. */
/* ------------------------------------------------------------------ */

export function useEnabledFunnelNames(): Set<string> | null {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["enabled_funnel_names", user?.organizationId],
    enabled: !!user?.organizationId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[] | null> => {
      const { data, error } = await supabase.rpc("enabled_funnel_names");
      if (error) throw error;
      return data ?? null;
    },
  });
  return useMemo(() => (data ? new Set(data) : null), [data]);
}

/* ------------------------------------------------------------------ */
/* Distinct funnel names — for the sidebar's expandable Funnels group. */
/* ------------------------------------------------------------------ */

/**
 * Distinct (funnel, owner) pairs of the org's leads, from the database
 * instead of every lead row. Falls back to the lead list until
 * 20261018010000_lead_funnel_owners.sql is applied.
 */
function useLeadOwnerPairs() {
  const { user } = useAuth();
  const pairs = useQuery({
    queryKey: ["leads", "funnel_owners", user?.organizationId],
    enabled: !!user?.organizationId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () =>
      fetchAllPages(async (from) => {
        const { data, error } = await supabase
          .rpc("lead_funnel_owners")
          .order("funnel")
          .order("owner_id")
          .range(from, from + RESOURCE_PAGE_SIZE - 1);
        if (error) throw error;
        return data ?? [];
      }),
  });
  const fallback = useLeadsRaw({ enabled: pairs.isError });
  const data = useMemo<{ funnel: string | null; owner_id: string | null }[] | undefined>(
    () => pairs.data ?? fallback.data,
    [pairs.data, fallback.data],
  );
  return { data, isLoading: pairs.isLoading || (pairs.isError && fallback.isLoading) };
}

/** Owners with at least one lead. */
export function useLeadOwnerIds(): Set<string> {
  const { data } = useLeadOwnerPairs();
  return useMemo(
    () => new Set((data ?? []).map((p) => p.owner_id).filter((id): id is string => !!id)),
    [data],
  );
}

export function useFunnelNames() {
  // The sidebar calls this on every page.
  const pairs = useLeadOwnerPairs();
  const visibleOwnerIds = useVisibleOwnerIds();
  const enabledFunnels = useEnabledFunnelNames();
  const names = useMemo(() => {
    const rows = pairs.data ?? [];
    const set = new Set<string>();
    for (const l of rows) {
      if (visibleOwnerIds && !(l.owner_id && visibleOwnerIds.has(l.owner_id))) continue;
      const name = l.funnel || "Direct Sales";
      if (enabledFunnels && !enabledFunnels.has(name)) continue;
      set.add(name);
    }
    return Array.from(set).sort();
  }, [pairs.data, visibleOwnerIds, enabledFunnels]);
  return { names, isLoading: pairs.isLoading };
}

/* ------------------------------------------------------------------ */
/* Funnel-level stat cards (Reyting) — computed directly from the raw   */
/* leads table rather than summed across per-manager leaderboard rows,  */
/* so a lead with no (or an unmatched) owner still counts toward the    */
/* funnel's totals instead of silently vanishing from the sum.          */
/* ------------------------------------------------------------------ */

// AmoCRM stage names are whatever the org typed into their own pipeline, and
// vary funnel to funnel -- confirmed real-world variants (per the user):
//   Prepayment:   "Predoplata", "Predoplata qildi", "Predoplata qildi |
//                 kelishuv bor", and the observed misspelling "Peredoplata"
//   Half payment: always "Yarim to'lov"
//   Full payment: "To'liq to'lov qildi", "WON | To'liq to'lov",
//                 "Успешно реализовано" (ru), or bare "WON"
//   Exception:    some funnels use "ROP Closed" in place of a full-payment
//                 stage -- counts as a sale too when it shows up
// Matched loosely (lowercased, apostrophes stripped) against any of these
// as a substring, not an exact string.
export const SALES_STAGE_KEYWORDS = [
  "predoplata",
  "peredoplata",
  "yarim",
  "toliq",
  "won",
  "успешно",
  "rop closed",
];

export function normalizeStageName(name: string): string {
  return name.toLowerCase().replace(/['’ʼ`]/g, "");
}

export type FunnelStats = {
  totalLeads: number;
  totalRevenue: number;
  wonCount: number;
  wonRevenue: number;
  lostCount: number;
  // Real, AI-verdict-based counterpart to the old "lost revenue" formula
  // (lostCount * a flat 15% guess * avgCheck) -- count/sum of only the
  // lost leads a call analysis actually flagged as recoverable
  // (leads.recoverable = true), never a blanket estimate over every lost
  // lead regardless of whether it has any real chance.
  recoverableCount: number;
  recoverableRevenue: number;
  salesStageCount: number;
  salesStageRevenue: number;
  // Average deal size across sales-stage leads only (salesStageRevenue /
  // salesStageCount) -- the "o'rtacha chek" the Dashboard's projection cards
  // are built from.
  avgCheck: number;
  conversion: number;
  isLoading: boolean;
};

export function useFunnelStats(funnel?: string | null): FunnelStats {
  const { data: cube, isLoading: cubeLoading } = useLeadCube({ funnel: funnel ?? null });
  const { data: stages, isLoading: stagesLoading } = usePipelineStagesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();

  return useMemo(() => {
    const stagesById = byId(stages);
    let totalLeads = 0;
    let totalRevenue = 0;
    let wonCount = 0;
    let wonRevenue = 0;
    let lostCount = 0;
    let recoverableCount = 0;
    let recoverableRevenue = 0;
    let salesStageCount = 0;
    let salesStageRevenue = 0;

    for (const r of cube ?? []) {
      if (visibleOwnerIds && !(r.owner_id && visibleOwnerIds.has(r.owner_id))) continue;
      totalLeads += r.n;
      totalRevenue += r.revenue;
      const stage = r.stage_id ? stagesById.get(r.stage_id) : undefined;
      if (stage?.is_won) {
        wonCount += r.n;
        wonRevenue += r.revenue;
      }
      if (stage?.is_lost) {
        lostCount += r.n;
        if (r.recoverable === true) {
          recoverableCount += r.n;
          recoverableRevenue += r.revenue;
        }
      }
      if (isSalesStageName(stage)) {
        salesStageCount += r.n;
        salesStageRevenue += r.revenue;
      }
    }

    return {
      totalLeads,
      totalRevenue,
      wonCount,
      wonRevenue,
      lostCount,
      recoverableCount,
      recoverableRevenue,
      salesStageCount,
      salesStageRevenue,
      avgCheck: salesStageCount ? salesStageRevenue / salesStageCount : 0,
      // Sales-stage count (prepayment/half-payment/full-payment), not WON --
      // this is "Umumiy konversiya" as specified, distinct from the WON-only
      // ratio a plain won/total conversion would give.
      conversion: totalLeads ? (salesStageCount / totalLeads) * 100 : 0,
      isLoading: cubeLoading || stagesLoading,
    };
  }, [cube, stages, cubeLoading, stagesLoading, visibleOwnerIds]);
}

/* ------------------------------------------------------------------ */
/* Today's per-funnel call activity (Dashboard "Kunlik calltime" card)  */
/* — how many managers made at least one call today in this funnel, how */
/* much total/average talk time, and how many distinct leads each       */
/* manager reached on average.                                          */
/* ------------------------------------------------------------------ */

export type FunnelCallStats = {
  managerCount: number;
  totalSeconds: number;
  avgSecondsPerManager: number;
  avgContactsPerManager: number;
  isLoading: boolean;
};

export function useFunnelCallStats(funnel?: string | null): FunnelCallStats {
  const startOfToday = useMemo(() => startOfDay(new Date()), []);
  // Only today's calls, each with its lead -- not every call and lead.
  const { data: calls, isLoading: callsLoading } = useCallsWithLead(startOfToday, null);
  const visibleOwnerIds = useVisibleOwnerIds();

  return useMemo(() => {
    // Every call's duration/contact counts toward the card's totals as long
    // as it resolves to a lead (regardless of whether that lead has an
    // owner_id) -- a call shouldn't vanish from "today's activity" just
    // because its lead's AmoCRM responsible user didn't map to a SalesIQ
    // profile. managerCount/per-manager averages still need a real owner_id
    // to attribute to someone, so those are tracked separately. That only
    // holds for an unrestricted view though -- a rop/sotuv_menejeri's "my
    // team's activity today" card must never count a call it can't confirm
    // belongs to someone visible to them, unattributed or not.
    const byManager = new Map<string, { seconds: number; leadIds: Set<string> }>();
    let totalSeconds = 0;
    const allContacts = new Set<string>();
    for (const c of calls ?? []) {
      if (new Date(c.occurred_at) < startOfToday) continue;
      if (!c.lead_id) continue;
      const lead = c.lead;
      if (visibleOwnerIds && (!lead?.owner_id || !visibleOwnerIds.has(lead.owner_id))) continue;
      const leadFunnel = lead?.funnel || "Direct Sales";
      if (funnel && leadFunnel !== funnel) continue;

      totalSeconds += c.duration_seconds;
      allContacts.add(c.lead_id);

      if (!lead?.owner_id) continue;
      const cur = byManager.get(lead.owner_id) ?? { seconds: 0, leadIds: new Set<string>() };
      cur.seconds += c.duration_seconds;
      cur.leadIds.add(lead.id);
      byManager.set(lead.owner_id, cur);
    }

    const managerCount = byManager.size;

    return {
      managerCount,
      totalSeconds,
      avgSecondsPerManager: managerCount ? Math.round(totalSeconds / managerCount) : 0,
      avgContactsPerManager: managerCount
        ? Math.round((allContacts.size / managerCount) * 10) / 10
        : 0,
      isLoading: callsLoading,
    };
  }, [calls, funnel, callsLoading, visibleOwnerIds, startOfToday]);
}

/* ------------------------------------------------------------------ */
/* Open AmoCRM task counts (Dashboard "zadachalar" card) — live-fetched, */
/* not stored locally, since this app never syncs AmoCRM's own task list */
/* in (it only ever pushes single reminder tasks out to AmoCRM).         */
/* ------------------------------------------------------------------ */

export type AmoTaskCardStats = { dueToday: number; overdue: number };

// Leads handed to a new owner since `sinceIso`, from the audit log (owner_id
// changed on an update). The audit log is readable by admins and ROPs
// only; for anyone else this comes back empty and the funnel's "assigned
// today" falls back to leads created today.
export function useLeadOwnerChanges(sinceIso: string, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["audit_logs", "lead_owner_changes", user?.organizationId, sinceIso],
    enabled: enabled && !!user?.organizationId,
    staleTime: 60_000,
    queryFn: async (): Promise<{ leadId: string; ownerId: string; at: string }[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select(
          "entity_id, created_at, old_owner:meta->old->>owner_id, new_owner:meta->new->>owner_id",
        )
        .eq("entity_type", "leads")
        .eq("action", "update")
        .gte("created_at", sinceIso)
        .limit(5000);
      if (error) return [];
      return (data ?? []).flatMap((r) =>
        r.entity_id && r.new_owner && r.new_owner !== r.old_owner
          ? [{ leadId: r.entity_id, ownerId: String(r.new_owner), at: r.created_at }]
          : [],
      );
    },
  });
}

export function useAmoCrmTaskStats(funnel?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["amocrm_task_stats", user?.organizationId, funnel ?? null],
    enabled: !!user?.organizationId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AmoTaskCardStats> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const params = new URLSearchParams();
      if (funnel) params.set("funnel", funnel);
      const res = await fetch(`/dashboard/amocrm-tasks?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = (await res.json()) as AmoTaskCardStats & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load AmoCRM tasks.");
      return { dueToday: json.dueToday, overdue: json.overdue };
    },
  });
}
