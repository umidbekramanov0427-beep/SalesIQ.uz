import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

// A company whose trial/subscription lapsed (organizations.active = false,
// flipped by deactivate-expired-trials.ts) gets this persistent banner on
// every page instead of a hard block -- their data stays visible (nothing
// here restricts reads/writes), but the banner never lets them forget to
// renew. Dismissing it only hides it for this page load, same as the
// reference this was modeled on -- it comes back on the next navigation,
// not gone for good from one click.
export function TrialBanner() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);

  // Only ever shown for an org member whose own org is explicitly
  // inactive -- orgActive is null for a platform_owner (no org of their
  // own) and true for everyone else in good standing, so both cases fall
  // through here with no banner.
  if (user?.orgActive !== false || dismissed) return null;

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
