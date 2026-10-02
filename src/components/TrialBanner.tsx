import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert, Sparkles, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useOrgAccess } from "@/lib/use-org-access";

// Two states, both dismissible for the current page load only (they come
// back on the next navigation, never gone for good from one click):
//   - trial:   a soft notice with the days left and that some features are
//              held back until the first payment.
//   - expired: the red "subscription lapsed" banner. With the lockout in
//              AuthGate this is only ever seen on /billing itself.
export function TrialBanner() {
  const { user } = useAuth();
  const { t } = useI18n();
  const access = useOrgAccess();
  const [dismissed, setDismissed] = useState(false);

  // orgActive is null for a platform_owner (no org of their own), so they
  // never see either banner.
  if (dismissed || user?.orgActive == null) return null;

  if (access.isTrial) {
    return (
      <div className="flex items-center justify-center gap-3 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span>{t("trial.trialBanner", { days: String(access.trialDaysLeft ?? 0) })}</span>
        <Link
          to="/billing"
          className="shrink-0 rounded-lg bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-white/25"
        >
          {t("trial.subscribe")}
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-1 shrink-0 rounded-lg p-1 text-primary-foreground/80 transition-colors hover:bg-white/15 hover:text-primary-foreground"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (!access.isExpired) return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-destructive px-4 py-3 text-sm font-medium text-destructive-foreground">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span>{t("trial.frozenBanner")}</span>
      <Link
        to="/billing"
        className="shrink-0 rounded-lg bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-white/25"
      >
        {t("trial.subscribe")}
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ml-1 shrink-0 rounded-lg p-1 text-destructive-foreground/80 transition-colors hover:bg-white/15 hover:text-destructive-foreground"
        aria-label={t("common.close")}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
