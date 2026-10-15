// A company's own sidebar (org_general_settings.sidebar_config): which of
// the standard sections it shows, which extra modules from the Admin panel
// it pins there, and in what order. The company's type (savdo bo'limi,
// B2B, o'quv markazi, ...) suggests a starting set. Pure, so it is tested.

export type BusinessType =
  "sales_team" | "call_center" | "b2b" | "online" | "education" | "real_estate" | "services";

export const BUSINESS_TYPES: BusinessType[] = [
  "sales_team",
  "call_center",
  "b2b",
  "online",
  "education",
  "real_estate",
  "services",
];

export type SidebarConfig = {
  /** Paths in the order the company wants them (missing ones keep the default order). */
  order: string[];
  /** Standard sections taken out of the sidebar. */
  hidden: string[];
  /** Extra modules put into the sidebar. */
  pinned: string[];
  businessType: BusinessType | null;
};

export const DEFAULT_SIDEBAR: SidebarConfig = {
  order: [],
  hidden: [],
  pinned: [],
  businessType: null,
};

/** Never hidden: the home page (and Settings / Admin, which sit outside the list). */
export const LOCKED_PATHS = new Set(["/"]);

/**
 * Extra modules each company type gets in its sidebar. They are only
 * suggestions: the admin turns any of them on or off afterwards.
 */
export const BUSINESS_PRESETS: Record<BusinessType, string[]> = {
  sales_team: ["/lead-tasks", "/sales-plan"],
  call_center: ["/lead-tasks", "/sales-plan"],
  b2b: ["/crm/companies", "/invoices", "/sales-plan"],
  online: ["/inbox", "/lead-tasks"],
  education: ["/inbox", "/lead-tasks"],
  real_estate: ["/crm/contacts", "/lead-tasks", "/sales-plan"],
  services: ["/inbox", "/crm/contacts", "/invoices"],
};

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : [];

/** Reads whatever is stored, tolerating a missing or malformed value. */
export function parseSidebarConfig(raw: unknown): SidebarConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SIDEBAR };
  const r = raw as Record<string, unknown>;
  const type = r["businessType"];
  return {
    order: strings(r["order"]),
    hidden: strings(r["hidden"]).filter((p) => !LOCKED_PATHS.has(p)),
    pinned: strings(r["pinned"]),
    businessType: BUSINESS_TYPES.includes(type as BusinessType) ? (type as BusinessType) : null,
  };
}

/** Switches to a company type: its suggested modules are pinned, the rest of the set stays. */
export function applyBusinessType(config: SidebarConfig, type: BusinessType): SidebarConfig {
  const previous = config.businessType ? BUSINESS_PRESETS[config.businessType] : [];
  // Modules the previous type had suggested go; ones the admin pinned by hand stay.
  const kept = config.pinned.filter((p) => !previous.includes(p));
  return {
    ...config,
    businessType: type,
    pinned: [...new Set([...kept, ...BUSINESS_PRESETS[type]])],
  };
}

export function toggleHidden(config: SidebarConfig, path: string): SidebarConfig {
  if (LOCKED_PATHS.has(path)) return config;
  const hidden = config.hidden.includes(path)
    ? config.hidden.filter((p) => p !== path)
    : [...config.hidden, path];
  return { ...config, hidden };
}

export function togglePinned(config: SidebarConfig, path: string): SidebarConfig {
  const pinned = config.pinned.includes(path)
    ? config.pinned.filter((p) => p !== path)
    : [...config.pinned, path];
  return { ...config, pinned };
}

type Orderable = { to: string };

/** The sections in the company's order: its own order first, the rest as they come. */
export function orderItems<T extends Orderable>(items: T[], order: string[]): T[] {
  const rank = new Map(order.map((p, i) => [p, i]));
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ra = rank.get(a.item.to);
      const rb = rank.get(b.item.to);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return a.i - b.i;
    })
    .map(({ item }) => item);
}

/**
 * Moves one section up (-1) or down (+1) among `visible` (the list as
 * shown) and returns the new full order.
 */
export function moveItem(visible: string[], path: string, dir: -1 | 1): string[] {
  const i = visible.indexOf(path);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= visible.length) return visible;
  const next = [...visible];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/**
 * What the sidebar shows: the standard sections the company didn't hide
 * plus the modules it pinned, in its order. `optional` marks a module
 * (shown only when pinned).
 */
export function resolveSidebar<T extends Orderable & { optional?: boolean }>(
  items: T[],
  config: SidebarConfig,
): T[] {
  const shown = items.filter((item) =>
    item.optional
      ? config.pinned.includes(item.to)
      : LOCKED_PATHS.has(item.to) || !config.hidden.includes(item.to),
  );
  return orderItems(shown, config.order);
}
