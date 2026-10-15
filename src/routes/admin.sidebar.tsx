import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  Building,
  Check,
  GraduationCap,
  Headphones,
  Home as HomeIcon,
  Loader2,
  Lock,
  PanelLeft,
  RotateCcw,
  ShieldAlert,
  ShoppingBag,
  Store,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import { useSaveSidebarConfig, useSidebarConfig } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { MODULE_NAV_ITEMS, NAV_ITEMS, appRoleOf, type NavItem } from "@/lib/nav";
import {
  applyBusinessType,
  BUSINESS_PRESETS,
  BUSINESS_TYPES,
  DEFAULT_SIDEBAR,
  LOCKED_PATHS,
  moveItem,
  resolveSidebar,
  toggleHidden,
  togglePinned,
  type BusinessType,
  type SidebarConfig,
} from "@/lib/sidebar-config";
import { TONE_TEXT } from "@/lib/tones";
import { useCrmEnabled } from "@/lib/use-org-access";
import { cn, describeError } from "@/lib/utils";

export const Route = createFileRoute("/admin/sidebar")({
  head: () => ({ meta: [{ title: "Yon menyu — SalesIQ" }] }),
  component: AdminSidebarPage,
});

const TYPE_ICON: Record<BusinessType, LucideIcon> = {
  sales_team: Users,
  call_center: Headphones,
  b2b: Briefcase,
  online: ShoppingBag,
  education: GraduationCap,
  real_estate: Building,
  services: Wrench,
};

// Sections every company starts with (the sidebar's own list, without
// Settings / Admin, which always sit at the bottom).
const GROUP_RANK = (g: NavItem["group"]) =>
  g === "general" ? 1 : g === "analysis" ? 2 : g === "control" ? 3 : 0;

/** Sorts by the sidebar's groups, keeping the order inside each group. */
function groupOrder(items: NavItem[]): NavItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => GROUP_RANK(a.item.group) - GROUP_RANK(b.item.group) || a.i - b.i)
    .map(({ item }) => item);
}

const STANDARD = NAV_ITEMS.filter(
  (i) => !i.platformOwnerOnly && i.to !== "/settings" && i.to !== "/admin",
);

function AdminSidebarPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard
          icon={ShieldAlert}
          tone="rose"
          title={t("admin.restrictedTitle")}
          description={t("admin.restrictedDesc")}
        >
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
          </div>
        </SectionCard>
      </>
    );
  }
  // The admin layout (admin.tsx) already wraps this page.
  return <SidebarEditor />;
}

