import { useState } from "react";
import { Calculator, Check, Minus, ShieldCheck, Plus, X } from "lucide-react";
import { PLAN_LABELS, SEAT_LIMITS } from "@/lib/plan-gating";
import { teamCosts } from "@/lib/pricing-compare";
import {
  formatUzs,
  SectionHead,
  shell,
  type PublicSiteInfo,
} from "@/components/marketing/landing-parts";

// /pricing (and the landing) section after the plan cards: a team-size
// calculator built on the live prices, SalesIQ next to a per-user CRM such
// as amoCRM, and what the price does and doesn't include. The comparison
// deliberately names no competitor prices -- they change and are quoted in
// rubles; the point made here is the pricing model, which doesn't.

type Mark = "yes" | "part" | "no";

const ROWS: { topic: string; ours: string; theirs: string; mark: Mark }[] = [
  {
    topic: "Narx qanday hisoblanadi",
    ours: "Tarif narxi qat'iy: 5, 25 yoki 60 menejergacha bitta narx",
    theirs: "Har bir foydalanuvchi uchun alohida — jamoa o'sgani sari hisob ham o'sadi",
    mark: "no",
  },
  {
    topic: "To'lov",
    ours: "So'mda, Payme yoki Click orqali, har oy",
    theirs: "Asosan rublda, narx valyuta kursiga bog'liq",
    mark: "part",
  },
  {
    topic: "AI qo'ng'iroq tahlili",
    ours: "Analyst IQ va Master IQ narxiga kiradi, limitsiz",
    theirs: "Alohida vidjet yoki xizmat, o'z to'lovi bilan",
    mark: "part",
  },
  {
    topic: "O'zbek tili",
    ours: "Interfeys, qo'llanmalar va AI xulosalari o'zbekcha",
    theirs: "O'zbekcha interfeys yo'q",
    mark: "no",
  },
  {
    topic: "Telefoniya",
    ours: "OnlinePBX, Sipuni, MoiZvonki tayyor; javobsiz qo'ng'iroq o'zi vazifa bo'ladi",
    theirs: "Vidjetlar orqali, odatda integrator ulab beradi",
    mark: "part",
  },
  {
    topic: "Joriy etish",
    ours: "O'zingiz bir kunda; amoCRM / Bitrix24'dan ko'chirish bepul",
    theirs: "Integrator xizmati ko'pincha alohida to'lanadi",
    mark: "part",
  },
  {
    topic: "Hujjatlar",
    ours: "Har to'lovga hisob-faktura va dalolatnoma, Didox orqali e-faktura",
    theirs: "O'zbekiston e-faktura tizimlariga tayyor ulanish yo'q",
    mark: "part",
  },
  {
    topic: "Yordam",
    ours: "Telegram orqali, o'zbek tilida",
    theirs: "Asosan rus tilida",
    mark: "part",
  },
];

const INCLUDED = [
  "Barcha yangilanishlar va yangi imkoniyatlar",
  "AI qo'ng'iroq tahlili — limitsiz (Analyst IQ, Master IQ)",
  "amoCRM / Bitrix24'dan ma'lumotlarni ko'chirish",
  "Telegram bot, push-bildirishnomalar, telefonga o'rnatiladigan ilova",
  "O'zbek tilida qo'llab-quvvatlash",
  "Har to'lovdan keyin hisob-faktura va dalolatnoma",
  "Hisobotlarni Excel va PDF'ga yuklab olish",
  "Istalgan oyda to'xtatish — ma'lumotlaringiz saqlanib qoladi",
];

const STEPS = [1, 5, 10, 25, 40, 60, 80, 100];

function MarkIcon({ mark }: { mark: Mark }) {
  if (mark === "yes")
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--lp-chip)] text-[var(--lp-violet)]">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--lp-line)] text-[var(--lp-faint)]">
      {mark === "no" ? (
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      ) : (
        <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
      )}
    </span>
  );
}

