import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

// A three-step welcome on someone's first visit: the menu, the "Qo'llanma"
// button, the AI assistant. Shown once per person on this browser; "Skip"
// or finishing it never shows it again.

const STEPS = [
  { target: '[data-tour="nav"]', key: "nav" },
  { target: '[data-tour="guide"]', key: "guide" },
  { target: '[data-tour="ai"]', key: "ai" },
] as const;

const storageKey = (userId: string) => `salesiq.tour.v1.${userId}`;

function seen(userId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(userId)) === "1";
  } catch {
    return true;
  }
}

function markSeen(userId: string) {
  try {
    window.localStorage.setItem(storageKey(userId), "1");
  } catch {
    // Private mode: the tour simply shows again next time.
  }
}

type Box = { top: number; left: number; width: number; height: number };

export function WelcomeTour() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (!user?.id || user.role === "platform_owner") return;
    if (seen(user.id)) return;
    // Let the page draw first so the targets exist.
    const timer = window.setTimeout(() => setStep(0), 1200);
    return () => window.clearTimeout(timer);
  }, [user?.id, user?.role]);

  useLayoutEffect(() => {
    if (step === null) return;
    function measure() {
      const el = document.querySelector(STEPS[step!]!.target);
      if (!el) {
        setBox(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step]);

  if (step === null || !user?.id) return null;

  function finish() {
    markSeen(user!.id);
    setStep(null);
  }
  function next() {
    // Skip a step whose target isn't on this page (e.g. no guide button).
    let n = step! + 1;
    while (n < STEPS.length && !document.querySelector(STEPS[n]!.target)) n++;
    if (n >= STEPS.length) finish();
    else setStep(n);
  }

  const current = STEPS[step]!;
  const pad = 6;
  // Card beside the target: right of the menu, below the guide button,
  // above-left of the AI button.
  const card = box
    ? current.key === "nav"
      ? { top: Math.max(16, box.top + 24), left: box.left + box.width + 16 }
      : current.key === "guide"
        ? { top: box.top + box.height + 14, left: Math.max(16, box.left + box.width - 340) }
        : { top: Math.max(16, box.top - 190), left: Math.max(16, box.left + box.width - 340) }
    : { top: 120, left: 120 };

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={finish} />
      {box && (
        <div
          className="pointer-events-none absolute rounded-xl ring-4 ring-primary/70"
          style={{
            top: box.top - pad,
            left: box.left - pad,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
          }}
        />
      )}
      <div
        className="absolute w-[340px] rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-[0_18px_50px_rgba(0,0,0,0.3)]"
        style={card}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-primary">
            {t("tour.counter", { n: step + 1, total: STEPS.length })}
          </p>
          <button
            type="button"
            onClick={finish}
            aria-label={t("tour.skip")}
            className="-m-1 grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[15px] font-semibold text-foreground">
          {t(`tour.${current.key}.title`)}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {t(`tour.${current.key}.body`)}
        </p>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={finish}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("tour.skip")}
          </button>
          <button
            type="button"
            onClick={next}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {step + 1 < STEPS.length ? t("tour.next") : t("tour.done")}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
