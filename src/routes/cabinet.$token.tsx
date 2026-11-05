import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  CircleSlash,
  CreditCard,
  FileText,
  Loader2,
  MessageCircle,
  Package,
  Paperclip,
  Phone,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatSom } from "@/lib/lead-payments/paid-stage";
import { cn } from "@/lib/utils";

// /cabinet/<token> -- a client's own cabinet, opened from the private link
// their manager sent (Mijoz kabineti): their orders, what they paid and
// still owe (with Payme / Click for open bills), invoices and the chat with
// the company. Public and read-only (see AuthGate); always dark, in the same
// glass look as the /pay page.
export const Route = createFileRoute("/cabinet/$token")({
  head: () => ({
    meta: [{ title: "Mijoz kabineti — SalesIQ" }, { name: "robots", content: "noindex" }],
  }),
  component: CabinetPage,
});

type Cabinet = {
  company: { name: string; logo: string | null };
  client: { name: string };
  manager: { name: string; phone: string | null } | null;
  orders: {
    id: string;
    name: string;
    stage: string | null;
    amount: number;
    paid: number;
    createdAt: string;
    closed: "won" | "lost" | null;
  }[];
  payments: { id: string; amount: number; method: string | null; paidAt: string; order: string }[];
  bills: {
    id: string;
    amount: number;
    description: string | null;
    status: string;
    createdAt: string;
    paidAt: string | null;
    order: string;
  }[];
  invoices: {
    id: string;
    number: string | null;
    date: string | null;
    total: number;
    currency: string | null;
    status: string | null;
    order: string;
  }[];
  messages: {
    id: string;
    fromClient: boolean;
    text: string;
    file: string | null;
    channel: string | null;
    at: string;
  }[];
};

type Tab = "orders" | "payments" | "documents" | "chat";
const TAB_ICON: Record<Tab, LucideIcon> = {
  orders: Package,
  payments: CreditCard,
  documents: FileText,
  chat: MessageCircle,
};

