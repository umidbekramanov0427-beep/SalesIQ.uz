import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { PermissionGate } from "@/components/PermissionGate";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import {
  useAiOnboarding,
  useApplyAiOnboardingProposal,
  useStartAiOnboarding,
  type OrgAiOnboardingRow,
} from "@/hooks/use-crm-data";
import { AI_SETUP_QUESTIONS_COUNT } from "@/lib/ai-onboarding-shared";

export const Route = createFileRoute("/onboarding/ai-setup")({
  head: () => ({
    meta: [
      { title: "AI bilan sozlash — SalesIQ" },
      {
        name: "description",
        content: "AI-driven onboarding interview and setup proposal for a new organization.",
      },
    ],
  }),
  component: AiSetupPageGated,
});

function AiSetupPageGated() {
  return (
    <PermissionGate action="Manage integrations">
      <AiSetupPage />
    </PermissionGate>
  );
}

type Proposal = {
  pipelineName: string;
  pipelineStages: { name: string; probability: number; isWon?: boolean; isLost?: boolean }[];
  leadQualityStages: { title: string; qualified: boolean; conditions: string[] }[];
  summary: string;
  migrationRecommendation: string;
};

function AiSetupPage() {
  const { t } = useI18n();
  const { data: row, isLoading } = useAiOnboarding();
  const start = useStartAiOnboarding();
  const apply = useApplyAiOnboardingProposal();

  async function onStart() {
    try {
      const res = await start.mutateAsync();
      if (!res.telegramLinked) {
        toast.error(t("aiOnboarding.needTelegramLink"));
      } else {
        toast.success(t("aiOnboarding.startedToast"));
      }
    } catch (err) {
      toast.error(describeError(err, t("common.saveFailed")));
    }
  }

  async function onApply() {
    try {
      await apply.mutateAsync();
      toast.success(t("aiOnboarding.appliedToast"));
    } catch (err) {
      toast.error(describeError(err, t("common.saveFailed")));
    }
  }

  const status = row?.status ?? "not_started";
  const proposal = row?.proposal as unknown as Proposal | null;

  return (
    <>
      <PageHeader
        title={t("aiOnboarding.pageTitle")}
        description={t("aiOnboarding.pageDesc")}
        actions={
          <Link
            to="/integrations"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t("amocrmChecklist.back")}
          </Link>
        }
      />

      {isLoading ? (
        <SectionCard title={t("aiOnboarding.pageTitle")}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        </SectionCard>
      ) : status === "not_started" ? (
        <SectionCard title={t("aiOnboarding.introTitle")} description={t("aiOnboarding.introDesc")}>
          <button
            type="button"
            onClick={onStart}
            disabled={start.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {start.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {t("aiOnboarding.startButton")}
          </button>
        </SectionCard>
      ) : status === "interviewing" ? (
        <InterviewProgress row={row} onRestart={onStart} restarting={start.isPending} />
      ) : (
        <ProposalReview
          proposal={proposal}
          status={status}
          onApply={onApply}
          applying={apply.isPending}
          onRestart={onStart}
          restarting={start.isPending}
        />
      )}
    </>
  );
}

function InterviewProgress({
  row,
  onRestart,
  restarting,
}: {
  row: OrgAiOnboardingRow | null | undefined;
  onRestart: () => void;
  restarting: boolean;
}) {
  const { t } = useI18n();
  const step = row?.current_step ?? 0;
  const total = AI_SETUP_QUESTIONS_COUNT;
  return (
    <SectionCard
      title={t("aiOnboarding.interviewingTitle")}
      description={t("aiOnboarding.interviewingDesc")}
    >
      <div className="space-y-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, (step / total) * 100)}%` }}
          />
        </div>
        <p className="text-xs text-subtle">
          {t("aiOnboarding.interviewProgress", { step: String(step), total: String(total) })}
        </p>
        <button
          type="button"
          onClick={onRestart}
          disabled={restarting}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          {restarting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {t("aiOnboarding.restartButton")}
        </button>
      </div>
    </SectionCard>
  );
}

function ProposalReview({
  proposal,
  status,
  onApply,
  applying,
  onRestart,
  restarting,
}: {
  proposal: Proposal | null;
  status: string;
  onApply: () => void;
  applying: boolean;
  onRestart: () => void;
  restarting: boolean;
}) {
  const { t } = useI18n();
  if (!proposal) {
    return (
      <SectionCard title={t("aiOnboarding.pageTitle")}>
        <p className="text-sm text-muted-foreground">{t("aiOnboarding.noProposal")}</p>
      </SectionCard>
    );
  }

  const applied = status === "applied";

  return (
    <div className="space-y-6">
      <SectionCard
        title={proposal.pipelineName}
        description={proposal.summary}
        actions={
          applied ? (
            <Pill tone="success">{t("aiOnboarding.appliedPill")}</Pill>
          ) : (
            <button
              type="button"
              onClick={onApply}
              disabled={applying}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {applying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {t("aiOnboarding.applyButton")}
            </button>
          )
        }
      >
        <div className="space-y-2">
          {proposal.pipelineStages.map((stage) => (
            <div
              key={stage.name}
              className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5 text-sm"
            >
              <span className="font-medium text-foreground">{stage.name}</span>
              <span className="text-xs text-subtle">{stage.probability}%</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("aiOnboarding.qualityStagesTitle")}>
        <div className="grid gap-3 sm:grid-cols-3">
          {proposal.leadQualityStages.map((q) => (
            <div key={q.title} className="surface-card p-4">
              <div className="flex items-center gap-2">
                <Pill tone={q.qualified ? "success" : "neutral"}>{q.title}</Pill>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-subtle">
                {q.conditions.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("aiOnboarding.migrationTitle")}>
        <p className="text-sm text-muted-foreground">{proposal.migrationRecommendation}</p>
        <Link
          to="/onboarding/data-import"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          {t("aiOnboarding.goToImport")}
        </Link>
      </SectionCard>

      <button
        type="button"
        onClick={onRestart}
        disabled={restarting}
        className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
      >
        {restarting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {t("aiOnboarding.restartButton")}
      </button>
    </div>
  );
}
