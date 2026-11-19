import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { InfoTip } from "@/components/layout/InfoTip";
import { loadTips } from "@/lib/help/tips-loader";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// A page's "!" beside its title: what the page is for and what can be done
// on it (the written explainer `page:<path>`, else `nav:<path>`).

/** A page's path with its ids folded to ":id", as the explainers are keyed. */
export function pageKey(pathname: string): string {
  const p =
    pathname
      .split("?")[0]!
      .split("/")
      .map((seg) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) || /^\d+$/.test(seg) || seg.length > 40
          ? ":id"
          : seg,
      )
      .join("/") || "/";
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

export function PageTools({
  title,
  description,
  className,
}: {
  title?: string | undefined;
  description?: string | undefined;
  /** Kept for the callers. */
  size?: "sm" | "md";
  className?: string | undefined;
}) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const page = pageKey(pathname);
  // The explainers load once the page has settled.
  useEffect(() => {
    const id = setTimeout(() => void loadTips(), 1200);
    return () => clearTimeout(id);
  }, []);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <InfoTip
        size="md"
        side="bottom"
        tipKeys={[`page:${page}`, `nav:${page}`]}
        text={description || t("info.fallback", { name: title ?? "" })}
        title={title}
        footer={<span className="text-[11.5px] text-subtle">{t("tipbox.guideHint")}</span>}
      />
    </span>
  );
}
