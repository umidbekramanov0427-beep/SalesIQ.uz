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
// A clear chip above the page title: easy to spot and to hit, without
// competing with the page's own (filled) buttons.
const BACK_LINK =
  "group mb-5 inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-4 text-[13px] font-semibold text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.05)] transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export function AdminBackLink() {
  const { t } = useI18n();
  const previousPath = getPreviousPath();

  if (!previousPath || previousPath === "/admin") {
    return (
      <Link to="/admin" className={BACK_LINK}>
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />{" "}
        {t("admin.backToPanel")}
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
    <Link to={previousPath} className={BACK_LINK}>
      <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> {label}
    </Link>
  );
}
