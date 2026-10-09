import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Laptop,
  LogOut,
  Moon,
  Pencil,
  Search,
  Settings2,
  Sun,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n, LANGS, LANG_SHORT, type Lang } from "@/lib/i18n";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { NAV_ITEMS, appRoleOf, canOpenPath, navItemsFor } from "@/lib/nav";
import { useCrmEnabled } from "@/lib/use-org-access";
import { SEARCH_CATALOG, catalogMatches } from "@/lib/search-catalog";
import { cn } from "@/lib/utils";
import { useGlobalLeadSearch, useMyOrganization } from "@/hooks/use-crm-data";

// amoCRM's account bar: opened from the logo, it drops over the working
// area (dimmed behind it) with the user, a search across the whole
// platform, the theme and the language. Replaces the old always-on top bar,
// so pages get that height back.

type Result = {
  key: string;
  group: "pages" | "settings" | "leads";
  icon: LucideIcon;
  label: string;
  hint?: string | undefined;
  go: () => void;
};

const ROLE_KEY: Record<string, string> = {
  super_admin: "admin.roleAdmin",
  platform_owner: "admin.roleAdmin",
  rop: "admin.roleRop",
  sotuv_menejeri: "admin.roleRep",
};

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex h-10 shrink-0 items-center gap-0.5 rounded-xl border border-border bg-muted/40 p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.label}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors",
            value === o.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.icon && <o.icon className="h-3.5 w-3.5" />}
          <span className={cn(o.icon && "hidden xl:inline")}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function AccountBar({
  open,
  onClose,
  onEditProfile,
}: {
  open: boolean;
  onClose: () => void;
  onEditProfile: () => void;
}) {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useTheme();
  const { user, signOut } = useAuth();
  const { data: org } = useMyOrganization();
  const navigate = useNavigate();
  const crmEnabled = useCrmEnabled();
  const role = appRoleOf(user);
  const isPlatformOwner = user?.role === "platform_owner";
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: leads = [], isFetching } = useGlobalLeadSearch(query, open);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const go = (to: string, search?: Record<string, string>) => {
    onClose();
    void navigate({ to, ...(search ? { search } : {}) } as never);
  };

  const results = useMemo<Result[]>(() => {
    const q = query.trim();
    const pages = isPlatformOwner
      ? NAV_ITEMS.filter((i) => i.platformOwnerOnly)
      : navItemsFor(role, crmEnabled);
    const pageResults: Result[] = pages
      .filter((i) => !q || catalogMatches(`${t(`nav.${i.to}`)} ${i.label} ${i.to}`, q))
      .slice(0, q ? 8 : 6)
      .map((i) => ({
        key: `p-${i.to}`,
        group: "pages",
        icon: i.icon,
        label: t(`nav.${i.to}`),
        go: () => go(i.to),
      }));
    if (!q) return pageResults;
    const rank = { rop: 1, super_admin: 2 } as const;
    const mine = role === "super_admin" ? 2 : role === "rop" ? 1 : 0;
    const settingResults: Result[] = SEARCH_CATALOG.filter(
      (c) =>
        !isPlatformOwner &&
        canOpenPath(role, c.to, crmEnabled) &&
        (!c.minRole || mine >= rank[c.minRole]) &&
        catalogMatches(`${t(c.labelKey)} ${c.keywords}`, q),
    )
      .slice(0, 8)
      .map((c) => ({
        key: `s-${c.to}-${c.section ?? ""}`,
        group: "settings",
        icon: Settings2,
        label: t(c.labelKey),
        hint: c.section ? t("nav./settings") : undefined,
        go: () => go(c.to, c.section ? { section: c.section } : undefined),
      }));
    const leadResults: Result[] = leads.map((l) => ({
      key: `l-${l.id}`,
      group: "leads",
      icon: UserRound,
      label: l.company_name || l.name,
      hint: [l.contact?.full_name, l.contact?.phone, l.funnel].filter(Boolean).join(" · "),
      go: () => {
        onClose();
        void navigate({
          to: "/crm/leads/$leadId",
          params: { leadId: l.id },
          search: { from: "funnels" },
        });
      },
    }));
    return [...pageResults, ...settingResults, ...leadResults];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, leads, role, crmEnabled, isPlatformOwner, t]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const groups: { key: Result["group"]; label: string }[] = [
    { key: "pages", label: query.trim() ? t("accountBar.pages") : t("accountBar.quick") },
    { key: "settings", label: t("accountBar.settings") },
    { key: "leads", label: t("accountBar.leads") },
  ];

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 z-40 bg-black/45 backdrop-blur-[2px] animate-in fade-in-0"
      />
      <div
        role="dialog"
        aria-label={t("accountBar.title")}
        className="absolute inset-x-3 top-2.5 z-50 animate-in fade-in-0 slide-in-from-top-2 md:inset-x-5"
      >
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-[0_16px_50px_rgba(0,0,0,0.28)] lg:flex-nowrap">
          {/* Who's signed in */}
          <div className="flex min-w-0 shrink-0 items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-[13px] font-bold text-primary">
              {user?.initials ?? "?"}
            </span>
            <div className="min-w-0 max-w-[180px] leading-tight">
              <p className="truncate text-[14px] font-bold text-foreground">{user?.name ?? "…"}</p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {[user?.role ? t(ROLE_KEY[user.role] ?? "") : "", org?.name]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <button
              type="button"
              onClick={onEditProfile}
              title={t("accountBar.editProfile")}
              aria-label={t("accountBar.editProfile")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={async () => {
                onClose();
                await signOut();
                void navigate({ to: "/login", replace: true });
              }}
              title={t("shell.signOut")}
              aria-label={t("shell.signOut")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          <span className="hidden h-8 w-px shrink-0 bg-border lg:block" />

          {/* Search across the platform */}
          <div className="relative order-last w-full min-w-0 lg:order-none lg:w-auto lg:flex-1">
            <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
              <Search className="h-4 w-4 shrink-0 text-subtle" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => window.setTimeout(() => setFocused(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(results.length - 1, a + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(0, a - 1));
                  } else if (e.key === "Enter") {
                    results[active]?.go();
                  }
                }}
                placeholder={t("accountBar.searchPlaceholder")}
                className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-subtle"
              />
              <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
                ⌘K
              </kbd>
            </div>

            <div
              className={cn(
                "absolute inset-x-0 top-full mt-2 max-h-[60vh]",
                (!focused || results.length === 0) && !query.trim() && "hidden",
              )}
            >
              <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 shadow-[0_16px_50px_rgba(0,0,0,0.25)]">
                {groups.map((g) => {
                  const items = results.filter((r) => r.group === g.key);
                  if (!items.length) return null;
                  return (
                    <div key={g.key} className="py-1">
                      <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-subtle">
                        {g.label}
                      </p>
                      {items.map((r) => {
                        const idx = results.indexOf(r);
                        return (
                          <button
                            key={r.key}
                            type="button"
                            onMouseEnter={() => setActive(idx)}
                            onClick={r.go}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                              idx === active ? "bg-primary/10" : "hover:bg-accent",
                            )}
                          >
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                              <r.icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium text-foreground">
                                {r.label}
                              </span>
                              {r.hint && (
                                <span className="block truncate text-[12px] text-muted-foreground">
                                  {r.hint}
                                </span>
                              )}
                            </span>
                            {idx === active && (
                              <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
                {query.trim().length >= 2 && !isFetching && results.length === 0 && (
                  <p className="px-3 py-6 text-center text-[13px] text-subtle">
                    {t("accountBar.nothing")}
                  </p>
                )}
                {query.trim().length >= 2 && isFetching && (
                  <p className="px-3 py-2 text-[12px] text-subtle">{t("common.loading")}</p>
                )}
              </div>
            </div>
          </div>

          {/* Theme and language */}
          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
            <Segmented<ThemeMode>
              label={t("shell.theme")}
              value={mode}
              onChange={setMode}
              options={[
                { value: "system", label: t("accountBar.themeAuto"), icon: Laptop },
                { value: "light", label: t("accountBar.themeLight"), icon: Sun },
                { value: "dark", label: t("accountBar.themeDark"), icon: Moon },
              ]}
            />
            <Segmented<Lang>
              label={t("shell.language")}
              value={lang}
              onChange={setLang}
              options={LANGS.map((l) => ({ value: l, label: LANG_SHORT[l] }))}
            />
            <button
              type="button"
              onClick={onClose}
              aria-label={t("accountBar.close")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
