import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, KeyRound, Loader2, QrCode, Send, Smartphone, Users } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SectionCard, StatusChip } from "@/components/layout/Primitives";
import {
  usePickWorkGroups,
  useWorkGroupChoices,
  useWorkTelegramAccount,
  useWorkTelegramAction,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Sozlamalar → «Telegram akkauntim»: the person's own work Telegram account.
// Connected by the code Telegram sends, or by scanning a QR code from the
// phone (Telegram → Settings → Devices → Link Desktop Device). Its private
// chats then come into the CRM as leads and are answered from the lead
// card; Saved Messages, groups, channels and bots never come in.

type Step =
  | { kind: "idle" }
  | { kind: "code"; loginId: string; via: string }
  | { kind: "password"; loginId: string }
  | { kind: "qr"; loginId: string; svg: string | null; url: string };

const input =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] outline-none focus:border-primary/50 phone:text-[16px]";

export function WorkTelegramCard() {
  const { t } = useI18n();
  const { data, isLoading } = useWorkTelegramAccount();
  const act = useWorkTelegramAction();
  const [method, setMethod] = useState<"code" | "qr">("code");
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [phone, setPhone] = useState("+998 ");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmOff, setConfirmOff] = useState(false);
  const polling = useRef(false);

  // The QR code: ask every 2 s whether the phone scanned it (a fresh code
  // comes back when the old one expires).
  useEffect(() => {
    if (step.kind !== "qr") return;
    const id = window.setInterval(async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const r = await act.mutateAsync({ action: "qr-poll", loginId: step.loginId });
        if (r["status"] === "done") {
          toast.success(t("tgu.connected"));
          setStep({ kind: "idle" });
        } else if (r["status"] === "password") {
          setStep({ kind: "password", loginId: step.loginId });
        } else if (typeof r["svg"] === "string" || typeof r["url"] === "string") {
          setStep((s) =>
            s.kind === "qr"
              ? {
                  ...s,
                  svg: (r["svg"] as string | null) ?? s.svg,
                  url: (r["url"] as string) ?? s.url,
                }
              : s,
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("tgu.failed"));
        setStep({ kind: "idle" });
      } finally {
        polling.current = false;
      }
    }, 2000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind, step.kind === "qr" ? step.loginId : ""]);

  async function run(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tgu.failed"));
    }
  }

  const sendCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await act.mutateAsync({ action: "start", phone });
      setCode("");
      setStep({ kind: "code", loginId: String(r["loginId"]), via: String(r["via"] ?? "app") });
    });
  };

  const confirmCode = (e: FormEvent) => {
    e.preventDefault();
    if (step.kind !== "code") return;
    void run(async () => {
      const r = await act.mutateAsync({ action: "code", loginId: step.loginId, code, phone });
      if (r["needPassword"]) {
        setPassword("");
        setStep({ kind: "password", loginId: step.loginId });
        return;
      }
      toast.success(t("tgu.connected"));
      setStep({ kind: "idle" });
    });
  };

  const confirmPassword = (e: FormEvent) => {
    e.preventDefault();
    if (step.kind !== "password") return;
    void run(async () => {
      await act.mutateAsync({ action: "code", loginId: step.loginId, code: "", password, phone });
      toast.success(t("tgu.connected"));
      setPassword("");
      setStep({ kind: "idle" });
    });
  };

  const startQr = () =>
    void run(async () => {
      const r = await act.mutateAsync({ action: "qr-start" });
      setStep({
        kind: "qr",
        loginId: String(r["loginId"]),
        svg: (r["svg"] as string | null) ?? null,
        url: String(r["url"] ?? ""),
      });
    });

  const account = data?.account ?? null;
  const busy = act.isPending && !polling.current;

  return (
    <SectionCard
      icon={Send}
      tone="sky"
      title={t("tgu.title")}
      description={t("tgu.desc")}
      info={t("tgu.info")}
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : data && !data.ready ? (
        <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-200">
          {t("tgu.notReady")}
        </p>
      ) : account ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sky-500 text-white">
              <Send className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-foreground">
                {account.name || t("tgu.workAccount")}
                <StatusChip state={account.status === "ok" ? "ok" : "error"}>
                  {account.status === "ok" ? t("tgu.stateOk") : t("tgu.stateError")}
                </StatusChip>
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {[account.phone, account.username ? `@${account.username}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {account.status === "error" && account.lastError && (
                <p className="mt-1 text-[12.5px] text-rose-700 dark:text-rose-300">
                  {account.lastError}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setConfirmOff(true)}
              className="ctl-soft inline-flex h-10 items-center rounded-xl px-4 text-[13px] font-semibold text-rose-700 dark:text-rose-300"
            >
              {t("tgu.disconnect")}
            </button>
          </div>
          {account.status === "ok" && <GroupPicker />}
          <Rules />
        </div>
      ) : data && !data.configured ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-[13px] text-muted-foreground">
          {t("tgu.notConfigured")}
        </p>
      ) : (
        <div className="space-y-5">
          <div
            role="tablist"
            aria-label={t("tgu.method")}
            className="ctl-track inline-flex gap-1 rounded-xl p-1"
          >
            {(
              [
                ["code", Smartphone, t("tgu.byCode")],
                ["qr", QrCode, t("tgu.byQr")],
              ] as const
            ).map(([m, Icon, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={method === m}
                onClick={() => {
                  setMethod(m);
                  setStep({ kind: "idle" });
                }}
                className="ctl-tab inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold"
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {step.kind === "password" ? (
            <form onSubmit={confirmPassword} className="max-w-sm space-y-3">
              <label className="block space-y-1.5">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                  <KeyRound className="h-4 w-4 text-primary" />
                  {t("tgu.password")}
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={input}
                />
              </label>
              <p className="text-[12.5px] text-muted-foreground">{t("tgu.passwordHint")}</p>
              <SubmitButton busy={busy} disabled={!password}>
                {t("tgu.connect")}
              </SubmitButton>
            </form>
          ) : method === "code" ? (
            step.kind === "code" ? (
              <form onSubmit={confirmCode} className="max-w-sm space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-[13px] font-semibold text-foreground">
                    {t("tgu.codeLabel")}
                  </span>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className={cn(input, "text-[20px] font-semibold tracking-[0.3em]")}
                  />
                </label>
                <p className="text-[12.5px] text-muted-foreground">
                  {step.via === "sms" ? t("tgu.codeViaSms") : t("tgu.codeViaApp")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton busy={busy} disabled={code.length < 5}>
                    {t("tgu.confirm")}
                  </SubmitButton>
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await act.mutateAsync({ action: "resend", loginId: step.loginId });
                        toast.success(t("tgu.resent"));
                      })
                    }
                    className="ctl-soft h-11 rounded-xl px-4 text-[13px] font-semibold"
                  >
                    {t("tgu.resend")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep({ kind: "idle" })}
                    className="h-11 rounded-xl px-3 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {t("tgu.changePhone")}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={sendCode} className="max-w-sm space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-[13px] font-semibold text-foreground">
                    {t("tgu.phone")}
                  </span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={input}
                  />
                </label>
                <p className="text-[12.5px] text-muted-foreground">{t("tgu.phoneHint")}</p>
                <SubmitButton busy={busy} disabled={phone.replace(/\D/g, "").length < 9}>
                  {t("tgu.sendCode")}
                </SubmitButton>
              </form>
            )
          ) : step.kind === "qr" ? (
            <div className="flex flex-wrap items-start gap-6">
              <div className="grid h-[220px] w-[220px] place-items-center rounded-2xl border border-border bg-white p-2">
                {step.svg ? (
                  <img
                    src={`data:image/svg+xml;utf8,${encodeURIComponent(step.svg)}`}
                    alt={t("tgu.qrAlt")}
                    className="h-full w-full"
                  />
                ) : (
                  <p className="px-3 text-center text-[12.5px] text-slate-600">
                    {t("tgu.qrMissing")}
                  </p>
                )}
              </div>
              <ol className="max-w-sm list-decimal space-y-1.5 pl-5 text-[13.5px] text-foreground">
                <li>{t("tgu.qrStep1")}</li>
                <li>{t("tgu.qrStep2")}</li>
                <li>{t("tgu.qrStep3")}</li>
                <li className="list-none pt-1 text-[12.5px] text-muted-foreground">
                  <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />
                  {t("tgu.qrWaiting")}
                </li>
              </ol>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="max-w-md text-[13px] text-muted-foreground">{t("tgu.qrIntro")}</p>
              <SubmitButton busy={busy} onClick={startQr}>
                <QrCode className="h-4 w-4" />
                {t("tgu.showQr")}
              </SubmitButton>
            </div>
          )}
          <Rules />
        </div>
      )}
      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title={t("tgu.disconnectTitle")}
        description={t("tgu.disconnectDesc")}
        confirmLabel={t("tgu.disconnect")}
        destructive
        onConfirm={() =>
          void run(async () => {
            await act.mutateAsync({ action: "disconnect" });
            toast.success(t("tgu.disconnected"));
          })
        }
      />
    </SectionCard>
  );
}

function SubmitButton({
  busy,
  disabled,
  onClick,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={busy || disabled}
      className="ctl-lit inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-semibold disabled:opacity-50"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/** What comes into the CRM from the account, and what never does. */
function Rules() {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <p className="text-[13px] font-semibold text-foreground">{t("tgu.inTitle")}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {t("tgu.inText")}
        </p>
      </div>
      <div className="rounded-xl border border-amber-400/40 bg-amber-400/[0.06] px-4 py-3">
        <p className="text-[13px] font-semibold text-foreground">{t("tgu.outTitle")}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {t("tgu.outText")}
        </p>
      </div>
    </div>
  );
}

/**
 * Ish guruhlari: the account's Telegram groups; the ticked ones come into
 * Inbox → «Guruhlar» (their messages from now on) and can be written to
 * from there. Nothing is taken until a group is ticked.
 */
function GroupPicker() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const choices = useWorkGroupChoices(open);
  const pick = usePickWorkGroups();
  const [chosen, setChosen] = useState<Set<number> | null>(null);
  const list = choices.data ?? [];
  const selected = chosen ?? new Set(list.filter((g) => g.picked).map((g) => g.id));
  const pickedCount = list.filter((g) => g.picked).length;

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-300">
          <Users className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-foreground">
            {t("tgg.pickTitle")}
          </span>
          <span className="block text-[12.5px] text-muted-foreground">{t("tgg.pickDesc")}</span>
        </span>
        <span className="ctl-soft inline-flex h-9 shrink-0 items-center rounded-xl px-3.5 text-[13px] font-semibold">
          {open ? t("common.close") : t("tgg.choose")}
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3">
          {choices.isLoading ? (
            <p className="flex items-center gap-2 py-3 text-[13px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("tgg.loading")}
            </p>
          ) : choices.error ? (
            <p className="py-3 text-[13px] text-rose-700 dark:text-rose-300">
              {choices.error.message}
            </p>
          ) : list.length === 0 ? (
            <p className="py-3 text-[13px] text-muted-foreground">{t("tgg.none")}</p>
          ) : (
            <>
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {list.map((g) => {
                  const on = selected.has(g.id);
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(g.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                          on ? "bg-primary/[0.08]" : "hover:bg-accent/60",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                            on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border",
                          )}
                        >
                          {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground">
                          {g.title || "—"}
                        </span>
                        {g.members != null && (
                          <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                            {t("tgg.members", { n: g.members })}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={pick.isPending || chosen === null}
                  onClick={() =>
                    pick.mutate(
                      list
                        .filter((g) => selected.has(g.id))
                        .map((g) => ({ id: g.id, title: g.title })),
                      {
                        onSuccess: () => {
                          setChosen(null);
                          toast.success(t("tgg.saved"));
                        },
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                  className="ctl-lit inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold disabled:opacity-50"
                >
                  {pick.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("tgg.save")}
                </button>
                <span className="text-[12.5px] text-muted-foreground">
                  {t("tgg.pickedNow", { n: pickedCount })}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
