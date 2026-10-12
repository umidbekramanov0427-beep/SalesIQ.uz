import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Send, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const DISMISS_KEY = "salesiq.tgReminderDismissedAt";
const DISMISS_FOR_MS = 3 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

// Until the Telegram bot is linked and the phone verified there (see
// /welcome/telegram), a thin bar on every page links to that step. It can
// be hidden for three days.
export function TelegramLinkReminder() {
  const { t } = useI18n();
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [hidden, setHidden] = useState(dismissedRecently);

  if (!user || user.role === "platform_owner") return null;
  if (user.telegramLinked && user.phoneVerified) return null;
  if (hidden || pathname.startsWith("/welcome")) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private mode: hide for this page view only.
    }
    setHidden(true);
  }

  return (
    <div className="flex items-center justify-center gap-2 border-b border-sky-500/25 bg-sky-500/10 px-4 py-2 text-[13px] text-foreground">
      <Send className="h-4 w-4 shrink-0 text-sky-600" />
      <span>{user.telegramLinked ? t("welcomeTg.reminderVerify") : t("welcomeTg.reminder")}</span>
      <Link
        to="/welcome/telegram"
        className="font-semibold text-sky-700 underline underline-offset-2 dark:text-sky-400"
      >
        {t("welcomeTg.reminderCta")}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("common.close")}
        className="ml-1 rounded p-0.5 text-subtle hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
