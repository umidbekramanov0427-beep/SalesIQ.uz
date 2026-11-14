import { useState } from "react";
import { CheckCircle2, Clock, Loader2, PhoneCall, Presentation, Send } from "lucide-react";
import { TEAM_SIZES } from "@/lib/applications";
import { SectionHead, shell } from "@/components/marketing/landing-parts";

// Landing → "Ariza qoldiring": name, phone, company and team size go to
// /applications/submit, land in Owner → Arizalar and ping the owner in
// Telegram. UTM tags of the visit ride along.

const ERRORS: Record<string, string> = {
  NAME: "Ismingizni yozing.",
  PHONE: "Telefon raqamini to'liq yozing, masalan 90 123 45 67.",
  EMAIL: "Email manzili noto'g'ri.",
  TOO_MANY: "Ariza allaqachon yuborilgan — tez orada bog'lanamiz.",
};

function utmTags(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const out: Record<string, string> = {};
  new URLSearchParams(window.location.search).forEach((v, k) => {
    if (k.startsWith("utm_")) out[k] = v;
  });
  return out;
}

export function ApplyForm() {
  const [f, setF] = useState({ name: "", phone: "", company: "", teamSize: "", message: "" });
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      const res = await fetch("/applications/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...f, website: trap, source: "landing", utm: utmTags() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(ERRORS[j.error ?? ""] ?? "Yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring.");
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError("Internet aloqasini tekshirib, qayta urinib ko'ring.");
      setState("idle");
    }
  }

  const field =
    "h-12 w-full rounded-xl border border-[var(--lp-line)] bg-[var(--lp-bg)] px-4 text-[15px] text-[var(--lp-ink)] outline-none transition-colors placeholder:text-[var(--lp-faint)] focus:border-[var(--lp-violet)]";

  return (
    <section id="ariza" className="scroll-mt-20 pb-24">
      <div className={`${shell} grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]`}>
        <div>
          <SectionHead
            eyebrow="Ariza"
            title="Demo va maslahat —"
            accent="bepul."
            desc="Raqamingizni qoldiring: jamoangizga mos sozlashni ko'rsatamiz va savollaringizga javob beramiz."
          />
          <ul data-reveal className="mt-8 space-y-3.5 text-[15px] text-[var(--lp-muted)]">
            {[
              [Clock, "Ish vaqtida 15 daqiqa ichida qo'ng'iroq qilamiz"],
              [Presentation, "30 daqiqalik demo: voronka, qo'ng'iroq tahlili, hisobotlar"],
              [PhoneCall, "amoCRM yoki Excel'dan ko'chirishda yordam beramiz"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof Clock;
              return (
                <li key={text as string} className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--lp-chip)] text-[var(--lp-violet)]">
                    <I className="h-4 w-4" />
                  </span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>

        <div data-reveal className="lp-card rounded-[24px] p-6 sm:p-8">
          {state === "done" ? (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/12 text-emerald-500">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <p className="lp-display mt-5 text-[24px] font-semibold">Arizangiz qabul qilindi</p>
              <p className="mt-2 max-w-sm text-[15px] text-[var(--lp-muted)]">
                Tez orada {f.phone} raqamiga qo'ng'iroq qilamiz.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
              <input
                className={`${field} sm:col-span-2`}
                placeholder="Ismingiz"
                autoComplete="name"
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
                required
              />
              <input
                className={field}
                placeholder="Telefon: 90 123 45 67"
                type="tel"
                autoComplete="tel"
                value={f.phone}
                onChange={(e) => setF({ ...f, phone: e.target.value })}
                required
              />
              <input
                className={field}
                placeholder="Kompaniya nomi"
                autoComplete="organization"
                value={f.company}
                onChange={(e) => setF({ ...f, company: e.target.value })}
              />
              <div className="sm:col-span-2">
                <p className="mb-2 text-[13px] font-medium text-[var(--lp-muted)]">
                  Sotuv jamoasi necha kishi?
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {TEAM_SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setF({ ...f, teamSize: f.teamSize === s ? "" : s })}
                      className={`h-11 rounded-xl border text-[14.5px] font-semibold transition-colors ${
                        f.teamSize === s
                          ? "border-[var(--lp-violet)] bg-[var(--lp-chip)] text-[var(--lp-violet)]"
                          : "border-[var(--lp-line)] text-[var(--lp-muted)] hover:text-[var(--lp-ink)]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className={`${field} h-24 resize-none py-3 sm:col-span-2`}
                placeholder="Izoh (ixtiyoriy): hozir nimada ishlaysiz, nima kerak"
                value={f.message}
                onChange={(e) => setF({ ...f, message: e.target.value })}
              />
              <input
                tabIndex={-1}
                aria-hidden
                autoComplete="off"
                className="hidden"
                value={trap}
                onChange={(e) => setTrap(e.target.value)}
              />
              {error && (
                <p className="text-[13.5px] font-medium text-rose-500 sm:col-span-2">{error}</p>
              )}
              <button
                type="submit"
                disabled={state === "sending"}
                className="inline-flex h-[52px] items-center justify-center gap-2 rounded-xl text-[15.5px] font-semibold text-white transition-transform disabled:opacity-60 sm:col-span-2"
                style={{ background: "var(--lp-grad)" }}
              >
                {state === "sending" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Ariza yuborish
              </button>
              <p className="text-center text-[12.5px] text-[var(--lp-faint)] sm:col-span-2">
                Ma'lumotlaringiz faqat siz bilan bog'lanish uchun ishlatiladi.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
