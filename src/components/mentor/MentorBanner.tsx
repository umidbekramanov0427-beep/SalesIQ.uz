import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { internDay, tashkentToday } from "@/lib/intern-roadmap";
import { useMentorMessages } from "@/hooks/use-intern-mentor";

// The AI mentor's latest word to an intern, shown at the top of the home
// pages so it's the first thing they see after signing in. Dismissable for
// the rest of the day.
export function MentorBanner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isIntern = !!user?.isIntern;
  const { data: messages } = useMentorMessages(isIntern ? user?.id : null);
  const dismissKey = `salesos.mentor.banner.${user?.id ?? ""}`;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(dismissKey) === tashkentToday());
    } catch {
      setDismissed(false);
    }
  }, [dismissKey]);

  if (!isIntern || !user || dismissed) return null;
  const day = internDay(user.internshipStartDate);
  if (day == null || day > user.internshipDays) return null;
  const latest = [...(messages ?? [])].reverse().find((m) => m.sender === "mentor");

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/[0.06] p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Bot className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">
          {t("mentor.bannerTitle", { day, total: user.internshipDays })}
        </p>
        <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-foreground">
          {latest?.content ?? t("mentor.bannerLoading")}
        </p>
        <Link
          to="/mentor"
          className="mt-2 inline-flex rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          {t("mentor.openChat")}
        </Link>
      </div>
      <button
        type="button"
        aria-label={t("mentor.dismiss")}
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(dismissKey, tashkentToday());
          } catch {
            // ignore
          }
        }}
        className="rounded-lg p-1 text-subtle hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
