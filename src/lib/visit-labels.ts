import { Laptop, Smartphone, type LucideIcon } from "lucide-react";
import { NAV_LABEL_PATHS } from "@/lib/nav";

// Words for the platform owner's visits report (/platform/sessions and
// /platform/visit/$sessionId): device, place, duration and what each
// timeline entry means in plain language.

type T = (key: string, vars?: Record<string, string>) => string;

export function deviceIcon(device: string | null): LucideIcon {
  return /iOS|Android/.test(device ?? "") ? Smartphone : Laptop;
}

export function placeLabel(v: {
  city: string | null;
  region: string | null;
  country: string | null;
}) {
  const parts = [v.city, v.region && v.region !== v.city ? v.region : null, v.country].filter(
    Boolean,
  );
  return parts.length ? parts.join(", ") : null;
}

export function durationLabel(createdAt: string, lastSeenAt: string | null, t: T): string {
  const ms = new Date(lastSeenAt ?? createdAt).getTime() - new Date(createdAt).getTime();
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return t("visits.lessThanMinute");
  if (min < 60) return t("visits.minutes", { n: String(min) });
  const h = Math.floor(min / 60);
  return t("visits.hoursMinutes", { h: String(h), m: String(min % 60) });
}

export function pageLabel(path: string, t: T): string {
  if (path === "/") return t("nav./");
  const match = NAV_LABEL_PATHS.find((p) => p !== "/" && (path === p || path.startsWith(`${p}/`)));
  return match ? t(`nav.${match}`) : path;
}

const ENTITIES = [
  "leads",
  "tasks",
  "contacts",
  "companies",
  "lead_activities",
  "pipelines",
  "pipeline_stages",
  "profiles",
  "web_forms",
  "automations",
  "salesbots",
] as const;

/** One timeline entry of a visit, in words. */
export function timelineLabel(
  item: { kind: string; label: string; path: string | null },
  t: T,
): string {
  if (item.kind === "page") return pageLabel(item.path ?? item.label, t);
  if (item.kind === "action" && item.label === "first_sign_in") return t("visits.firstSignIn");
  if (item.kind === "blocked") {
    if (item.label.startsWith("page:"))
      return t("visits.blockedPage", { page: pageLabel(item.label.slice(5), t) });
    if (item.label.startsWith("feature:"))
      return t("visits.blockedFeature", { feature: item.label.slice(8) });
  }
  if (item.kind === "change") {
    const [action = "", entity = ""] = item.label.split(":");
    const what = (ENTITIES as readonly string[]).includes(entity)
      ? t(`visits.entity.${entity}`)
      : entity;
    const verb =
      action === "insert" || action === "create"
        ? t("visits.created")
        : action === "delete"
          ? t("visits.deleted")
          : t("visits.updated");
    return `${what} — ${verb}`;
  }
  return item.label;
}
