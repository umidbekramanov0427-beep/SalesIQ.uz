// The AI analysis of one call from the phone's call log (pbx_calls): the
// row Audio tahlil made for it in amocrm_calls (source "pbx", pbx_call_id).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { CallAnalysis } from "./crm-views";

export type PbxCallAnalysis = {
  id: string;
  score: number | null;
  mood: string | null;
  talkRatio: number | null;
  nextStep: string | null;
  aiSummary: string | null;
  transcript: string | null;
  recordingUrl: string | null;
  analysis: CallAnalysis | null;
  leadId: string | null;
  durationSeconds: number;
  analyzedAt: string | null;
  error: string | null;
};

export function usePbxCallAnalysis(pbxCallId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pbx_call_analysis", user?.organizationId, pbxCallId],
    enabled: !!pbxCallId && !!user?.organizationId,
    // Until the analysis is written, look again now and then.
    refetchInterval: (q) => (q.state.data && q.state.data.analyzedAt ? false : 15_000),
    queryFn: async (): Promise<PbxCallAnalysis | null> => {
      const { data, error } = await supabase
        .from("amocrm_calls")
        .select(
          "id, score, mood, talk_ratio, next_step, ai_summary, transcript, recording_url, analysis, lead_id, duration_seconds, analyzed_at, analysis_error",
        )
        .eq("pbx_call_id", pbxCallId!)
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      if (!data) return null;
      return {
        id: data.id,
        score: data.score,
        mood: data.mood,
        talkRatio: data.talk_ratio,
        nextStep: data.next_step,
        aiSummary: data.ai_summary,
        transcript: data.transcript,
        recordingUrl: data.recording_url,
        analysis: (data.analysis ?? null) as CallAnalysis | null,
        leadId: data.lead_id,
        durationSeconds: data.duration_seconds ?? 0,
        analyzedAt: data.analyzed_at,
        error: data.analysis_error,
      };
    },
  });
}
