// Hisob va to'lov, as in 5CRM: the plan and its end on top, the balance with
// Click / Payme top-up and «Balansdan avto-yangilash», then the team size
// and period, the modules with their prices, the price table with what is
// still short, «Sotib olish», the legal-entity contract, the free bonuses
// and the money history. Every sum comes from lib/billing-catalog quote(),
// the same function the server charges with.
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CalendarClock,
  Check,
  CircleCheck,
  CreditCard,
  Gift,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { BillingSection } from "@/components/settings/BillingSection";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useOrgAccess } from "@/lib/use-org-access";
import { useOrgModules } from "@/hooks/crm/warehouse";
import { cn, describeError, formatDate } from "@/lib/utils";
import { PLAN_LABELS, normalizePlan } from "@/lib/plan-gating";
import {
  BILLING_MODULES,
  BILLING_PERIODS,
  PER_SEAT_MODULES,
  freeMonths,
  quote,
  shortfall,
  type BillingModule,
  type BillingPeriod,
  type Cart,
} from "@/lib/billing-catalog";
import { useWallet, useWalletAction, type WalletData } from "@/hooks/crm/billing-wallet";

const sum = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const BONUS_GROUPS: { key: string; items: string[] }[] = [
  { key: "crm", items: ["funnels", "leadCard", "tasks", "import", "api", "dupes"] },
  { key: "chat", items: ["inbox", "telegramBot", "instagram", "quickReplies"] },
  { key: "team", items: ["control", "classroom", "refunds", "reports"] },
  { key: "platform", items: ["mobile", "assistant", "backup", "support"] },
];

export function BillingStore() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data, isLoading } = useWallet();
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </p>
    );
  }
  // Until the balance migration has run, the old plan-by-months flow keeps
  // working.
  if (!data?.ready) return <BillingSection />;
  return (
    <Store data={data} isAdmin={user?.role === "super_admin" || user?.role === "platform_owner"} />
  );
}

