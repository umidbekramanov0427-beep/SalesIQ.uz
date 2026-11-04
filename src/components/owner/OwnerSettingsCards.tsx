import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CreditCard, Loader2, LifeBuoy, Send } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";

import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import {
  usePlatformSettings,
  usePlatformPaymentCredentials,
  useSavePlatformPaymentSettings,
  useUpdatePlatformSettings,
} from "@/hooks/use-crm-data";

// Owner panel → Sozlamalar: the platform-wide settings cards (the owner's
// own Payme/Click cashbox, support contacts, the bot short link).

export function SupportContactsCard() {
  const { t } = useI18n();
  const { data: settings } = usePlatformSettings();
  const update = useUpdatePlatformSettings();
  const [telegram, setTelegram] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (settings === undefined || hydrated) return;
    setTelegram(settings?.support_telegram ?? "");
    setPhone(settings?.support_phone ?? "");
    setEmail(settings?.support_email ?? "");
    setHydrated(true);
  }, [settings, hydrated]);

  async function save() {
    try {
      await update.mutateAsync({
        support_telegram: telegram.trim() || null,
        support_phone: phone.trim() || null,
        support_email: email.trim() || null,
      });
      toast.success(t("common.saved"));
    } catch (err) {
      toast.error(describeError(err, t("common.saveFailed")));
    }
  }

  return (
    <SectionCard
      icon={LifeBuoy}
      tone="violet"
      title={t("platform.supportContactsTitle")}
      description={t("platform.supportContactsDesc")}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Telegram</span>
          <input
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            placeholder="@sizning_bot"
            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">{t("trial.phone")}</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998901234567"
            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="support@salesiq.uz"
            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={update.isPending}
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {t("common.save")}
      </button>
    </SectionCard>
  );
}

type PlatformBot = { id: string; name: string; enabled: boolean; organizationName: string };

