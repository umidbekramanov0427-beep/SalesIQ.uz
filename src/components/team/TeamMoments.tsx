import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PartyPopper, Rocket, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgGeneralSettings } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { sceneFor, type BoostTexts } from "@/lib/morning-boost";

// Two team moments from Voronka sozlamalari → Qo'shimcha sozlamalar:
//  - Sotuv bayrami: a lead reaching the funnel's celebration stage for the
//    first time puts confetti and the seller's name on everyone's screen
//    (~5 s). The database writes a 'SaleCelebrate' notification per person;
//    LiveNotifications turns it into the "salesiq:celebrate" event.
//  - Ertalabki zaryad: once a day, the first time a manager or head opens
//    the app, a motivation screen -- a greeting by name, why the work
//    matters, yesterday's result and today's goal.

export const CELEBRATE_EVENT = "salesiq:celebrate";
export type CelebrateDetail = { seller: string; lead: string };

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

export function SaleCelebrationOverlay({
  detail,
  onDone,
}: {
  detail: CelebrateDetail;
  onDone: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const id = setTimeout(onDone, 5200);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <div
      role="status"
      onClick={onDone}
      className="fixed inset-0 z-[200] grid place-items-center bg-black/30 backdrop-blur-[2px] animate-in fade-in duration-300"
    >
      <Confetti />
      <div className="celebrate-pop relative mx-4 max-w-md rounded-[20px] border border-white/15 bg-[#0e2330]/90 px-8 py-7 text-center text-white shadow-2xl">
        <PartyPopper className="mx-auto h-12 w-12 text-amber-300" />
        <p className="mt-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/70">
          {t("moment.saleTitle")}
        </p>
        <p className="mt-1 text-[28px] font-extrabold leading-tight">{detail.seller}</p>
        {detail.lead && <p className="mt-1 truncate text-[14px] text-white/75">{detail.lead}</p>}
      </div>
    </div>
  );
}

/** Mounted once in AppShell: shows the celebration whenever the event fires. */
export function SaleCelebrationHost() {
  const [current, setCurrent] = useState<CelebrateDetail | null>(null);
  useEffect(() => {
    const on = (e: Event) => setCurrent((e as CustomEvent<CelebrateDetail>).detail);
    window.addEventListener(CELEBRATE_EVENT, on);
    return () => window.removeEventListener(CELEBRATE_EVENT, on);
  }, []);
  if (!current) return null;
  return <SaleCelebrationOverlay detail={current} onDone={() => setCurrent(null)} />;
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
