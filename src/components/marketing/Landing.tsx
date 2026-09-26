import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  CreditCard,
  FileSignature,
  GitBranch,
  Mail,
  MessageCircle,
  Phone,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { LoginWaves } from "@/components/LoginWaves";
import { Logo } from "@/components/Logo";

const TRIAL_DAYS = 14;

// The marketing landing page shown at "/" to a logged-out visitor (see
// index.tsx's RootOrLanding and __root.tsx's AuthGate) -- a signed-in
// visit to "/" renders the Reyting dashboard instead, this component never
// mounts for them. Content is hand-written Uzbek describing capabilities
// that actually ship in this codebase (see the feature grid below), not
// placeholder copy -- if a feature is listed here, it's real.
function formatUzs(n: number): string {
  return new Intl.NumberFormat("uz-UZ").format(n);
}

type PublicSiteInfo = {
  priceUzs: number;
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
          priceUzs: json.priceUzs ?? 0,
          supportPhone: json.supportPhone ?? null,
          supportTelegram: json.supportTelegram ?? null,
          supportEmail: json.supportEmail ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setInfo({ priceUzs: 0, supportPhone: null, supportTelegram: null, supportEmail: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return info;
}

const FEATURES: { icon: typeof Users; title: string; desc: string }[] = [
  {
    icon: GitBranch,
    title: "CRM va voronka boshqaruvi",
    desc: "Lidlarni bosqichlar bo'yicha kuzating, maxsus maydonlar qo'shing, dublikatlarni birlashtiring, AmoCRM yoki Bitrix24'dan ma'lumotlaringizni import qiling.",
  },
  {
    icon: Bot,
    title: "AI qo'ng'iroq tahlili",
    desc: "Har bir qo'ng'iroq avtomatik transkripsiya qilinadi, ball qo'yiladi, kuchli va zaif tomonlar, mijoz kayfiyati va keyingi qadam AI tomonidan aniqlanadi.",
  },
  {
    icon: Phone,
    title: "Native telefoniya",
    desc: "OnlinePBX va MoiZvonki bilan to'g'ridan-to'g'ri integratsiya — bitta tugma bilan qo'ng'iroq qiling, suhbatlar avtomatik yozib olinadi va tahlil qilinadi.",
  },
  {
    icon: Workflow,
    title: "Avtomatlashtirish",
    desc: "Lid bosqichi o'zgarganda avtomatik vazifa yarating, xodimga eslatma yuboring yoki mijozga xabar joʻnating — qo'lda bajarilmasin.",
  },
  {
    icon: MessageCircle,
    title: "Telegram, WhatsApp, Email",
    desc: "Mijozlar bilan to'g'ridan-to'g'ri platforma ichidan yozishing — barcha yozishmalar lid kartasida saqlanadi, hech narsa yo'qolmaydi.",
  },
  {
    icon: BarChart3,
    title: "Reyting va kunlik hisobot",
    desc: "Xodimlar samaradorligini real vaqtda solishtiring: sotuv, konversiya, bajarilgan rejalar — bir ekranda.",
  },
  {
    icon: FileSignature,
    title: "Shartnoma va e-imzo",
    desc: "Kelishuvlarni platforma ichida tayyorlang va mijozga elektron imzo uchun yuboring — bosib chiqarish shart emas.",
  },
  {
    icon: CreditCard,
    title: "Payme va Click to'lovlari",
    desc: "Mijozlaringizdan to'g'ridan-to'g'ri platforma orqali to'lov qabul qiling, tranzaksiyalar tarixini kuzating.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Ro'yxatdan o'ting",
    desc: "Kompaniyangiz nomi, ismingiz va emailingiz bilan 2 daqiqada shaxsiy ish maydoningizni yarating.",
  },
  {
    n: "2",
    title: "Jamoangizni qo'shing",
    desc: "Xodimlaringizni taklif qiling, Telegram/telefoniya/AmoCRM integratsiyalarini ulang.",
  },
  {
    n: "3",
    title: "Sotuvni oshiring",
    desc: "Lidlarni kuzating, AI tahlildan foydalaning, jamoa samaradorligini real vaqtda ko'ring.",
  },
];

function NavBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0A1330]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="text-lg font-extrabold tracking-tight text-white">SalesIQ</span>
        </div>
        <nav className="hidden items-center gap-8 text-sm font-medium text-indigo-100/70 md:flex">
          <a href="#imkoniyatlar" className="transition-colors hover:text-white">
            Imkoniyatlar
          </a>
          <a href="#qanday-ishlaydi" className="transition-colors hover:text-white">
            Qanday ishlaydi
          </a>
          <a href="#narx" className="transition-colors hover:text-white">
            Narx
          </a>
          <a href="#aloqa" className="transition-colors hover:text-white">
            Aloqa
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden rounded-lg px-3.5 py-2 text-sm font-semibold text-indigo-100/80 transition-colors hover:text-white sm:block"
          >
            Kirish
          </Link>
          <Link
            to="/signup"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#0A1330] transition-opacity hover:opacity-90"
          >
            Bepul boshlash
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#0A1330] via-[#101B40] to-[#060B1C]">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3.5 py-1.5 text-xs font-semibold text-indigo-200">
          <Sparkles className="h-3.5 w-3.5" />
          O'zbekiston sotuv jamoalari uchun
        </span>

        <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
          Sotuvingizni boshqaradigan, <span className="text-indigo-300">o'rganadigan</span> AI
          operatsion tizim
        </h1>

        <p className="mt-5 max-w-xl text-base font-medium text-indigo-100/70 sm:text-lg">
          Chuqur analitika • Aniq qadamlar • Barqaror natija
        </p>
        <p className="mt-3 max-w-2xl text-sm text-indigo-100/60 sm:text-base">
          Lidlaringizni, qo'ng'iroqlaringizni va jamoangizni bitta joyda boshqaring — har bir suhbat
          AI tomonidan tahlil qilinadi, har bir bosqich avtomatlashtiriladi.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-bold text-[#0A1330] transition-opacity hover:opacity-90"
          >
            {TRIAL_DAYS} kunlik bepul sinov <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5"
          >
            Tizimga kirish
          </Link>
        </div>
        <p className="mt-4 text-xs text-indigo-100/50">
          Karta raqami talab qilinmaydi. {TRIAL_DAYS} kundan so'ng xohlasangiz davom ettirasiz.
        </p>

        <LoginWaves className="mt-14 h-48 w-full max-w-2xl opacity-80" />
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="imkoniyatlar" className="bg-background py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Sotuv jamoangiz uchun kerakli hamma narsa
          </h2>
          <p className="mt-3 text-muted-foreground">
            Alohida-alohida xizmatlarni ulash o'rniga — bitta platforma, bitta narx, bitta jamoa
            uchun.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-sm font-bold text-foreground">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="qanday-ishlaydi" className="bg-surface py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            3 qadamda ishga tushiring
          </h2>
        </div>

        <div className="mt-14 grid gap-8 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-extrabold text-primary-foreground">
                {s.n}
              </span>
              <h3 className="mt-4 text-base font-bold text-foreground">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PLAN_INCLUDES = [
  "Cheksiz lidlar va voronkalar",
  "AI qo'ng'iroq tahlili va transkripsiya",
  "Native telefoniya integratsiyasi",
  "Avtomatlashtirish va workflow",
  "Telegram / WhatsApp / Email",
  "Reyting, kunlik hisobot va tahlil",
  "Payme / Click to'lov integratsiyasi",
  "Cheksiz xodimlar soni",
];

function Pricing({ info }: { info: PublicSiteInfo | null }) {
  const priceUzs = info?.priceUzs ?? null;
  return (
    <section id="narx" className="bg-background py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Sodda, shaffof narx
          </h2>
          <p className="mt-3 text-muted-foreground">
            Bitta tarif, hamma imkoniyat bilan. Yashirin to'lovlar yo'q.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-md rounded-2xl border border-primary/20 bg-card p-8 text-center shadow-soft">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Kompaniya uchun
          </p>
          <div className="mt-3 flex items-end justify-center gap-1.5">
            {priceUzs === null ? (
              <span className="h-10 w-40 animate-pulse rounded-lg bg-muted" />
            ) : priceUzs > 0 ? (
              <>
                <span className="text-4xl font-extrabold tracking-tight text-foreground">
                  {formatUzs(priceUzs)}
                </span>
                <span className="pb-1 text-sm font-medium text-muted-foreground">so'm / oy</span>
              </>
            ) : (
              <span className="text-2xl font-bold text-foreground">Biz bilan bog'laning</span>
            )}
          </div>

          <ul className="mt-7 space-y-2.5 text-left">
            {PLAN_INCLUDES.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                {item}
              </li>
            ))}
          </ul>

          <Link
            to="/signup"
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {TRIAL_DAYS} kunlik bepul boshlash <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// The platform owner's own support contacts -- the exact same
// support_phone/support_telegram/support_email fields set on
// /platform/notifications' "Qo'llab-quvvatlash aloqalari" card (and shown
// to every signed-in org on its own /billing page). A prospective
// customer evaluating the product from this public page is a different
// audience than an existing tenant asking for support, but it's the same
// underlying "how do I reach the person running this platform" contact --
// no separate field to keep in sync. Renders nothing at all if the owner
// hasn't set any of them yet, rather than an internal-looking "not
// configured" placeholder on a page prospective customers see.
function Contact({ info }: { info: PublicSiteInfo | null }) {
  if (!info) return null;
  const { supportPhone, supportTelegram, supportEmail } = info;
  if (!supportPhone && !supportTelegram && !supportEmail) return null;

  const items = [
    supportTelegram && {
      icon: MessageCircle,
      label: "Telegram",
      value: `@${supportTelegram.replace(/^@/, "")}`,
      href: `https://t.me/${supportTelegram.replace(/^@/, "")}`,
    },
    supportPhone && {
      icon: Phone,
      label: "Telefon",
      value: supportPhone,
      href: `tel:${supportPhone}`,
    },
    supportEmail && {
      icon: Mail,
      label: "Email",
      value: supportEmail,
      href: `mailto:${supportEmail}`,
    },
  ].filter((x): x is { icon: typeof Phone; label: string; value: string; href: string } => !!x);

  return (
    <section id="aloqa" className="bg-surface py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Savollaringiz bormi?
          </h2>
          <p className="mt-3 text-muted-foreground">
            To'g'ridan-to'g'ri biz bilan bog'laning — sizga yordam beramiz.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target={item.label === "Telegram" ? "_blank" : undefined}
              rel={item.label === "Telegram" ? "noreferrer" : undefined}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-5 text-center transition-colors hover:border-primary/30"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <item.icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-subtle">
                {item.label}
              </span>
              <span className="text-sm font-medium text-foreground">{item.value}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#0A1330] via-[#101B40] to-[#060B1C] py-20 sm:py-24">
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-400/10 blur-3xl" />
      <div className="relative mx-auto max-w-2xl px-4 text-center sm:px-6">
        <BrandMark className="mx-auto" iconClassName="h-14 w-14" wordmarkClassName="text-2xl" />
        <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Sotuv jamoangizni bugun kuchaytiring
        </h2>
        <p className="mt-3 text-indigo-100/70">
          {TRIAL_DAYS} kunlik bepul sinov — karta kerak emas, 2 daqiqada boshlaysiz.
        </p>
        <Link
          to="/signup"
          className="mt-7 inline-flex items-center gap-2 rounded-lg bg-white px-7 py-3.5 text-sm font-bold text-[#0A1330] transition-opacity hover:opacity-90"
        >
          Bepul boshlash <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-background py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
        <div className="flex items-center gap-2">
          <Logo className="h-6 w-6" />
          <span className="text-sm font-bold text-foreground">SalesIQ</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link to="/login" className="transition-colors hover:text-foreground">
            Kirish
          </Link>
          <Link to="/signup" className="transition-colors hover:text-foreground">
            Ro'yxatdan o'tish
          </Link>
          <Link to="/privacy" className="transition-colors hover:text-foreground">
            Maxfiylik siyosati
          </Link>
          <Link to="/terms" className="transition-colors hover:text-foreground">
            Foydalanish shartlari
          </Link>
        </div>
        <p className="text-xs text-subtle">
          © {new Date().getFullYear()} SalesIQ. Barcha huquqlar himoyalangan.
        </p>
      </div>
    </footer>
  );
}

export function Landing() {
  // Forced dark, independent of the app's own light/dark toggle (which only
  // applies once inside the authenticated app and defaults to light for a
  // visitor who has never flipped it) -- same treatment /login and /signup
  // already use (a hardcoded navy gradient), so a first-time visitor always
  // sees one consistent dark brand impression instead of the semantic
  // tokens below resolving to their light palette.
  const info = usePublicSiteInfo();
  return (
    <div className="dark min-h-screen bg-background">
      <NavBar />
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing info={info} />
      <Contact info={info} />
      <FinalCta />
      <Footer />
    </div>
  );
}
