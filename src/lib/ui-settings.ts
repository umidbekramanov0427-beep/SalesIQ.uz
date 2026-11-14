import { parseClientNotify, type ClientNotifyRules } from "./client-notify";
import { compactCallSettings, parseCallSettings, type CallSettings } from "./call-settings";

// The gear (⚙️) on every card and page: the company's own choices for how
// its pages look and behave, kept in org_general_settings.ui_settings (the
// owner panel's in platform_settings.ui_settings). Company-wide: an admin or
// head of sales sets them, everyone in the company sees the same. Pure
// rules here; the hook is hooks/crm/ui-settings.ts.
//
//   cards[<page>|<card>]  hide a card, or warn when its figure falls below /
//                         rises above a limit (red), with "good" in green.
//   pages[<page>]         auto refresh, the filters a page opens with, and
//                         hidden table columns.

export type CardRule = {
  /** Hidden for everyone in the company (admins can bring it back). */
  hide?: boolean;
  /** Red when the figure is below this. */
  min?: number | null;
  /** Red when the figure is above this. */
  max?: number | null;
};

export type PageRule = {
  /** Seconds between automatic refreshes; 0 / absent = off. */
  refresh?: number;
  /** The filters (URL query, without "?") the page opens with. */
  filters?: string;
  /** Hidden table columns: table signature -> column keys. */
  columns?: Record<string, string[]>;
};

export type UiSettings = {
  cards: Record<string, CardRule>;
  pages: Record<string, PageRule>;
  /** Bosh sahifa's own card settings (formula, view, target... see home-card-settings.ts). */
  home: Record<string, Record<string, unknown>>;
  /** Client message notifications (client-notify.ts); absent = defaults. */
  notify?: ClientNotifyRules;
  /** Admin → Qo'ng'iroq sozlamalari (call-settings.ts); absent = defaults. */
  phone?: Partial<CallSettings>;
};

export const EMPTY_UI: UiSettings = { cards: {}, pages: {}, home: {} };

export const REFRESH_OPTIONS = [0, 30, 60, 300, 900] as const;

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Whatever is stored, as clean settings (unknown keys and bad values dropped). */
export function parseUiSettings(raw: unknown): UiSettings {
  const o = isObj(raw) ? raw : {};
  const cards: Record<string, CardRule> = {};
  if (isObj(o["cards"])) {
    for (const [k, v] of Object.entries(o["cards"])) {
      if (!isObj(v) || k.length > 300) continue;
      const r: CardRule = {};
      if (v["hide"] === true) r.hide = true;
      const min = num(v["min"]);
      const max = num(v["max"]);
      if (min != null) r.min = min;
      if (max != null) r.max = max;
      if (Object.keys(r).length) cards[k] = r;
    }
  }
  const pages: Record<string, PageRule> = {};
  if (isObj(o["pages"])) {
    for (const [k, v] of Object.entries(o["pages"])) {
      if (!isObj(v) || !k.startsWith("/") || k.length > 200) continue;
      const r: PageRule = {};
      const refresh = num(v["refresh"]);
      if (refresh && (REFRESH_OPTIONS as readonly number[]).includes(refresh)) r.refresh = refresh;
      if (typeof v["filters"] === "string" && v["filters"].length <= 2000 && v["filters"])
        r.filters = v["filters"].replace(/^\?/, "");
      if (isObj(v["columns"])) {
        const cols: Record<string, string[]> = {};
        for (const [sig, list] of Object.entries(v["columns"])) {
          if (!Array.isArray(list)) continue;
          const keys = list.filter((x): x is string => typeof x === "string" && x.length <= 120);
          if (keys.length) cols[sig] = keys.slice(0, 40);
        }
        if (Object.keys(cols).length) r.columns = cols;
      }
      if (Object.keys(r).length) pages[k] = r;
    }
  }
  const home: Record<string, Record<string, unknown>> = {};
  if (isObj(o["home"])) {
    for (const [k, v] of Object.entries(o["home"])) {
      if (isObj(v) && k.length <= 120 && Object.keys(v).length) home[k] = v;
    }
  }
  const out: UiSettings = { cards, pages, home };
  if (isObj(o["notify"])) out.notify = parseClientNotify(o["notify"]);
  if (isObj(o["phone"])) out.phone = compactCallSettings(parseCallSettings(o["phone"]));
  return out;
}

/** Settings with one Bosh sahifa card's own settings replaced (empty removes them). */
export function withHomeCard(
  s: UiSettings,
  id: string,
  value: Record<string, unknown>,
): UiSettings {
  const home = { ...s.home };
  if (Object.keys(value).length) home[id] = value;
  else delete home[id];
  return { ...s, home };
}

/** Settings with one card's rule replaced (an empty rule removes it). */
export function withCardRule(s: UiSettings, id: string, rule: CardRule): UiSettings {
  const cards = { ...s.cards };
  const clean: CardRule = {};
  if (rule.hide) clean.hide = true;
  if (rule.min != null && Number.isFinite(rule.min)) clean.min = rule.min;
  if (rule.max != null && Number.isFinite(rule.max)) clean.max = rule.max;
  if (Object.keys(clean).length) cards[id] = clean;
  else delete cards[id];
  return { ...s, cards };
}

/** Settings with one page's rule merged (undefined fields removed). */
export function withPageRule(s: UiSettings, page: string, patch: Partial<PageRule>): UiSettings {
  const next: PageRule = { ...(s.pages[page] ?? {}), ...patch };
  for (const k of Object.keys(next) as (keyof PageRule)[]) {
    const v = next[k];
    if (v == null || v === "" || v === 0 || (typeof v === "object" && !Object.keys(v).length))
      delete next[k];
  }
  const pages = { ...s.pages };
  if (Object.keys(next).length) pages[page] = next;
  else delete pages[page];
  return { ...s, pages };
}

/**
 * A page's key: its path with ids folded, so every lead card or company
 * page shares one set of settings ("/platform/organizations/:id").
 */
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

/** A label as a stable key part: lower-case letters and digits only. */
export function slug(text: string): string {
  return (
    text
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "card"
  );
}

/** A card's id: its page and its name (the name's i18n key when known). */
export const cardId = (page: string, name: string) => `${page}|${name}`;

/**
 * The figure a card shows, as a number: "15 000 000 so'm" -> 15000000,
 * "43%" -> 43, "72/100" -> 72, "-12,5" -> -12.5, "—" -> null.
 */
export function figureOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const m = value
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/[\u2212\u2013]/g, "-")
    .match(/[-+]?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type CardState = "bad" | "good" | null;

/** Red when the figure breaks a limit, green when it keeps every limit set. */
export function cardState(rule: CardRule | undefined, value: unknown): CardState {
  if (!rule || (rule.min == null && rule.max == null)) return null;
  const n = figureOf(value);
  if (n == null) return null;
  if (rule.min != null && n < rule.min) return "bad";
  if (rule.max != null && n > rule.max) return "bad";
  return "good";
}

/** A table's signature: its column names, so a hidden column follows the table. */
export function tableSignature(columns: string[]): string {
  const names = columns.filter((c) => /[\p{L}\p{N}]/u.test(c)).slice(0, 6);
  return names.length ? slug(names.join(" ")).slice(0, 80) : "table";
}