// Which salesbot the shared bot's plain link (t.me/<bot>, no ?start=)
// opens -- so a short link can go into ads and bios. Anyone who isn't
// staff or an existing customer and presses Start lands in it.
export function BotShortLinkCard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const bots = useQuery({
    queryKey: ["platform", "salesbots"],
    queryFn: async () => {
      const res = await apiFetch("/platform/salesbots");
      const body = (await res.json()) as {
        defaultId?: string | null;
        bots?: PlatformBot[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return { defaultId: body.defaultId ?? null, bots: body.bots ?? [] };
    },
  });
  const save = useMutation({
    mutationFn: async (botId: string | null) => {
      const res = await apiFetch("/platform/salesbots", {
        method: "POST",
        body: JSON.stringify({ botId }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    },
    onSuccess: () => {
      toast.success(t("common.saved"));
      void qc.invalidateQueries({ queryKey: ["platform", "salesbots"] });
      void qc.invalidateQueries({ queryKey: ["salesbot-link"] });
    },
    onError: (err) => toast.error(describeError(err, t("common.saveFailed"))),
  });
  const current = bots.data?.bots.find((b) => b.id === bots.data?.defaultId) ?? null;

  return (
    <SectionCard
      icon={Send}
      tone="sky"
      title={t("platform.botLinkTitle")}
      description={t("platform.botLinkDesc")}
    >
      {bots.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      ) : bots.error ? (
        <p className="text-sm text-destructive">
          {describeError(bots.error, t("sb.share.failed"))}
        </p>
      ) : (
        <div className="space-y-3">
          <select
            value={bots.data?.defaultId ?? ""}
            disabled={save.isPending}
            onChange={(e) => save.mutate(e.target.value || null)}
            className="h-10 w-full max-w-xl rounded-lg border border-border bg-background px-3 text-sm font-medium outline-none focus:border-primary/40"
          >
            <option value="">{t("platform.botLinkNone")}</option>
            {(bots.data?.bots ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.organizationName} · {b.name}
                {b.enabled ? "" : ` (${t("platform.botLinkOff")})`}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {current
              ? t("platform.botLinkActive", { name: current.name })
              : t("platform.botLinkHint")}
          </p>
        </div>
      )}
    </SectionCard>
  );
}

// The platform's own Payme/Click merchant account, used by every tenant
// org to pay for its SalesIQ subscription (see /billing) -- one shared
// account, not the per-org kind other integrations on this platform have.
export function PlatformPaymentSettingsCard() {
  const { t } = useI18n();
  const { data: creds } = usePlatformPaymentCredentials();
  const save = useSavePlatformPaymentSettings();
  const [priceStartIqUzs, setPriceStartIqUzs] = useState("");
  const [priceAnalystIqUzs, setPriceAnalystIqUzs] = useState("");
  const [priceMasterIqUzs, setPriceMasterIqUzs] = useState("");
  const [extraSeatPriceUzs, setExtraSeatPriceUzs] = useState("");
  const [paymeMerchantId, setPaymeMerchantId] = useState("");
  const [paymeSecretKey, setPaymeSecretKey] = useState("");
  const [clickServiceId, setClickServiceId] = useState("");
  const [clickMerchantId, setClickMerchantId] = useState("");
  const [clickSecretKey, setClickSecretKey] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (creds === undefined || hydrated) return;
    setPriceStartIqUzs(creds.priceStartIqUzs ? String(creds.priceStartIqUzs) : "");
    setPriceAnalystIqUzs(creds.priceAnalystIqUzs ? String(creds.priceAnalystIqUzs) : "");
    setPriceMasterIqUzs(creds.priceMasterIqUzs ? String(creds.priceMasterIqUzs) : "");
    setExtraSeatPriceUzs(creds.extraSeatPriceUzs ? String(creds.extraSeatPriceUzs) : "");
    setPaymeMerchantId(creds.paymeMerchantId);
    setClickServiceId(creds.clickServiceId);
    setClickMerchantId(creds.clickMerchantId);
    setHydrated(true);
  }, [creds, hydrated]);

  async function saveSettings() {
    try {
      await save.mutateAsync({
        priceStartIqUzs: priceStartIqUzs ? Number(priceStartIqUzs) : 0,
        priceAnalystIqUzs: priceAnalystIqUzs ? Number(priceAnalystIqUzs) : 0,
        priceMasterIqUzs: priceMasterIqUzs ? Number(priceMasterIqUzs) : 0,
        extraSeatPriceUzs: extraSeatPriceUzs ? Number(extraSeatPriceUzs) : 0,
        paymeMerchantId,
        paymeSecretKey: paymeSecretKey.trim() || undefined,
        clickServiceId,
        clickMerchantId,
        clickSecretKey: clickSecretKey.trim() || undefined,
      });
      setPaymeSecretKey("");
      setClickSecretKey("");
      toast.success(t("common.saved"));
    } catch (err) {
      toast.error(describeError(err, t("common.saveFailed")));
    }
  }

  return (
    <SectionCard
      icon={CreditCard}
      tone="emerald"
      title={t("platform.paymentSettingsTitle")}
      description={t("platform.paymentSettingsDesc")}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Start IQ (so'm/oy)</span>
            <input
              type="number"
              value={priceStartIqUzs}
              onChange={(e) => setPriceStartIqUzs(e.target.value)}
              placeholder="0"
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Analyst IQ (so'm/oy)</span>
            <input
              type="number"
              value={priceAnalystIqUzs}
              onChange={(e) => setPriceAnalystIqUzs(e.target.value)}
              placeholder="0"
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Master IQ (so'm/oy)</span>
            <input
              type="number"
              value={priceMasterIqUzs}
              onChange={(e) => setPriceMasterIqUzs(e.target.value)}
              placeholder="0"
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              {t("platform.extraSeatPriceLabel")}
            </span>
            <input
              type="number"
              value={extraSeatPriceUzs}
              onChange={(e) => setExtraSeatPriceUzs(e.target.value)}
              placeholder="0"
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Payme merchant ID</span>
            <input
              value={paymeMerchantId}
              onChange={(e) => setPaymeMerchantId(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Payme secret key{creds?.paymeSecretKeySet ? ` (${t("common.saved")})` : ""}
            </span>
            <input
              type="password"
              value={paymeSecretKey}
              onChange={(e) => setPaymeSecretKey(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Click service ID</span>
            <input
              value={clickServiceId}
              onChange={(e) => setClickServiceId(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Click merchant ID</span>
            <input
              value={clickMerchantId}
              onChange={(e) => setClickMerchantId(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">
              Click secret key{creds?.clickSecretKeySet ? ` (${t("common.saved")})` : ""}
            </span>
            <input
              type="password"
              value={clickSecretKey}
              onChange={(e) => setClickSecretKey(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={save.isPending}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("common.save")}
        </button>
      </div>
    </SectionCard>
  );
}
