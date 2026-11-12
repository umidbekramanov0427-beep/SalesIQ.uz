import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { LogoLoader } from "@/components/LogoLoader";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { canUseCrm, canUseMarketing } from "@/lib/marketing";
import { isPlatformHost, panelFromHost, type Panel } from "@/lib/subdomain";
import { moveSessionToPanel, panelOriginLive } from "@/lib/subdomain-handoff";

// Keeps each panel on its own address: /marketing/* belongs to
// marketing.salesiq.uz (or <sub>.marketing.salesiq.uz), everything else to
// the CRM's. On a preview URL or localhost both panels share one address
// and nothing moves. A marketolog is always sent to the marketing panel;
// someone without marketing access sees why the panel is closed.

export const isMarketingPath = (p: string) => p === "/marketing" || p.startsWith("/marketing/");

export function PanelGuard({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const [host, setHost] = useState<{ panel: Panel; platform: boolean } | null>(null);
  useEffect(() => {
    setHost({
      panel: panelFromHost(window.location.host),
      platform: isPlatformHost(window.location.host),
    });
  }, []);

  const wantsMarketing = isMarketingPath(pathname);
  const crmOk = canUseCrm(user);
  const marketingOk = canUseMarketing(user);

  // What has to happen: stay, go to another path here, or move address.
  let move: { panel: Panel; next: string } | null = null as { panel: Panel; next: string } | null;
  let go: string | null = null;
  if (host && user) {
    if (!wantsMarketing && (!crmOk || host.panel === "marketing")) {
      // A CRM page: a marketolog or the marketing address -> marketing home,
      // or the same page on the CRM's address.
      if (!crmOk || pathname === "/") go = "/marketing";
      else if (host.platform) move = { panel: "crm", next: `${pathname}${search}` };
      else go = "/marketing";
    } else if (wantsMarketing && host.panel === "crm" && host.platform && marketingOk) {
      move = { panel: "marketing", next: `${pathname}${search}` };
    }
  }

  useEffect(() => {
    if (go) void navigate({ to: go, replace: true });
  }, [go, navigate]);
  // Until the other address answers (DNS not set up yet), the panel opens
  // right here instead of sending the person to a dead address.
  const [unreachable, setUnreachable] = useState<Panel | null>(null);
  if (move && unreachable === move.panel) move = null;
  useEffect(() => {
    if (!move || !user) return;
    let cancelled = false;
    const target = move;
    void (async () => {
      const live = await panelOriginLive(user.orgSubdomain, target.panel);
      if (cancelled) return;
      if (!live || !(await moveSessionToPanel(target.panel, user.orgSubdomain, target.next))) {
        setUnreachable(target.panel);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move?.panel, move?.next, user?.id]);

  if (!host || go || move) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas">
        <LogoLoader className="h-14 w-14" />
      </div>
    );
  }

  if (wantsMarketing && !marketingOk) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/12 text-rose-600">
            <Megaphone className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-foreground">{t("mkt.noAccessTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("mkt.noAccessDesc")}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {crmOk && (
              <button
                type="button"
                onClick={() =>
                  host.platform && host.panel === "marketing"
                    ? void moveSessionToPanel("crm", user?.orgSubdomain ?? null, "/")
                    : void navigate({ to: "/" })
                }
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                {t("mkt.toCrm")}
              </button>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              {t("subdomain.signOut")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
