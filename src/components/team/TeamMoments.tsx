import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PartyPopper, Rocket, Sparkles, Trophy, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useControlSettings, useOrgGeneralSettings } from "@/hooks/use-crm-data";
import type { CelebrationStyle } from "@/lib/control-settings";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { sceneFor, type BoostTexts } from "@/lib/morning-boost";

// Team moments:
//  - Celebrations: a lead reaching the funnel's celebration stage
//    («Sotuv bayrami», Voronka sozlamalari), a part of a plan reached, the
//    whole plan, a personal plan and the day's first sale (Nazorat → Reja va
//    fakt → Sozlash) put an effect -- confetti, fireworks, a rocket, a
//    trophy or balloons -- and the words on everyone's screen. The database
//    writes 'SaleCelebrate' / 'TeamCelebrate' notifications per person;
//    LiveNotifications turns them into the "salesiq:celebrate" event.
//  - Ertalabki zaryad: once a day, the first time a manager or head opens
//    the app, a motivation screen -- a greeting by name, why the work
//    matters, yesterday's result and today's goal.

export const CELEBRATE_EVENT = "salesiq:celebrate";

/**
 * One celebration on everyone's screen. `kind`: a sale (the funnel's
 * «Sotuv bayrami»), a part of a plan, the whole plan, a personal plan, the
 * day's first sale, or a preview from the settings. `style` falls back to
 * the company's choice for that kind.
 */
export type CelebrateDetail = {
  kind?: "sale" | "part" | "done" | "personal" | "first" | "preview";
  style?: CelebrationStyle | null;
  /** The big line: the seller's name, or the celebration text. */
  seller: string;
  /** The line under it: the lead, or the plan's figures. */
  lead: string;
  /** How much of the plan is done (draws the ring). */
  pct?: number | null;
  /** Shows the effect even when a preview of another style is wanted. */
  seconds?: number;
};

export function celebrate(detail: CelebrateDetail) {
  window.dispatchEvent(new CustomEvent<CelebrateDetail>(CELEBRATE_EVENT, { detail }));
}

const CONFETTI_COLORS = ["#4a86d6", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#facc15"];

/** Falling confetti pieces over the whole screen (pure CSS). */
function Confetti({ count = 90 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 2.6 + Math.random() * 2,
        size: 6 + Math.random() * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
        round: i % 3 === 0,
        drift: (Math.random() - 0.5) * 160,
      })),
    [count],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-[-20px]"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.round ? p.size : p.size * 0.45,
              background: p.color,
              borderRadius: p.round ? "50%" : 2,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Firework bursts: rings of sparks opening one after another. */
function Fireworks() {
  const bursts = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        x: 12 + Math.random() * 76,
        y: 12 + Math.random() * 45,
        size: 160 + Math.random() * 140,
        delay: i * 0.38,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
      })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {bursts.map((b, i) => (
        <span
          key={i}
          className="cel-burst absolute block rounded-full"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.size,
            height: b.size,
            animationDelay: `${b.delay}s`,
            background: `radial-gradient(circle, transparent 38%, ${b.color} 40%, transparent 42%), repeating-conic-gradient(${b.color} 0deg 3deg, transparent 3deg 18deg)`,
            WebkitMaskImage:
              "radial-gradient(circle, transparent 30%, #000 31%, #000 50%, transparent 51%)",
            maskImage:
              "radial-gradient(circle, transparent 30%, #000 31%, #000 50%, transparent 51%)",
          }}
        />
      ))}
      <Confetti count={40} />
    </div>
  );
}

