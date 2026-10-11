import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { guideForPath } from "@/lib/help/paths";
import { useI18n } from "@/lib/i18n";

// "Qo'llanma" in every page header: opens the guide for the page you're on.
export function GuideButton() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/help")) return null;
  const slug = guideForPath(pathname);
  if (!slug) return null;
  return (
    <Link
      data-tour="guide"
      to="/help/$slug"
      params={{ slug }}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      <BookOpen className="h-4 w-4" /> {t("help.button")}
    </Link>
  );
}
