import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Globe, Moon, Sun } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LANGS, LANG_SHORT, useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// The sign-in / sign-up page's look: a calm card (after Uiverse's "ammarsaa"
// form) -- filled fields whose names float up, a pulsing brand dot before
// the title, the brand's blue button -- on a quiet page with one faint blue
// light. The logo, the languages and the light / dark switch sit in the
// card's top row. Colors are the --ac-* tokens in styles.css (.auth-card-skin,
// and its light form), so both themes come from one set of classes.

export type SkinStyle = {
  label: string;
  err: string;
  head: string;
  h1: string;
  accent: string;
  sub: string;
  submit: string;
  errorBox: string;
  divider: string;
  dividerLine: string;
  google: string;
  link: string;
  muted: string;
  chip: string;
  notice: string;
  badge: string;
};

const CARD: SkinStyle = {
  label: "mb-1.5 block text-[13px] font-semibold text-[var(--ac-muted)]",
  err: "text-[var(--ac-err)]",
  head: "mb-6",
  h1: "auth-card-title text-[30px] font-semibold leading-tight tracking-[-0.03em] text-[var(--auth-ink)] phone:text-[27px]",
  accent: "text-[var(--auth-ink)]",
  sub: "mt-2 text-[15px] leading-snug text-[var(--ac-muted)]",
  submit:
    "h-[52px] rounded-[12px] bg-primary text-[16px] font-semibold text-white shadow-[0_10px_26px_-12px_var(--primary)] hover:brightness-[1.12]",
  errorBox: "rounded-[10px] border border-red-400/30 bg-red-500/10 text-[var(--ac-err)]",
  divider: "text-[var(--ac-faint)]",
  dividerLine: "bg-[var(--ac-line)]",
  google:
    "h-[52px] rounded-[12px] border border-[var(--ac-field-border)] bg-[var(--ac-google)] text-[var(--ac-text)] hover:bg-[var(--ac-google-hover)]",
  link: "text-[var(--auth-ink)]",
  muted: "text-[var(--ac-muted)] hover:text-[var(--ac-text)]",
  chip: "border-[var(--ac-line)] bg-[var(--ac-field)] text-[var(--ac-muted)]",
  notice: "border-amber-400/40 bg-amber-400/10 text-[var(--ac-notice)]",
  badge: "bg-primary/15 text-[var(--auth-ink)]",
};

export function useAuthSkin(): { s: SkinStyle } {
  return { s: CARD };
}

// ---- light / dark -------------------------------------------------------------
// Dark unless the person picked light here; the pick also becomes the app's
// theme, so the workspace opens the same way.

const THEME_KEY = "salesiq.authTheme";
let light = false;
let themeLoaded = false;
const listeners = new Set<() => void>();

function loadTheme() {
  if (themeLoaded || typeof window === "undefined") return;
  themeLoaded = true;
  try {
    light = localStorage.getItem(THEME_KEY) === "light";
    // The old design picker's choice: no longer used.
    localStorage.removeItem("salesiq.authSkin.preview");
  } catch {
    /* private window */
  }
  listeners.forEach((l) => l());
}

function useAuthLight(): [boolean, () => void] {
  const isLight = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => light,
    () => false,
  );
  useEffect(loadTheme, []);
  const { setMode } = useTheme();
  return [
    isLight,
    () => {
      light = !light;
      try {
        localStorage.setItem(THEME_KEY, light ? "light" : "dark");
      } catch {
        /* private window */
      }
      setMode(light ? "light" : "dark");
      listeners.forEach((l) => l());
    },
  ];
}

// ---- the page and the card -------------------------------------------------------

/** The page: quiet backdrop, one faint blue light, a footer line. */
export function AuthPage({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [isLight] = useAuthLight();
  return (
    <main
      data-auth-theme={isLight ? "light" : "dark"}
      className={cn(
        "auth-card-skin relative flex min-h-dvh w-full flex-col overflow-x-hidden bg-[var(--ac-page)] text-[var(--ac-text)]",
        !isLight && "auth-surface always-dark",
      )}
    >
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <span className="absolute inset-0 bg-[radial-gradient(var(--ac-dots)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <span className="auth-card-glow absolute left-1/2 top-1/2 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[150px] phone:h-[400px] phone:w-[400px]" />
      </div>
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-10 phone:px-3 phone:py-4">
        {children}
      </div>
      <p className="relative z-10 pb-6 text-center text-[12.5px] text-[var(--ac-faint)] phone:px-4">
        {t("authv.footer")}
      </p>
    </main>
  );
}

/** The card: logo, light / dark and languages on top, then the form. */
export function AuthCard({ children, leaving }: { children: ReactNode; leaving?: boolean }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div
      className={cn(
        "w-full",
        pathname.startsWith("/signup") ? "max-w-[560px]" : "max-w-[520px]",
        leaving ? "auth-flip-out" : "auth-flip-in",
      )}
    >
      <div className="rounded-[24px] border border-[var(--ac-card-border)] bg-[var(--ac-card)] px-11 pb-10 pt-8 shadow-[var(--ac-card-shadow)] phone:rounded-[20px] phone:px-5 phone:pb-7 phone:pt-5">
        <div className="mb-8 flex items-center justify-between gap-3 phone:mb-6">
          <span className="inline-flex min-w-0 items-center gap-2.5">
            <Logo className="h-8 w-8 shrink-0 phone:h-7 phone:w-7" />
            <span className="truncate text-[18px] font-bold tracking-tight phone:text-[16px]">
              SalesIQ<span className="text-[var(--auth-ink)]">.uz</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <ThemeSwitch />
            <LangSwitch />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

function ThemeSwitch() {
  const { t } = useI18n();
  const [isLight, toggle] = useAuthLight();
  const label = isLight ? t("authv.themeDark") : t("authv.themeLight");
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--ac-line)] bg-[var(--ac-field)] text-[var(--ac-muted)] transition-colors hover:text-[var(--ac-text)]"
    >
      {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}

function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex h-9 items-center gap-0.5 rounded-xl border border-[var(--ac-line)] bg-[var(--ac-field)] p-1">
      <Globe className="mx-1 h-3.5 w-3.5 text-[var(--ac-faint)] phone:hidden" />
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={cn(
            "h-full rounded-lg px-2.5 text-[11.5px] font-semibold transition-colors phone:px-2",
            lang === l
              ? "bg-primary text-white"
              : "text-[var(--ac-muted)] hover:text-[var(--ac-text)]",
          )}
        >
          {LANG_SHORT[l]}
        </button>
      ))}
    </div>
  );
}