/** A rocket taking off through the stars. */
function RocketLaunch() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 50 }, (_, i) => (
        <span
          key={i}
          className="cel-twinkle absolute h-[3px] w-[3px] rounded-full bg-white"
          style={{
            left: `${(i * 37) % 100}%`,
            top: `${(i * 53) % 100}%`,
            animationDelay: `${(i % 9) * 0.2}s`,
          }}
        />
      ))}
      <div className="cel-rocket absolute bottom-[-90px] left-1/2">
        <Rocket className="h-24 w-24 text-white drop-shadow-[0_0_24px_rgba(255,190,90,0.9)]" />
        <span className="cel-trail absolute left-2 top-16 block h-8 w-8 rounded-full bg-[radial-gradient(circle,#fff3b0,#ff9a3c_55%,transparent_70%)]" />
      </div>
    </div>
  );
}

/** A big trophy in a turning crown of light, with sparkles. */
function TrophyGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <span
        className="cel-rays absolute left-1/2 top-1/2 block h-[150vmax] w-[150vmax] opacity-40"
        style={{
          background:
            "repeating-conic-gradient(rgba(255,214,102,0.35) 0deg 6deg, transparent 6deg 18deg)",
        }}
      />
      {Array.from({ length: 26 }, (_, i) => (
        <Sparkles
          key={i}
          className="cel-twinkle absolute h-5 w-5 text-amber-200"
          style={{
            left: `${(i * 41) % 100}%`,
            top: `${(i * 29) % 100}%`,
            animationDelay: `${(i % 7) * 0.25}s`,
          }}
        />
      ))}
    </div>
  );
}

