import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUpRight,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  CreditCard,
  FileSignature,
  GitBranch,
  Headphones,
  LayoutDashboard,
  Mail,
  MessageCircle,
  MessageSquareText,
  Moon,
  Phone,
  PhoneIncoming,
  Send,
  Sparkles,
  Sun,
  Users,
  Workflow,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { useTheme } from "@/lib/theme";
import { SEAT_LIMITS } from "@/lib/plan-gating";

const TRIAL_DAYS = 14;

// The marketing landing page shown at "/" to a logged-out visitor (see
// index.tsx's RootOrLanding and __root.tsx's AuthGate) -- a signed-in
// visit to "/" renders the Reyting dashboard instead, this component never
// mounts for them. Content is hand-written Uzbek describing capabilities
// that actually ship in this codebase, not placeholder copy -- if a
// feature or integration is listed here, it's real. Colors come from the
// .lp token set in styles.css and follow the app's light/dark toggle.
function formatUzs(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

type PublicSiteInfo = {
  priceStartIqUzs: number;
  priceAnalystIqUzs: number;
  priceMasterIqUzs: number;
  supportPhone: string | null;
  supportTelegram: string | null;
  supportEmail: string | null;
};

function usePublicSiteInfo(): PublicSiteInfo | null {
  const [info, setInfo] = useState<PublicSiteInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/pricing")
      .then((r) => r.json())
      .then((json: Partial<PublicSiteInfo>) => {
        if (cancelled) return;
        setInfo({
          priceStartIqUzs: json.priceStartIqUzs ?? 0,
          priceAnalystIqUzs: json.priceAnalystIqUzs ?? 0,
          priceMasterIqUzs: json.priceMasterIqUzs ?? 0,
          supportPhone: json.supportPhone ?? null,
          supportTelegram: json.supportTelegram ?? null,
          supportEmail: json.supportEmail ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setInfo({
            priceStartIqUzs: 0,
            priceAnalystIqUzs: 0,
            priceMasterIqUzs: 0,
            supportPhone: null,
            supportTelegram: null,
            supportEmail: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return info;
}

// Marks every [data-reveal] element under the landing root "in" once it
// scrolls into view (see .lp [data-reveal] in styles.css). One observer
// for the whole page; elements are unobserved after their first reveal.
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const targets = el.querySelectorAll<HTMLElement>("[data-reveal]");
    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((t) => (t.dataset["reveal"] = "in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset["reveal"] = "in";
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [root]);
}

const shell = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";

function SectionHead({
  eyebrow,
  title,
  accent,
  desc,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  desc?: string;
}) {
  return (
    <div data-reveal>
      <p className="lp-eyebrow">{eyebrow}</p>
      <h2 className="lp-display mt-5 text-[40px] font-semibold leading-[1.04] sm:text-[52px]">
        {title}
        <br />
        <span className="lp-grad-text">{accent}</span>
      </h2>
      {desc && (
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-[var(--lp-muted)]">{desc}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

// Both icons render and CSS picks one (html.dark), so the server-rendered
// markup matches the first client render whatever theme is stored.
function ThemeButton() {
  const { toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Yorug' / qorong'i rejim"
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--lp-line)] bg-[var(--lp-card)] text-[var(--lp-ink)] transition-colors hover:border-[var(--lp-violet)] focus-visible:outline-2 focus-visible:outline-[var(--lp-violet)]"
    >
      <Moon className="h-[18px] w-[18px] dark:hidden" />
      <Sun className="hidden h-[18px] w-[18px] dark:block" />
    </button>
  );
}

function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={`sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] ${
        scrolled
          ? "border-b border-[var(--lp-line)] bg-[color-mix(in_oklab,var(--lp-bg)_92%,transparent)] backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <div className={`${shell} flex h-[76px] items-center justify-between gap-6`}>
        <a href="#" className="flex items-center gap-3">
          <Logo className="h-10 w-10" />
          <span className="leading-none">
            <span className="lp-display block text-[19px] font-bold tracking-tight">SalesIQ</span>
            <span className="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--lp-muted)]">
              AI sales operating system
            </span>
          </span>
        </a>
        <nav className="hidden items-center gap-9 text-[15px] font-medium text-[var(--lp-muted)] md:flex">
          {[
            ["#mahsulotlar", "Mahsulotlar"],
            ["#imkoniyatlar", "Imkoniyatlar"],
            ["#jarayon", "Jarayon"],
            ["#integratsiyalar", "Integratsiyalar"],
            ["#tariflar", "Tariflar"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="transition-colors hover:text-[var(--lp-violet)]">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <ThemeButton />
          <Link
            to="/login"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--lp-line)] bg-[var(--lp-card)] px-4 text-[15px] font-semibold text-[var(--lp-ink)] transition-colors hover:border-[var(--lp-violet)]"
          >
            Kirish <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero -- copy on the left, the platform banner where a photo would go.
// ---------------------------------------------------------------------------

function MiniBars() {
  const bars = [38, 52, 44, 63, 58, 72, 66, 84, 78, 92];
  return (
    <div className="flex h-[74px] items-end gap-[5px]">
      {bars.map((h, i) => (
        <span
          key={i}
          className="flex-1 rounded-t-[4px]"
          style={{
            height: `${h}%`,
            background:
              i === bars.length - 1
                ? "linear-gradient(180deg,#8f73ff,#4d6bff)"
                : "rgba(143,115,255,0.28)",
          }}
        />
      ))}
    </div>
  );
}

// A faithful, hand-built miniature of the real dashboard -- HTML, not a
// screenshot, so it stays razor-sharp at any zoom and costs no image
// download on the very first paint.
function PlatformBanner() {
  return (
    <div className="relative" data-reveal>
      {/* Ghost outline offset behind the card. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-4 translate-y-3 rounded-[28px] rounded-br-[96px] border border-[var(--lp-line)]"
      />
      <div
        className="relative overflow-hidden rounded-[28px] rounded-br-[96px] text-white"
        style={{
          background:
            "radial-gradient(120% 80% at 85% 0%, #3a2a9b 0%, transparent 55%), radial-gradient(90% 70% at 0% 100%, #0b3aa8 0%, transparent 60%), #0c0b22",
          boxShadow: "0 40px 80px -40px rgba(40,20,140,0.55)",
        }}
      >
        {/* App window */}
        <div className="px-6 pt-6 sm:px-8 sm:pt-8">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 rounded-md bg-white/[0.06] px-2.5 py-0.5 font-mono text-[10.5px] text-white/55">
                salesiq.uz / reyting
              </span>
            </div>
            <div className="flex">
              <div className="flex w-12 flex-col items-center gap-3 border-r border-white/10 py-4">
                <Logo className="h-6 w-6" />
                {[LayoutDashboard, GitBranch, Phone, BarChart3, Users].map((Icon, i) => (
                  <span
                    key={i}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                      i === 0 ? "bg-white/15 text-white" : "text-white/45"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                ))}
              </div>
              <div className="min-w-0 flex-1 space-y-3 p-4">
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    ["Qo'ng'iroqlar", "128", "bugun"],
                    ["Konversiya", "31%", "hafta"],
                    ["AI ball", "8.4", "o'rtacha"],
                  ].map(([k, v, s]) => (
                    <div
                      key={k}
                      className="rounded-xl border border-white/10 bg-white/[0.05] p-2.5"
                    >
                      <p className="truncate text-[10px] text-white/55">{k}</p>
                      <p className="mt-1 font-mono text-[18px] font-semibold tabular-nums leading-none">
                        {v}
                      </p>
                      <p className="mt-1 text-[9.5px] text-white/40">{s}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2.5">
                  <div className="col-span-3 rounded-xl border border-white/10 bg-white/[0.05] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10.5px] font-medium text-white/70">Sotuv dinamikasi</p>
                      <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300">
                        ▲ o'smoqda
                      </span>
                    </div>
                    <MiniBars />
                  </div>
                  <div className="col-span-2 rounded-xl border border-white/10 bg-white/[0.05] p-3">
                    <p className="text-[10.5px] font-medium text-white/70">AI tahlil</p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: "conic-gradient(#8f73ff 0 86%, rgba(255,255,255,.1) 0)",
                        }}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#15123a] font-mono text-[11px] font-semibold">
                          86
                        </span>
                      </div>
                      <ul className="min-w-0 space-y-1 text-[9.5px] text-white/65">
                        <li className="truncate">✓ Salomlashish</li>
                        <li className="truncate">✓ Ehtiyoj</li>
                        <li className="truncate text-amber-300">! Keyingi qadam</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Caption, like a photo credit over the bottom of the card. */}
        <div className="relative px-6 pb-9 pt-6 sm:px-8">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/55">
            SalesIQ platformasi
          </p>
          <p className="lp-display mt-2 text-[30px] font-semibold leading-[1.08]">
            Butun sotuv
            <br />
            bitta ekranda.
          </p>
          <p className="mt-2 text-[13.5px] text-white/60">Lid → qo'ng'iroq → AI tahlil → natija.</p>
        </div>
      </div>

      {/* Floating chips */}
      <div className="lp-float absolute -left-6 top-10 hidden items-center gap-2.5 rounded-2xl border border-white/10 bg-[#141233] px-3.5 py-2.5 text-white shadow-2xl sm:flex">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
          <Sparkles className="h-4 w-4 text-[#b9a6ff]" />
        </span>
        <span className="leading-tight">
          <span className="block text-[10.5px] text-white/55">AI native</span>
          <span className="block text-[14px] font-semibold">Sales OS</span>
        </span>
      </div>
      <div
        className="lp-float absolute -right-4 bottom-36 hidden items-center gap-3 rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-card)] px-3.5 py-2.5 text-[var(--lp-ink)] shadow-xl sm:flex"
        style={{ animationDelay: "1.5s" }}
      >
        <span className="lp-pulse flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white">
          <PhoneIncoming className="h-4 w-4" />
        </span>
        <span className="leading-tight">
          <span className="block text-[10.5px] text-[var(--lp-muted)]">Kiruvchi qo'ng'iroq</span>
          <span className="block text-[13.5px] font-semibold">Lid kartasi ochildi</span>
        </span>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 80% 10%, color-mix(in oklab, var(--lp-violet) 14%, transparent), transparent 70%), radial-gradient(50% 40% at 0% 60%, color-mix(in oklab, var(--lp-blue) 10%, transparent), transparent 70%)",
        }}
      />
      <div
        className={`${shell} relative grid items-center gap-14 pb-20 pt-10 lg:grid-cols-[1.02fr_1fr] lg:pt-14`}
      >
        <div data-reveal>
          <p className="lp-eyebrow flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-violet)]" />
            O'zbekiston sotuv jamoalari uchun
          </p>
          <h1 className="lp-display mt-6 text-[52px] font-semibold leading-[1.0] sm:text-[68px]">
            Sotuvingiz
            <br />
            <span className="lp-grad-text">sun'iy intellekt</span>
            <br />
            nazoratida<span className="text-[var(--lp-violet)]">.</span>
          </h1>
          <p className="mt-7 max-w-[480px] text-[17px] leading-relaxed text-[var(--lp-muted)]">
            Lidlar, qo'ng'iroqlar va jamoa bitta joyda.{" "}
            <span className="text-[var(--lp-ink)]">
              Har bir suhbat AI tomonidan baholanadi, har bir bosqich avtomatlashtiriladi.
            </span>
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-5">
            <Link
              to="/signup"
              className="inline-flex h-[52px] items-center gap-2.5 rounded-xl px-6 text-[15.5px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(90,50,240,0.65)] transition-transform hover:-translate-y-0.5"
              style={{ background: "linear-gradient(95deg,#6a3cf0,#3d4ff6 60%,#1593e6)" }}
            >
              <Sparkles className="h-[18px] w-[18px]" />
              {TRIAL_DAYS} kun bepul boshlash
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <a
              href="#imkoniyatlar"
              className="inline-flex items-center gap-2 text-[15.5px] font-medium text-[var(--lp-ink)] hover:text-[var(--lp-violet)]"
            >
              Imkoniyatlar bilan tanishish <ArrowDown className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-5 text-[13px] text-[var(--lp-faint)]">
            Karta talab qilinmaydi. {TRIAL_DAYS} kundan so'ng xohlasangiz davom ettirasiz.
          </p>
        </div>
        <PlatformBanner />
      </div>
    </section>
  );
}

function StatsStrip() {
  const stats: { n: string; label: string }[] = [
    { n: String(TRIAL_DAYS), label: "kunlik bepul sinov" },
    { n: "8+", label: "telefoniya integratsiyasi" },
    { n: "3", label: "interfeys tili: uz · ru · en" },
  ];
  return (
    <section className={`${shell} pb-24`}>
      <div
        data-reveal
        className="lp-card grid divide-y divide-[var(--lp-line)] rounded-[22px] sm:grid-cols-4 sm:divide-x sm:divide-y-0"
      >
        {stats.map((s) => (
          <div key={s.label} className="flex items-baseline gap-3 px-7 py-7">
            <span className="lp-display lp-grad-text text-[44px] font-semibold leading-none">
              {s.n}
            </span>
            <span className="text-[14px] text-[var(--lp-muted)]">{s.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-3 px-7 py-7 text-[14px] font-medium">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--lp-chip)] text-[var(--lp-violet)]">
            <CreditCard className="h-[18px] w-[18px]" />
          </span>
          Bank kartasi talab qilinmaydi.
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 01 / Imkoniyatlar
// ---------------------------------------------------------------------------

type Feature = { icon: typeof Users; tag: string; title: string; desc: string };

const CORE_FEATURES: Feature[] = [
  {
    icon: Bot,
    tag: "AI tahlil",
    title: "Har bir qo'ng'iroq baholanadi",
    desc: "Suhbat matnga aylanadi, mezonlar bo'yicha ball qo'yiladi, kuchli va zaif tomonlar hamda keyingi qadam aniqlanadi.",
  },
  {
    icon: GitBranch,
    tag: "CRM",
    title: "Voronka va lidlar nazorati",
    desc: "Bosqichlar, maxsus maydonlar, dublikatlarni birlashtirish. AmoCRM yoki Bitrix24'dan ma'lumotlar import qilinadi.",
  },
  {
    icon: Phone,
    tag: "Telefoniya",
    title: "Bir tugma bilan qo'ng'iroq",
    desc: "OnlinePBX, Sipuni, MoiZvonki va boshqalar. Kiruvchi qo'ng'iroqda lid kartasi o'zi ochiladi, o'tkazib yuborilgani vazifaga aylanadi.",
  },
  {
    icon: BarChart3,
    tag: "Reyting",
    title: "Jamoa natijasi real vaqtda",
    desc: "Sotuv, konversiya, rejaning bajarilishi va kunlik hisobot — har bir menejer bo'yicha bitta ekranda.",
  },
];

const MORE_FEATURES: Feature[] = [
  {
    icon: Workflow,
    tag: "Avtomatlashtirish",
    title: "Qoidalar o'zi ishlaydi",
    desc: "Bosqich o'zgarganda vazifa, eslatma yoki mijozga xabar — qo'lda emas.",
  },
  {
    icon: MessageCircle,
    tag: "Xabarlar",
    title: "Telegram, SMS, Email",
    desc: "Barcha yozishmalar lid kartasida saqlanadi, hech narsa yo'qolmaydi.",
  },
  {
    icon: FileSignature,
    tag: "Hujjatlar",
    title: "Shartnoma va e-imzo",
    desc: "Shablondan shartnoma tuzing va mijozga onlayn imzo uchun yuboring.",
  },
  {
    icon: CreditCard,
    tag: "To'lovlar",
    title: "Payme va Click",
    desc: "To'lovlarni platforma orqali qabul qiling, tarixini kuzating.",
  },
];

function SystemPanel() {
  return (
    <div
      className="relative mt-10 overflow-hidden rounded-[24px] text-white"
      style={{
        background:
          "radial-gradient(70% 70% at 50% 45%, #2b1f7a 0%, transparent 70%), linear-gradient(180deg,#121034,#0b0a20)",
      }}
    >
      <p className="absolute left-6 top-5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/50">
        SalesIQ / ulangan
      </p>
      <div className="relative flex h-[300px] items-center justify-center">
        <div className="lp-orbit absolute h-[230px] w-[230px] rounded-full border border-white/12">
          <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[#8f73ff] shadow-[0_0_14px_#8f73ff]" />
        </div>
        <div
          className="lp-orbit absolute h-[300px] w-[380px] rounded-[50%] border border-cyan-300/20"
          style={{ animationDirection: "reverse", animationDuration: "40s" }}
        >
          <span className="absolute -bottom-1 left-1/3 h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_12px_#67e8f9]" />
        </div>
        <div className="relative flex h-24 w-24 items-center justify-center rounded-[28px] border border-white/15 bg-white/[0.06] shadow-[0_0_60px_rgba(143,115,255,0.45)]">
          <Logo className="h-14 w-14" />
        </div>
      </div>
      <p className="absolute bottom-5 right-6 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/50">
        Lid → qo'ng'iroq → AI → natija
      </p>
    </div>
  );
}

function FeatureCard({ f, n }: { f: Feature; n: number }) {
  const num = String(n).padStart(2, "0");
  return (
    <div
      data-reveal
      className="lp-card group relative overflow-hidden rounded-[22px] p-7 transition-transform hover:-translate-y-1"
    >
      <span className="lp-display pointer-events-none absolute right-5 top-2 text-[84px] font-bold leading-none text-[var(--lp-ink)] opacity-[0.045]">
        {num}
      </span>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--lp-chip)] text-[var(--lp-violet)]">
        <f.icon className="h-5 w-5" />
      </span>
      <p className="lp-eyebrow mt-5 !text-[var(--lp-faint)]">
        {num} / {f.tag}
      </p>
      <h3 className="lp-display mt-2 text-[24px] font-semibold leading-tight">{f.title}</h3>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[var(--lp-muted)]">{f.desc}</p>
      <span className="mt-6 block h-[2px] w-12 rounded-full bg-[var(--lp-violet)] transition-all group-hover:w-20" />
    </div>
  );
}

function Features() {
  return (
    <section id="imkoniyatlar" className="scroll-mt-20 py-24">
      <div className={`${shell} grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14`}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHead
            eyebrow="01 / Imkoniyatlar"
            title="Bir-biriga ulangan"
            accent="kuchli modullar."
            desc="Alohida xizmatlarni bir-biriga ulash o'rniga — bitta platforma, bitta narx, bitta jamoa uchun."
          />
          <div data-reveal>
            <SystemPanel />
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {["CRM", "Telefoniya", "AI tahlil", "Hisobotlar", "Avtomatika"].map((t) => (
                <span
                  key={t}
                  className="rounded-lg border border-[var(--lp-line)] bg-[var(--lp-card)] px-3 py-1 text-[12.5px] font-medium text-[var(--lp-violet)]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-5">
          {CORE_FEATURES.map((f, i) => (
            <FeatureCard key={f.title} f={f} n={i + 1} />
          ))}
        </div>
      </div>

      <div className={`${shell} mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4`}>
        {MORE_FEATURES.map((f) => (
          <div key={f.title} data-reveal className="lp-card rounded-[20px] p-6">
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--lp-chip)] text-[var(--lp-violet)]">
                <f.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--lp-faint)]">
                {f.tag}
              </span>
            </div>
            <h3 className="lp-display mt-5 text-[19px] font-semibold">{f.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-muted)]">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 02 / Jarayon -- an accordion of the real onboarding order.
// ---------------------------------------------------------------------------

const STEPS: { tag: string; title: string; desc: string; chips: string[]; result: string }[] = [
  {
    tag: "Boshlash",
    title: "Ro'yxatdan o'ting",
    desc: "Kompaniya nomi, ismingiz va telefoningiz bilan ikki daqiqada ish maydoningizni yarating.",
    chips: ["2 daqiqa", "Karta kerak emas"],
    result: "Shaxsiy ish maydoni tayyor",
  },
  {
    tag: "Jamoa",
    title: "Xodimlarni qo'shing",
    desc: "Menejerlarni taklif qiling, rollar va huquqlarni belgilang, bo'limlarni tuzing.",
    chips: ["Rollar", "Huquqlar", "Bo'limlar"],
    result: "Har kim faqat o'z ishini ko'radi",
  },
  {
    tag: "Integratsiya",
    title: "Telefoniya va CRM'ni ulang",
    desc: "OnlinePBX yoki boshqa provayder, AmoCRM yoki Bitrix24 — kalitni kiritasiz, ma'lumotlar o'zi kela boshlaydi.",
    chips: ["Telefoniya", "AmoCRM", "Bitrix24"],
    result: "Qo'ng'iroq va lidlar bitta joyda",
  },
  {
    tag: "AI",
    title: "Baholash mezonlarini sozlang",
    desc: "Qaysi holatda necha ball berilishini belgilaysiz — AI har bir suhbatni shu mezonlar bo'yicha tekshiradi.",
    chips: ["Mezonlar", "Ballar", "Tavsiyalar"],
    result: "Har bir suhbat bo'yicha aniq baho",
  },
  {
    tag: "Natija",
    title: "Reyting va hisobotni kuzating",
    desc: "Kim qancha qo'ng'iroq qildi, qayerda lid yo'qotildi, kim rejani bajardi — kunlik hisobot Telegram'ga keladi.",
    chips: ["Reyting", "Kunlik hisobot", "Telegram"],
    result: "Qarorlar taxmin emas, raqam asosida",
  },
];

function Process() {
  const [open, setOpen] = useState(0);
  return (
    <section
      id="jarayon"
      className="scroll-mt-20 border-y border-[var(--lp-line)] bg-[var(--lp-bg-2)] py-24"
    >
      <div className={`${shell} grid gap-12 lg:grid-cols-[0.8fr_1.2fr]`}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHead
            eyebrow="02 / Jarayon"
            title="Ulashdan"
            accent="natijagacha."
            desc="Har bir qadam keyingisiga tayyorlaydi. Birinchi kunning o'zida ishlay boshlaysiz."
          />
          <div
            data-reveal
            className="mt-10 border-y border-[var(--lp-line)] py-4 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--lp-violet)]"
          >
            5 qadam &nbsp;/&nbsp; {TRIAL_DAYS} kun bepul &nbsp;/&nbsp; 0 so'm
          </div>
        </div>
        <div className="grid gap-3">
          {STEPS.map((s, i) => {
            const isOpen = open === i;
            return (
              <div
                key={s.title}
                data-reveal
                className={`rounded-[18px] border transition-colors ${
                  isOpen
                    ? "border-[color-mix(in_oklab,var(--lp-violet)_45%,transparent)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--lp-violet)_10%,var(--lp-card)),var(--lp-card))] shadow-[var(--lp-shadow)]"
                    : "border-[var(--lp-line)] bg-[var(--lp-card)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-5 px-6 py-5 text-left"
                >
                  <span className="font-mono text-[13px] text-[var(--lp-faint)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--lp-faint)]">
                      {s.tag}
                    </span>
                    <span
                      className={`lp-display mt-1 block text-[21px] font-semibold ${isOpen ? "text-[var(--lp-violet)]" : ""}`}
                    >
                      {s.title}
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-[var(--lp-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <div className="px-6 pb-6 pl-[63px]">
                      <p className="text-[15px] leading-relaxed text-[var(--lp-muted)]">{s.desc}</p>
                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12.5px] text-[var(--lp-ink)]">
                        {s.chips.map((c) => (
                          <span key={c}>· {c}</span>
                        ))}
                      </div>
                      <p className="mt-4 flex items-center gap-2 text-[13.5px] font-medium text-[var(--lp-violet)]">
                        <Check className="h-4 w-4" /> Natija: {s.result}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 03 / Integratsiyalar -- services that really have a connector in the code.
// ---------------------------------------------------------------------------

const INTEGRATIONS: {
  name: string;
  tag: string;
  title: string;
  desc: string;
  icon: typeof Users;
  tint: string;
  ink: string;
}[] = [
  {
    name: "amoCRM",
    tag: "CRM",
    title: "amoCRM sinxronizatsiyasi",
    desc: "Lidlar, bitimlar va qo'ng'iroqlar avtomatik ko'chadi.",
    icon: GitBranch,
    tint: "linear-gradient(135deg,#e3ecff,#f4f2ff)",
    ink: "#2f55d4",
  },
  {
    name: "Bitrix24",
    tag: "CRM",
    title: "Bitrix24 ulanishi",
    desc: "Ikki tomonlama ma'lumot almashinuvi.",
    icon: LayoutDashboard,
    tint: "linear-gradient(135deg,#dff6ff,#eef4ff)",
    ink: "#1186c8",
  },
  {
    name: "OnlinePBX",
    tag: "Telefoniya",
    title: "OnlinePBX, Sipuni va boshqalar",
    desc: "Qo'ng'iroq, yozuv va AI tahlil — avtomatik.",
    icon: Headphones,
    tint: "linear-gradient(135deg,#efe7ff,#f7f4ff)",
    ink: "#6a3cf0",
  },
  {
    name: "Telegram",
    tag: "Bot va hisobot",
    title: "Telegram bot",
    desc: "Kunlik hisobot, eslatmalar va tezkor kirish.",
    icon: Send,
    tint: "linear-gradient(135deg,#dff3ff,#f1f8ff)",
    ink: "#1a8fd1",
  },
  {
    name: "Payme · Click",
    tag: "To'lov",
    title: "Onlayn to'lovlar",
    desc: "To'lovni platforma orqali qabul qiling.",
    icon: CreditCard,
    tint: "linear-gradient(135deg,#e2f7f6,#f3f8ff)",
    ink: "#0f8f8a",
  },
  {
    name: "Eskiz",
    tag: "SMS",
    title: "SMS xabarnomalar",
    desc: "O'zbek raqamlariga SMS va ommaviy xabar.",
    icon: MessageSquareText,
    tint: "linear-gradient(135deg,#fff1df,#fff8ef)",
    ink: "#c26b0e",
  },
];

function Integrations() {
  return (
    <section id="integratsiyalar" className="scroll-mt-20 py-24">
      <div className={shell}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead
            eyebrow="03 / Integratsiyalar"
            title="Ishlatayotgan"
            accent="xizmatlaringiz bilan."
          />
          <p data-reveal className="max-w-sm text-[15px] leading-relaxed text-[var(--lp-muted)]">
            Hozirgi tizimingizdan voz kechishingiz shart emas — SalesIQ ularni bir joyga yig'adi.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {INTEGRATIONS.map((it, i) => (
            <div
              key={it.name}
              data-reveal
              className="lp-card group overflow-hidden rounded-[20px] transition-transform hover:-translate-y-1"
            >
              <div
                className="relative flex h-[118px] items-center justify-between px-6 dark:!bg-none dark:!bg-[var(--lp-card-2)]"
                style={{ background: it.tint, ["--ink" as string]: it.ink }}
              >
                <span className="lp-display text-[26px] font-bold tracking-tight text-[var(--ink)] dark:text-[color-mix(in_oklab,var(--ink)_55%,white)]">
                  {it.name}
                </span>
                <it.icon className="h-7 w-7 text-[var(--ink)] opacity-70 dark:text-[color-mix(in_oklab,var(--ink)_55%,white)]" />
                <span className="absolute right-4 top-3 font-mono text-[10px] text-[var(--lp-faint)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="border-t border-[var(--lp-line)] px-6 py-5">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--lp-faint)]">
                  {it.tag}
                </p>
                <h3 className="lp-display mt-1.5 text-[18px] font-semibold">{it.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--lp-muted)]">
                  {it.desc}
                </p>
              </div>
            </div>
          ))}
          <div
            data-reveal
            className="flex flex-col justify-end rounded-[20px] border border-dashed border-[var(--lp-line)] p-6"
          >
            <span className="lp-display lp-grad-text text-[64px] font-semibold leading-none">
              {INTEGRATIONS.length}+
            </span>
            <p className="mt-3 text-[14px] text-[var(--lp-muted)]">
              tayyor ulanish, yana vebhuk orqali istalgan manba.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Mahsulotlar -- one platform, two ways in: Analytics on top of the CRM a
// team already uses, or the full CRM with analytics built in. Same
// accounts, data and integrations underneath, so moving from one to the
// other is a plan change, not a migration.
// ---------------------------------------------------------------------------

type ProductLine = {
  id: string;
  icon: typeof BarChart3;
  name: string;
  forWho: string;
  points: string[];
  plan: string;
  featured?: boolean;
};

const PRODUCT_LINES: ProductLine[] = [
  {
    id: "analytics",
    icon: BarChart3,
    name: "SalesIQ Analytics",
    forWho:
      "amoCRM yoki Bitrix24'da ishlayotgan jamoalar uchun. CRM'ingiz o'zgarmaydi — SalesIQ uni tahlil qiladi.",
    points: [
      "amoCRM / Bitrix24 bilan doimiy sinxronizatsiya",
      "AI qo'ng'iroq tahlili va menejerlar bahosi",
      "Lid, voronka va yo'qotishlar analitikasi",
      "Kunlik hisobot Telegram'ga",
    ],
    plan: "Analyst IQ tarifi",
  },
  {
    id: "crm",
    icon: Workflow,
    name: "SalesIQ CRM + Analytics",
    forWho: "Butun sotuvni bitta joyda yuritmoqchi bo'lganlar uchun — CRM va analitika birga.",
    points: [
      "Lidlar, kontaktlar va voronka taxtasi",
      "Telefoniya, o'tkazib yuborilgan qo'ng'iroqlar nazorati",
      "Salesbot va avtomatlashtirish",
      "SalesIQ Analytics'dagi hamma imkoniyatlar",
    ],
    plan: "Master IQ tarifi",
    featured: true,
  },
];

const SHARED_BASE = [
  "Foydalanuvchilar",
  "Kompaniyalar",
  "Ruxsatlar",
  "Integratsiyalar",
  "Ma'lumotlar bazasi",
];

function Products() {
  return (
    <section id="mahsulotlar" className="scroll-mt-20 py-24">
      <div className={shell}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead
            eyebrow="Bitta platforma · ikki yo'nalish"
            title="O'zingizga mos"
            accent="yo'lni tanlang."
          />
          <p data-reveal className="max-w-sm text-[15px] leading-relaxed text-[var(--lp-muted)]">
            Analytics'dan boshlab, keyin CRM'ga o'tishingiz mumkin — bir tugma bilan, ma'lumotlar
            o'z joyida qoladi.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {PRODUCT_LINES.map((line) => {
            const featured = !!line.featured;
            return (
              <div
                key={line.id}
                data-reveal
                className={`flex flex-col rounded-[24px] p-8 ${featured ? "text-white" : "lp-card"}`}
                style={
                  featured
                    ? {
                        background:
                          "radial-gradient(90% 60% at 100% 0%, #3b2ba3 0%, transparent 60%), #0f0d2a",
                        boxShadow: "0 40px 70px -40px rgba(60,30,180,0.7)",
                      }
                    : undefined
                }
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                    featured
                      ? "bg-white/12 text-white"
                      : "bg-[var(--lp-chip)] text-[var(--lp-violet)]"
                  }`}
                >
                  <line.icon className="h-6 w-6" />
                </span>
                <p className="lp-display mt-6 text-[26px] font-semibold">{line.name}</p>
                <p
                  className={`mt-2 text-[15px] leading-relaxed ${featured ? "text-white/65" : "text-[var(--lp-muted)]"}`}
                >
                  {line.forWho}
                </p>
                <ul
                  className={`mt-7 flex-1 space-y-3 border-t pt-7 ${featured ? "border-white/12" : "border-[var(--lp-line)]"}`}
                >
                  {line.points.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-[14.5px]">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          featured
                            ? "bg-white/15 text-white"
                            : "bg-[var(--lp-chip)] text-[var(--lp-violet)]"
                        }`}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                  <span
                    className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${
                      featured
                        ? "bg-white/12 text-[#c9bcff]"
                        : "bg-[var(--lp-chip)] text-[var(--lp-violet)]"
                    }`}
                  >
                    {line.plan}
                  </span>
                  <a
                    href="#tariflar"
                    className={`inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition-transform hover:-translate-y-0.5 ${
                      featured
                        ? "bg-white text-[#1b1440]"
                        : "border border-[var(--lp-line)] bg-[var(--lp-card)] text-[var(--lp-ink)] hover:border-[var(--lp-violet)]"
                    }`}
                  >
                    Narxini ko'rish <ArrowDown className="h-4 w-4" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        <div
          data-reveal
          className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-[20px] border border-dashed border-[var(--lp-line)] px-6 py-5 text-center"
        >
          <span className="text-[14px] font-semibold text-[var(--lp-ink)]">Umumiy asos:</span>
          {SHARED_BASE.map((item, i) => (
            <span key={item} className="text-[14px] text-[var(--lp-muted)]">
              {item}
              {i < SHARED_BASE.length - 1 && <span className="ml-3 opacity-50">•</span>}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 04 / Tariflar
// ---------------------------------------------------------------------------

type PlanCard = {
  id: "start_iq" | "analyst_iq" | "master_iq";
  /** Which of the two product lines (see Products) the plan is. */
  line: string;
  name: string;
  tagline: string;
  includes: string[];
  featured?: boolean;
};

const seats = (n: number | null) => (n === null ? "Cheksiz" : `${n} tagacha`);

const PLAN_CARDS: PlanCard[] = [
  {
    id: "start_iq",
    line: "SalesIQ CRM · boshlang'ich",
    name: "Start IQ",
    tagline: "Jamoani platformaga o'tkazish va sinab ko'rish uchun.",
    includes: [
      "Lidlar, kontaktlar va voronka taxtasi",
      "Vazifalar va bildirishnomalar",
      `${seats(SEAT_LIMITS.start_iq)} foydalanuvchi`,
      "AmoCRM / Bitrix24 ma'lumotlarini ko'rish",
    ],
  },
  {
    id: "analyst_iq",
    line: "SalesIQ Analytics",
    name: "Analyst IQ",
    tagline: "Qo'ng'iroqlarni AI bilan tahlil qilib, sotuvni o'stirish uchun.",
    includes: [
      "Start IQ'dagi hammasi",
      "Telefoniya va AI qo'ng'iroq tahlili",
      "O'tkazib yuborilgan qo'ng'iroqlar nazorati",
      "Voronka, lid va kunlik hisobot analitikasi",
      "AmoCRM / Bitrix24 doimiy sinxronizatsiyasi",
      `${seats(SEAT_LIMITS.analyst_iq)} foydalanuvchi`,
    ],
    featured: true,
  },
  {
    id: "master_iq",
    line: "SalesIQ CRM + Analytics",
    name: "Master IQ",
    tagline: "To'liq CRM + chuqur analitika — barcha imkoniyatlar.",
    includes: [
      "Analyst IQ'dagi hammasi",
      "Avtomatlashtirish va workflow qoidalari",
      "Telegram / SMS / Email kampaniyalar",
      "Elektron imzo va shartnoma shablonlari",
      "Veb-forma quruvchisi",
      `${seats(SEAT_LIMITS.master_iq)} foydalanuvchi, qo'shimcha o'rin mumkin`,
    ],
  },
];

function priceFor(plan: PlanCard["id"], info: PublicSiteInfo | null): number | null {
  if (!info) return null;
  if (plan === "start_iq") return info.priceStartIqUzs;
  if (plan === "analyst_iq") return info.priceAnalystIqUzs;
  return info.priceMasterIqUzs;
}

function Pricing({ info }: { info: PublicSiteInfo | null }) {
  return (
    <section
      id="tariflar"
      className="scroll-mt-20 border-y border-[var(--lp-line)] bg-[var(--lp-bg-2)] py-24"
    >
      <div className={shell}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead eyebrow="04 / Tariflar" title="Biznesingizga" accent="mos tarif." />
          <p data-reveal className="max-w-sm text-[15px] leading-relaxed text-[var(--lp-muted)]">
            Uchta aniq tarif. Yashirin to'lovlar yo'q. Har biri {TRIAL_DAYS} kunlik bepul sinov
            bilan boshlanadi.
          </p>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PLAN_CARDS.map((plan) => {
            const priceUzs = priceFor(plan.id, info);
            const featured = !!plan.featured;
            return (
              <div
                key={plan.id}
                data-reveal
                className={`relative flex flex-col rounded-[24px] p-8 ${
                  featured ? "text-white" : "lp-card"
                }`}
                style={
                  featured
                    ? {
                        background:
                          "radial-gradient(90% 60% at 100% 0%, #3b2ba3 0%, transparent 60%), #0f0d2a",
                        boxShadow: "0 40px 70px -40px rgba(60,30,180,0.7)",
                      }
                    : undefined
                }
              >
                <p
                  className={`mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${featured ? "text-[#c9bcff]" : "text-[var(--lp-violet)]"}`}
                >
                  {plan.line}
                </p>
                <div className="flex items-center justify-between">
                  <p
                    className={`lp-display text-[22px] font-semibold ${featured ? "" : "text-[var(--lp-ink)]"}`}
                  >
                    {plan.name}
                  </p>
                  {featured && (
                    <span className="rounded-full bg-white/12 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#c9bcff]">
                      Ko'p tanlanadi
                    </span>
                  )}
                </div>
                <p
                  className={`mt-2 text-[14.5px] leading-relaxed ${featured ? "text-white/65" : "text-[var(--lp-muted)]"}`}
                >
                  {plan.tagline}
                </p>
                <div className="mt-7 flex min-h-[44px] items-end gap-2">
                  {priceUzs === null ? (
                    <span className="h-10 w-40 animate-pulse rounded-lg bg-current opacity-10" />
                  ) : priceUzs > 0 ? (
                    <>
                      <span className="lp-display text-[40px] font-semibold leading-none tabular-nums">
                        {formatUzs(priceUzs)}
                      </span>
                      <span
                        className={`pb-1 text-[13px] ${featured ? "text-white/55" : "text-[var(--lp-muted)]"}`}
                      >
                        so'm / oy
                      </span>
                    </>
                  ) : (
                    <span className="lp-display text-[24px] font-semibold">
                      Biz bilan bog'laning
                    </span>
                  )}
                </div>
                <ul
                  className={`mt-7 flex-1 space-y-3 border-t pt-7 ${featured ? "border-white/12" : "border-[var(--lp-line)]"}`}
                >
                  {plan.includes.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-[14.5px]">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          featured
                            ? "bg-white/15 text-white"
                            : "bg-[var(--lp-chip)] text-[var(--lp-violet)]"
                        }`}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/signup"
                  search={{ plan: plan.id }}
                  className={`mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-transform hover:-translate-y-0.5 ${
                    featured
                      ? "bg-white text-[#1b1440]"
                      : "border border-[var(--lp-line)] bg-[var(--lp-card)] text-[var(--lp-ink)] hover:border-[var(--lp-violet)]"
                  }`}
                >
                  {TRIAL_DAYS} kun bepul boshlash <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 05 / Savol-javob
// ---------------------------------------------------------------------------

const FAQ: { q: string; a: string }[] = [
  {
    q: "SalesIQ kimlar uchun?",
    a: "Telefon orqali sotadigan har qanday jamoa uchun: ta'lim markazlari, ko'chmas mulk, klinikalar, xizmat ko'rsatish va savdo kompaniyalari. 2 nafar menejerdan yuzlab xodimgacha.",
  },
  {
    q: "Bepul sinov qanday ishlaydi?",
    a: `${TRIAL_DAYS} kun davomida platformadan bepul foydalanasiz, karta so'ralmaydi. Muddat tugagach, tarifni tanlab davom ettirasiz yoki shunchaki to'xtatasiz.`,
  },
  {
    q: "Qaysi telefoniyalar bilan ishlaydi?",
    a: "OnlinePBX, Sipuni, MoiZvonki, Binotel, New-Tel, FreePBX va Issabel (Asterisk), shuningdek API orqali istalgan boshqa provayder.",
  },
  {
    q: "AmoCRM yoki Bitrix24'dan o'tsam ma'lumotlar yo'qolmaydimi?",
    a: "Yo'q. Lidlar, kontaktlar, bosqichlar va menejerlar import qilinadi. Xohlasangiz eski CRM'da ishlashda davom etasiz — SalesIQ faqat tahlil qiladi.",
  },
  {
    q: "Qo'ng'iroqlar qanday baholanadi?",
    a: "Yozuv matnga aylantiriladi va siz belgilagan mezonlar bo'yicha AI ball qo'yadi: kuchli tomonlar, xatolar, mijoz kayfiyati va keyingi qadam bilan.",
  },
  {
    q: "Ma'lumotlarim xavfsizmi?",
    a: "Har bir kompaniya ma'lumoti alohida saqlanadi va faqat o'z xodimlariga ko'rinadi. Kim nimani ko'rishi rollar va huquqlar orqali boshqariladi.",
  },
];

function Faq({ info }: { info: PublicSiteInfo | null }) {
  const [open, setOpen] = useState<number>(-1);
  const tg = info?.supportTelegram?.replace(/^@/, "");
  return (
    <section id="savollar" className="scroll-mt-20 py-24">
      <div className={`${shell} grid gap-12 lg:grid-cols-[0.8fr_1.2fr]`}>
        <div>
          <SectionHead
            eyebrow="05 / Savol-javob"
            title="Boshlashdan oldin"
            accent="bilish kerak."
            desc="Savolingizga javob topilmadimi? Biz bilan to'g'ridan-to'g'ri bog'laning."
          />
          {tg && (
            <a
              data-reveal
              href={`https://t.me/${tg}`}
              target="_blank"
              rel="noreferrer"
              className="mt-7 inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--lp-violet)]"
            >
              <Send className="h-4 w-4" /> Telegram'da yozish
            </a>
          )}
        </div>
        <div className="border-t border-[var(--lp-line)]">
          {FAQ.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className="border-b border-[var(--lp-line)]">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="flex w-full items-center justify-between gap-6 py-6 text-left text-[17px] font-semibold hover:text-[var(--lp-violet)]"
                >
                  {f.q}
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-[var(--lp-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-[var(--lp-muted)]">
                      {f.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// The platform owner's own support contacts -- the same
// support_phone/support_telegram/support_email fields set on
// /platform/notifications. Renders nothing if none are set yet, rather
// than an internal-looking placeholder on a page prospects see.
function ContactRow({ info }: { info: PublicSiteInfo | null }): ReactNode {
  if (!info) return null;
  const { supportPhone, supportTelegram, supportEmail } = info;
  const items = [
    supportTelegram && {
      icon: Send,
      label: `@${supportTelegram.replace(/^@/, "")}`,
      href: `https://t.me/${supportTelegram.replace(/^@/, "")}`,
    },
    supportPhone && { icon: Phone, label: supportPhone, href: `tel:${supportPhone}` },
    supportEmail && { icon: Mail, label: supportEmail, href: `mailto:${supportEmail}` },
  ].filter((x): x is { icon: typeof Phone; label: string; href: string } => !!x);
  if (items.length === 0) return null;
  return (
    <div id="aloqa" className="mt-8 flex flex-wrap justify-center gap-3">
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          target={item.href.startsWith("https") ? "_blank" : undefined}
          rel={item.href.startsWith("https") ? "noreferrer" : undefined}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-[14.5px] font-medium text-white transition-colors hover:bg-white/[0.12]"
        >
          <item.icon className="h-4 w-4" /> {item.label}
        </a>
      ))}
    </div>
  );
}

function FinalCta({ info }: { info: PublicSiteInfo | null }) {
  return (
    <section className={`${shell} pb-24`}>
      <div
        data-reveal
        className="relative overflow-hidden rounded-[32px] rounded-br-[110px] px-8 py-20 text-center text-white"
        style={{
          background:
            "radial-gradient(70% 90% at 15% 0%, #4b33c9 0%, transparent 60%), radial-gradient(60% 80% at 100% 100%, #0d4fd8 0%, transparent 60%), #0e0c28",
        }}
      >
        <Logo className="mx-auto h-16 w-16" />
        <h2 className="lp-display mx-auto mt-7 max-w-2xl text-[40px] font-semibold leading-[1.06] sm:text-[52px]">
          Sotuv jamoangizni bugun kuchaytiring.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[16px] text-white/65">
          {TRIAL_DAYS} kunlik bepul sinov — karta kerak emas, 2 daqiqada boshlaysiz.
        </p>
        <Link
          to="/signup"
          className="mt-9 inline-flex h-[52px] items-center gap-2 rounded-xl bg-white px-7 text-[15.5px] font-semibold text-[#1b1440] transition-transform hover:-translate-y-0.5"
        >
          Bepul boshlash <ArrowUpRight className="h-4 w-4" />
        </Link>
        <ContactRow info={info} />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--lp-line)] py-10">
      <div
        className={`${shell} flex flex-col items-center gap-5 text-center sm:flex-row sm:justify-between sm:text-left`}
      >
        <div className="flex items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span className="lp-display text-[16px] font-bold">SalesIQ</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[14px] text-[var(--lp-muted)]">
          <Link to="/login" className="hover:text-[var(--lp-violet)]">
            Kirish
          </Link>
          <Link to="/signup" className="hover:text-[var(--lp-violet)]">
            Ro'yxatdan o'tish
          </Link>
          <Link to="/privacy" className="hover:text-[var(--lp-violet)]">
            Maxfiylik siyosati
          </Link>
          <Link to="/terms" className="hover:text-[var(--lp-violet)]">
            Foydalanish shartlari
          </Link>
        </div>
        <p className="font-mono text-[11.5px] text-[var(--lp-faint)]">
          © {new Date().getFullYear()} SalesIQ
        </p>
      </div>
    </footer>
  );
}

export function Landing() {
  const info = usePublicSiteInfo();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  return (
    <div ref={root} className="lp min-h-screen font-sans antialiased">
      <NavBar />
      <main>
        <Hero />
        <StatsStrip />
        <Products />
        <Features />
        <Process />
        <Integrations />
        <Pricing info={info} />
        <Faq info={info} />
        <FinalCta info={info} />
      </main>
      <Footer />
    </div>
  );
}
