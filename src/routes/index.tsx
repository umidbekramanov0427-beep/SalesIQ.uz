import { lazy, Suspense, useEffect } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { PermissionGate } from "@/components/PermissionGate";
import { Landing } from "@/components/marketing/Landing";
import { LogoLoader } from "@/components/LogoLoader";
import { trackOnce } from "@/lib/analytics";

const Leaderboard = lazy(() =>
  import("@/components/leaderboard/LeaderboardPage").then((m) => ({ default: m.Leaderboard })),
);
const HomePage = lazy(() =>
  import("@/components/dashboard/HomePage").then((m) => ({ default: m.HomePage })),
);

export const Route = createFileRoute("/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    from?: string | undefined;
    to?: string | undefined;
    label?: string | undefined;
    q?: string | undefined;
    stage?: string | undefined;
    funnel?: string | undefined;
    tags?: string | undefined;
    min?: string | undefined;
    max?: string | undefined;
    tab?: string | undefined;
  } => ({
    from: typeof search["from"] === "string" ? search["from"] : undefined,
    to: typeof search["to"] === "string" ? search["to"] : undefined,
    label: typeof search["label"] === "string" ? search["label"] : undefined,
    q: typeof search["q"] === "string" ? search["q"] : undefined,
    stage: typeof search["stage"] === "string" ? search["stage"] : undefined,
    funnel: typeof search["funnel"] === "string" ? search["funnel"] : undefined,
    tags: typeof search["tags"] === "string" ? search["tags"] : undefined,
    min: typeof search["min"] === "string" ? search["min"] : undefined,
    max: typeof search["max"] === "string" ? search["max"] : undefined,
    tab: typeof search["tab"] === "string" ? search["tab"] : undefined,
  }),
  // "/" is a dual-purpose route: AuthGate (__root.tsx) treats it as public
  // only while logged out, in which case it renders the marketing landing
  // page below instead of this route's own Leaderboard component -- so this
  // head() is the one a search engine or a shared link actually sees, and
  // it describes the product, not the in-app Reyting screen. The
  // authenticated Leaderboard branch restores its own tab title via a
  // document.title effect once it knows it's rendering for a signed-in
  // user (see RootOrLanding below).
  head: () => ({
    meta: [
      { title: "SalesIQ — sotuv jamoalari uchun AI operatsion tizimi" },
      {
        name: "description",
        content:
          "SalesIQ: lidlar, voronka va telefoniyani boshqaring, har bir qo'ng'iroqni AI bilan tahlil qiling, jamoangizni avtomatlashtiring. 14 kunlik bepul sinov.",
      },
      { property: "og:title", content: "SalesIQ — sotuv jamoalari uchun AI operatsion tizimi" },
      {
        property: "og:description",
        content: "Lidlar, telefoniya, AI qo'ng'iroq tahlili va avtomatlashtirish — bitta joyda.",
      },
    ],
  }),
  component: RootOrLanding,
});

function RootOrLanding() {
  const { user, ready } = useAuth();
  // Not signed in (or not known yet) is the state AuthGate lets reach this
  // component without wrapping it in AppShell (see __root.tsx). Until the
  // auth check finishes the landing is rendered anyway -- it is what the
  // server sends, so visitors see it immediately -- but marked pending, so
  // a browser with a stored session shows the loader instead (styles.css).
  if (!user) {
    return (
      <>
        <div className={ready ? undefined : "guest-landing-pending"}>
          <Landing />
        </div>
        {!ready && (
          <div className="session-boot-loader fixed inset-0 z-50 items-center justify-center bg-canvas">
            <LogoLoader className="h-16 w-16" />
          </div>
        )}
      </>
    );
  }
  // An intern's home is Sinfxona (their probation plan + AI mentor).
  if (user?.isIntern) return <Navigate to="/content-library" replace />;
  return <SignedInHome managers={user?.role === "rop" || user?.role === "super_admin"} />;
}

const fallback = (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="h-5 w-5 animate-spin text-subtle" />
  </div>
);

// Bosh sahifa: heads of sales and admins get the dashboard with Reyting as
// one of its tabs; a sales rep's home is the Reyting itself.
function SignedInHome({ managers }: { managers: boolean }) {
  const { t } = useI18n();
  // The route's own head() above is written for the logged-out marketing
  // view (see the comment there) since that's what search engines and
  // shared links see; restore the in-app tab title for a signed-in session.
  useEffect(() => {
    document.title = `${t("home.title")} — SalesIQ`;
  }, [t]);
  useEffect(() => {
    // helps improve this setup flow — safe to remove once you've verified the event lands
    trackOnce("Viewed Home Page", {
      view: managers ? "dashboard" : "rating",
      prompt_version: "BA400.4",
    });
  }, [managers]);
  if (managers) {
    return (
      <Suspense fallback={fallback}>
        <HomePage />
      </Suspense>
    );
  }
  return (
    <PermissionGate action="View leaderboard">
      <Suspense fallback={fallback}>
        <Leaderboard />
      </Suspense>
    </PermissionGate>
  );
}