const BALLOON_COLORS = ["#3b82f6", "#f43f5e", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899"];

/** Balloons floating up from the bottom of the screen. */
function Balloons() {
  const list = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        left: Math.random() * 96,
        delay: Math.random() * 1.6,
        duration: 4.5 + Math.random() * 2.5,
        size: 46 + Math.random() * 30,
        sway: (Math.random() - 0.5) * 80,
        color: BALLOON_COLORS[i % BALLOON_COLORS.length]!,
      })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {list.map((b, i) => (
        <span
          key={i}
          className="cel-balloon absolute bottom-[-140px] block"
          style={
            {
              left: `${b.left}%`,
              animationDelay: `${b.delay}s`,
              animationDuration: `${b.duration}s`,
              "--sway": `${b.sway}px`,
            } as CSSProperties
          }
        >
          <span
            className="block rounded-[50%]"
            style={{
              width: b.size,
              height: b.size * 1.2,
              background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.65), ${b.color} 38%)`,
            }}
          />
          <span className="mx-auto block h-14 w-px bg-white/50" />
        </span>
      ))}
    </div>
  );
}

function Effect({ style }: { style: CelebrationStyle }) {
  if (style === "fireworks") return <Fireworks />;
  if (style === "rocket") return <RocketLaunch />;
  if (style === "trophy") return <TrophyGlow />;
  if (style === "balloons") return <Balloons />;
  return <Confetti />;
}

const STYLE_ICON: Record<CelebrationStyle, typeof PartyPopper> = {
  confetti: PartyPopper,
  fireworks: Sparkles,
  rocket: Rocket,
  trophy: Trophy,
  balloons: PartyPopper,
};

/** A short rising chime (Web Audio, no file). */
function playChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      const at = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + 0.55);
    });
    window.setTimeout(() => void ctx.close(), 1500);
  } catch {
    // no sound is fine
  }
}

/** The plan ring: fills from 0 to `pct`. */
function PctRing({ pct }: { pct: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const shown = Math.min(100, Math.max(0, pct));
  return (
    <div className="relative mx-auto grid h-[116px] w-[116px] place-items-center">
      <svg viewBox="0 0 110 110" className="absolute inset-0 -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="9" />
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke="url(#cel-ring-grad)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          className="cel-ring"
          style={
            {
              strokeDashoffset: c - (c * shown) / 100,
              "--ring-from": `${c}`,
              "--ring-to": `${c - (c * shown) / 100}`,
            } as CSSProperties
          }
        />
        <defs>
          <linearGradient id="cel-ring-grad" x1="0" x2="1">
            <stop offset="0" stopColor="#fde68a" />
            <stop offset="1" stopColor="#34d399" />
          </linearGradient>
        </defs>
      </svg>
      <span
        className={cn(
          "font-display font-bold tabular-nums",
          shown >= 100 ? "text-[24px]" : "text-[30px]",
        )}
      >
        {Number.isInteger(shown) ? shown : shown.toFixed(1).replace(".", ",")}%
      </span>
    </div>
  );
}

export function CelebrationOverlay({
  detail,
  onDone,
}: {
  detail: CelebrateDetail;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const settings = useControlSettings().celebrations;
  const kind = detail.kind ?? "sale";
  const style: CelebrationStyle =
    detail.style ??
    (kind === "sale"
      ? settings.sale.style
      : kind === "personal"
        ? settings.personal.style
        : kind === "first"
          ? settings.firstSale.style
          : settings.team.style);
  const seconds = detail.seconds ?? settings.seconds;
  const Icon = kind === "done" ? Trophy : STYLE_ICON[style];
  useEffect(() => {
    if (settings.sound) playChime();
    const id = setTimeout(onDone, seconds * 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per celebration
  }, []);
  const eyebrow =
    kind === "sale"
      ? t("moment.saleTitle")
      : kind === "first"
        ? t("moment.firstTitle")
        : kind === "personal"
          ? t("moment.personalTitle")
          : kind === "done"
            ? t("moment.doneTitle")
            : kind === "preview"
              ? t("moment.previewTitle")
              : t("moment.partTitle");
  const sceneBg =
    style === "rocket" ? "bg-[#060b1f]/80" : style === "trophy" ? "bg-[#1a1203]/70" : "bg-black/40";
  return (
    <div
      role="status"
      onClick={onDone}
      className={cn(
        "fixed inset-0 z-[200] grid place-items-center backdrop-blur-[3px] animate-in fade-in duration-300",
        sceneBg,
      )}
    >
      <Effect style={style} />
      <div className="celebrate-pop relative mx-4 w-full max-w-md overflow-hidden rounded-[24px] border border-white/15 bg-gradient-to-b from-[#13263a]/95 to-[#0b1724]/95 px-8 pb-6 pt-7 text-center text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
        <span
          aria-hidden
          className="cel-shine pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent"
        />
        {detail.pct != null ? (
          <PctRing pct={detail.pct} />
        ) : (
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 shadow-[0_10px_30px_-8px_rgba(251,146,60,0.8)]">
            <Icon className="h-9 w-9 text-white" />
          </span>
        )}
        <p className="mt-4 text-[12.5px] font-semibold uppercase tracking-[0.16em] text-amber-200/90">
          {eyebrow}
        </p>
        <p className="mt-1.5 text-balance text-[24px] font-extrabold leading-tight">
          {detail.seller}
        </p>
        {detail.lead && (
          <p className="mt-2 text-[14px] leading-snug text-white/75">{detail.lead}</p>
        )}
        <span className="mt-5 block h-1 overflow-hidden rounded-full bg-white/10">
          <span
            className="cel-drain block h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-400"
            style={{ "--cel-seconds": `${seconds}s` } as CSSProperties}
          />
        </span>
      </div>
    </div>
  );
}

/** Mounted once in AppShell: shows the celebration whenever the event fires. */
export function SaleCelebrationHost() {
  const [queue, setQueue] = useState<CelebrateDetail[]>([]);
  useEffect(() => {
    const on = (e: Event) =>
      setQueue((q) => [...q, (e as CustomEvent<CelebrateDetail>).detail].slice(-4));
    window.addEventListener(CELEBRATE_EVENT, on);
    return () => window.removeEventListener(CELEBRATE_EVENT, on);
  }, []);
  const current = queue[0];
  if (!current) return null;
  return (
    <CelebrationOverlay
      key={`${current.kind}-${current.seller}-${queue.length}`}
      detail={current}
      onDone={() => setQueue((q) => q.slice(1))}
    />
  );
}

/* ------------------------------------------------------- morning boost */

export {
  BOOST_ANIMATIONS,
  sceneFor,
  type BoostAnimation,
  type BoostTexts,
} from "@/lib/morning-boost";
type Scene = ReturnType<typeof sceneFor>;

const SCENE_BG: Record<Scene, string> = {
  sun: "from-[#ff9a5a] via-[#f6c26b] to-[#7cc3f5]",
  rocket: "from-[#0b1026] via-[#1d2b64] to-[#3a3f8f]",
  confetti: "from-[#1f3b73] via-[#3a5bb8] to-[#7aa2f7]",
  ocean: "from-[#0a5f8a] via-[#1792b5] to-[#7fd3e6]",
  mountain: "from-[#2b4162] via-[#5d7a99] to-[#c9d6df]",
};

function SceneArt({ scene }: { scene: Scene }) {
  if (scene === "confetti") return <Confetti count={70} />;
  if (scene === "sun")
    return (
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2">
        <div className="boost-sun absolute left-1/2 top-full h-56 w-56 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#fff6c9_0%,#ffd36b_45%,#ff9a3c_75%,transparent_76%)] shadow-[0_0_120px_40px_rgba(255,200,90,0.55)]" />
      </div>
    );
  if (scene === "rocket")
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 40 }, (_, i) => (
          <span
            key={i}
            className="absolute h-[2px] w-[2px] rounded-full bg-white/80"
            style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%` }}
          />
        ))}
        <Rocket className="boost-rocket absolute bottom-[-80px] left-1/2 h-20 w-20 -translate-x-1/2 -rotate-45 text-white" />
      </div>
    );
  if (scene === "ocean")
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 overflow-hidden"
      >
        {[0, 1, 2].map((i) => (
          <svg
            key={i}
            viewBox="0 0 1200 120"
            preserveAspectRatio="none"
            className="boost-wave absolute bottom-0 h-full w-[200%]"
            style={{ animationDuration: `${7 + i * 3}s`, opacity: 0.35 + i * 0.2 }}
          >
            <path
              d="M0 60 Q150 10 300 60 T600 60 T900 60 T1200 60 V120 H0Z"
              fill="rgba(255,255,255,0.55)"
            />
          </svg>
        ))}
      </div>
    );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2">
      <svg viewBox="0 0 1200 300" preserveAspectRatio="none" className="boost-rise h-full w-full">
        <path
          d="M0 300 L250 90 L420 220 L640 40 L860 210 L1010 120 L1200 260 V300Z"
          fill="rgba(255,255,255,0.28)"
        />
        <path
          d="M0 300 L180 180 L380 260 L560 140 L780 270 L980 170 L1200 300Z"
          fill="rgba(255,255,255,0.45)"
        />
      </svg>
    </div>
  );
}

