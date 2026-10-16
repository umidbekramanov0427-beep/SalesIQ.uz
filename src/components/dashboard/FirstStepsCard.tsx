import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Rocket, X } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  FIRST_STEPS,
  firstStepLink,
  firstStepsDone,
  nextFirstStep,
  type FirstStepsState,
} from "@/lib/first-steps";
import { cn } from "@/lib/utils";

// The company owner's "Birinchi qadamlar" on the home page while the
// company is new (/account/first-steps decides): five things that make the
// trial worth paying for, ticked off as they happen. Can be hidden.

const dismissKey = (orgId: string) => `salesiq.firstSteps.hidden.${orgId}`;

export function FirstStepsCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const orgId = user?.organizationId ?? "";
  const [hidden, setHidden] = useState(() => {
    try {
      return !!orgId && localStorage.getItem(dismissKey(orgId)) === "1";
    } catch {
      return false;
    }
  });
  const { data } = useQuery({
    queryKey: ["first_steps", orgId],
    enabled: !!orgId && !hidden,
    staleTime: 60_000,
    queryFn: async (): Promise<{ show: boolean; steps?: FirstStepsState }> => {
      const res = await apiFetch("/account/first-steps");
      if (!res.ok) return { show: false };
      return (await res.json()) as { show: boolean; steps?: FirstStepsState };
    },
  });
  if (hidden || !data?.show || !data.steps) return null;
  const steps = data.steps;
  const done = firstStepsDone(steps);
  const next = nextFirstStep(steps);

  function hide() {
    try {
      localStorage.setItem(dismissKey(orgId), "1");
    } catch {
      // Private mode: hidden for this visit only.
    }
    setHidden(true);
  }

  return (
    <SectionCard
      className="mb-5"
      icon={Rocket}
      tone="primary"
      title={t("firstSteps.title")}
      description={t("firstSteps.desc")}
      actions={
        <button
          type="button"
          onClick={hide}
          aria-label={t("firstSteps.hide")}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" /> {t("firstSteps.hide")}
        </button>
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${(done / FIRST_STEPS.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
          {done}/{FIRST_STEPS.length}
        </span>
      </div>
      <ol className="grid gap-2 md:grid-cols-5">
        {FIRST_STEPS.map((step) => {
          const ok = steps[step];
          const current = step === next;
          return (
            <li key={step}>
              <Link
                {...(firstStepLink(step) as { to: "/" })}
                className={cn(
                  "flex h-full items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors md:flex-col md:gap-2",
                  ok
                    ? "border-border bg-surface/60 phone:py-2"
                    : current
                      ? "border-primary/50 bg-primary/5 hover:bg-primary/10"
                      : "border-border bg-card hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                    ok
                      ? "bg-emerald-500 text-white"
                      : current
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {ok ? <Check className="h-4 w-4" /> : FIRST_STEPS.indexOf(step) + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm font-semibold leading-snug",
                      ok ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {t(`firstSteps.${step}`)}
                  </span>
                  {!ok && (
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                      {t(`firstSteps.${step}Hint`)}
                    </span>
                  )}
                </span>
                {current && <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary md:hidden" />}
              </Link>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
