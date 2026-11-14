import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  AudioWaveform,
  BarChart3,
  Check,
  Globe,
  MessageCircleMore,
  PhoneCall,
  SquareKanban,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Logo } from "@/components/Logo";
import { LANGS, LANG_SHORT, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The sign-in / sign-up page's looks ("skins"). The form and every flow
// stay one (login.tsx / signup.tsx with AuthGlass's parts); a skin only
// changes the page around the form and how its fields, buttons and links
// look. DEFAULT_AUTH_SKIN is what everyone sees; ?variants on the page shows
// a bar to try the others (?skin=<id> opens one directly).

export const AUTH_SKINS = [
  "glass",
  "classic",
  "clean",
  "split",
  "aurora",
  "bento",
  "editorial",
] as const;
export type AuthSkinId = (typeof AUTH_SKINS)[number];
export const DEFAULT_AUTH_SKIN: AuthSkinId = "glass";

const PREVIEW_KEY = "salesiq.authSkin.preview";

export type SkinStyle = {
  dark: boolean;
  label: string;
  field: string;
  fieldOk: string;
  fieldErr: string;
  input: string;
  icon: string;
  eye: string;
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

const GLASS: SkinStyle = {
  dark: true,
  label: "mb-[7px] block text-[13px] font-semibold text-[#c9d2e3]",
  field:
    "flex h-[46px] items-center gap-2.5 rounded-xl border bg-[rgba(6,10,20,.55)] px-3.5 transition-[border-color,box-shadow] focus-within:border-[#4d86ff] focus-within:shadow-[0_0_0_3px_rgba(77,134,255,.18)]",
  fieldOk: "border-[rgba(120,160,230,.18)]",
  fieldErr: "border-red-400/60",
  input: "text-[14.5px] text-[#e7ecf6] placeholder:text-[#6b768c]",
  icon: "text-[#7f8aa3]",
  eye: "text-[#7f8aa3] hover:text-white",
  err: "text-red-300",
  head: "mb-6",
  h1: "text-[28px] font-bold leading-tight tracking-tight",
  accent: "text-[#5b8cff]",
  sub: "mt-1.5 text-sm text-[#9aa6bd]",
  submit:
    "h-12 rounded-xl bg-[linear-gradient(90deg,#2f7bff,#5b55e6)] text-[15px] font-bold text-white shadow-[0_12px_30px_-10px_rgba(47,123,255,.7)] hover:brightness-110",
  errorBox: "rounded-xl border border-red-400/30 bg-red-500/15 text-red-300",
  divider: "text-[#6b768c]",
  dividerLine: "bg-[rgba(120,160,230,.15)]",
  google:
    "h-[46px] rounded-xl border border-[rgba(120,160,230,.2)] bg-white/[0.03] text-white hover:bg-white/[0.07]",
  link: "text-[#6f9bff]",
  muted: "text-[#9aa6bd] hover:text-white",
  chip: "border-white/10 bg-white/5 text-white/80",
  notice: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  badge: "bg-[#4d86ff]/15 text-[#8fb2ff]",
};

const LIGHT: SkinStyle = {
  dark: false,
  label: "mb-1.5 block text-[13px] font-semibold text-[#334155]",
  field:
    "flex h-12 items-center gap-2.5 rounded-xl border bg-white px-3.5 transition-[border-color,box-shadow] focus-within:border-[#2563eb] focus-within:shadow-[0_0_0_4px_rgba(37,99,235,.12)]",
  fieldOk: "border-[#dbe1ea]",
  fieldErr: "border-red-400",
  input: "text-[15px] text-[#0f172a] placeholder:text-[#94a3b8]",
  icon: "text-[#94a3b8]",
  eye: "text-[#94a3b8] hover:text-[#0f172a]",
  err: "text-red-600",
  head: "mb-7",
  h1: "text-[30px] font-bold leading-tight tracking-tight text-[#0f172a]",
  accent: "text-[#2563eb]",
  sub: "mt-2 text-[14.5px] text-[#64748b]",
  submit:
    "h-12 rounded-xl bg-[#2563eb] text-[15px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(37,99,235,.9)] hover:bg-[#1d4ed8]",
  errorBox: "rounded-xl border border-red-200 bg-red-50 text-red-700",
  divider: "text-[#94a3b8]",
  dividerLine: "bg-[#e2e8f0]",
  google: "h-12 rounded-xl border border-[#dbe1ea] bg-white text-[#0f172a] hover:bg-[#f8fafc]",
  link: "text-[#2563eb]",
  muted: "text-[#64748b] hover:text-[#0f172a]",
  chip: "border-[#e2e8f0] bg-[#f1f5f9] text-[#334155]",
  notice: "border-amber-300 bg-amber-50 text-amber-800",
  badge: "bg-[#2563eb]/10 text-[#1d4ed8]",
};

const STYLES: Record<AuthSkinId, SkinStyle> = {
  glass: GLASS,
  classic: {
    ...GLASS,
    label: "mb-2 block text-[13px] font-medium text-white/60",
    field:
      "flex h-14 items-center gap-3 rounded-xl border bg-white/5 px-3.5 transition-colors focus-within:border-[#5b7cff]/60 focus-within:bg-white/10",
    fieldOk: "border-white/10",
    input: "text-base text-white placeholder:text-white/25",
    icon: "text-white/30",
    h1: "text-center text-[22px] font-bold text-white",
    head: "mb-6",
    accent: "text-white",
    sub: "mt-2 text-center text-sm text-white/50",
    submit:
      "h-14 rounded-xl bg-[#4f6bff] text-base font-bold uppercase tracking-wide text-white hover:opacity-90",
    google:
      "h-14 rounded-xl border border-white/10 bg-white/5 text-base text-white hover:bg-white/10",
    divider: "text-white/40 uppercase tracking-wide font-medium",
    dividerLine: "bg-white/10",
    link: "text-[#7c93ff]",
    muted: "text-white/50 hover:text-white",
  },
  clean: {
    ...LIGHT,
    field:
      "flex h-11 items-center gap-2.5 rounded-lg border bg-white px-3 transition-[border-color,box-shadow] focus-within:border-[#111827] focus-within:shadow-[0_0_0_3px_rgba(17,24,39,.08)]",
    fieldOk: "border-[#e5e7eb]",
    h1: "text-[24px] font-semibold tracking-tight text-[#111827]",
    accent: "text-[#9ca3af]",
    sub: "mt-1.5 text-[14px] text-[#6b7280]",
    head: "mb-6",
    submit: "h-11 rounded-lg bg-[#111827] text-[14px] font-semibold text-white hover:bg-[#1f2937]",
    google:
      "h-11 rounded-lg border border-[#e5e7eb] bg-white text-[14px] text-[#111827] hover:bg-[#f9fafb]",
    link: "text-[#111827] underline underline-offset-4",
  },
  split: LIGHT,
  aurora: {
    ...LIGHT,
    field:
      "flex h-12 items-center gap-2.5 rounded-2xl border bg-[#f8fafc] px-4 transition-[border-color,box-shadow,background-color] focus-within:border-[#8b5cf6] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(139,92,246,.14)]",
    fieldOk: "border-transparent",
    h1: "text-center text-[30px] font-bold tracking-tight text-[#0f172a]",
    accent:
      "bg-gradient-to-r from-[#6366f1] via-[#a855f7] to-[#ec4899] bg-clip-text text-transparent",
    sub: "mt-2 text-center text-[14.5px] text-[#64748b]",
    submit:
      "h-12 rounded-2xl bg-[linear-gradient(90deg,#6366f1,#a855f7,#ec4899)] text-[15px] font-bold text-white shadow-[0_14px_30px_-12px_rgba(168,85,247,.8)] hover:brightness-110",
    google: "h-12 rounded-2xl border border-[#e2e8f0] bg-white text-[#0f172a] hover:bg-[#f8fafc]",
    link: "text-[#7c3aed]",
    badge: "bg-[#a855f7]/10 text-[#7c3aed]",
  },
  bento: {
    ...GLASS,
    label: "mb-1.5 block text-[13px] font-semibold text-[#cbd5e1]",
    field:
      "flex h-12 items-center gap-2.5 rounded-xl border bg-[#0b111c] px-3.5 transition-[border-color,box-shadow] focus-within:border-[#3b82f6] focus-within:shadow-[0_0_0_4px_rgba(59,130,246,.16)]",
    fieldOk: "border-[#1e293b]",
    input: "text-[15px] text-[#f1f5f9] placeholder:text-[#475569]",
    icon: "text-[#64748b]",
    h1: "text-[30px] font-bold leading-tight tracking-tight text-white",
    accent: "text-[#60a5fa]",
    sub: "mt-2 text-[14.5px] text-[#8b98ad]",
    head: "mb-7",
    submit: "h-12 rounded-xl bg-[#3b82f6] text-[15px] font-semibold text-white hover:bg-[#2563eb]",
    google:
      "h-12 rounded-xl border border-[#1e293b] bg-[#0b111c] text-[#e2e8f0] hover:bg-[#111a29]",
    divider: "text-[#475569]",
    dividerLine: "bg-[#1e293b]",
    link: "text-[#60a5fa]",
    muted: "text-[#8b98ad] hover:text-white",
  },
  editorial: {
    ...LIGHT,
    label: "mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-[#737373]",
    field:
      "flex h-12 items-center gap-2.5 border-b-2 bg-transparent px-0.5 transition-colors focus-within:border-[#0a0a0a]",
    fieldOk: "border-[#d4d4d4]",
    input: "text-[16px] text-[#0a0a0a] placeholder:text-[#a3a3a3]",
    icon: "text-[#a3a3a3]",
    h1: "font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-[#0a0a0a]",
    accent: "italic text-[#0a0a0a]",
    sub: "mt-3 text-[14.5px] text-[#737373]",
    head: "mb-8",
    submit:
      "h-12 rounded-none bg-[#0a0a0a] text-[13px] font-bold uppercase tracking-[0.14em] text-white hover:bg-[#262626]",
    google: "h-12 rounded-none border border-[#d4d4d4] bg-white text-[#0a0a0a] hover:bg-[#fafafa]",
    errorBox: "rounded-none border border-red-300 bg-red-50 text-red-700",
    link: "text-[#0a0a0a] underline underline-offset-4",
    muted: "text-[#737373] hover:text-[#0a0a0a]",
  },
};

// The chosen look lives in a tiny store, so the page's own parts (links,
// notices, the Google button) read it too, not only what AuthBackdrop wraps.
let current: AuthSkinId = DEFAULT_AUTH_SKIN;
let previewing = false;
let loaded = false;
const listeners = new Set<() => void>();
const isSkin = (v: string | null): v is AuthSkinId =>
  !!v && (AUTH_SKINS as readonly string[]).includes(v);

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const q = new URLSearchParams(window.location.search);
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(PREVIEW_KEY);
  } catch {
    /* private window */
  }
  const asked = q.get("skin");
  current = isSkin(asked) ? asked : isSkin(stored) ? stored : DEFAULT_AUTH_SKIN;
  previewing = q.has("variants") || isSkin(asked) || isSkin(stored);
  listeners.forEach((l) => l());
}