export function MorningBoostScreen({
  name,
  scene,
  texts,
  result,
  onClose,
}: {
  name: string;
  scene: Scene;
  texts: BoostTexts | null | undefined;
  result: { sales: number; moves: number } | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const first = name.split(" ")[0] || name;
  const fill = (s: string) => s.replaceAll("{name}", first);
  return (
    <div className="fixed inset-0 z-[210] animate-in fade-in duration-500">
      <div className={cn("absolute inset-0 bg-gradient-to-b", SCENE_BG[scene])} />
      <SceneArt scene={scene} />
      <button
        type="button"
        onClick={onClose}
        aria-label={t("moment.close")}
        className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-black/20 text-white transition-colors hover:bg-black/35"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="relative mx-auto flex h-full max-w-xl flex-col items-center justify-center px-6 text-center text-white">
        <h1 className="boost-line text-[34px] font-extrabold leading-tight drop-shadow-sm sm:text-[42px]">
          {fill(texts?.greeting || t("moment.greeting"))}
        </h1>
        <p className="boost-line mt-4 text-[17px] leading-relaxed text-white/90 [animation-delay:0.25s]">
          {fill(texts?.meaning || t("moment.meaning"))}
        </p>
        {result && (
          <div className="boost-line mt-6 grid w-full max-w-sm grid-cols-2 gap-3 [animation-delay:0.45s]">
            <div className="rounded-2xl bg-white/15 px-4 py-3 backdrop-blur">
              <p className="text-[28px] font-extrabold">{result.sales}</p>
              <p className="text-[12.5px] text-white/80">{t("moment.ySales")}</p>
            </div>
            <div className="rounded-2xl bg-white/15 px-4 py-3 backdrop-blur">
              <p className="text-[28px] font-extrabold">{result.moves}</p>
              <p className="text-[12.5px] text-white/80">{t("moment.yMoves")}</p>
            </div>
          </div>
        )}
        <p className="boost-line mt-6 rounded-2xl bg-black/15 px-5 py-3 text-[15px] font-semibold [animation-delay:0.65s]">
          🎯 {fill(texts?.goal || t("moment.goal"))}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="boost-line mt-8 h-12 rounded-full bg-white px-8 text-[15px] font-bold text-[#0e2330] shadow-lg transition-transform hover:scale-[1.03] [animation-delay:0.85s]"
        >
          {t("moment.start")}
        </button>
      </div>
    </div>
  );
}

const SEEN_KEY = (uid: string) => `morning-boost:${uid}`;
const tashkentDay = (d = new Date()) =>
  new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);

