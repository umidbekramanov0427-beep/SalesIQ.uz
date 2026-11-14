import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthCard, AuthPage, useAuthSkin } from "@/components/auth/auth-skins";

// The sign-in and sign-up pages' parts (the look itself is auth-skins.tsx).
// Going from one page to the other turns the card over (auth-flip-out, then
// the next page's auth-flip-in), so it reads as one card with two sides.

export function AuthBackdrop({ children }: { children: ReactNode }) {
  return <AuthPage>{children}</AuthPage>;
}

/** The card; `leaving` plays the turn-over before the page changes. */
export function GlassCard({ children, leaving }: { children: ReactNode; leaving?: boolean }) {
  return <AuthCard {...(leaving ? { leaving } : {})}>{children}</AuthCard>;
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
  const { s } = useAuthSkin();
  return (
    <div className={s.head}>
      <h1 className={s.h1}>
        <span aria-hidden className="auth-card-dot" />
        {title} {accent && <span className={s.accent}>{accent}</span>}
      </h1>
      {sub && <p className={s.sub}>{sub}</p>}
    </div>
  );
}

/**
 * A filled field whose name sits inside it and moves up once there is
 * something in it (or it is focused) -- see .auth-float in styles.css. The
 * placeholder is a blank so :placeholder-shown means "empty". (`icon` is
 * kept for the callers; this look shows none.)
 */
export function GlassField({
  label,
  icon: _icon,
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
  const { s } = useAuthSkin();
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
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ac-faint)] transition-colors hover:text-[var(--ac-text)]"
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
