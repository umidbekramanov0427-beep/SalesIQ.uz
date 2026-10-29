import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, CheckCircle2, CircleSlash, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useI18n, type Lang } from "@/lib/i18n";
import { formatSom } from "@/lib/lead-payments/paid-stage";
import { cn } from "@/lib/utils";

// /pay/<link id> -- the page a company's client opens from a payment link
// the manager sent: who is asking, how much, for what, and a choice of
// Payme / Click into the company's own cashbox. Public (see AuthGate). It is
// always dark, in the same glass look as the sign-in page. Coming back from
// the gateway it keeps checking until the payment shows up.
export const Route = createFileRoute("/pay/$linkId")({
  head: () => ({
    meta: [{ title: "To'lov — SalesIQ" }, { name: "robots", content: "noindex" }],
  }),
  component: PayPage,
});

type Bill = {
  company: string;
  amount: number;
  description: string | null;
  status: "pending" | "paid" | "cancelled";
  createdAt?: string | null;
  paidAt: string | null;
  provider: string | null;
  payme: string | null;
  click: string | null;
};

type Method = "payme" | "click";

const MONTHS_UZ = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

function formatDay(iso: string | null | undefined, lang: Lang): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (lang === "uz") return `${d.getDate()}-${MONTHS_UZ[d.getMonth()]} ${d.getFullYear()}`;
  return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function initials(name: string): string {
  const words = name
    .replace(/["'«»]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "S"
  );
}

function PayPage() {
  const { t, lang, setLang } = useI18n();
  const { linkId } = Route.useParams();
  const [bill, setBill] = useState<Bill | null>(null);
  const [missing, setMissing] = useState(false);
  const [method, setMethod] = useState<Method | null>(null);

  // The company's clients get Uzbek (Russian on a Russian browser) unless
  // they have picked a language on this device before.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem("salesos.lang");
    } catch {
      // storage unavailable
    }
    if (!stored) setLang(navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "uz");
  }, [setLang]);

  useEffect(() => {
    let stop = false;
    let tries = 0;
    async function load() {
      const res = await fetch(`/lead-payments/public?id=${encodeURIComponent(linkId)}`).catch(
        () => null,
      );
      if (stop) return;
      if (!res?.ok) {
        if (res?.status === 404) setMissing(true);
        return;
      }
      const next = (await res.json()) as Bill;
      setBill(next);
      // Back from Payme / Click the callback can land a few seconds later:
      // an open bill is checked again for a few minutes.
      if (next.status === "pending" && tries++ < 36) setTimeout(() => void load(), 5000);
    }
    void load();
    return () => {
      stop = true;
    };
  }, [linkId]);

  // Payme first when the company has both.
  const chosen: Method | null = method ?? (bill?.payme ? "payme" : bill?.click ? "click" : null);
  const payUrl = chosen === "payme" ? bill?.payme : chosen === "click" ? bill?.click : null;

  return (
    <main className="always-dark relative min-h-dvh w-full overflow-x-hidden bg-[#07090f] text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(900px_600px_at_80%_20%,#14234a_0%,#07090f_60%)]"
      />
      <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-16">
        <div className="absolute right-5 top-5 flex rounded-xl border border-white/10 bg-white/5 p-0.5 text-xs font-bold backdrop-blur">
          {(["uz", "ru"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn(
                "rounded-[10px] px-3 py-1.5 transition-colors",
                lang === l ? "bg-white/15 text-white" : "text-white/55 hover:text-white",
              )}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="grid w-full max-w-[800px] grid-cols-[380px_minmax(0,1fr)] overflow-hidden rounded-[26px] border border-[rgba(120,170,255,0.22)] bg-[linear-gradient(160deg,rgba(30,44,70,0.6),rgba(10,16,30,0.6))] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[20px] phone:grid-cols-1 phone:rounded-[22px]">
          {missing ? (
            <div className="col-span-full p-12 text-center">
              <CircleSlash className="mx-auto h-10 w-10 text-white/45" />
              <p className="mt-3 text-base font-semibold">{t("pay.notFound")}</p>
            </div>
          ) : !bill ? (
            <div className="col-span-full flex justify-center p-16">
              <Loader2 className="h-6 w-6 animate-spin text-white/55" />
            </div>
          ) : (
            <>
              <section className="border-r border-[rgba(120,170,255,0.15)] p-[34px] phone:border-b phone:border-r-0 phone:p-6">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] bg-[#2a3a5c] text-sm font-extrabold text-[#9cc0ff]">
                    {initials(bill.company)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{bill.company}</p>
                    <p className="text-xs text-white/55">{t("pay.link")}</p>
                  </div>
                </div>

                <p className="mt-7 text-[13px] text-white/55">{t("pay.amount")}</p>
                <p className="mt-1 flex items-baseline gap-2 font-bold tracking-[-0.02em]">
                  <span className="text-[36px] leading-none tabular-nums">
                    {formatSom(bill.amount)}
                  </span>
                  <span className="text-lg text-white/60">so'm</span>
                </p>

                <dl className="mt-5 grid gap-2.5 text-[13.5px]">
                  {bill.description && <Detail label={t("pay.service")} value={bill.description} />}
                  {formatDay(bill.createdAt, lang) && (
                    <Detail label={t("pay.date")} value={formatDay(bill.createdAt, lang)!} />
                  )}
                  <Detail
                    label={t("pay.status")}
                    value={
                      bill.status === "paid"
                        ? t("pay.statusPaid")
                        : bill.status === "cancelled"
                          ? t("pay.statusCancelled")
                          : t("pay.statusPending")
                    }
                    tone={
                      bill.status === "paid"
                        ? "text-[#4fd18b]"
                        : bill.status === "pending"
                          ? "text-[#ffc861]"
                          : "text-white/55"
                    }
                  />
                </dl>

                <p className="mt-[30px] flex items-start gap-2 text-[12.5px] leading-snug text-white/65">
                  <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-[#3fbf7f]" />
                  {t("pay.safe")}
                </p>
              </section>

              <section className="p-[34px] phone:p-6">
                {bill.status === "paid" ? (
                  <div className="flex h-full flex-col items-center justify-center py-6 text-center">
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-[#3fbf7f]/15 text-[#4fd18b] shadow-[0_0_40px_-6px_rgba(63,191,127,0.6)]">
                      <CheckCircle2 className="h-9 w-9" />
                    </span>
                    <p className="mt-4 text-lg font-bold">{t("pay.paid")}</p>
                    <p className="mt-1 text-sm text-white/60">{t("pay.paidHint")}</p>
                    {formatDay(bill.paidAt, lang) && (
                      <p className="mt-3 text-xs text-white/45">
                        {t("pay.paidOn", { date: formatDay(bill.paidAt, lang)! })}
                      </p>
                    )}
                  </div>
                ) : bill.status === "cancelled" ? (
                  <div className="flex h-full flex-col items-center justify-center py-6 text-center">
                    <CircleSlash className="h-10 w-10 text-white/45" />
                    <p className="mt-3 text-sm font-semibold text-white/70">{t("pay.cancelled")}</p>
                  </div>
                ) : !bill.payme && !bill.click ? (
                  <div className="flex h-full items-center justify-center py-6 text-center text-sm text-white/60">
                    {t("pay.unavailable")}
                  </div>
                ) : (
                  <>
                    <h1 className="text-lg font-bold">{t("pay.choose")}</h1>
                    <div className="mt-[18px] grid gap-3" role="radiogroup">
                      {bill.payme && (
                        <MethodCard
                          name="Payme"
                          mark="payme"
                          markClass="bg-[#00b7c2]"
                          cards={t("pay.paymeCards")}
                          selected={chosen === "payme"}
                          onSelect={() => setMethod("payme")}
                        />
                      )}
                      {bill.click && (
                        <MethodCard
                          name="Click"
                          mark="click"
                          markClass="bg-[#0e6ffd]"
                          cards={t("pay.clickCards")}
                          selected={chosen === "click"}
                          onSelect={() => setMethod("click")}
                        />
                      )}
                    </div>
                    <a
                      href={payUrl ?? undefined}
                      className="mt-[22px] flex h-[50px] items-center justify-center gap-2 rounded-[13px] bg-[linear-gradient(90deg,#2f7bff,#5b55e6)] px-4 text-[15px] font-bold text-white shadow-[0_12px_30px_-10px_rgba(47,123,255,0.7)] transition-[transform,filter] hover:-translate-y-px hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9cc0ff]"
                    >
                      <Lock className="h-4 w-4" />
                      {t("pay.payBtn", { amount: formatSom(bill.amount) })}
                    </a>
                    <p className="mt-[18px] flex items-center gap-2.5 rounded-xl border border-[rgba(120,160,230,0.15)] bg-white/[0.04] px-3.5 py-3 text-[13px] text-white/65">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#4d86ff]" />
                      {t("pay.waiting")}
                    </p>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Detail({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-white/55">{label}</dt>
      <dd className={cn("min-w-0 text-right font-semibold", tone)}>{value}</dd>
    </div>
  );
}

function MethodCard({
  name,
  mark,
  markClass,
  cards,
  selected,
  onSelect,
}: {
  name: string;
  mark: string;
  markClass: string;
  cards: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3.5 rounded-2xl p-4 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9cc0ff]",
        selected
          ? "border-[1.5px] border-[#4d86ff] bg-[rgba(77,134,255,0.1)] shadow-[0_0_0_3px_rgba(77,134,255,0.15)]"
          : "border border-[rgba(120,160,230,0.2)] hover:border-[rgba(120,160,230,0.4)] hover:bg-white/[0.03]",
      )}
    >
      <span
        className={cn(
          "grid h-[34px] w-[52px] shrink-0 place-items-center rounded-lg text-[13px] font-extrabold text-white",
          markClass,
        )}
      >
        {mark}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{name}</span>
        <span className="block text-xs text-white/55">{cards}</span>
      </span>
      {selected ? (
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#4d86ff]">
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </span>
      ) : (
        <span className="h-5 w-5 shrink-0 rounded-full border-[1.5px] border-[#4a5163]" />
      )}
    </button>
  );
}
