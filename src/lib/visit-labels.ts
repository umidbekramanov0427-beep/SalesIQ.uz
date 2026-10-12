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
  if (item.kind === "action" && isAlert(item.label))
    return t(`visits.alert.${item.label.slice(6)}`);
  if (item.kind === "action" && (TRAILED_ACTIONS as readonly string[]).includes(item.label))
    return t(`visits.act.${item.label}`);
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

/** Security alerts kept in a visit's timeline ("alert:<kind>" actions). */
export function isAlert(label: string): boolean {
  return label.startsWith("alert:");
}

/** Important actions the app names in the trail (lib/api.ts, lib/export-csv.ts). */
export const TRAILED_ACTIONS = [
  "report_export",
  "report_telegram",
  "call_analyze",
  "user_invite",
  "integration_connect",
  "ai_question",
  "bulk_message",
  "leads_merge",
  "telegram_link",
] as const;

export function actionLabel(label: string, t: T): string {
  if (label === "first_sign_in") return t("visits.firstSignIn");
  if (isAlert(label)) return t(`visits.alert.${label.slice(6)}`);
  return (TRAILED_ACTIONS as readonly string[]).includes(label) ? t(`visits.act.${label}`) : label;
}

/**
 * The platform's main features for a company's usage analysis: a feature
 * counts as used when one of its pages was opened or one of its actions done.
 */
export const FEATURES: { key: string; paths: string[]; actions: string[] }[] = [
  {
    key: "funnels",
    paths: ["/funnels", "/crm", "/lead-tasks", "/inbox"],
    actions: ["leads_merge"],
  },
  { key: "audio", paths: ["/audio-analytics"], actions: ["call_analyze"] },
  { key: "lead_analytics", paths: ["/lead-analytics", "/analytics"], actions: [] },
  { key: "attendance", paths: ["/attendance", "/normatives"], actions: [] },
  { key: "library", paths: ["/content-library"], actions: [] },
  { key: "ai", paths: ["/ai-assistant"], actions: ["ai_question"] },
  {
    key: "integrations",
    paths: ["/integrations", "/admin/telephony"],
    actions: ["integration_connect"],
  },
  { key: "reports", paths: [], actions: ["report_export", "report_telegram"] },
  { key: "team", paths: ["/admin/employees"], actions: ["user_invite"] },
  { key: "telegram", paths: ["/welcome/telegram"], actions: ["telegram_link"] },
];

export function featureUsage(
  pages: { path: string; count: number }[],
  actions: { label: string; count: number }[],
): { key: string; count: number }[] {
  return FEATURES.map((f) => {
    const opened = pages
      .filter((p) => f.paths.some((fp) => p.path === fp || p.path.startsWith(`${fp}/`)))
      .reduce((n, p) => n + p.count, 0);
    const done = actions
      .filter((a) => f.actions.includes(a.label))
      .reduce((n, a) => n + a.count, 0);
    return { key: f.key, count: opened + done };
  });
}

/** Page opens grouped by section (sidebar names), most used first. */
export function sectionUsage(pages: { path: string; count: number }[], t: T) {
  const map = new Map<string, number>();
  for (const p of pages) {
    const label = pageLabel(p.path, t);
    map.set(label, (map.get(label) ?? 0) + p.count);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}
