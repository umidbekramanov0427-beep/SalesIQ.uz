import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { captureRefFromUrl } from "@/lib/referral";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { installGlobalErrorLogging, logClientError, reloadIfStaleChunk } from "../lib/error-log";
import { SubdomainGuard } from "@/components/layout/SubdomainGuard";
import { MfaGate } from "@/components/auth/MfaGate";
import { AppShell } from "../components/layout/AppShell";
import { SubscriptionExpiredScreen } from "../components/SubscriptionExpiredScreen";
import { LogoLoader } from "../components/LogoLoader";
import { AuthProvider, useAuth } from "../lib/auth";
import { I18nProvider, useI18n, useI18nOrEnglish } from "../lib/i18n";
import { CurrencyProvider } from "../lib/currency";
import { ThemeProvider } from "../lib/theme";
import { ACCENT_BOOT_SCRIPT, useApplySavedAccent } from "../lib/accent";
import { Toaster } from "../components/ui/sonner";
import { identify, pageName, trackPage } from "../lib/analytics";
import { trail } from "../lib/session-trail";

function NotFoundComponent() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("notfound.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("notfound.desc")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("notfound.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const { t } = useI18nOrEnglish();
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    logClientError(error, { boundary: "tanstack_root_error_component" });
    // A lazy page chunk from an older deploy: load the current build.
    reloadIfStaleChunk(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("errorpage.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("errorpage.desc")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("errorpage.tryAgain")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("errorpage.goHome")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // No viewport meta here: PHONE_BOOT_SCRIPT (RootShell) writes it before
      // first paint -- a fixed 1366px layout for computers and tablets, the
      // device width for phones. Kept out of head() so a re-render never
      // puts the desktop width back over a phone's.
      { title: "SalesIQ CRM" },
      { name: "theme-color", content: "#1d4ed8" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "SalesIQ" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      {
        name: "description",
        content:
          "Real-time sales rep ranking, monthly targets, bonus tracking and department comparison.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "SalesIQ CRM" },
      { name: "twitter:title", content: "SalesIQ CRM" },
      {
        property: "og:description",
        content:
          "Real-time sales rep ranking, monthly targets, bonus tracking and department comparison.",
      },
      {
        name: "twitter:description",
        content:
          "Real-time sales rep ranking, monthly targets, bonus tracking and department comparison.",
      },
      {
        property: "og:image",
        content: "https://salesiq.uz/og-image.png",
      },
      {
        name: "twitter:image",
        content: "https://salesiq.uz/og-image.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// "/" is server-rendered as the marketing landing so a visitor sees it at
// once instead of a spinner until the auth check finishes. A browser that
// holds a Supabase session gets data-session on <html> before first paint,
// which hides that pre-rendered landing behind the loader (styles.css,
// .guest-landing-pending) until the signed-in home takes over.
const SESSION_BOOT_SCRIPT = `(function(){try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&/^sb-.+-auth-token$/.test(k)){document.documentElement.setAttribute("data-session","");return}}}catch(e){}})();`;

// Writes the viewport meta before first paint. Computers and tablets get a
// fixed 1366px layout (clears Tailwind's xl breakpoint with room for a
// scrollbar). A phone -- a touch screen whose short side is under 768px --
// gets its real width at 1:1, like any phone app, plus <html class="phone">
// for the phone layout (the `phone:` variant and the html.phone rules in
// styles.css: bottom tab bar, one-column pages, 16px inputs so iOS doesn't
// zoom). A page that sets its own viewport (the Telegram Mini App) keeps it.
const PHONE_BOOT_SCRIPT = `(function(){try{var s=window.screen,m=Math.min(s.width,s.height),phone=m<768&&window.matchMedia("(pointer: coarse)").matches;if(phone)document.documentElement.classList.add("phone");var v=document.querySelector('meta[name="viewport"]');if(v&&!phone)return;if(!v){v=document.createElement("meta");v.name="viewport";document.head.appendChild(v)}v.content=phone?"width=device-width, initial-scale=1, viewport-fit=cover":"width=1366"}catch(e){}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the accent boot script below stamps
    // data-accent on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Replays the user's saved accent color before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: ACCENT_BOOT_SCRIPT }} />
        {/* Marks a stored session before first paint (see SESSION_BOOT_SCRIPT). */}
        <script dangerouslySetInnerHTML={{ __html: SESSION_BOOT_SCRIPT }} />
        {/* Phones: real device width and the compact sizing (PHONE_BOOT_SCRIPT). */}
        <script dangerouslySetInnerHTML={{ __html: PHONE_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthGate() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Full path incl. query string (e.g. "/hr/settings") -- carried through to
  // /login so a genuinely logged-out visit, or any transient moment where
  // `user` isn't resolved yet on a hard refresh, sends them back to the
  // exact page they were on afterward instead of always landing on "/"
  // (Reyting).
  const href = useRouterState({ select: (s) => s.location.href });
  // /privacy and /terms have to be reachable by anyone logged out too --
  // they're the Privacy Policy / Terms of Service URLs Google's OAuth
  // consent screen links to, and Google fetches them without ever
  // authenticating. /f/:slug is a lead-capture web form (module 7) meant to
  // be embedded on the org's own external site, so it has to be reachable
  // by anonymous visitors too.
  const isAlwaysPublicRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    // "/pricing" renders the same Landing page as "/" does while logged
    // out, but reachable regardless of auth state -- a signed-in org
    // clicking "Saytga o'tish" from the Billing settings tab needs to see
    // the live public pricing without it resolving to their own dashboard
    // the way "/" would once they're authenticated.
    pathname === "/pricing" ||
    pathname.startsWith("/f/") ||
    // A company's client paying a bill from a link (lead_payment_links).
    pathname.startsWith("/pay/") ||
    // Telegram Mini App pages sign the user in themselves (or need no
    // account at all, for a client sharing their number).
    pathname === "/tma" ||
    pathname.startsWith("/tma/") ||
    // Arrival on a company's own address with the session from salesiq.uz.
    pathname === "/auth/handoff";
  // "/" is public ONLY while logged out -- that's when index.tsx renders
  // the marketing landing page instead of the authenticated Reyting
  // dashboard, so it needs to render bare (no AppShell chrome, no redirect
  // to /login) exactly like the routes above. Once signed in, "/" goes
  // through the normal AppShell-wrapped flow below like any other route.
  //
  // While the auth check is still running, "/" renders bare too: the
  // logged-out landing is what the server sends, and RootOrLanding hides it
  // for a browser with a stored session (see SESSION_BOOT_SCRIPT).
  const isPublicRoute = isAlwaysPublicRoute || (pathname === "/" && !user);

  // Product analytics (src/lib/analytics.ts): a page view per navigation.
  // The platform owner's own visits are left out so they don't mix into
  // customer usage.
  const ownerVisit = user?.role === "platform_owner";
  useEffect(() => {
    if (!ready || ownerVisit) return;
    identify(
      user
        ? {
            id: user.id,
            role: user.role,
            organizationId: user.organizationId,
            plan: user.orgPlan,
            isIntern: user.isIntern,
          }
        : null,
    );
    trackPage(pathname);
    // The visits report (/platform/sessions) lists the pages of a session.
    if (user) trail("page", pageName(pathname), pathname);
    // Keyed on the path and the signed-in account only: a profile refresh
    // isn't a new page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pathname, user?.id, ownerVisit]);

  useEffect(() => {
    if (ready && !user && !isPublicRoute) {
      void navigate({ to: "/login", search: { redirect: href }, replace: true });
    }
  }, [ready, user, isPublicRoute, href, navigate]);

  if (isPublicRoute) return <Outlet />;

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <LogoLoader className="h-16 w-16" />
      </div>
    );
  }

  // An org whose trial or paid period lapsed is locked out of everything but
  // the billing page (where it can pay). orgActive is null for a
  // platform_owner, so they're never caught by this.
  // A frozen company (platform owner's decision) can't pay its way out, so
  // even /billing shows the frozen screen.
  // Its payment documents (/billing/doc) stay open too.
  const lockedOut =
    user.orgActive === false &&
    (user.orgFrozen || (pathname !== "/billing" && pathname !== "/billing/doc"));

  return (
    <MfaGate>
      <SubdomainGuard>
        <AppShell>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          {lockedOut ? <SubscriptionExpiredScreen /> : <Outlet />}
        </AppShell>
      </SubdomainGuard>
    </MfaGate>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    installGlobalErrorLogging();
    // An invitation link (salesiq.uz/?ref=CODE) is remembered for sign-up.
    captureRefFromUrl();
  }, []);
  useApplySavedAccent();

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <CurrencyProvider>
          <ThemeProvider>
            <AuthProvider>
              <AuthGate />
              <Toaster />
            </AuthProvider>
          </ThemeProvider>
        </CurrencyProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
