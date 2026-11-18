// What /marketing-api/ai sends to the AI tahlilchi page.
import type { Metrics, RuleAlert } from "@/lib/marketing-ai/metrics";
import type { Finding } from "@/lib/marketing-ai/diagnose";
import type { Forecast } from "@/lib/marketing-ai/forecast";

export type AiOverview = {
  current: Metrics;
  previous: Metrics;
  alerts: RuleAlert[];
  lastAnalysis: {
    result: { findings?: Finding[]; rejected?: number };
    created_at: string;
    provider: string | null;
    model: string | null;
    period_from: string | null;
    period_to: string | null;
  } | null;
  fx: { rate: number; date: string | null; live: boolean };
};

export type AiAnalysis = {
  findings: Finding[];
  rejected: number;
  cached: boolean;
  at: string;
  provider: string | null;
  model: string | null;
  period: { from: string; to: string };
};

export type AiForecasts = {
  period: { from: string; to: string };
  leads: Forecast;
  qualified: Forecast;
  prepaid: Forecast;
  paid: Forecast;
  revenue: Forecast;
  spend: Forecast;
  conversion: { qualRateNext: number | null; qualRateNow: number | null };
  audienceLoss: { viewersLostPerWebinar: number; qualifiedLostPerWebinar: number | null } | null;
  budget: { cplNow: number | null; cplNext: number | null };
};

export type AiRec = {
  id: string;
  title: string;
  problem: string | null;
  priority: "critical" | "warning" | "opportunity";
  status: "new" | "in_progress" | "done" | "rejected";
  assignee_id: string | null;
  metric_key: string | null;
  metric_before: number | null;
  metric_after: number | null;
  measured_at: string | null;
  created_at: string;
  done_at: string | null;
};

export type AiSettingsView = {
  settings: {
    enabled: boolean;
    provider: "gemini" | "anthropic" | "openai";
    model: string | null;
    keyLast4: string | null;
    hasKey: boolean;
    dailyLimitUsd: number | null;
    monthlyLimitUsd: number | null;
    frequency: "manual" | "daily" | "after_webinar";
    ready: boolean;
  };
  usage: { today: number; month: number; tokens: number; calls: number; errors: number } | null;
  platformKey: boolean;
  editor: boolean;
};
