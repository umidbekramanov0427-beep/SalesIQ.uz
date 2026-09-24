import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { getPreviousPath } from "@/lib/nav-history";
import { NAV_LABEL_PATHS } from "@/lib/nav";

// Every /admin/* sub-page (and /integrations) replaces its parent's own
// content via Outlet, so without this there's no way back short of the
// browser back button or the sidebar link. It used to always say/link
// "Admin panelga qaytish", which was wrong whenever the user actually
// arrived from somewhere else (e.g. Funnels -> lead fields settings) --
// now it names and links to wherever nav-history recorded as the real
// previous page, falling back to the admin panel only when that's
// unknown (a direct page load/refresh) or genuinely was /admin.
export function AdminBackLink() {
  const { t } = useI18n();
  const previousPath = getPreviousPath();

  if (!previousPath || previousPath === "/admin") {
    return (
      <Link
        to="/admin"
        className="mb-4 inline-flex items-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-500 shadow-soft transition-colors hover:border-amber-400/60 hover:bg-amber-400/20"
      >
        <ArrowLeft className="h-4 w-4" /> {t("admin.backToPanel")}
      </Link>
    );
  }

  const matchedPath = NAV_LABEL_PATHS.find(
    (p) => p === previousPath || (p !== "/" && previousPath.startsWith(p)),
  );
  const label = matchedPath
    ? t("admin.backToSection", { name: t(`nav.${matchedPath}`) })
    : t("admin.backGeneric");

  return (
    <Link
      to={previousPath}
      className="mb-4 inline-flex items-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-500 shadow-soft transition-colors hover:border-amber-400/60 hover:bg-amber-400/20"
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  );
}
