import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Globe, type LucideIcon } from "lucide-react";
import { useI18n, LANGS, LANG_SHORT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { SkinCard, SkinnedAuthPage, useAuthSkin } from "@/components/auth/auth-skins";

// The sign-in and sign-up pages share one look: a dark page with soft blue
// light waves (drawn here, no image), and a frosted glass card with two cut
// corners lit in brand blue. Going from one page to the other turns the card
// over (auth-flip-out, then the next page's auth-flip-in), so it reads as one
// card with two sides.

export function AuthBackdrop({ children }: { children: ReactNode }) {
  // The page's look (auth-skins.tsx); the glass one is drawn here.
  return (
    <SkinnedAuthPage glass={<GlassBackdrop>{children}</GlassBackdrop>}>{children}</SkinnedAuthPage>
  );
}

function GlassBackdrop({ children }: { children: ReactNode }) {
  const { lang, setLang } = useI18n();
  return (
    <main className="always-dark relative min-h-dvh w-full overflow-x-hidden bg-[#05070c] text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(1200px_700px_at_70%_30%,#0b1424_0%,#05070c_70%)]"
      >
        <svg
          className="absolute -inset-[10%] h-[120%] w-[120%]"
          viewBox="0 0 1400 900"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="auth-w1" x1="0" x2="1">
              <stop offset="0" stopColor="#0a1a3a" stopOpacity="0" />
              <stop offset=".5" stopColor="#2f7bff" />
              <stop offset="1" stopColor="#0a1a3a" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="auth-w2" x1="0" x2="1">
              <stop offset="0" stopColor="#1a2440" stopOpacity="0" />
              <stop offset=".55" stopColor="#5aa9ff" />
              <stop offset="1" stopColor="#1a2440" stopOpacity="0" />
            </linearGradient>
            <filter id="auth-b8">
              <feGaussianBlur stdDeviation="8" />
            </filter>
            <filter id="auth-b24">
              <feGaussianBlur stdDeviation="24" />
            </filter>
          </defs>
          <g fill="none" strokeLinecap="round" className="auth-waves">
            <path
              d="M-50 640 C 300 420, 650 820, 1450 360"
              stroke="#0f1a2e"
              strokeWidth="140"
              filter="url(#auth-b24)"
            />
            <path
              d="M-50 600 C 300 380, 650 780, 1450 320"
              stroke="url(#auth-w1)"
              strokeWidth="10"
              filter="url(#auth-b8)"
            />
            <path
              d="M-50 600 C 300 380, 650 780, 1450 320"
              stroke="url(#auth-w2)"
              strokeWidth="2"
            />
            <path
              d="M-50 720 C 380 520, 760 900, 1450 470"
              stroke="url(#auth-w1)"
              strokeWidth="6"
              filter="url(#auth-b8)"
              opacity=".7"
            />
            <path
              d="M-50 720 C 380 520, 760 900, 1450 470"
              stroke="url(#auth-w2)"
              strokeWidth="1.4"
              opacity=".8"
            />
            <path
              d="M-50 260 C 420 60, 820 420, 1450 120"
              stroke="url(#auth-w1)"
              strokeWidth="14"
              filter="url(#auth-b24)"
              opacity=".55"
            />
            <path
              d="M-50 230 C 420 30, 820 390, 1450 90"
              stroke="url(#auth-w2)"
              strokeWidth="1.2"
              opacity=".5"
            />
            <path
              d="M-50 820 C 500 640, 900 960, 1450 640"
              stroke="#1d2a44"
              strokeWidth="60"
              filter="url(#auth-b24)"
              opacity=".8"
            />
          </g>
        </svg>
      </div>

      <div className="absolute right-5 top-5 z-10 flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1 backdrop-blur">
        <Globe className="ml-1 h-3.5 w-3.5 shrink-0 text-[#7aa2ff]" />
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
              lang === l ? "bg-[#3570ee] text-white" : "text-white/55 hover:bg-white/10",
            )}
          >
            {LANG_SHORT[l]}
          </button>
        ))}
      </div>

      <div className="relative grid min-h-dvh place-items-center px-4 py-16 phone:py-14">
        {children}
      </div>
    </main>
  );
}

