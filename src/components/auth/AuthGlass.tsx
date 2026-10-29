import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Globe, type LucideIcon } from "lucide-react";
import { useI18n, LANGS, LANG_SHORT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";

// The sign-in and sign-up pages share one look: a dark page with soft blue
// light waves (drawn here, no image), and a frosted glass card with two cut
// corners lit in brand blue. Going from one page to the other turns the card
// over (auth-flip-out, then the next page's auth-flip-in), so it reads as one
// card with two sides.

export function AuthBackdrop({ children }: { children: ReactNode }) {
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
  return (
    <div className="mb-6">
      <h1 className="text-[28px] font-bold leading-tight tracking-tight">
        {title} {accent && <span className="text-[#5b8cff]">{accent}</span>}
      </h1>
      {sub && <p className="mt-1.5 text-sm text-[#9aa6bd]">{sub}</p>}
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
  return (
    <label className={cn("block", className)}>
      <span className="mb-[7px] block text-[13px] font-semibold text-[#c9d2e3]">{label}</span>
      <span
        className={cn(
          "flex h-[46px] items-center gap-2.5 rounded-xl border bg-[rgba(6,10,20,.55)] px-3.5 transition-[border-color,box-shadow] focus-within:border-[#4d86ff] focus-within:shadow-[0_0_0_3px_rgba(77,134,255,.18)]",
          error ? "border-red-400/60" : "border-[rgba(120,160,230,.18)]",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-[#7f8aa3]" />
        <input
          {...input}
          type={isPassword && shown ? "text" : type}
          aria-invalid={!!error}
          className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-[#e7ecf6] outline-none placeholder:text-[#6b768c]"
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShown((v) => !v)}
            className="text-[#7f8aa3] transition-colors hover:text-white"
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
      {error && <span className="mt-1.5 block text-xs text-red-300">{error}</span>}
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
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,#2f7bff,#5b55e6)] text-[15px] font-bold text-white shadow-[0_12px_30px_-10px_rgba(47,123,255,.7)] transition-[filter,transform] hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function GlassError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm font-medium text-red-300"
    >
      {children}
    </p>
  );
}

export function GlassDivider({ label }: { label: string }) {
  return (
    <div className="my-[18px] flex items-center gap-3 text-xs text-[#6b768c]">
      <span className="h-px flex-1 bg-[rgba(120,160,230,.15)]" />
      {label}
      <span className="h-px flex-1 bg-[rgba(120,160,230,.15)]" />
    </div>
  );
}
