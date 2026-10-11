import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Copy,
  ExternalLink,
  History,
  Loader2,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  Send,
  Server,
  Settings2,
  ShieldAlert,
  Trash2,
  Unplug,
  Webhook,
  X,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneForwarded,
  Timer,
  Clock3,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill, StatCard } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PlanGate } from "@/components/PlanGate";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, timeAgo } from "@/lib/utils";
import { AmoCrmCard, Bitrix24Card } from "@/components/integrations/IntegrationCards";
import {
  TELEPHONY_PROVIDERS,
  getTelephonyProviderMeta,
  useAmoConnectionStatus,
  useBitrix24ConnectionStatus,
  useCreateWebhookDestination,
  useDeleteWebhookDestination,
  useDisconnectTelephony,
  useWebhookDestinationHistory,
  useWebhookDestinations,
  useProfilesRaw,
  useMissedCallSummary,
  useRefreshApiPullManagers,
  useSaveTelephonyCredentials,
  useSaveTelephonyExtensionLinks,
  useSyncPbxHistory,
  useTelephonyStatus,
  useTestApiPullHealth,
  useTestTelephonyConnection,
  useToggleWebhookDestination,
  useUnlinkManagerTelegram,
  type OutgoingWebhookEvent,
  type ProfileRow,
  type TelephonyCredentialsStatus,
  type TelephonyExtensionLink,
  type TelephonyFieldKey,
  type TelephonyProvider,
} from "@/hooks/use-crm-data";
import { CrmGate } from "@/components/CrmGate";

export const Route = createFileRoute("/admin/telephony")({
  head: () => ({
    meta: [
      { title: "Integratsiyalar — SalesIQ" },
      {
        name: "description",
        content: "Qo'ng'iroqlar, yozuvlar va xabarlar qaysi manbalardan kelishini boshqaring.",
      },
    ],
  }),
  component: () => (
    <CrmGate>
      <AdminTelephonyPage />
    </CrmGate>
  ),
});

const PROVIDER_ICONS: Record<TelephonyProvider, React.ComponentType<{ className?: string }>> = {
  telegram: Send,
  moizvonki: PhoneCall,
  binotel: PhoneCall,
  onlinepbx: PhoneCall,
  sipuni: Phone,
  freepbx: Server,
  issabel: Server,
  newtel: Phone,
  api_inbound: ArrowDownToLine,
  api_outbound: ArrowUpFromLine,
};

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const EMPTY_FORM: Record<TelephonyFieldKey, string> = {
  apiKey: "",
  apiSecret: "",
  pbxDomain: "",
  callerId: "",
  smsSenderName: "",
};

/* ------------------------------------------------------------------ */
/* Card grid                                                            */
/* ------------------------------------------------------------------ */