/** Yesterday's sales and stage moves of one person (Tashkent days). */
export async function yesterdayResult(uid: string) {
  const today = tashkentDay();
  const start = new Date(`${today}T00:00:00+05:00`);
  const yStart = new Date(start.getTime() - 86_400_000);
  const [{ data }, { data: won }] = await Promise.all([
    supabase
      .from("lead_stage_events")
      .select("stage_id")
      .eq("owner_id", uid)
      .gte("entered_at", yStart.toISOString())
      .lt("entered_at", start.toISOString())
      .limit(1000),
    supabase.from("pipeline_stages").select("id").eq("is_won", true),
  ]);
  const wonIds = new Set((won ?? []).map((s) => s.id));
  const rows = data ?? [];
  return { sales: rows.filter((r) => wonIds.has(r.stage_id)).length, moves: rows.length };
}

/** Mounted once in AppShell: the morning screen for managers and heads. */
export function MorningBoostHost() {
  const { user } = useAuth();
  const { data: settings } = useOrgGeneralSettings();
  const [show, setShow] = useState(false);
  const [result, setResult] = useState<{ sales: number; moves: number } | null>(null);
  const eligible = user?.role === "rop" || user?.role === "sotuv_menejeri";
  const enabled = !!settings?.morning_boost_enabled;
  const resetAt = settings?.morning_boost_reset_at ?? null;

  useEffect(() => {
    if (!eligible || !enabled || !user?.id) return;
    let seen: { day?: string; at?: string } = {};
    try {
      seen = JSON.parse(localStorage.getItem(SEEN_KEY(user.id)) ?? "{}");
    } catch {
      /* private mode: shows each visit, harmless */
    }
    const due =
      seen.day !== tashkentDay() ||
      (!!resetAt && !!seen.at && Date.parse(resetAt) > Date.parse(seen.at));
    if (!due) return;
    setShow(true);
    void yesterdayResult(user.id).then(setResult, () => setResult(null));
  }, [eligible, enabled, resetAt, user?.id]);

  if (!show || !user) return null;
  function close() {
    setShow(false);
    try {
      localStorage.setItem(
        SEEN_KEY(user!.id),
        JSON.stringify({ day: tashkentDay(), at: new Date().toISOString() }),
      );
    } catch {
      /* ignore */
    }
  }
  return (
    <MorningBoostScreen
      name={user.name}
      scene={sceneFor(settings?.morning_boost_animation)}
      texts={settings?.morning_boost_texts as BoostTexts | null}
      result={result}
      onClose={close}
    />
  );
}