// The company's sidebar: pick the company type (suggests modules), show or
// hide each standard section, pin extra modules, and order them -- with a
// live preview of the result. Nothing changes until "Saqlash".
function SidebarEditor() {
  const { t } = useI18n();
  const crmEnabled = useCrmEnabled();
  const saved = useSidebarConfig();
  const save = useSaveSidebarConfig();
  const [draft, setDraft] = useState<SidebarConfig>(saved);
  const savedKey = JSON.stringify(saved);
  useEffect(() => setDraft(JSON.parse(savedKey) as SidebarConfig), [savedKey]);
  const dirty = JSON.stringify(draft) !== savedKey;

  const available = useMemo(
    () => [...STANDARD, ...MODULE_NAV_ITEMS].filter((i) => crmEnabled || !i.crmOnly),
    [crmEnabled],
  );
  // What the sidebar shows, grouped the way it draws them (ungrouped,
  // then Asosiy / Tahlil / Nazorat); arrows move within a group.
  const shown = groupOrder(resolveSidebar(available, draft));
  const shownPaths = shown.map((i) => i.to);
  const hiddenStandard = STANDARD.filter(
    (i) => (crmEnabled || !i.crmOnly) && !shownPaths.includes(i.to),
  );
  const unpinned = MODULE_NAV_ITEMS.filter(
    (i) => (crmEnabled || !i.crmOnly) && !shownPaths.includes(i.to),
  );

  const toggle = (item: NavItem) =>
    setDraft((d) => (item.optional ? togglePinned(d, item.to) : toggleHidden(d, item.to)));
  const move = (path: string, dir: -1 | 1) => {
    const group = shown.find((i) => i.to === path)?.group;
    const segment = shown.filter((i) => i.group === group).map((i) => i.to);
    const moved = moveItem(segment, path, dir);
    let k = 0;
    const order = shown.map((i) => (i.group === group ? moved[k++]! : i.to));
    setDraft((d) => ({ ...d, order }));
  };
  const sameGroup = (i: number, j: number) => !!shown[j] && shown[j]!.group === shown[i]!.group;

  async function onSave() {
    try {
      await save.mutateAsync(draft);
      toast.success(t("sidebarCfg.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === "MIGRATION_PENDING"
          ? t("sidebarCfg.migrationPending")
          : describeError(err, t("sidebarCfg.saveFailed")),
      );
    }
  }

  return (
    <>
      <PageHeader
        icon={PanelLeft}
        tone="violet"
        title={t("sidebarCfg.title")}
        description={t("sidebarCfg.desc")}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <SectionCard
            icon={Store}
            tone="amber"
            title={t("sidebarCfg.typeTitle")}
            description={t("sidebarCfg.typeDesc")}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BUSINESS_TYPES.map((type) => {
                const Icon = TYPE_ICON[type];
                const active = draft.businessType === type;
                const adds = BUSINESS_PRESETS[type]
                  .filter((p) => available.some((i) => i.to === p))
                  .map((p) => t(`nav.${p}`));
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDraft((d) => applyBusinessType(d, type))}
                    aria-pressed={active}
                    className={cn(
                      "relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-surface hover:border-primary/40",
                    )}
                  >
                    {active && (
                      <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="text-[15px] font-bold text-foreground">
                      {t(`sidebarCfg.type.${type}`)}
                    </span>
                    <span className="text-[12.5px] leading-snug text-muted-foreground">
                      {t(`sidebarCfg.typeHint.${type}`)}
                    </span>
                    {adds.length > 0 && (
                      <span className="text-[12px] font-medium text-foreground/80">
                        + {adds.join(", ")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            icon={PanelLeft}
            tone="violet"
            title={t("sidebarCfg.shownTitle")}
            description={t("sidebarCfg.shownDesc")}
          >
            <ul className="divide-y divide-border">
              {shown.map((item, i) => (
                <ItemRow
                  key={item.to}
                  item={item}
                  on
                  locked={LOCKED_PATHS.has(item.to)}
                  onToggle={() => toggle(item)}
                  onUp={sameGroup(i, i - 1) ? () => move(item.to, -1) : undefined}
                  onDown={sameGroup(i, i + 1) ? () => move(item.to, 1) : undefined}
                />
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            icon={Lock}
            tone="slate"
            title={t("sidebarCfg.offTitle")}
            description={t("sidebarCfg.offDesc")}
          >
            {hiddenStandard.length + unpinned.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("sidebarCfg.allShown")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {[...hiddenStandard, ...unpinned].map((item) => (
                  <ItemRow key={item.to} item={item} on={false} onToggle={() => toggle(item)} />
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <SidebarPreview items={shown} />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={!dirty || save.isPending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {t("sidebarCfg.save")}
            </button>
            <button
              type="button"
              onClick={() => setDraft({ ...DEFAULT_SIDEBAR })}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" /> {t("sidebarCfg.reset")}
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

function ItemRow({
  item,
  on,
  locked = false,
  onToggle,
  onUp,
  onDown,
}: {
  item: NavItem;
  on: boolean;
  locked?: boolean;
  onToggle: () => void;
  onUp?: (() => void) | undefined;
  onDown?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const Icon = item.icon;
  const roleNote =
    item.roles && !item.roles.includes("sotuv_menejeri") ? t("sidebarCfg.managersOnly") : null;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Icon className={cn("h-5 w-5 shrink-0", TONE_TEXT[item.tone])} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          {t(`nav.${item.to}`)}
          {item.optional && (
            <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              {t("sidebarCfg.module")}
            </span>
          )}
        </p>
        <p className="text-[12px] text-muted-foreground">
          {[t(`sidebarCfg.about.${item.to}`), roleNote].filter(Boolean).join(" · ")}
        </p>
      </div>
      {on && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onUp}
            disabled={!onUp}
            aria-label={t("sidebarCfg.up")}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDown}
            disabled={!onDown}
            aria-label={t("sidebarCfg.down")}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      )}
      {locked ? (
        <span title={t("sidebarCfg.locked")} className="grid h-8 w-11 place-items-center">
          <Lock className="h-4 w-4 text-muted-foreground" />
        </span>
      ) : (
        <Switch checked={on} onCheckedChange={onToggle} aria-label={t(`nav.${item.to}`)} />
      )}
    </li>
  );
}

// A small copy of the sidebar as it will look, Settings at the bottom.
function SidebarPreview({ items }: { items: NavItem[] }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const role = appRoleOf(user);
  const settings = NAV_ITEMS.find((i) => i.to === "/settings")!;
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {t("sidebarCfg.preview")}
      </p>
      <div className="rounded-xl border border-sidebar-border bg-sidebar p-2">
        {items.map((item, i) => {
          const Icon = item.to === "/" ? HomeIcon : item.icon;
          const forRole = !item.roles || (role && item.roles.includes(role));
          const newGroup = i > 0 && items[i - 1]!.group !== item.group;
          return (
            <div
              key={item.to}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-semibold text-sidebar-foreground",
                newGroup && "mt-1 border-t border-sidebar-border pt-3",
                !forRole && "opacity-50",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", TONE_TEXT[item.tone])} />
              <span className="truncate">{t(`nav.${item.to}`)}</span>
            </div>
          );
        })}
        <div className="mt-1 border-t border-sidebar-border pt-1">
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-semibold text-sidebar-foreground">
            <settings.icon className={cn("h-4 w-4", TONE_TEXT[settings.tone])} />
            {t("nav./settings")}
          </div>
        </div>
      </div>
      <p className="mt-2 px-1 text-[12px] leading-snug text-muted-foreground">
        {t("sidebarCfg.previewNote")}
      </p>
    </div>
  );
}