function Store({ data, isAdmin }: { data: WalletData; isAdmin: boolean }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const access = useOrgAccess();
  const activeModules = useOrgModules();
  const act = useWalletAction();
  const { catalog, wallet } = data;

  const [cart, setCart] = useState<Cart>(() => ({
    seats: Math.max(1, wallet.cart?.seats ?? data.staff ?? 1),
    months: wallet.cart?.months ?? 3,
    modules: wallet.cart?.modules ?? BILLING_MODULES.filter((m) => activeModules.includes(m)),
  }));
  useEffect(() => {
    // Modules arrive after the page: start from what the company has on.
    if (!wallet.cart && activeModules.length)
      setCart((c) =>
        c.modules.length
          ? c
          : { ...c, modules: BILLING_MODULES.filter((m) => activeModules.includes(m)) },
      );
  }, [activeModules, wallet.cart]);

  const q = useMemo(() => quote(cart, catalog), [cart, catalog]);
  const short = shortfall(q.total, wallet.balance, catalog.commissionPct);
  const commission = short.charge - short.credit;
  const [topup, setTopup] = useState("");
  const [legalOpen, setLegalOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const setSeats = (n: number) =>
    setCart((c) => ({ ...c, seats: Math.min(catalog.maxSeats, Math.max(1, Math.round(n) || 1)) }));
  const toggle = (m: BillingModule) =>
    setCart((c) => ({
      ...c,
      modules: c.modules.includes(m) ? c.modules.filter((x) => x !== m) : [...c.modules, m],
    }));

  async function pay(provider: "payme" | "click", credit: number) {
    try {
      const r = await act.mutateAsync({ action: "topup", provider, credit });
      if (r.payUrl) window.open(r.payUrl, "_blank", "noreferrer");
      toast.info(t("billing.payOpened", { p: provider === "click" ? "Click" : "Payme" }));
    } catch (e) {
      toast.error(describeError(e, t("billing.failed")));
    }
  }

  async function buy() {
    try {
      const r = await act.mutateAsync({ action: "purchase", cart });
      toast.success(t("billing.bought", { date: r.until ? formatDate(r.until) : "" }));
    } catch (e) {
      toast.error(describeError(e, t("billing.failed")));
    }
  }

  const plan = user?.orgPlan ? PLAN_LABELS[normalizePlan(user.orgPlan)] : "—";
  const ends = user?.orgTrialEndsAt ? formatDate(user.orgTrialEndsAt) : "—";
  const topupNum = Number(topup.replace(/\s/g, "")) || 0;
  const can = isAdmin && wallet.ready;

  return (
    <div className="space-y-4">
      {/* Sizning tanlovingiz */}
      <section className="rounded-2xl border border-border bg-card px-5 py-4">
        <p className="text-[15px] text-foreground">
          {t("billing.yourChoice")}: <b>{access.isTrial ? t("billing.trial") : plan}</b> —{" "}
          <span className="font-semibold text-primary">{t("billing.until", { date: ends })}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> {t("billing.activeStaff", { n: data.staff })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CircleCheck className="h-3.5 w-3.5" />
            {access.isExpired
              ? t("billing.expired")
              : access.isTrial
                ? t("billing.trialPhase")
                : t("billing.paidPhase")}
          </span>
          {access.trialDaysLeft != null && (
            <span className="inline-flex items-center gap-1.5 text-warning">
              <CalendarClock className="h-3.5 w-3.5" />{" "}
              {t("billing.daysLeft", { n: access.trialDaysLeft })}
            </span>
          )}
        </div>
      </section>

      {/* Hisob balansi */}
      <section className="rounded-2xl border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[12.5px] text-muted-foreground">{t("billing.balance")}</p>
              <p className="text-[26px] font-bold leading-tight tabular-nums text-foreground">
                {sum(wallet.balance)}{" "}
                <span className="text-[14px] font-medium text-muted-foreground">so'm</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[11.5px] text-muted-foreground">
                {t("billing.topupAmount", { pct: catalog.commissionPct })}
              </span>
              <input
                inputMode="numeric"
                value={topup}
                onChange={(e) => setTopup(e.target.value.replace(/[^\d\s]/g, ""))}
                placeholder={t("billing.amountPh")}
                className="h-10 w-44 rounded-xl border border-border bg-background px-3 text-[14px] tabular-nums outline-none focus:border-primary"
              />
            </label>
            {(["click", "payme"] as const).map((p) => (
              <Button
                key={p}
                variant="outline"
                disabled={!can || !data.providers[p] || act.isPending}
                onClick={() => {
                  if (topupNum < catalog.minTopup)
                    toast.error(t("billing.minTopup", { n: sum(catalog.minTopup) }));
                  else void pay(p, topupNum);
                }}
                className="h-10"
              >
                <img
                  src={`/brand/${p}.svg`}
                  alt=""
                  className="h-4 w-4"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
                {p === "click" ? "Click" : "Payme"}
              </Button>
            ))}
            <Button variant="outline" disabled className="h-10" title={t("billing.soon")}>
              Paynet
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {t("billing.balanceHint", { pct: catalog.commissionPct })}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="inline-flex items-center gap-2 text-[13px] text-foreground">
            <RefreshCw className="h-4 w-4 text-primary" />
            <b>{t("billing.autoRenew")}</b>
            <span className="text-muted-foreground">— {t("billing.autoRenewHint")}</span>
          </span>
          <Switch
            checked={wallet.autoRenew}
            disabled={!can || act.isPending}
            onCheckedChange={(on) =>
              act.mutate(
                { action: "autoRenew", on },
                { onError: (e) => toast.error(describeError(e, t("billing.failed"))) },
              )
            }
          />
        </div>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="mt-2 text-[12px] font-semibold text-primary hover:underline"
        >
          {showHistory
            ? t("billing.hideHistory")
            : t("billing.showHistory", { n: data.history.length })}
        </button>
        {showHistory && <History data={data} />}
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {/* Jamoangizda nechta xodim? */}
          <section className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-[16px] font-bold text-foreground">{t("billing.teamSize")}</h3>
              <div className="ctl-track inline-flex">
                {BILLING_PERIODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-selected={cart.months === m}
                    onClick={() => setCart((c) => ({ ...c, months: m as BillingPeriod }))}
                    className="ctl-tab px-3 py-1.5 text-[12.5px] font-semibold"
                  >
                    {t("billing.months", { n: m })}
                    {freeMonths(m) > 0 && (
                      <span className="ml-1 text-success">+{freeMonths(m)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex items-center rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setSeats(cart.seats - 1)}
                  className="grid h-10 w-10 place-items-center text-muted-foreground hover:text-foreground"
                  aria-label="−"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  inputMode="numeric"
                  value={cart.seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                  className="h-10 w-14 bg-transparent text-center text-[17px] font-bold tabular-nums outline-none"
                />
                <button
                  type="button"
                  onClick={() => setSeats(cart.seats + 1)}
                  className="grid h-10 w-10 place-items-center text-muted-foreground hover:text-foreground"
                  aria-label="+"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <input
                type="range"
                min={1}
                max={Math.min(catalog.maxSeats, 100)}
                value={Math.min(cart.seats, 100)}
                onChange={(e) => setSeats(Number(e.target.value))}
                className="h-2 flex-1 accent-[var(--primary)]"
              />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <SeatLine checked locked label={t("billing.crmSeat")} price={catalog.crmSeat} />
              <SeatLine
                checked={cart.modules.includes("telephony")}
                label={t("billing.telSeat")}
                price={catalog.modules.telephony.monthly}
                onToggle={() => toggle("telephony")}
              />
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-[12.5px] text-muted-foreground">
                {t("billing.forPeriod", { m: cart.months, n: cart.seats })}
              </p>
              <p className="text-[30px] font-bold leading-tight tabular-nums text-foreground">
                {sum(q.total)}{" "}
                <span className="text-[14px] font-medium text-muted-foreground">so'm</span>
              </p>
              <p className="text-[12.5px] text-muted-foreground">
                {t("billing.firstThen", { first: sum(q.firstMonth), next: sum(q.monthly) })}
              </p>
            </div>
          </section>

          {/* Modullar */}
          <section className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[16px] font-bold text-foreground">{t("billing.modulesTitle")}</h3>
              <p className="text-[12px] text-muted-foreground">{t("billing.modulesHint")}</p>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {BILLING_MODULES.filter((m) => m !== "telephony").map((m) => {
                const on = cart.modules.includes(m);
                const p = catalog.modules[m];
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggle(m)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                      on
                        ? "border-primary/60 bg-primary/[0.04]"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    <Switch checked={on} className="pointer-events-none mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-foreground">
                        {t(`billing.mod.${m}`)}
                      </span>
                      <span className="block text-[12px] leading-snug text-muted-foreground">
                        {t(`billing.mod.${m}.desc`)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[14px] font-bold tabular-nums text-foreground">
                        {sum(p.monthly)}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {PER_SEAT_MODULES.has(m) ? t("billing.perSeat") : t("billing.perMonth")}
                      </span>
                      {p.setup > 0 && (
                        <span className="block text-[11px] text-muted-foreground">
                          +{sum(p.setup)} {t("billing.setup")}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Narx hisobi */}
        <aside className="space-y-4 xl:sticky xl:top-4">
          <section className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-bold text-foreground">{t("billing.priceTitle")}</h3>
              <button
                type="button"
                onClick={() => setCart((c) => ({ ...c, modules: [] }))}
                className="text-[12px] font-semibold text-primary hover:underline"
              >
                {t("billing.clear")}
              </button>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-4 text-[11.5px] text-muted-foreground">
              <span />
              <span className="text-right">{t("billing.col1")}</span>
              <span className="text-right">{t("billing.col2")}</span>
            </div>
            <div className="divide-y divide-border">
              {q.lines.map((l) => (
                <div
                  key={l.key}
                  className="grid grid-cols-[1fr_auto_auto] gap-x-4 py-2 text-[13px]"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">
                      {l.key === "crm"
                        ? t("billing.crmSeat")
                        : l.key === "telephony"
                          ? t("billing.telSeat")
                          : t(`billing.mod.${l.key}`)}
                    </span>
                    {l.qty > 1 && (
                      <span className="block text-[11.5px] text-muted-foreground">
                        {l.qty} × {sum(l.unit)}
                      </span>
                    )}
                  </span>
                  <span className="text-right tabular-nums">{sum(l.first)}</span>
                  <span className="text-right tabular-nums">{sum(l.monthly)}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 py-2 text-[13.5px] font-bold">
                <span>{t("billing.sum")}</span>
                <span className="text-right tabular-nums">{sum(q.firstMonth)}</span>
                <span className="text-right tabular-nums">{sum(q.monthly)}</span>
              </div>
            </div>

            <div className="mt-2 rounded-xl bg-surface px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] text-muted-foreground">
                  {t("billing.forMonths", { n: cart.months })}
                  {q.bonusMonths > 0 && ` + ${t("billing.free", { n: q.bonusMonths })}`}
                </span>
                <span className="text-[22px] font-bold tabular-nums text-foreground">
                  {sum(q.total)}{" "}
                  <span className="text-[12px] font-medium text-muted-foreground">so'm</span>
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {sum(q.firstMonth)}
                {cart.months > 1 && ` + ${cart.months - 1} × ${sum(q.monthly)}`} = {sum(q.total)}
              </p>
            </div>

            <dl className="mt-3 space-y-1.5 text-[13px]">
              <Row label={t("billing.tariff")} value={sum(q.total)} />
              <Row
                label={t("billing.onBalance")}
                value={`− ${sum(Math.min(wallet.balance, q.total))}`}
              />
              {short.credit > 0 ? (
                <>
                  <div className="flex items-baseline justify-between pt-1 text-[14px] font-bold text-destructive">
                    <dt>{t("billing.short")}</dt>
                    <dd className="tabular-nums">{sum(short.credit)} so'm</dd>
                  </div>
                  <Row
                    label={t("billing.commission", { pct: catalog.commissionPct })}
                    value={`+ ${sum(commission)}`}
                  />
                  <Row label={t("billing.toPay")} value={`${sum(short.charge)} so'm`} bold />
                </>
              ) : (
                <div className="flex items-baseline justify-between pt-1 text-[14px] font-bold text-success">
                  <dt>{t("billing.enough")}</dt>
                  <dd>
                    <Check className="inline h-4 w-4" />
                  </dd>
                </div>
              )}
            </dl>

            <Button
              className="mt-3 h-11 w-full text-[14px]"
              disabled={!can || short.credit > 0 || act.isPending}
              onClick={() => void buy()}
            >
              {act.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("billing.buy")} →
            </Button>
            <p className="mt-1.5 text-center text-[11.5px] text-muted-foreground">
              {t("billing.buyHint")}
            </p>

            {short.credit > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-center text-[12px] font-semibold text-foreground">
                  {t("billing.payShort", { n: sum(short.charge) })}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(["click", "payme"] as const).map((p) => (
                    <Button
                      key={p}
                      variant="outline"
                      disabled={!can || !data.providers[p] || act.isPending}
                      onClick={() => void pay(p, Math.max(short.credit, catalog.minTopup))}
                    >
                      <CreditCard className="h-4 w-4" /> {p === "click" ? "Click" : "Payme"}
                    </Button>
                  ))}
                </div>
                <p className="text-center text-[11px] text-muted-foreground">
                  {t("billing.willLand", { n: sum(short.credit) })}
                </p>
              </div>
            )}

            <Button
              variant="outline"
              className="mt-3 w-full"
              disabled={!isAdmin}
              onClick={() => setLegalOpen(true)}
            >
              <Building2 className="h-4 w-4" /> {t("billing.legal")}
            </Button>
          </section>

          <Bonuses />
        </aside>
      </div>

      {legalOpen && <LegalDialog data={data} total={q.total} onClose={() => setLegalOpen(false)} />}
    </div>
  );
}

function SeatLine({
  checked,
  locked,
  label,
  price,
  onToggle,
}: {
  checked: boolean;
  locked?: boolean;
  label: string;
  price: number;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onToggle}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left",
        checked ? "border-primary/60 bg-primary/[0.04]" : "border-border hover:border-primary/40",
        locked && "cursor-default",
      )}
    >
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1 text-[13.5px] font-medium text-foreground">{label}</span>
      <span className="text-[13.5px] font-bold tabular-nums text-foreground">{sum(price)}</span>
    </button>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between",
        bold ? "font-bold text-foreground" : "text-muted-foreground",
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Bonuses() {
  const { t } = useI18n();
  const n = BONUS_GROUPS.reduce((s, g) => s + g.items.length, 0);
  return (
    <section className="rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-[15px] font-bold text-foreground">
          <Gift className="h-4 w-4 text-success" /> {t("billing.bonuses")}
        </h3>
        <span className="text-[11.5px] font-semibold text-success">
          {t("billing.bonusCount", { n })}
        </span>
      </div>
      <div className="mt-2 space-y-3">
        {BONUS_GROUPS.map((g) => (
          <div key={g.key}>
            <p className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
              {t(`billing.bg.${g.key}`)}
            </p>
            <ul className="mt-1 space-y-0.5">
              {g.items.map((i) => (
                <li key={i} className="flex items-center gap-2 text-[13px] text-foreground">
                  <Check className="h-3.5 w-3.5 shrink-0 text-success" /> {t(`billing.b.${i}`)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function History({ data }: { data: WalletData }) {
  const { t } = useI18n();
  if (!data.history.length)
    return <p className="mt-2 text-[12.5px] text-muted-foreground">{t("billing.noHistory")}</p>;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-[13px]">
        <tbody>
          {data.history.map((h) => (
            <tr key={h.id} className="border-t border-border">
              <td className="py-2 pr-3 text-muted-foreground tabular-nums">
                {formatDate(h.createdAt)}
              </td>
              <td className="py-2 pr-3">
                <span className="inline-flex items-center gap-1.5">
                  {h.amount >= 0 ? (
                    <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
                  )}
                  {t(`billing.tx.${h.kind}`)}
                  {h.provider && <span className="text-muted-foreground"> · {h.provider}</span>}
                  {h.note && <span className="text-muted-foreground"> · {h.note}</span>}
                </span>
              </td>
              <td
                className={cn(
                  "py-2 pr-3 text-right font-semibold tabular-nums",
                  h.amount >= 0 ? "text-success" : "text-foreground",
                )}
              >
                {h.amount >= 0 ? "+" : "−"}
                {sum(Math.abs(h.amount))}
              </td>
              <td className="py-2 text-right text-muted-foreground tabular-nums">
                {sum(h.balanceAfter)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LEGAL_FIELDS = [
  "name",
  "inn",
  "director",
  "phone",
  "address",
  "bank",
  "mfo",
  "account",
] as const;

function LegalDialog({
  data,
  total,
  onClose,
}: {
  data: WalletData;
  total: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const act = useWalletAction();
  const [f, setF] = useState<Record<string, string>>(() =>
    Object.fromEntries(LEGAL_FIELDS.map((k) => [k, data.wallet.legal[k] ?? ""])),
  );
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> {t("billing.legalTitle")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-muted-foreground">{t("billing.legalDesc")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {LEGAL_FIELDS.map((k) => (
            <label
              key={k}
              className={cn("block", (k === "name" || k === "address") && "sm:col-span-2")}
            >
              <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                {t(`billing.lf.${k}`)}
                {(k === "name" || k === "inn") && <span className="text-destructive"> *</span>}
              </span>
              <input
                value={f[k] ?? ""}
                onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))}
                inputMode={k === "inn" || k === "mfo" || k === "account" ? "numeric" : undefined}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px] outline-none focus:border-primary"
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-[13px] text-muted-foreground">
            {t("billing.legalSum")}:{" "}
            <b className="text-foreground tabular-nums">{sum(total)} so'm</b>
          </span>
          <Button
            disabled={act.isPending}
            onClick={() =>
              act.mutate(
                { action: "legal", legal: f },
                {
                  onSuccess: () => {
                    toast.success(t("billing.legalSent"));
                    onClose();
                  },
                  onError: (e) => toast.error(describeError(e, t("billing.failed"))),
                },
              )
            }
          >
            {act.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("billing.legalSubmit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