/** The glass card; `leaving` plays the turn-over before the page changes. */
export function GlassCard({ children, leaving }: { children: ReactNode; leaving?: boolean }) {
  const { id } = useAuthSkin();
  if (id !== "glass") return <SkinCard {...(leaving ? { leaving } : {})}>{children}</SkinCard>;
  return (
    <div
      className={cn(
        "relative w-full max-w-[440px] [perspective:1400px]",
        leaving ? "auth-flip-out" : "auth-flip-in",
      )}
    >
      <span aria-hidden className="auth-corner-glow -left-5 -top-5" />
      <span aria-hidden className="auth-corner-glow -bottom-5 -right-5" />
      <div className="auth-glass relative px-[38px] pb-[30px] pt-[34px] phone:px-6">
        <div className="mb-6 flex items-center gap-2.5">
          <Logo className="h-[34px] w-[34px]" />
          <span className="text-[19px] font-bold tracking-tight">
            SalesIQ<span className="text-[#5b8cff]">.uz</span>
          </span>
        </div>
        {children}
      </div>
      <span aria-hidden className="auth-corner -left-0.5 -top-0.5" />
      <span aria-hidden className="auth-corner -bottom-0.5 -right-0.5 rotate-180" />
    </div>
  );
}

/** Navigates to the other side of the card after its turn-over. */
export function useCardFlip() {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  function flipTo(to: "/login" | "/signup") {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => void navigate({ to }), 260);
  }
  return { leaving, flipTo };
}

export function GlassHeading({
  title,
  accent,
  sub,
}: {
  title: string;
  accent?: string;
  sub?: ReactNode;
}) {
  const { id, s } = useAuthSkin();
  return (
    <div className={s.head}>
      <h1 className={s.h1}>
        {id === "card" && <span aria-hidden className="auth-card-dot" />}
        {title} {accent && <span className={s.accent}>{accent}</span>}
      </h1>
      {sub && <p className={s.sub}>{sub}</p>}
    </div>
  );
}

export function GlassField({
  label,
  icon: Icon,
  error,
  className,
  type = "text",
  ...input
}: {
  label: string;
  icon: LucideIcon;
  error?: string | undefined;
  className?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  const { id, s } = useAuthSkin();
  if (id === "card") {
    // A filled field whose name sits inside it and moves up once there is
    // something in it (or it is focused) -- see .auth-float in styles.css.
    // The placeholder is a blank so :placeholder-shown means "empty".
    return (
      <div className={cn("block", className)}>
        <label className={cn("auth-float", error && "auth-float-err", isPassword && "pr-11")}>
          <input
            {...input}
            placeholder=" "
            type={isPassword && shown ? "text" : type}
            aria-invalid={!!error}
            className="auth-float-input"
          />
          <span className="auth-float-label">{label}</span>
          {isPassword && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShown((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 transition-colors hover:text-white"
              aria-label={shown ? "Hide" : "Show"}
            >
              {shown ? (
                <EyeOff className="h-[18px] w-[18px]" />
              ) : (
                <Eye className="h-[18px] w-[18px]" />
              )}
            </button>
          )}
        </label>
        {error && <span className={cn("mt-1.5 block text-xs", s.err)}>{error}</span>}
      </div>
    );
  }
  return (
    <label className={cn("block", className)}>
      <span className={s.label}>{label}</span>
      <span className={cn(s.field, error ? s.fieldErr : s.fieldOk)}>
        <Icon className={cn("h-[18px] w-[18px] shrink-0", s.icon)} />
        <input
          {...input}
          type={isPassword && shown ? "text" : type}
          aria-invalid={!!error}
          className={cn("h-full min-w-0 flex-1 bg-transparent outline-none", s.input)}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShown((v) => !v)}
            className={cn("transition-colors", s.eye)}
            aria-label={shown ? "Hide" : "Show"}
          >
            {shown ? (
              <EyeOff className="h-[18px] w-[18px]" />
            ) : (
              <Eye className="h-[18px] w-[18px]" />
            )}
          </button>
        )}
      </span>
      {error && <span className={cn("mt-1.5 block text-xs", s.err)}>{error}</span>}
    </label>
  );
}

export function GlassSubmit({
  children,
  busy,
  disabled,
}: {
  children: ReactNode;
  busy?: boolean;
  disabled?: boolean;
}) {
  const { s } = useAuthSkin();
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className={cn(
        "flex w-full items-center justify-center gap-2 transition-[filter,transform,background-color] active:scale-[0.99] disabled:opacity-60",
        s.submit,
      )}
    >
      {children}
    </button>
  );
}

export function GlassError({ children }: { children: ReactNode }) {
  const { s } = useAuthSkin();
  return (
    <p role="alert" className={cn("px-3 py-2 text-sm font-medium", s.errorBox)}>
      {children}
    </p>
  );
}

export function GlassDivider({ label }: { label: string }) {
  const { s } = useAuthSkin();
  return (
    <div className={cn("my-[18px] flex items-center gap-3 text-xs", s.divider)}>
      <span className={cn("h-px flex-1", s.dividerLine)} />
      {label}
      <span className={cn("h-px flex-1", s.dividerLine)} />
    </div>
  );
}