function TeamCalculator({ info }: { info: PublicSiteInfo | null }) {
  const [managers, setManagers] = useState(10);
  const prices = {
    start_iq: info?.priceStartIqUzs ?? 0,
    analyst_iq: info?.priceAnalystIqUzs ?? 0,
    master_iq: info?.priceMasterIqUzs ?? 0,
  };
  const extraSeat = info?.extraSeatPriceUzs ?? 0;
  const costs = teamCosts(managers, prices, extraSeat);
  const priced = costs.filter((c) => c.total !== null);
  const best = priced.length
    ? priced.reduce((a, b) => ((b.total ?? 0) < (a.total ?? 0) ? b : a)).plan
    : null;

  return (
    <div data-reveal className="lp-card rounded-[24px] p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--lp-chip)] text-[var(--lp-violet)]">
            <Calculator className="h-5 w-5" />
          </span>
          <div>
            <p className="lp-display text-[19px] font-semibold">Jamoangiz uchun narx</p>
            <p className="text-[14px] text-[var(--lp-muted)]">
              Menejerlar sonini tanlang — oylik summa va bitta menejerga to'g'ri keladigan narx.
            </p>
          </div>
        </div>
        <p className="lp-display text-[40px] font-semibold leading-none tabular-nums">
          {managers}
          <span className="ml-2 text-[15px] font-medium text-[var(--lp-muted)]">menejer</span>
        </p>
      </div>

      <input
        type="range"
        min={1}
        max={100}
        value={managers}
        onChange={(e) => setManagers(Number(e.target.value))}
        aria-label="Menejerlar soni"
        className="mt-7 w-full cursor-pointer accent-[var(--lp-violet)]"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {STEPS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setManagers(n)}
            className={`h-8 rounded-lg px-3 font-mono text-[12.5px] font-semibold tabular-nums transition-colors ${
              managers === n
                ? "bg-[var(--lp-violet)] text-white"
                : "border border-[var(--lp-line)] text-[var(--lp-muted)] hover:border-[var(--lp-violet)] hover:text-[var(--lp-ink)]"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="mt-7 grid gap-3 md:grid-cols-3">
        {costs.map((c) => {
          const limit = SEAT_LIMITS[c.plan];
          const isBest = c.plan === best;
          return (
            <div
              key={c.plan}
              className={`relative rounded-2xl border p-5 transition-colors ${
                isBest
                  ? "border-[var(--lp-violet)] bg-[var(--lp-card-2)] ring-2 ring-[var(--lp-violet)]/20"
                  : "border-[var(--lp-line)]"
              } ${c.fits ? "" : "opacity-55"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[15px] font-semibold">{PLAN_LABELS[c.plan]}</p>
                {isBest && (
                  <span className="rounded-full bg-[var(--lp-violet)] px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white">
                    Eng qulay
                  </span>
                )}
              </div>
              {!info ? (
                <span className="mt-4 block h-9 w-36 animate-pulse rounded-lg bg-current opacity-10" />
              ) : !c.fits ? (
                <p className="mt-4 text-[14px] leading-snug text-[var(--lp-muted)]">
                  {limit} menejergacha — jamoangiz uchun kichik
                </p>
              ) : c.total === null ? (
                <p className="mt-4 text-[14px] text-[var(--lp-muted)]">
                  Narxni biz bilan kelishing
                </p>
              ) : (
                <>
                  <p className="mt-3 flex items-baseline gap-1.5">
                    <span className="lp-display text-[30px] font-semibold leading-none tabular-nums">
                      {formatUzs(c.perManager ?? 0)}
                    </span>
                    <span className="text-[13px] text-[var(--lp-muted)]">so'm / menejer</span>
                  </p>
                  <p className="mt-2 text-[13.5px] text-[var(--lp-muted)] tabular-nums">
                    Oyiga jami {formatUzs(c.total)} so'm
                    {limit !== null && managers > limit && extraSeat > 0
                      ? ` (${managers - limit} qo'shimcha o'rin bilan)`
                      : ""}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-5 text-[14px] leading-relaxed text-[var(--lp-muted)]">
        Foydalanuvchi boshiga to'lanadigan CRM'da hisob <b>{managers} × bitta o'rin narxi</b>{" "}
        bo'ladi: jamoa ikki baravar o'ssa, to'lov ham ikki baravar o'sadi. SalesIQ'da tarif
        chegarasigacha narx o'zgarmaydi — har yangi menejer bilan bitta menejerga to'g'ri keladigan
        narx kamayadi.
      </p>
    </div>
  );
}

export function PricingCompare({ info }: { info: PublicSiteInfo | null }) {
  const extraSeat = info?.extraSeatPriceUzs ?? 0;
  const optional = [
    {
      title: "Telefoniya daqiqalari",
      text: "Operatoringizga (OnlinePBX, Sipuni, MoiZvonki) to'g'ridan-to'g'ri, ularning tarifida.",
    },
    {
      title: "SMS xabarlar",
      text: "SMS provayderga (masalan, Eskiz) o'z tarifida — faqat SMS yuborsangiz.",
    },
    {
      title: `${SEAT_LIMITS.master_iq} tadan ortiq o'rin`,
      text:
        extraSeat > 0
          ? `Master IQ'da har bir qo'shimcha o'rin — ${formatUzs(extraSeat)} so'm / oy.`
          : "Master IQ'da qo'shimcha o'rin — narxi kelishiladi.",
    },
  ];

  return (
    <section id="taqqoslash" className="scroll-mt-20 py-24">
      <div className={shell}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead
            eyebrow="05 / Taqqoslash"
            title="Har menejer uchun"
            accent="alohida to'lamaysiz."
          />
          <p data-reveal className="max-w-sm text-[15px] leading-relaxed text-[var(--lp-muted)]">
            amoCRM kabi CRM'lar har bir foydalanuvchi uchun haq oladi. SalesIQ'da narx tarif
            bo'yicha — jamoa kattalashgani sari foydasi ko'proq.
          </p>
        </div>

        <div className="mt-12">
          <TeamCalculator info={info} />
        </div>

        <div data-reveal className="lp-card mt-6 overflow-x-auto rounded-[24px]">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-[0.8fr_1.25fr_1.25fr] border-b border-[var(--lp-line)] font-mono text-[11.5px] font-semibold uppercase tracking-[0.12em]">
              <p className="px-6 py-4 text-[var(--lp-faint)]">Nima</p>
              <p className="bg-[var(--lp-chip)] px-6 py-4 text-[var(--lp-violet)]">SalesIQ</p>
              <p className="px-6 py-4 text-[var(--lp-faint)]">
                Foydalanuvchi boshiga CRM (amoCRM va b.)
              </p>
            </div>
            {ROWS.map((r, i) => (
              <div
                key={r.topic}
                className={`grid grid-cols-[0.8fr_1.25fr_1.25fr] text-[14.5px] ${
                  i < ROWS.length - 1 ? "border-b border-[var(--lp-line)]" : ""
                }`}
              >
                <p className="px-6 py-4 font-semibold">{r.topic}</p>
                <div className="flex items-start gap-3 bg-[var(--lp-chip)]/45 px-6 py-4">
                  <MarkIcon mark="yes" />
                  <span className="leading-snug">{r.ours}</span>
                </div>
                <div className="flex items-start gap-3 px-6 py-4 text-[var(--lp-muted)]">
                  <MarkIcon mark={r.mark} />
                  <span className="leading-snug">{r.theirs}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div id="narx" className="mt-6 grid scroll-mt-24 gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div data-reveal className="lp-card rounded-[24px] p-7 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--lp-chip)] text-[var(--lp-violet)]">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="lp-display text-[21px] font-semibold">Yashirin to'lov yo'q</p>
                <p className="text-[14px] text-[var(--lp-muted)]">Tarif narxiga hammasi kiradi:</p>
              </div>
            </div>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[14.5px] leading-snug">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--lp-chip)] text-[var(--lp-violet)]">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div
            data-reveal
            className="rounded-[24px] border border-dashed border-[var(--lp-line)] p-7 sm:p-8"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--lp-line)] text-[var(--lp-muted)]">
                <Plus className="h-5 w-5" />
              </span>
              <div>
                <p className="lp-display text-[21px] font-semibold">Faqat o'zingiz tanlasangiz</p>
                <p className="text-[14px] text-[var(--lp-muted)]">
                  To'g'ridan-to'g'ri xizmat egasiga to'lanadi
                </p>
              </div>
            </div>
            <ul className="mt-6 space-y-4">
              {optional.map((o) => (
                <li key={o.title}>
                  <p className="text-[15px] font-semibold">{o.title}</p>
                  <p className="mt-0.5 text-[14px] leading-snug text-[var(--lp-muted)]">{o.text}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-[var(--lp-line)] pt-4 text-[13.5px] text-[var(--lp-muted)]">
              SalesIQ bu to'lovlarga ustama qo'shmaydi.
            </p>
          </div>
        </div>

        <p className="mt-6 max-w-3xl text-[12.5px] leading-relaxed text-[var(--lp-faint)]">
          Taqqoslash ochiq manbalardagi ma'lumotlarga asoslangan (2026-yil oktabr) va har bir
          provayderning umumiy narx modelini ko'rsatadi. amoCRM — o'z egasining savdo belgisi. Aniq
          narx va shartlarni amocrm.ru saytida tekshiring.
        </p>
      </div>
    </section>
  );
}