function ProviderCard({
  provider,
  selected,
  connected,
  onSelect,
}: {
  provider: TelephonyProvider;
  selected: boolean;
  connected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const meta = getTelephonyProviderMeta(provider);
  const Icon = PROVIDER_ICONS[provider];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "surface-card relative flex flex-col items-start gap-1.5 p-3 text-left transition-colors",
        selected ? "border-primary ring-1 ring-primary/40" : "hover:bg-accent",
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
            connected ? "bg-success/15 text-success" : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {connected && (
          <span className="shrink-0">
            <Pill tone="success">
              <CheckCircle2 className="mr-1 inline h-3 w-3" /> {t("telephony.connected")}
            </Pill>
          </span>
        )}
      </div>
      <div>
        <p className="text-[13px] font-bold leading-tight text-foreground sm:text-sm">
          {t(meta.labelKey)}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
          {t(meta.descriptionKey)}
        </p>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Shared "extension/operator code -> manager" mapping panel, reused by  */
/* Issabel, New-Tel, and both generic API cards.                        */
/* ------------------------------------------------------------------ */

function ExtensionLinksPanel({
  provider,
  links,
  codeLabel,
  codePlaceholder,
  title,
  description,
  profiles,
}: {
  provider: TelephonyProvider;
  links: TelephonyExtensionLink[];
  codeLabel: string;
  codePlaceholder: string;
  title: string;
  description: string;
  profiles: ProfileRow[];
}) {
  const { t } = useI18n();
  const save = useSaveTelephonyExtensionLinks();
  const [code, setCode] = useState("");
  const [profileId, setProfileId] = useState("");

  async function onAdd() {
    if (!code.trim() || !profileId) return;
    const next = [...links.filter((l) => l.code !== code.trim()), { code: code.trim(), profileId }];
    try {
      await save.mutateAsync({ provider, extensionLinks: next });
      setCode("");
      setProfileId("");
      toast.success(t("telephony.saveSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    }
  }

  async function onRemove(linkCode: string) {
    try {
      await save.mutateAsync({
        provider,
        extensionLinks: links.filter((l) => l.code !== linkCode),
      });
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    }
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <Pill tone="neutral">{links.length}</Pill>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={codePlaceholder}
          className="h-9 w-36 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
        />
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          className="h-9 min-w-[200px] rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">{t("telephony.pickManager")}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void onAdd()}
          disabled={!code.trim() || !profileId || save.isPending}
          className="inline-flex h-9 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" /> {t("telephony.addLink")}
        </button>
      </div>
      {links.length > 0 ? (
        <ul className="space-y-1.5">
          {links.map((link) => {
            const profile = profiles.find((p) => p.id === link.profileId);
            return (
              <li
                key={link.code}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-foreground">{link.code}</span>
                <span className="flex-1 truncate text-foreground">
                  {profile?.full_name ?? t("telephony.unknownManager")}
                </span>
                <button
                  type="button"
                  onClick={() => void onRemove(link.code)}
                  className="shrink-0 text-destructive/70 transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border py-3 text-center text-xs text-subtle">
          {codeLabel}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel: form-based providers (OnlinePBX/Sipuni inline, MoiZvonki/       */
/* Binotel gated behind "Yoqish").                                       */
/* ------------------------------------------------------------------ */

function CredentialsFormPanel({
  provider,
  status,
  gated,
}: {
  provider: TelephonyProvider;
  status: TelephonyCredentialsStatus | undefined;
  gated: boolean;
}) {
  const { t } = useI18n();
  const meta = getTelephonyProviderMeta(provider);
  const save = useSaveTelephonyCredentials();
  const disconnect = useDisconnectTelephony();
  const testConnection = useTestTelephonyConnection();
  const [form, setForm] = useState<Record<TelephonyFieldKey, string>>(EMPTY_FORM);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isConnected = !!status?.connected;

  useEffect(() => {
    setForm({
      ...EMPTY_FORM,
      pbxDomain: status?.pbxDomain ?? "",
      callerId: status?.callerId ?? "",
      smsSenderName: status?.smsSenderName ?? "",
    });
    setRevealed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  function setField(key: TelephonyFieldKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const missingRequired = meta.fields.some((f) => f.required && !form[f.key].trim());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (missingRequired) return;
    try {
      await save.mutateAsync({ provider, ...form });
      toast.success(t("telephony.saveSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    }
  }

  async function onTest() {
    try {
      const result = await testConnection.mutateAsync(provider);
      toast.success(
        result.pbxDomain
          ? t("telephony.testSuccess", { domain: result.pbxDomain })
          : t("telephony.testSuccessGeneric"),
      );
    } catch (err) {
      toast.error(describeError(err, t("telephony.testFailed")));
    }
  }

  async function onDisconnect() {
    try {
      await disconnect.mutateAsync(provider);
      toast.success(t("telephony.disconnectSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    } finally {
      setConfirmDisconnect(false);
    }
  }

  if (gated && !isConnected && !revealed) {
    const Icon = PROVIDER_ICONS[provider];
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </span>
        <p className="text-sm font-bold text-foreground">{t(`telephony.gateTitle.${provider}`)}</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {t(`telephony.gateDesc.${provider}`)}
        </p>
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t("telephony.enableButton")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {meta.fields.map((field) => (
            <label
              key={field.key}
              className={cn("space-y-1.5", field.key === "smsSenderName" && "sm:col-span-2")}
            >
              <span className="text-xs font-semibold text-muted-foreground">
                {t(field.labelKey)}
              </span>
              <input
                type={field.inputType ?? "text"}
                value={form[field.key]}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={save.isPending || missingRequired}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Settings2 className="h-4 w-4" />
            )}
            {t("telephony.testAndConnectButton")}
          </button>
          {isConnected && (
            <button
              type="button"
              onClick={() => void onTest()}
              disabled={testConnection.isPending}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              {testConnection.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Phone className="h-3.5 w-3.5" />
              )}
              {t("telephony.testButton")}
            </button>
          )}
          {isConnected && (
            <button
              type="button"
              onClick={() => setConfirmDisconnect(true)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Unplug className="h-3.5 w-3.5" />
              {t("telephony.disconnectButton")}
            </button>
          )}
        </div>
      </form>

      {isConnected && status?.connectedAt && (
        <p className="text-xs text-subtle">
          {t("telephony.connectedAtLabel")}: {timeAgo(status.connectedAt)}
        </p>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title={t("telephony.disconnectConfirmTitle")}
        description={t("telephony.disconnectConfirmDesc")}
        confirmLabel={t("telephony.disconnectButton")}
        onConfirm={() => void onDisconnect()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel: Telegram roster -- real, backed by profiles.telegram_chat_id.  */
/* ------------------------------------------------------------------ */

function TelegramRosterPanel({ profiles }: { profiles: ProfileRow[] }) {
  const { t } = useI18n();
  const unlink = useUnlinkManagerTelegram();
  const linkedCount = profiles.filter((p) => p.telegram_chat_id).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-foreground">Menejerlar Telegram ulanishlari</p>
        <Pill tone="neutral">
          {linkedCount}/{profiles.length} {t("telephony.linkedSuffix")}
        </Pill>
      </div>
      <p className="text-xs text-muted-foreground">
        Har bir xodim o'z Telegram akkauntini{" "}
        <a href="/settings" className="text-primary underline underline-offset-2">
          Sozlamalar
        </a>{" "}
        sahifasida o'zi ulaydi (botga kod yuborib) -- bu yerdan faqat holatni ko'rish va ulanishni
        bekor qilish mumkin.
      </p>
      <ul className="space-y-1.5">
        {profiles.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            <span className="truncate text-foreground">{p.full_name}</span>
            {p.telegram_chat_id ? (
              <div className="flex shrink-0 items-center gap-2">
                <Pill tone="success">
                  <CheckCircle2 className="mr-1 inline h-3 w-3" /> {t("telephony.connected")}
                </Pill>
                <button
                  type="button"
                  onClick={() => void unlink.mutateAsync(p.id)}
                  disabled={unlink.isPending}
                  className="text-xs font-semibold text-destructive hover:underline"
                >
                  {t("telephony.unlinkButton")}
                </button>
              </div>
            ) : (
              <Pill tone="neutral">{t("telephony.notConnected")}</Pill>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel: agent-token providers (FreePBX simple, Issabel monitor).       */
/* ------------------------------------------------------------------ */

const ISSABEL_STEPS = [
  {
    title: "Paketni tekshirish va ochish",
    desc: "E'lon qilingan checksum'ni tekshirib, toza relizni Issabel serverida oching.",
    code: "sha256sum -c metasell-issabel-agent-*.tar.gz.sha256\ntar -xzf metasell-issabel-agent-*.tar.gz",
  },
  {
    title: "Preflight va install'ni bajaring",
    desc: "O'zgarmas relizni o'rnatishdan oldin faqat o'qiydigan moslik tekshiruvini bajaring.",
    code: "sudo ./preflight.sh --install-check\nsudo ./install.sh",
  },
  {
    title: "Connect va faqat o'qish DB kirishini sozlang",
    desc: "Bir martalik tokenni agent env fayliga yozing, keyin SELECT-only DB foydalanuvchi rejasini alohida tekshiring.",
    code: "METASELL_CONNECT_BASE_URL=https://connect.metasell.ai/api/connect/v1\nMETASELL_ISSABEL_PROVISIONING_TOKEN=<provisioning-token>\nsudo ./provision-readonly-db-user.sh --plan",
  },
  {
    title: "Preflight va shadow rejimini ishga tushiring",
    desc: "Rollout preflight'ni bajaring va avtoyuklashni yoqmasdan ishga tushiring. Faqat nazorat qo'ng'iroqlari tekshirilgach avtoyuklashni yoqing.",
    code: "sudo ./rollout-preflight.sh\nsudo ./start-shadow.sh\ncurl -fsS http://127.0.0.1:18091/healthz",
  },
];

function AgentTokenPanel({
  provider,
  status,
  monitor,
  profiles,
}: {
  provider: TelephonyProvider;
  status: TelephonyCredentialsStatus | undefined;
  monitor: boolean;
  profiles: ProfileRow[];
}) {
  const { t } = useI18n();
  const save = useSaveTelephonyCredentials();
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const isConnected = !!status?.connected;

  async function onGenerate() {
    const token = generateToken();
    try {
      await save.mutateAsync({
        provider,
        apiKey: token,
        apiSecret: "",
        pbxDomain: "",
        callerId: "",
        smsSenderName: "",
      });
      setRevealedToken(token);
      toast.success(t("telephony.saveSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success(t("telephony.copied"));
  }

  if (!isConnected) {
    const Icon = PROVIDER_ICONS[provider];
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </span>
        <p className="text-sm font-bold text-foreground">{t(`telephony.gateTitle.${provider}`)}</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {t(`telephony.gateDesc.${provider}`)}
        </p>
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={save.isPending}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("telephony.generateTokenButton")
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Pill tone="neutral">{t("telephony.notConfiguredYet")}</Pill>
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={save.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
        >
          {save.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {t("telephony.refreshButton")}
        </button>
      </div>

      {revealedToken && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {t("telephony.provisioningTokenLabel")}
          </span>
          <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-xs text-foreground">{revealedToken}</code>
            <button
              type="button"
              onClick={() => void copy(revealedToken)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-destructive">{t("telephony.inboundKeyOnceHint")}</p>
        </div>
      )}

      {monitor && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ["AGENT VERSIYASI", "Noma'lum"],
              ["OXIRGI HEARTBEAT", "Hali yo'q"],
              ["MA'LUMOT QABUL QILISH BOSHI", "Boshlanmagan"],
              ["OXIRGI QO'NG'IROQLAR PAKETI", "Hali yo'q"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
                  {label}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-[13px] font-bold text-foreground">O'rnatish yo'riqnomasi</p>
            <p className="text-xs text-muted-foreground">
              Faqat tekshirilgan CentOS 7 self-contained paketdan foydalaning. Installer servisni
              ishga tushirmaydi va Issabel qo'ng'iroq ma'lumotlarini o'zgartirmaydi.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {ISSABEL_STEPS.map((step, i) => (
                <div key={step.title} className="rounded-xl border border-border bg-surface p-3">
                  <p className="text-xs font-semibold text-primary">{i + 1}-QADAM</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{step.desc}</p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-2 text-[11px] text-foreground">
                    {step.code}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-[13px] font-bold text-foreground">Agent operatsion monitoringi</p>
            <p className="text-xs text-muted-foreground">
              Alohida Issabel agenti yuboradigan maxfiy ma'lumotsiz ish ko'rsatkichlari. Qo'ng'iroq
              IDlari, raqamlar, yo'llar va hisob ma'lumotlari yuborilmaydi.
            </p>
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                ["RELIZ / BUILD / O'RNATISH", "Noma'lum"],
                ["OXIRGI HEARTBEAT", "Hali yo'q"],
                ["OXIRGI MUVAFFAQIYATLI CDR SO'ROVI", "Hali yo'q"],
                ["MANBALARGA KIRISH HOLATI", "Noma'lum"],
                ["AGENT QO'NG'IROQ HISOBLAGICHLARI", "0 topildi · 0 qabul qilindi"],
                ["YOZUVNI TOPISH DARAJASI", "Noma'lum"],
                ["YUKLASH NAVBATI / URINISHLAR", "0 navbatda"],
                ["OXIRGI SOLISHTIRISH", "0 kuzatildi · 0 o'zgardi"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-surface p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
                    {label}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <ExtensionLinksPanel
            provider={provider}
            links={status?.extensionLinks ?? []}
            codeLabel="Hali ichki raqamlar bog'lanmagan."
            codePlaceholder="101"
            title="Topilgan Issabel ichki raqamlari"
            description="Har bir faol Issabel ichki raqamini uning qo'ng'iroqlariga javobgar Connect menejeriga moslang."
            profiles={profiles}
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel: New-Tel -- webhook signing key + extension links.              */
/* ------------------------------------------------------------------ */

function NewTelPanel({
  status,
  profiles,
}: {
  status: TelephonyCredentialsStatus | undefined;
  profiles: ProfileRow[];
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const save = useSaveTelephonyCredentials();
  const [key, setKey] = useState("");

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/integrations/telephony/webhook?org=${user?.organizationId ?? ""}&provider=newtel`
      : "";

  async function onSave() {
    if (!key.trim()) return;
    try {
      await save.mutateAsync({
        provider: "newtel",
        apiKey: "",
        apiSecret: key.trim(),
        pbxDomain: "",
        callerId: "",
        smsSenderName: "",
      });
      toast.success(t("telephony.saveSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success(t("telephony.copied"));
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-bold text-foreground">Webhook sozlash</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          {[
            ["HOLAT", status?.connected ? "Configured" : "Not Configured"],
            ["WEBHOOK URL", webhookUrl],
            ["KALIT", status?.apiSecretSet ? "Saqlangan" : "Kiritilmagan"],
            ["OXIRGI WEBHOOK", status?.lastEventAt ? timeAgo(status.lastEventAt) : "Hali kelmagan"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border bg-surface p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
                {label}
              </p>
              <p className="mt-1 truncate text-xs font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            New-Teldagi imzo kaliti
          </span>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="New-Teldagi kalitni kiriting"
              className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={!key.trim() || save.isPending}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("telephony.saveKeyButton")
              )}
            </button>
            <button
              type="button"
              onClick={() => void copy(webhookUrl)}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <ExtensionLinksPanel
        provider="newtel"
        links={status?.extensionLinks ?? []}
        codeLabel="New-Tel bog'lanishlari hali yo'q."
        codePlaceholder="100, 103 yoki 104"
        title="Ichki raqamlarni bog'lash"
        description="New-Tel xodim ichki raqamini Connect menejeri bilan bog'lang."
        profiles={profiles}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel: generic API pull / push.                                      */
/* ------------------------------------------------------------------ */

function ApiPullPanel({
  status,
  profiles,
}: {
  status: TelephonyCredentialsStatus | undefined;
  profiles: ProfileRow[];
}) {
  const { t } = useI18n();
  const meta = getTelephonyProviderMeta("api_inbound");
  const save = useSaveTelephonyCredentials();
  const testHealth = useTestApiPullHealth();
  const refreshManagers = useRefreshApiPullManagers();
  const [form, setForm] = useState<Record<TelephonyFieldKey, string>>(EMPTY_FORM);
  const [editing, setEditing] = useState(!status?.connected);
  const [managerCount, setManagerCount] = useState<number | null>(null);
  const [showDocs, setShowDocs] = useState(false);

  useEffect(() => {
    setForm({
      ...EMPTY_FORM,
      pbxDomain: status?.pbxDomain ?? "",
      callerId: status?.callerId ?? "",
    });
    setEditing(!status?.connected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected]);

  function setField(key: TelephonyFieldKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const missingRequired = meta.fields.some((f) => f.required && !form[f.key].trim());

  async function onSave() {
    if (missingRequired) return;
    try {
      await save.mutateAsync({ provider: "api_inbound", ...form });
      setEditing(false);
      toast.success(t("telephony.saveSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    }
  }

  async function onTest() {
    try {
      await testHealth.mutateAsync();
      toast.success(t("telephony.testSuccessGeneric"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.testFailed")));
    }
  }

  async function onRefreshManagers() {
    try {
      const result = await refreshManagers.mutateAsync();
      setManagerCount(result.count);
      toast.success(t("telephony.saveSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.testFailed")));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowDocs((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" /> {t("telephony.docsButton")}
        </button>
        <button
          type="button"
          onClick={() => void onTest()}
          disabled={!status?.connected || testHealth.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          {testHealth.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          {t("telephony.testButton")}
        </button>
        <button
          type="button"
          onClick={() => void onRefreshManagers()}
          disabled={!status?.connected || refreshManagers.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          {refreshManagers.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {t("telephony.refreshManagersButton")}
        </button>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <Settings2 className="h-3.5 w-3.5" /> {t("telephony.editSettingsButton")}
        </button>
      </div>

      {showDocs && (
        <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground">
          Connect tashqi manbani uchta endpoint orqali o'qiydi: <code>GET /health</code>,{" "}
          <code>GET /managers</code> va <code>GET /calls</code>. So'rovlar{" "}
          <code>Authorization: Bearer &lt;token&gt;</code> sarlavhasi bilan yuboriladi.
        </div>
      )}

      {editing ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {meta.fields.map((field) => (
            <label key={field.key} className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {t(field.labelKey)}
              </span>
              <input
                type={field.inputType ?? "text"}
                value={form[field.key]}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={missingRequired || save.isPending}
            className="inline-flex h-10 w-fit items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:col-span-2"
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("telephony.saveButton")
            )}
          </button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-5">
          {[
            ["NOMI", "API connection"],
            ["BASE URL", status?.pbxDomain || "Kiritilmagan"],
            ["API TOKEN", status?.apiSecretSet ? "Saqlangan" : "Kiritilmagan"],
            ["MAXSUS SARLAVHALAR", status?.callerId || "Kiritilmagan"],
            ["HOLAT", status?.connected ? "Sozlangan" : "Sozlanmagan"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border bg-surface p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
                {label}
              </p>
              <p className="mt-1 truncate text-xs font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>
      )}

      {managerCount != null && (
        <p className="text-xs text-muted-foreground">
          {t("telephony.managersLoaded")}: {managerCount}
        </p>
      )}

      <ExtensionLinksPanel
        provider="api_inbound"
        links={status?.extensionLinks ?? []}
        codeLabel="Hali menejer bog'lanishi yo'q."
        codePlaceholder="manager_id"
        title="API menejerlar xaritasi"
        description="Mijoz tizimidagi tashqi manager_id qiymatlarini Connect menejerlari bilan bog'lang."
        profiles={profiles}
      />
    </div>
  );
}

function ApiPushPanel({
  status,
  profiles,
}: {
  status: TelephonyCredentialsStatus | undefined;
  profiles: ProfileRow[];
}) {
  const { t } = useI18n();
  const meta = getTelephonyProviderMeta("api_outbound");
  const save = useSaveTelephonyCredentials();
  const testConnection = useTestTelephonyConnection();
  const [form, setForm] = useState<Record<TelephonyFieldKey, string>>(EMPTY_FORM);
  const [showDocs, setShowDocs] = useState(false);

  useEffect(() => {
    setForm({ ...EMPTY_FORM, pbxDomain: status?.pbxDomain ?? "" });
  }, [status?.pbxDomain]);

  function setField(key: TelephonyFieldKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const missingRequired = meta.fields.some((f) => f.required && !form[f.key].trim());

  async function onSave() {
    if (missingRequired) return;
    try {
      await save.mutateAsync({ provider: "api_outbound", ...form });
      toast.success(t("telephony.saveSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    }
  }

  async function onTest() {
    try {
      await testConnection.mutateAsync("api_outbound");
      toast.success(t("telephony.testSuccessGeneric"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.testFailed")));
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success(t("telephony.copied"));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowDocs((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" /> {t("telephony.docsButton")}
        </button>
        <button
          type="button"
          onClick={() => setField("apiSecret", generateToken())}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
        >
          {t("telephony.generateButton")}
        </button>
        {status?.connected && (
          <button
            type="button"
            onClick={() => void onTest()}
            disabled={testConnection.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
          >
            {testConnection.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {t("telephony.testButton")}
          </button>
        )}
      </div>

      {showDocs && (
        <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground">
          Har bir yakunlangan qo'ng'iroq yoki uchrashuv uchun manzilga bitta POST so'rov yuboring,
          API kalit <code>X-API-Key</code> sarlavhasida bo'lsin. <code>operator_code</code> va{" "}
          <code>audio_url</code> majburiy; <code>client_id</code>, <code>client_name</code>,{" "}
          <code>manager_name</code>, <code>interaction_type</code> (call yoki meeting),{" "}
          <code>start_time</code>, <code>end_time</code>, <code>client_phone_number</code> va{" "}
          <code>call_type</code> ixtiyoriy.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {meta.fields.map((field) => (
          <label key={field.key} className="space-y-1.5 sm:col-span-2">
            <span className="text-xs font-semibold text-muted-foreground">{t(field.labelKey)}</span>
            <div className="flex items-center gap-2">
              <input
                type={field.inputType ?? "text"}
                value={form[field.key]}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                className="h-10 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
              />
              {field.key === "pbxDomain" && (
                <button
                  type="button"
                  onClick={() => void copy(form.pbxDomain)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </label>
        ))}
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={missingRequired || save.isPending}
          className="inline-flex h-10 w-fit items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:col-span-2"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("telephony.saveButton")
          )}
        </button>
      </div>

      <ExtensionLinksPanel
        provider="api_outbound"
        links={status?.extensionLinks ?? []}
        codeLabel="Hozircha menejerlar yo'q."
        codePlaceholder="operator_code"
        title="Menejerlarning operator kodlari"
        description="Qo'ng'iroq kerakli menejerga tushishi uchun operator_code maydonida shu qiymatlardan birini yuboring."
        profiles={profiles}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* OnlinePBX: where every call comes from -- the webhook, each           */
/* salesperson's extension, and pulling the PBX's own history.          */
/* ------------------------------------------------------------------ */

function OnlinePbxCallsPanel({
  status,
  profiles,
}: {
  status: TelephonyCredentialsStatus | undefined;
  profiles: ProfileRow[];
}) {
  const { user } = useAuth();
  const sync = useSyncPbxHistory();
  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/integrations/telephony/webhook?org=${user?.organizationId ?? ""}&provider=onlinepbx`
      : "";
  const [result, setResult] = useState<string | null>(null);

  async function pull() {
    const r = await sync.mutateAsync({ force: true, hours: 24 * 7 });
    if (r.error) toast.error(r.error);
    else toast.success(`OnlinePBX'dan ${r.synced ?? 0} ta qo'ng'iroq yuklandi`);
    setResult(r.error ?? `${r.synced ?? 0} ta qo'ng'iroq yuklandi`);
  }

  return (
    <div className="mt-6 space-y-5 border-t border-border pt-5">
      <div className="space-y-2">
        <p className="text-[13px] font-bold text-foreground">1. Har bir xodimning ichki raqami</p>
        <p className="text-xs text-muted-foreground">
          Platformadan qo'ng'iroq bosilganda OnlinePBX avval shu ichki raqamga (masalan 105)
          qo'ng'iroq qiladi, xodim go'shakni ko'targach mijozga ulaydi. Kiruvchi va javobsiz
          qo'ng'iroqlar ham shu raqam bo'yicha xodimga yoziladi.
        </p>
      </div>
      <ExtensionLinksPanel
        provider="onlinepbx"
        links={status?.extensionLinks ?? []}
        codeLabel="Hali ichki raqamlar bog'lanmagan."
        codePlaceholder="105"
        title="Ichki raqamlar"
        description="Har bir OnlinePBX ichki raqamini uning egasi bo'lgan xodimga moslang."
        profiles={profiles}
      />

      <div className="space-y-2">
        <p className="text-[13px] font-bold text-foreground">2. Webhook (real vaqtda)</p>
        <p className="text-xs text-muted-foreground">
          OnlinePBX paneli → Integratsiya → Webhook'ga shu manzilni qo'shing va qo'ng'iroq
          hodisalarini yoqing (qo'ng'iroq boshlandi, javob berildi, tugadi). Shunda har bir
          qo'ng'iroq darhol platformada ko'rinadi.
        </p>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-[12px] text-foreground">{webhookUrl}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(webhookUrl);
              toast.success("Nusxa olindi");
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-bold text-foreground">3. Qo'ng'iroqlar tarixi</p>
        <p className="text-xs text-muted-foreground">
          Webhook sozlanmagan bo'lsa ham, telefon oynasi ochilganda OnlinePBX tarixi avtomatik
          tortib olinadi. Oxirgi 7 kunni hozir yuklash uchun:
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={sync.isPending || !status?.connected}
            onClick={() => void pull()}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", sync.isPending && "animate-spin")} />
            Tarixni yuklash
          </button>
          {result && <span className="text-xs text-muted-foreground">{result}</span>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                              */
/* ------------------------------------------------------------------ */

function DetailPanel({
  provider,
  status,
  profiles,
}: {
  provider: TelephonyProvider;
  status: TelephonyCredentialsStatus | undefined;
  profiles: ProfileRow[];
}) {
  const meta = getTelephonyProviderMeta(provider);
  switch (meta.kind) {
    case "roster-telegram":
      return <TelegramRosterPanel profiles={profiles} />;
    case "pbx-inline":
      return (
        <>
          <CredentialsFormPanel provider={provider} status={status} gated={false} />
          {provider === "onlinepbx" && <OnlinePbxCallsPanel status={status} profiles={profiles} />}
        </>
      );
    case "pbx-gated":
      return <CredentialsFormPanel provider={provider} status={status} gated />;
    case "agent-token-simple":
      return (
        <AgentTokenPanel provider={provider} status={status} monitor={false} profiles={profiles} />
      );
    case "agent-token-monitor":
      return <AgentTokenPanel provider={provider} status={status} monitor profiles={profiles} />;
    case "webhook-signing":
      return <NewTelPanel status={status} profiles={profiles} />;
    case "api-pull":
      return <ApiPullPanel status={status} profiles={profiles} />;
    case "api-push":
      return <ApiPushPanel status={status} profiles={profiles} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Chiquvchi integratsiyalar (Outgoing integrations) tab -- pushes OUT   */
/* to amoCRM/Bitrix24 (real CRM sync, same cards as /integrations) and   */
/* to an org's own arbitrary webhook destinations (new, built here).    */
/* ------------------------------------------------------------------ */

type OutgoingKind = "amocrm" | "bitrix24" | "webhooks";

const OUTGOING_EVENT_OPTIONS: { key: OutgoingWebhookEvent; labelKey: string }[] = [
  { key: "call_created", labelKey: "telephony.webhookEventCallCreated" },
  { key: "recording_ready", labelKey: "telephony.webhookEventRecordingReady" },
  { key: "ai_analysis_done", labelKey: "telephony.webhookEventAiAnalysisDone" },
];

function OutgoingProviderCard({
  icon: Icon,
  label,
  description,
  connected,
  selected,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  connected: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "surface-card relative flex flex-col items-start gap-1.5 p-3 text-left transition-colors",
        selected ? "border-primary ring-1 ring-primary/40" : "hover:bg-accent",
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
            connected ? "bg-success/15 text-success" : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {connected && (
          <span className="shrink-0">
            <Pill tone="success">
              <CheckCircle2 className="mr-1 inline h-3 w-3" /> {t("telephony.connected")}
            </Pill>
          </span>
        )}
      </div>
      <div>
        <p className="text-[13px] font-bold leading-tight text-foreground sm:text-sm">{label}</p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
          {description}
        </p>
      </div>
    </button>
  );
}

function WebhookDestinationsPanel() {
  const { t } = useI18n();
  const { data: webhooks, isLoading } = useWebhookDestinations();
  const { data: history } = useWebhookDestinationHistory();
  const create = useCreateWebhookDestination();
  const toggle = useToggleWebhookDestination();
  const del = useDeleteWebhookDestination();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<OutgoingWebhookEvent>>(new Set());
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function toggleEvent(key: OutgoingWebhookEvent) {
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onAdd() {
    if (!name.trim() || !url.trim()) return;
    try {
      await create.mutateAsync({
        name: name.trim(),
        url: url.trim(),
        enabled: true,
        events: Array.from(events),
        headers: Object.fromEntries(
          headers.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value]),
        ),
      });
      setName("");
      setUrl("");
      setEvents(new Set());
      setHeaders([]);
      toast.success(t("telephony.webhookSaveSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.webhookSaveFailed")));
    }
  }

  async function onToggle(id: string, enabled: boolean) {
    try {
      await toggle.mutateAsync({ id, enabled });
    } catch (err) {
      toast.error(describeError(err, t("telephony.webhookToggleFailed")));
    }
  }

  async function onDelete(id: string) {
    try {
      await del.mutateAsync(id);
      toast.success(t("telephony.webhookDeleteSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.webhookDeleteFailed")));
    } finally {
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border border-border p-4">
        <p className="text-[13px] font-bold text-foreground">{t("telephony.webhookAddTitle")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("telephony.webhookNameLabel")}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("telephony.webhookNamePlaceholder")}
              className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("telephony.webhookDestUrlLabel")}
            </span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {t("telephony.webhookEventsLabel")}
          </span>
          <div className="flex flex-wrap gap-3">
            {OUTGOING_EVENT_OPTIONS.map((opt) => (
              <label
                key={opt.key}
                className="flex items-center gap-2 text-xs font-medium text-foreground"
              >
                <Switch
                  checked={events.has(opt.key)}
                  onCheckedChange={() => toggleEvent(opt.key)}
                />
                {t(opt.labelKey)}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("telephony.webhookHeadersLabel")}
            </span>
            <button
              type="button"
              onClick={() => setHeaders((hs) => [...hs, { key: "", value: "" }])}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="h-3 w-3" /> {t("telephony.webhookAddHeader")}
            </button>
          </div>
          {headers.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={h.key}
                onChange={(e) =>
                  setHeaders((hs) =>
                    hs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)),
                  )
                }
                placeholder={t("telephony.webhookHeaderKeyPlaceholder")}
                className="h-9 w-1/2 rounded-xl border border-border bg-surface px-3 text-xs text-foreground outline-none focus:border-primary"
              />
              <input
                value={h.value}
                onChange={(e) =>
                  setHeaders((hs) =>
                    hs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                  )
                }
                placeholder={t("telephony.webhookHeaderValuePlaceholder")}
                className="h-9 w-1/2 rounded-xl border border-border bg-surface px-3 text-xs text-foreground outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setHeaders((hs) => hs.filter((_, j) => j !== i))}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void onAdd()}
          disabled={!name.trim() || !url.trim() || create.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {create.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {t("telephony.webhookAddButton")}
        </button>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-[13px] font-bold text-foreground">{t("telephony.webhookListTitle")}</p>
        {isLoading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : !webhooks?.length ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            {t("telephony.webhookListEmpty")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {webhooks.map((w) => (
              <li
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{w.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{w.url}</p>
                  {w.events.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {w.events.map((ev) => (
                        <Pill key={ev} tone="info">
                          {t(
                            `telephony.webhookEvent${ev === "call_created" ? "CallCreated" : ev === "recording_ready" ? "RecordingReady" : "AiAnalysisDone"}`,
                          )}
                        </Pill>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch checked={w.enabled} onCheckedChange={(v) => void onToggle(w.id, v)} />
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(w.id)}
                    className="text-destructive/70 transition-colors hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
          <History className="h-3.5 w-3.5" /> {t("telephony.webhookHistoryTitle")}
        </p>
        {!history?.length ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            {t("telephony.webhookHistoryEmpty")}
          </p>
        ) : (
          <ul className="space-y-1">
            {history.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs"
              >
                <span className="font-mono text-foreground">{d.event}</span>
                <span className="text-muted-foreground">{timeAgo(d.createdAt)}</span>
                <Pill tone={d.status === "sent" ? "success" : "danger"}>
                  {d.status === "sent"
                    ? t("telephony.webhookStatusSent")
                    : t("telephony.webhookStatusFailed")}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(v) => !v && setConfirmDeleteId(null)}
        title={t("telephony.webhookDeleteConfirmTitle")}
        description={t("telephony.webhookDeleteConfirmDesc")}
        onConfirm={() => confirmDeleteId && void onDelete(confirmDeleteId)}
      />
    </div>
  );
}

function OutgoingIntegrationsTab() {
  const { t } = useI18n();
  const { data: amoStatus } = useAmoConnectionStatus();
  const { data: bitrixStatus } = useBitrix24ConnectionStatus();
  const { data: webhooks } = useWebhookDestinations();
  const [selected, setSelected] = useState<OutgoingKind>("amocrm");

  return (
    <div className="space-y-5">
      <SectionCard
        title={t("telephony.outgoingTab")}
        icon={PhoneOutgoing}
        tone="sky"
        description={t("telephony.outgoingDesc")}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <OutgoingProviderCard
            icon={ArrowUpFromLine}
            label={t("amocrm.settingsTitle")}
            description={t("telephony.outgoingAmoDesc")}
            connected={!!amoStatus}
            selected={selected === "amocrm"}
            onSelect={() => setSelected("amocrm")}
          />
          <OutgoingProviderCard
            icon={Server}
            label={t("bitrix24.settingsTitle")}
            description={t("telephony.outgoingBitrixDesc")}
            connected={!!bitrixStatus}
            selected={selected === "bitrix24"}
            onSelect={() => setSelected("bitrix24")}
          />
          <OutgoingProviderCard
            icon={Webhook}
            label={t("telephony.outgoingWebhooksLabel")}
            description={t("telephony.outgoingWebhooksDesc")}
            connected={!!webhooks?.some((w) => w.enabled)}
            selected={selected === "webhooks"}
            onSelect={() => setSelected("webhooks")}
          />
        </div>
      </SectionCard>

      {selected === "amocrm" && <AmoCrmCard />}
      {selected === "bitrix24" && <Bitrix24Card />}
      {selected === "webhooks" && (
        <SectionCard
          title={t("telephony.outgoingWebhooksLabel")}
          icon={Webhook}
          tone="slate"
          description={t("telephony.outgoingWebhooksDesc")}
        >
          <WebhookDestinationsPanel />
        </SectionCard>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                  */
/* ------------------------------------------------------------------ */

function MissedCallsCard() {
  const { t } = useI18n();
  const { data } = useMissedCallSummary(7);
  // Hidden until the missed-calls migration has run (the view is absent).
  if (!data) return null;
  const pct = (n: number) => (data.missed > 0 ? `${Math.round((n / data.missed) * 100)}%` : "—");
  return (
    <SectionCard
      title={t("missed.title")}
      icon={PhoneMissed}
      tone="rose"
      description={t("missed.desc")}
      className="mb-5"
    >
      {data.missed === 0 ? (
        <p className="text-sm text-muted-foreground">{t("missed.none")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("missed.count")}
            value={String(data.missed)}
            icon={PhoneMissed}
            iconTone="rose"
          />
          <StatCard
            label={t("missed.calledBack")}
            value={`${data.calledBack} · ${pct(data.calledBack)}`}
            icon={PhoneForwarded}
            iconTone="emerald"
          />
          <StatCard
            label={t("missed.within15")}
            value={`${data.calledBack15m} · ${pct(data.calledBack15m)}`}
            icon={Timer}
            iconTone="sky"
          />
          <StatCard
            label={t("missed.avgWait")}
            value={
              data.avgCallbackSeconds == null
                ? "—"
                : t("missed.minutes", {
                    n: String(Math.max(1, Math.round(data.avgCallbackSeconds / 60))),
                  })
            }
            icon={Clock3}
            iconTone="amber"
          />
        </div>
      )}
    </SectionCard>
  );
}

function IntegrationsPage() {
  const { t } = useI18n();
  const { data: statusMap, isLoading } = useTelephonyStatus();
  const { data: profiles } = useProfilesRaw();
  const [tab, setTab] = useState<"source" | "outgoing">("source");
  const [selected, setSelected] = useState<TelephonyProvider>("telegram");

  const meta = getTelephonyProviderMeta(selected);
  const status = statusMap?.[selected];

  return (
    <>
      <AdminBackLink />
      <PageHeader
        title={t("telephony.title")}
        icon={Phone}
        tone="sky"
        description={t("telephony.desc")}
      />

      <MissedCallsCard />

      <div className="mb-4 inline-flex rounded-xl border border-border bg-surface p-1">
        <button
          type="button"
          onClick={() => setTab("source")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            tab === "source"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("telephony.sourceTab")}
        </button>
        <button
          type="button"
          onClick={() => setTab("outgoing")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            tab === "outgoing"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("telephony.outgoingTab")}
        </button>
      </div>

      {tab === "outgoing" ? (
        <OutgoingIntegrationsTab />
      ) : isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <div className="space-y-5">
          <SectionCard
            title={t("telephony.sourceTab")}
            icon={PhoneIncoming}
            tone="sky"
            description={t("telephony.sourceDesc")}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {TELEPHONY_PROVIDERS.map((p) => (
                <ProviderCard
                  key={p.id}
                  provider={p.id}
                  selected={selected === p.id}
                  connected={
                    p.id === "telegram"
                      ? (profiles ?? []).some((pr) => pr.telegram_chat_id)
                      : !!statusMap?.[p.id]?.connected
                  }
                  onSelect={() => setSelected(p.id)}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title={t(meta.labelKey)}
            icon={Phone}
            tone="sky"
            description={t(meta.descriptionKey)}
          >
            <DetailPanel provider={selected} status={status} profiles={profiles ?? []} />
          </SectionCard>
        </div>
      )}
    </>
  );
}

function AdminTelephonyPage() {
  const { user } = useAuth();
  const { t } = useI18n();

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard
          icon={ShieldAlert}
          tone="rose"
          title={t("admin.restrictedTitle")}
          description={t("admin.restrictedDesc")}
        >
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
          </div>
        </SectionCard>
      </>
    );
  }

  return (
    <PlanGate feature="telephony">
      <IntegrationsPage />
    </PlanGate>
  );
}