function setSkin(id: AuthSkinId) {
  current = id;
  previewing = true;
  try {
    localStorage.setItem(PREVIEW_KEY, id);
  } catch {
    /* private window */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAuthSkin(): { id: AuthSkinId; s: SkinStyle } {
  const id = useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULT_AUTH_SKIN,
  );
  useEffect(load, []);
  return { id, s: STYLES[id] };
}

/** The page: the chosen skin's backdrop and side panels around the form. */
export function SkinnedAuthPage({ children, glass }: { children: ReactNode; glass: ReactNode }) {
  const { id } = useAuthSkin();
  const preview = useSyncExternalStore(
    subscribe,
    () => previewing,
    () => false,
  );
  return (
    <>
      {id === "glass" ? glass : <SkinFrame id={id}>{children}</SkinFrame>}
      {preview && <SkinPicker value={id} onChange={setSkin} />}
    </>
  );
}

/** The card the form sits in (each skin has its own, or none). */
export function SkinCard({ children, leaving }: { children: ReactNode; leaving?: boolean }) {
  const { id } = useAuthSkin();
  const flip = leaving ? "auth-flip-out" : "auth-flip-in";
  if (id === "clean")
    return (
      <div className={cn("w-full max-w-[400px]", flip)}>
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,.04),0_12px_32px_-16px_rgba(0,0,0,.12)] phone:p-6">
          {children}
        </div>
      </div>
    );
  if (id === "aurora")
    return (
      <div className={cn("w-full max-w-[440px]", flip)}>
        <div className="rounded-[28px] border border-white/70 bg-white/85 p-9 shadow-[0_40px_90px_-30px_rgba(79,70,229,.45)] backdrop-blur-xl phone:p-6">
          <div className="mb-6 flex justify-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-[0_10px_30px_-10px_rgba(99,102,241,.5)]">
              <Logo className="h-8 w-8" />
            </span>
          </div>
          {children}
        </div>
      </div>
    );
  return <div className={cn("w-full max-w-[400px]", flip)}>{children}</div>;
}

