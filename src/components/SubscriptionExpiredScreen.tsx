import { Link } from "@tanstack/react-router";
import { Lock, Snowflake } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

// Replaces every page (except /billing) for an org whose trial or paid
// period has lapsed -- see AuthGate in __root.tsx. Nothing is deleted: the
// moment a payment goes through, the org's own data is all still there.
export function SubscriptionExpiredScreen() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isAdmin = user?.role === "super_admin";

  if (user?.orgFrozen) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="surface-card w-full max-w-md p-6 text-center sm:p-8">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600">
            <Snowflake className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-lg font-bold text-foreground">{t("frozen.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("frozen.desc")}</p>
          {user.orgFrozenReason && (
            <p className="mt-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground">
              {user.orgFrozenReason}
            </p>
          )}
          <p className="mt-3 text-xs text-subtle">{t("lockout.dataSafe")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="surface-card w-full max-w-md p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <Lock className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-foreground">{t("lockout.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAdmin ? t("lockout.descAdmin") : t("lockout.descMember")}
        </p>
        <p className="mt-2 text-xs text-subtle">{t("lockout.dataSafe")}</p>
        <Link
          to="/billing"
          className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {isAdmin ? t("lockout.ctaAdmin") : t("lockout.ctaMember")}
        </Link>
      </div>
    </div>
  );
}
