import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, CheckCircle2, Loader2, Phone, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { useLinkTelegram } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";

export const Route = createFileRoute("/welcome/telegram")({
  head: () => ({ meta: [{ title: "Telegram botni ulash — SalesIQ" }] }),
  component: WelcomeTelegramPage,
});

// The step right after sign-up: link the Telegram bot (reports and
// notifications go there) and confirm the phone number by sharing it in
// the bot. The bot side is in telegram.webhook.ts (link code, then
// handlePhoneVerification). The page polls the profile until both are done.
function WelcomeTelegramPage() {
  const { t } = useI18n();
  const { user, refreshProfile } = useAuth();
  const link = useLinkTelegram();
  const [opened, setOpened] = useState(false);

  const linked = !!user?.telegramLinked;
  const verified = !!user?.phoneVerified;
  const done = linked && verified;

  useEffect(() => {
    if (!opened || done) return;
    const id = window.setInterval(() => void refreshProfile(), 3000);
    return () => window.clearInterval(id);
  }, [opened, done, refreshProfile]);

  async function connect() {
    // Opened before the request so the browser doesn't treat it as a popup.
    const tab = window.open("", "_blank");
    try {
      const { code, botUsername } = await link.mutateAsync();
      if (!botUsername) throw new Error(t("welcomeTg.noBot"));
      const url = `https://t.me/${botUsername}?start=${code}`;
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setOpened(true);
    } catch (err) {
      tab?.close();
      toast.error(describeError(err, t("welcomeTg.linkFailed")));
    }
  }

  const steps = [
    { icon: Send, title: t("welcomeTg.step1"), desc: t("welcomeTg.step1Desc"), ok: linked },
    { icon: Phone, title: t("welcomeTg.step2"), desc: t("welcomeTg.step2Desc"), ok: verified },
    { icon: BellRing, title: t("welcomeTg.step3"), desc: t("welcomeTg.step3Desc"), ok: done },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        icon={ShieldCheck}
        tone="sky"
        title={t("welcomeTg.title")}
        description={t("welcomeTg.desc")}
      />
      <SectionCard>
        <ol className="divide-y divide-border">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3 py-3.5 first:pt-1 last:pb-1">
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                  s.ok ? "bg-success/15 text-success" : "bg-primary/10 text-primary",
                )}
              >
                {s.ok ? <CheckCircle2 className="h-5 w-5" /> : <s.icon className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {i + 1}. {s.title}
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          {done ? (
            <Link
              to="/"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
            >
              <CheckCircle2 className="h-4 w-4" /> {t("welcomeTg.continue")}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              disabled={link.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#229ED9] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {link.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {linked ? t("welcomeTg.reopen") : t("welcomeTg.connect")}
            </button>
          )}
          {!done && (
            <Link
              to="/"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {t("welcomeTg.later")}
            </Link>
          )}
          {opened && !done && (
            <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("welcomeTg.waiting")}
            </span>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