function LangSwitch({ dark }: { dark: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-xl border p-1",
        dark ? "border-white/10 bg-white/5" : "border-[#e2e8f0] bg-white",
      )}
    >
      <Globe className={cn("ml-1 h-3.5 w-3.5", dark ? "text-white/50" : "text-[#94a3b8]")} />
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={cn(
            "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
            lang === l
              ? dark
                ? "bg-white/15 text-white"
                : "bg-[#0f172a] text-white"
              : dark
                ? "text-white/50 hover:bg-white/10"
                : "text-[#64748b] hover:bg-[#f1f5f9]",
          )}
        >
          {LANG_SHORT[l]}
        </button>
      ))}
    </div>
  );
}

function Wordmark({ dark, className }: { dark: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Logo className="h-8 w-8" />
      <span
        className={cn(
          "text-[18px] font-bold tracking-tight",
          dark ? "text-white" : "text-[#0f172a]",
        )}
      >
        SalesIQ<span className={dark ? "text-[#60a5fa]" : "text-[#2563eb]"}>.uz</span>
      </span>
    </span>
  );
}

function SkinFrame({ id, children }: { id: AuthSkinId; children: ReactNode }) {
  const { t } = useI18n();

  if (id === "classic") {
    // The sign-in page as it was before the glass card.
    return (
      <main className="auth-surface always-dark min-h-dvh w-full bg-[#060b1c] text-white">
        <div className="grid min-h-dvh w-full bg-gradient-to-br from-[var(--auth-from)] via-[var(--auth-via)] to-[var(--auth-to)] lg:grid-cols-2">
          <section className="relative hidden flex-col overflow-hidden p-10 lg:flex">
            <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
            <div className="relative flex flex-1 flex-col items-center justify-center gap-8">
              <BrandMark
                className="items-center text-center"
                iconClassName="h-24 w-24 sm:h-28 sm:w-28"
                wordmarkClassName="text-3xl sm:text-4xl"
              />
              <div className="text-center">
                <h2 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
                  {t("login.title")}
                </h2>
                <p className="mt-4 text-base font-medium tracking-wide text-indigo-300/80 sm:text-lg">
                  {t("login.tagline")}
                </p>
              </div>
            </div>
          </section>
          <section className="flex flex-col justify-center p-8 sm:p-10 lg:p-14">
            <div className="mb-6 flex justify-end">
              <LangSwitch dark />
            </div>
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 flex flex-col items-center text-center">
                <span className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <Logo className="h-11 w-11" />
                </span>
                <p className="mt-4 text-3xl font-bold text-white">SalesIQ</p>
                <p className="mt-2 text-base font-bold uppercase tracking-wide text-[#7c93ff]">
                  {t("login.subtitle")}
                </p>
              </div>
              {children}
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (id === "clean") {
    return (
      <main className="min-h-dvh w-full bg-[#f7f8fa] text-[#111827]">
        <header className="flex items-center justify-between px-8 py-6 phone:px-4">
          <Wordmark dark={false} />
          <LangSwitch dark={false} />
        </header>
        <div className="grid place-items-center px-4 pb-16 pt-[6vh]">{children}</div>
        <p className="pb-8 text-center text-[12.5px] text-[#9ca3af]">{t("authv.footer")}</p>
      </main>
    );
  }

  if (id === "split") {
    return (
      <main className="grid min-h-dvh w-full grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] bg-white text-[#0f172a] phone:grid-cols-1">
        <section className="flex flex-col px-14 py-10 phone:px-5 phone:py-6">
          <div className="flex items-center justify-between">
            <Wordmark dark={false} />
            <LangSwitch dark={false} />
          </div>
          <div className="flex flex-1 items-center justify-center py-10">{children}</div>
          <p className="text-[12.5px] text-[#94a3b8]">{t("authv.footer")}</p>
        </section>
        <section className="relative m-3 overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#1e40af_0%,#2563eb_45%,#4f46e5_100%)] p-12 text-white phone:hidden">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-[#22d3ee]/20 blur-3xl" />
          <div className="relative max-w-[520px]">
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/70">
              SalesIQ
            </p>
            <h2 className="mt-3 text-[40px] font-bold leading-[1.1] tracking-tight [text-wrap:balance]">
              {t("authv.split.title")}
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-white/80">{t("authv.split.sub")}</p>
          </div>
          {/* A little picture of the product: today's figures and a week of sales. */}
          <div className="relative mt-10 grid max-w-[560px] grid-cols-3 gap-3">
            {[
              { k: "authv.split.today", v: "12,4 mln", d: "+18%" },
              { k: "authv.split.calls", v: "146", d: "+9%" },
              { k: "authv.split.score", v: "82/100", d: "A" },
            ].map((x) => (
              <div
                key={x.k}
                className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur"
              >
                <p className="text-[12px] font-medium text-white/70">{t(x.k)}</p>
                <p className="mt-1.5 text-[22px] font-bold tabular-nums">{x.v}</p>
                <p className="mt-0.5 text-[12px] font-semibold text-[#86efac]">{x.d}</p>
              </div>
            ))}
            <div className="col-span-3 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-[12px] font-medium text-white/70">{t("authv.split.week")}</p>
              <div className="mt-3 flex h-28 items-end gap-2.5">
                {[38, 52, 44, 70, 58, 86, 74].map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h}%` }}
                    className={cn("flex-1 rounded-t-md", i === 5 ? "bg-white" : "bg-white/35")}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (id === "aurora") {
    return (
      <main className="relative min-h-dvh w-full overflow-hidden bg-[#eef1ff] text-[#0f172a]">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-[#818cf8]/55 blur-[120px]" />
          <span className="absolute -right-32 top-10 h-[480px] w-[480px] rounded-full bg-[#f472b6]/45 blur-[120px]" />
          <span className="absolute -bottom-48 left-1/3 h-[520px] w-[520px] rounded-full bg-[#38bdf8]/45 blur-[120px]" />
          <span className="absolute bottom-10 right-10 h-[300px] w-[300px] rounded-full bg-[#34d399]/35 blur-[100px]" />
        </div>
        <div className="absolute right-6 top-6 z-10">
          <LangSwitch dark={false} />
        </div>
        <div className="relative grid min-h-dvh place-items-center px-4 py-16">{children}</div>
      </main>
    );
  }

  if (id === "bento") {
    const tiles: { icon: LucideIcon; tone: string; title: string; desc: string; wide?: boolean }[] =
      [
        {
          icon: SquareKanban,
          tone: "bg-violet-500/15 text-violet-300",
          title: "authv.bento.funnels",
          desc: "authv.bento.funnelsD",
          wide: true,
        },
        {
          icon: AudioWaveform,
          tone: "bg-rose-500/15 text-rose-300",
          title: "authv.bento.audio",
          desc: "authv.bento.audioD",
        },
        {
          icon: PhoneCall,
          tone: "bg-emerald-500/15 text-emerald-300",
          title: "authv.bento.phone",
          desc: "authv.bento.phoneD",
        },
        {
          icon: MessageCircleMore,
          tone: "bg-sky-500/15 text-sky-300",
          title: "authv.bento.inbox",
          desc: "authv.bento.inboxD",
        },
        {
          icon: BarChart3,
          tone: "bg-amber-500/15 text-amber-300",
          title: "authv.bento.reports",
          desc: "authv.bento.reportsD",
        },
      ];
    return (
      <main className="always-dark grid min-h-dvh w-full grid-cols-[520px_minmax(0,1fr)] bg-[#070b12] text-white phone:grid-cols-1">
        <section className="flex flex-col border-r border-[#151d2b] bg-[#0b1018] px-14 py-10 phone:px-5 phone:py-6">
          <div className="flex items-center justify-between">
            <Wordmark dark />
            <LangSwitch dark />
          </div>
          <div className="flex flex-1 items-center justify-center py-10">{children}</div>
          <p className="text-[12.5px] text-[#475569]">{t("authv.footer")}</p>
        </section>
        <section className="grid grid-cols-2 content-center gap-4 p-10 phone:hidden">
          {tiles.map((x) => (
            <div
              key={x.title}
              className={cn(
                "rounded-3xl border border-[#151d2b] bg-[#0d131d] p-6",
                x.wide && "col-span-2",
              )}
            >
              <span className={cn("grid h-11 w-11 place-items-center rounded-2xl", x.tone)}>
                <x.icon className="h-5 w-5" />
              </span>
              <p className="mt-4 text-[17px] font-semibold text-white">{t(x.title)}</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#8b98ad]">{t(x.desc)}</p>
              {x.wide && (
                <div className="mt-5 grid grid-cols-4 gap-2.5">
                  {[
                    ["authv.bento.s1", 14, "bg-sky-400"],
                    ["authv.bento.s2", 9, "bg-violet-400"],
                    ["authv.bento.s3", 5, "bg-amber-400"],
                    ["authv.bento.s4", 3, "bg-emerald-400"],
                  ].map(([n, c, tone]) => (
                    <div key={n as string} className="rounded-xl bg-[#111a27] p-3">
                      <span className={cn("block h-1 w-8 rounded-full", tone as string)} />
                      <p className="mt-2 text-[12px] text-[#8b98ad]">{t(n as string)}</p>
                      <p className="text-[18px] font-bold tabular-nums text-white">{c}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      </main>
    );
  }

  // editorial
  return (
    <main className="grid min-h-dvh w-full grid-cols-2 bg-white text-[#0a0a0a] phone:grid-cols-1">
      <section className="relative flex flex-col justify-between overflow-hidden bg-[#0a0a0a] p-12 text-white phone:hidden">
        <span className="inline-flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="text-[13px] font-bold uppercase tracking-[0.2em] text-white/70">
            SalesIQ.uz
          </span>
        </span>
        <div>
          <p className="font-serif text-[112px] font-semibold leading-[0.9] tracking-tight">
            Sales
            <br />
            <span className="italic text-white/90">IQ.</span>
          </p>
          <p className="mt-8 max-w-[420px] text-[20px] leading-snug text-white/75 [text-wrap:balance]">
            {t("authv.edit.tagline")}
          </p>
        </div>
        <div className="flex items-center gap-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-white/45">
          <span>CRM</span>
          <span>AI</span>
          <span>{t("authv.bento.phone")}</span>
          <span>{t("authv.bento.reports")}</span>
        </div>
      </section>
      <section className="flex flex-col px-16 py-10 phone:px-5 phone:py-6">
        <div className="flex justify-end">
          <LangSwitch dark={false} />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">{children}</div>
        <p className="text-[12px] uppercase tracking-[0.14em] text-[#a3a3a3]">
          {t("authv.footer")}
        </p>
      </section>
    </main>
  );
}

const SKIN_NAME: Record<AuthSkinId, string> = {
  glass: "authv.name.glass",
  classic: "authv.name.classic",
  clean: "authv.name.clean",
  split: "authv.name.split",
  aurora: "authv.name.aurora",
  bento: "authv.name.bento",
  editorial: "authv.name.editorial",
};

/** Only with ?variants: try every look before one is chosen. */
function SkinPicker({
  value,
  onChange,
}: {
  value: AuthSkinId;
  onChange: (id: AuthSkinId) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-black/10 bg-white/95 p-1.5 text-[#0f172a] shadow-[0_20px_50px_-15px_rgba(0,0,0,.45)] backdrop-blur [scrollbar-width:none]">
        <span className="shrink-0 px-2.5 text-[12px] font-semibold text-[#64748b]">
          {t("authv.picker")}
        </span>
        {AUTH_SKINS.map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold transition-colors",
              value === id ? "bg-[#0f172a] text-white" : "hover:bg-[#f1f5f9]",
            )}
          >
            <span className="tabular-nums opacity-60">{i + 1}</span>
            {t(SKIN_NAME[id])}
            {value === id && <Check className="h-3.5 w-3.5" />}
          </button>
        ))}
      </div>
    </div>
  );
}