const pad = (n: number) => String(n).padStart(2, "0");
const day = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const time = (iso: string) => {
  const d = new Date(iso);
  return `${day(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const som = (n: number) => `${formatSom(n)} so'm`;

const GLASS =
  "rounded-[22px] border border-[rgba(120,170,255,0.18)] bg-[linear-gradient(160deg,rgba(30,44,70,0.55),rgba(10,16,30,0.55))] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[18px]";

function CabinetPage() {
  const { t, lang, setLang } = useI18n();
  const { token } = Route.useParams();
  const [data, setData] = useState<Cabinet | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("orders");

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
    void fetch(`/cabinet/data?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (stop) return;
        if (!res.ok) return setMissing(true);
        setData((await res.json()) as Cabinet);
      })
      .catch(() => !stop && setMissing(true));
    return () => {
      stop = true;
    };
  }, [token]);

  const totals = useMemo(() => {
    if (!data) return null;
    const amount = data.orders.reduce((s, o) => s + o.amount, 0);
    const paid = data.payments.reduce((s, p) => s + p.amount, 0);
    const open = data.bills.filter((b) => b.status === "pending");
    return {
      amount,
      paid,
      due: open.reduce((s, b) => s + b.amount, 0),
      openCount: open.length,
    };
  }, [data]);

  return (
    <main className="always-dark relative min-h-dvh w-full overflow-x-hidden bg-[#07090f] text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(900px_600px_at_85%_10%,#14234a_0%,#07090f_60%)]"
      />
      <div className="relative mx-auto w-full max-w-[880px] px-4 pb-16 pt-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {data?.company.logo ? (
              <img
                src={data.company.logo}
                alt=""
                className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-0.5"
              />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#2a3a5c] text-sm font-extrabold text-[#9cc0ff]">
                {(data?.company.name || "S").slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-[15px] font-bold">{data?.company.name ?? ""}</span>
          </div>
          <div className="flex shrink-0 rounded-xl border border-white/10 bg-white/5 p-0.5 text-xs font-bold">
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
        </div>

        {missing ? (
          <div className={cn(GLASS, "px-6 py-14 text-center")}>
            <CircleSlash className="mx-auto h-10 w-10 text-white/40" />
            <p className="mt-4 text-lg font-bold">{t("cab.missing")}</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-white/60">{t("cab.missingHint")}</p>
          </div>
        ) : !data || !totals ? (
          <div className="flex items-center justify-center gap-2 py-24 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("common.loading")}
          </div>
        ) : (
          <>
            <section className={cn(GLASS, "p-6 phone:p-5")}>
              <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#9cc0ff]">
                {t("cab.title")}
              </p>
              <h1 className="mt-1.5 text-[26px] font-extrabold leading-tight [text-wrap:balance] phone:text-[22px]">
                {t("cab.hello", { name: data.client.name })}
              </h1>
              {data.manager && (
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/70">
                  <span>
                    {t("cab.manager")}:{" "}
                    <span className="font-semibold text-white">{data.manager.name}</span>
                  </span>
                  {data.manager.phone && (
                    <a
                      href={`tel:${data.manager.phone.replace(/[^\d+]/g, "")}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-semibold text-white hover:bg-white/10"
                    >
                      <Phone className="h-3.5 w-3.5" /> {data.manager.phone}
                    </a>
                  )}
                </div>
              )}
              <div className="mt-5 grid grid-cols-3 gap-3 phone:grid-cols-1">
                <Stat label={t("cab.total")} value={som(totals.amount)} />
                <Stat label={t("cab.paid")} value={som(totals.paid)} tone="text-[#4fd18b]" />
                <Stat
                  label={t("cab.due")}
                  value={som(totals.due)}
                  tone={totals.due > 0 ? "text-[#ffb35c]" : "text-white"}
                />
              </div>
            </section>

            <nav className="mt-5 flex gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-1 [scrollbar-width:none]">
              {(["orders", "payments", "documents", "chat"] as const).map((k) => {
                const Icon = TAB_ICON[k];
                const badge = k === "payments" && totals.openCount > 0 ? totals.openCount : null;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={cn(
                      "flex shrink-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition-colors",
                      tab === k ? "bg-white/12 text-white" : "text-white/55 hover:text-white",
                    )}
                  >
                    <Icon className="h-4 w-4" /> {t(`cab.tab.${k}`)}
                    {badge && (
                      <span className="rounded-full bg-[#ffb35c] px-1.5 text-[11px] text-[#1a1206]">
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <section className={cn(GLASS, "mt-4 overflow-hidden")}>
              {tab === "orders" && <Orders data={data} />}
              {tab === "payments" && <Payments data={data} />}
              {tab === "documents" && <Documents data={data} />}
              {tab === "chat" && <Chat data={data} />}
            </section>
            <p className="mt-6 text-center text-xs text-white/35">{t("cab.footer")}</p>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="text-xs font-semibold text-white/55">{label}</p>
      <p className={cn("mt-1 text-lg font-extrabold tabular-nums", tone ?? "text-white")}>
        {value}
      </p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-6 py-12 text-center text-sm text-white/50">{text}</p>;
}

const ROW = "flex items-center gap-4 border-b border-white/[0.07] px-5 py-4 last:border-b-0";

function Orders({ data }: { data: Cabinet }) {
  const { t } = useI18n();
  if (!data.orders.length) return <Empty text={t("cab.noOrders")} />;
  return (
    <div>
      {data.orders.map((o) => {
        const left = Math.max(0, o.amount - o.paid);
        return (
          <div key={o.id} className={ROW}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#2a3a5c] text-[#9cc0ff]">
              <Package className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold">{o.name}</p>
              <p className="mt-0.5 text-[13px] text-white/55">
                {day(o.createdAt)}
                {o.stage ? ` · ${o.stage}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {o.amount > 0 && (
                <p className="text-[15px] font-bold tabular-nums">{som(o.amount)}</p>
              )}
              <p
                className={cn(
                  "mt-0.5 text-[12.5px] font-semibold",
                  o.closed === "won"
                    ? "text-[#4fd18b]"
                    : o.closed === "lost"
                      ? "text-white/45"
                      : left > 0 && o.paid > 0
                        ? "text-[#ffb35c]"
                        : "text-[#9cc0ff]",
                )}
              >
                {o.closed === "won"
                  ? t("cab.done")
                  : o.closed === "lost"
                    ? t("cab.closed")
                    : o.paid > 0 && left > 0
                      ? t("cab.left", { sum: formatSom(left) })
                      : t("cab.inProgress")}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Payments({ data }: { data: Cabinet }) {
  const { t } = useI18n();
  const open = data.bills.filter((b) => b.status === "pending");
  if (!open.length && !data.payments.length) return <Empty text={t("cab.noPayments")} />;
  return (
    <div>
      {open.length > 0 && (
        <div className="border-b border-white/[0.07] bg-[#ffb35c]/[0.06] px-5 py-4">
          <p className="text-[13px] font-bold uppercase tracking-[0.06em] text-[#ffb35c]">
            {t("cab.toPay")}
          </p>
          <div className="mt-3 space-y-2.5">
            {open.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-extrabold tabular-nums">{som(b.amount)}</p>
                  <p className="truncate text-[13px] text-white/60">
                    {b.description || b.order} · {day(b.createdAt)}
                  </p>
                </div>
                <a
                  href={`/pay/${b.id}`}
                  className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-[linear-gradient(90deg,#2f7bff,#5b55e6)] px-5 text-sm font-bold text-white shadow-[0_10px_26px_-10px_rgba(47,123,255,0.7)] hover:brightness-110"
                >
                  <CreditCard className="h-4 w-4" /> {t("cab.payNow")}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.payments.length > 0 && (
        <>
          <p className="px-5 pb-1 pt-4 text-[13px] font-bold uppercase tracking-[0.06em] text-white/50">
            {t("cab.history")}
          </p>
          {data.payments.map((p) => (
            <div key={p.id} className={ROW}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#3fbf7f]/15 text-[#4fd18b]">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold">
                  {p.order || t("cab.payment")}
                </p>
                <p className="mt-0.5 text-[13px] text-white/55">
                  {day(p.paidAt)}
                  {p.method ? ` · ${t(`cab.m.${p.method}`)}` : ""}
                </p>
              </div>
              <p className="shrink-0 text-[15px] font-bold tabular-nums text-[#4fd18b]">
                +{som(p.amount)}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function Documents({ data }: { data: Cabinet }) {
  const { t } = useI18n();
  if (!data.invoices.length) return <Empty text={t("cab.noDocs")} />;
  return (
    <div>
      {data.invoices.map((i) => (
        <div key={i.id} className={ROW}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#2a3a5c] text-[#9cc0ff]">
            <Receipt className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">
              {t("cab.invoice", { n: i.number ?? "—" })}
            </p>
            <p className="mt-0.5 text-[13px] text-white/55">
              {day(i.date)}
              {i.order ? ` · ${i.order}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[15px] font-bold tabular-nums">
              {formatSom(i.total)} {i.currency && i.currency !== "UZS" ? i.currency : "so'm"}
            </p>
            {i.status && (
              <p
                className={cn(
                  "mt-0.5 text-[12.5px] font-semibold",
                  i.status === "paid" ? "text-[#4fd18b]" : "text-white/55",
                )}
              >
                {t(`cab.inv.${i.status}`)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Chat({ data }: { data: Cabinet }) {
  const { t } = useI18n();
  if (!data.messages.length) return <Empty text={t("cab.noChat")} />;
  return (
    <div className="max-h-[70dvh] space-y-2.5 overflow-y-auto px-4 py-5">
      {data.messages.map((m) => (
        <div key={m.id} className={cn("flex", m.fromClient ? "justify-end" : "justify-start")}>
          <div
            className={cn(
              "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug",
              m.fromClient
                ? "rounded-br-md bg-[linear-gradient(135deg,#2f7bff,#5b55e6)] text-white"
                : "rounded-bl-md border border-white/10 bg-white/[0.07] text-white",
            )}
          >
            {m.file && (
              <p className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-semibold opacity-90">
                <Paperclip className="h-3.5 w-3.5" /> {m.file}
              </p>
            )}
            {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
            <p
              className={cn(
                "mt-1 text-right text-[11px]",
                m.fromClient ? "text-white/70" : "text-white/45",
              )}
            >
              {time(m.at)}
              {m.channel === "instagram" ? " · Instagram" : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
