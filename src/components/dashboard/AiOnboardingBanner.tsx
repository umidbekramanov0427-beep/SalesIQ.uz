import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAiOnboarding } from "@/hooks/use-crm-data";

// Surfaces the "To'liq AI onboarding oqimi" on the Dashboard until it's
// been applied -- useAiOnboarding() is already gated to admins only, so a
// rep/manager never sees this. Hidden entirely once status is "applied" or
// still loading (avoids a flash of the banner right before real data
// arrives).
export function AiOnboardingBanner() {
  const { t } = useI18n();
  const { data: row, isLoading } = useAiOnboarding();
  if (isLoading) return null;
  const status = row?.status ?? "not_started";
  if (status === "applied") return null;

  const copy =
    status === "interviewing"
      ? {
          title: t("aiOnboarding.bannerInterviewingTitle"),
          desc: t("aiOnboarding.bannerInterviewingDesc"),
        }
      : status === "proposal_ready"
        ? { title: t("aiOnboarding.bannerReadyTitle"), desc: t("aiOnboarding.bannerReadyDesc") }
        : { title: t("aiOnboarding.bannerStartTitle"), desc: t("aiOnboarding.bannerStartDesc") };

  return (
    <Link
      to="/onboarding/ai-setup"
      className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4 transition-colors hover:bg-primary/10"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{copy.title}</p>
          <p className="text-xs text-muted-foreground">{copy.desc}</p>
        </div>
      </div>
      <span className="text-xs font-semibold text-primary">{t("aiOnboarding.bannerCta")}</span>
    </Link>
  );
}
