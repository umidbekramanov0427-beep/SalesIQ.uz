import type { ReactNode } from "react";
import { Building2, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { companyOrigin } from "@/lib/subdomain";
import { useCurrentSubdomain } from "@/lib/use-subdomain";

// On <company>.salesiq.uz only that company's own members get in. Anyone
// else signed in there (a member of another company) is shown where their
// own workspace is instead of an empty or foreign-looking app. The data
// itself is already isolated per organization by RLS; this keeps the
// address bar and the workspace consistent. The platform owner can open
// any company's subdomain.
export function SubdomainGuard({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const sub = useCurrentSubdomain();
  if (!sub || !user || user.role === "platform_owner") return <>{children}</>;
  if (user.orgSubdomain === sub) return <>{children}</>;

  const target = companyOrigin(user.orgSubdomain);
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary">
          <Building2 className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-foreground">{t("subdomain.wrongTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("subdomain.wrongDesc", { host: `${sub}` })}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <a
            href={target}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t("subdomain.goToMine")}
          </a>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            <LogOut className="h-4 w-4" /> {t("subdomain.signOut")}
          </button>
        </div>
      </div>
    </div>
  );
}
