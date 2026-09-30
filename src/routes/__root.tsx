import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { installGlobalErrorLogging, logClientError } from "../lib/error-log";
import { AppShell } from "../components/layout/AppShell";
import { LogoLoader } from "../components/LogoLoader";
import { AuthProvider, useAuth } from "../lib/auth";
import { I18nProvider, useI18n } from "../lib/i18n";
import { CurrencyProvider } from "../lib/currency";
import { ThemeProvider } from "../lib/theme";
import { Toaster } from "../components/ui/sonner";

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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const { t } = useI18n();
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    logClientError(error, { boundary: "tanstack_root_error_component" });
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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SalesIQ CRM" },
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
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
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
    pathname.startsWith("/f/");
  // "/" is public ONLY while logged out -- that's when index.tsx renders
  // the marketing landing page instead of the authenticated Reyting
  // dashboard, so it needs to render bare (no AppShell chrome, no redirect
  // to /login) exactly like the routes above. Once signed in, "/" goes
  // through the normal AppShell-wrapped flow below like any other route.
  const isPublicRoute = isAlwaysPublicRoute || (pathname === "/" && ready && !user);

  useEffect(() => {
    if (ready && !user && !isPublicRoute) {
      void navigate({ to: "/login", search: { redirect: href }, replace: true });
    }
  }, [ready, user, isPublicRoute, href, navigate]);

  if (isPublicRoute) return <Outlet />;

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <LogoLoader className="h-16 w-16" />
      </div>
    );
  }

  return (
    <AppShell>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </AppShell>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    installGlobalErrorLogging();
  }, []);

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
