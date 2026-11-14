import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  AudioWaveform,
  BellRing,
  Cable,
  CalendarRange,
  Headphones,
  MonitorDown,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  ShieldAlert,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { PageHeader, SectionCard, SettingRow, SettingRows } from "@/components/layout/Primitives";
import { ConnectSection, DesktopSection } from "@/components/phone/center/Sections";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  TELEPHONY_PROVIDERS,
  useCallSettings,
  useProfilesRaw,
  useTelephonyStatus,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import {
  AUTO_GAPS,
  CALL_PERIODS,
  REP_HIDEABLE,
  type CallSettings,
  type RepHideable,
} from "@/lib/call-settings";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";

// Admin → Qo'ng'iroq sozlamalari: everything to set up for calls, in one
// place (5TEL's Sozlamalar / Ulanish / Operatorlar / Desktop): the
// company's call rules (ui_settings.phone, src/lib/call-settings.ts), the
// telephony connection, which operator is which extension, the desktop
// app, and the related settings elsewhere. Calling itself is the funnel's
// phone button (PhoneProvider → the Telefon window).

const TABS = ["general", "connect", "operators", "desktop"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICON: Record<Tab, typeof Phone> = {
  general: SlidersHorizontal,
  connect: Cable,
  operators: Headphones,
  desktop: MonitorDown,
};

export const Route = createFileRoute("/admin/call-settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: (TABS as readonly string[]).includes(String(search["tab"]))
      ? (search["tab"] as Tab)
      : undefined,
  }),
  head: () => ({ meta: [{ title: "Qo'ng'iroq sozlamalari — SalesIQ" }] }),
  component: CallSettingsPage,
});

function CallSettingsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { tab = "general" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const canManage = user?.role === "super_admin" || user?.role === "platform_owner";

  if (user && !canManage) {
    return (
      <>
        <AdminBackLink />
        <SectionCard
          icon={ShieldAlert}
          tone="rose"
          title={t("admin.restrictedTitle")}
          description={t("admin.restrictedDesc")}
        >
          <p className="text-sm text-muted-foreground">{t("admin.restrictedHint")}</p>
        </SectionCard>
      </>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("callSet.title")}
        description={t("callSet.desc")}
        icon={PhoneCall}
        tone="emerald"
      />
      <div
        role="tablist"
        className="ctl-track flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-2xl p-1 [scrollbar-width:none]"
      >
        {TABS.map((k) => {
          const Icon = TAB_ICON[k];
          const on = tab === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              data-state={on ? "active" : "inactive"}
              onClick={() =>
                void navigate({ search: { tab: k === "general" ? undefined : k }, replace: true })
              }
              className="ctl-tab inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold"
            >
              <Icon className="h-4 w-4" />
              {t(`callSet.tab.${k}`)}
            </button>
          );
        })}
      </div>

      <div key={tab} className="tab-enter">
        {tab === "general" ? (
          <GeneralTab />
        ) : tab === "connect" ? (
          <ConnectSection data={undefined} />
        ) : tab === "operators" ? (
          <OperatorsTab />
        ) : (
          <DesktopSection />
        )}
      </div>
    </div>
  );
}

/* ---- Umumiy: the company's call rules ------------------------------------- */

function GeneralTab() {
  const { t } = useI18n();
  const { value, save, saving } = useCallSettings();
  const savedKey = JSON.stringify(value);
  const [draft, setDraft] = useState<CallSettings>(value);
  useEffect(() => setDraft(JSON.parse(savedKey) as CallSettings), [savedKey]);
  const dirty = JSON.stringify(draft) !== savedKey;
  const set = (patch: Partial<CallSettings>) => setDraft((d) => ({ ...d, ...patch }));

  async function onSave() {
    try {
      await save(draft);
      toast.success(t("callSet.saved"));
    } catch (e) {
      toast.error(describeError(e, t("common.saveFailed")));
    }
  }

  const select =
    "h-9 rounded-[8px] border border-border bg-background px-2.5 text-[13px] font-medium outline-none focus:border-primary";

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <SectionCard
          icon={PhoneIncoming}
          tone="emerald"
          title={t("callSet.calls")}
          description={t("callSet.callsDesc")}
        >
          <SettingRows>
            <SettingRow title={t("callSet.popup")} description={t("callSet.popupDesc")}>
              <Switch checked={draft.popup} onCheckedChange={(v) => set({ popup: v })} />
            </SettingRow>
            <SettingRow title={t("callSet.period")} description={t("callSet.periodDesc")}>
              <select
                value={draft.period}
                onChange={(e) => set({ period: e.target.value as CallSettings["period"] })}
                className={select}
              >
                {CALL_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {t(`ptel.period.${p}`)}
                  </option>
                ))}
              </select>
            </SettingRow>
          </SettingRows>
        </SectionCard>

        <SectionCard
          icon={PhoneForwarded}
          tone="rose"
          title={t("callSet.auto")}
          description={t("callSet.autoDesc")}
        >
          <SettingRows>
            <SettingRow title={t("callSet.gap")} description={t("callSet.gapDesc")}>
              <select
                value={draft.autoGap}
                onChange={(e) => set({ autoGap: Number(e.target.value) })}
                className={select}
              >
                {AUTO_GAPS.map((s) => (
                  <option key={s} value={s}>
                    {t("ptel.auto.sec", { n: s })}
                  </option>
                ))}
              </select>
            </SettingRow>
          </SettingRows>
        </SectionCard>

        <SectionCard
          icon={Users}
          tone="sky"
          title={t("callSet.reps")}
          description={t("callSet.repsDesc")}
        >
          <SettingRows>
            {REP_HIDEABLE.map((s) => {
              const shown = !draft.hiddenForReps.includes(s);
              return (
                <SettingRow key={s} title={t(`ptel.s.${s}`)} description={t(`ptel.d.${s}`)}>
                  <Switch
                    checked={shown}
                    onCheckedChange={(v) =>
                      set({
                        hiddenForReps: v
                          ? draft.hiddenForReps.filter((x) => x !== s)
                          : ([...draft.hiddenForReps, s] as RepHideable[]),
                      })
                    }
                  />
                </SettingRow>
              );
            })}
          </SettingRows>
        </SectionCard>

        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <Button variant="outline" onClick={() => setDraft(value)} disabled={saving}>
              {t("common.cancel")}
            </Button>
          )}
          <Button onClick={() => void onSave()} disabled={!dirty || saving}>
            {t("common.save")}
          </Button>
        </div>
      </div>

      <SectionCard
        icon={CalendarRange}
        tone="slate"
        title={t("callSet.related")}
        description={t("callSet.relatedDesc")}
        className="self-start"
      >
        <SettingRows>
          <Related
            to="/admin/phone-format"
            icon={Phone}
            title={t("ptel.set.format")}
            desc={t("ptel.set.formatDesc")}
          />
          <Related
            to="/settings"
            search={{ section: "notifications" }}
            icon={BellRing}
            title={t("ptel.set.push")}
            desc={t("ptel.set.pushDesc")}
          />
          <Related
            to="/audio-analytics"
            icon={AudioWaveform}
            title={t("ptel.set.audio")}
            desc={t("ptel.set.audioDesc")}
          />
        </SettingRows>
      </SectionCard>
    </div>
  );
}

function Related({
  to,
  search,
  icon: Icon,
  title,
  desc,
}: {
  to: string;
  search?: Record<string, string>;
  icon: typeof Phone;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to as never}
      {...(search ? { search: search as never } : {})}
      className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/30"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-surface text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-[12.5px] leading-snug text-muted-foreground">{desc}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/* ---- Operatorlar: who is which extension ---------------------------------- */

function OperatorsTab() {
  const { t } = useI18n();
  const { data: statuses } = useTelephonyStatus();
  const { data: people = [] } = useProfilesRaw();
  const providers = TELEPHONY_PROVIDERS.filter(
    (p) => p.id !== "telegram" && statuses?.[p.id]?.connected,
  );
  const extOf = (profileId: string) =>
    providers.flatMap((p) =>
      (statuses?.[p.id]?.extensionLinks ?? [])
        .filter((l) => l.profileId === profileId)
        .map((l) => ({ provider: p, code: l.code })),
    );
  const staff = people.filter((p) => p.role !== "platform_owner");

  return (
    <SectionCard
      icon={Headphones}
      tone="amber"
      title={t("callSet.tab.operators")}
      description={t("callSet.opsDesc")}
      actions={
        providers[0] ? (
          <Link
            to="/admin/telephony"
            search={{ provider: providers[0].id } as never}
            className="ctl-soft inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-semibold"
          >
            {t("callSet.opsManage")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : undefined
      }
    >
      {providers.length === 0 ? (
        <Empty>
          {t("callSet.opsNoPbx")}{" "}
          <Link
            to="/admin/call-settings"
            search={{ tab: "connect" }}
            className="font-semibold text-primary hover:underline"
          >
            {t("callSet.tab.connect")}
          </Link>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-[8px] border border-border">
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
            <span>{t("callSet.opsPerson")}</span>
            <span>{t("callSet.opsRole")}</span>
            <span>{t("callSet.opsExt")}</span>
          </div>
          <ul className="divide-y divide-border">
            {staff.map((p) => {
              const exts = extOf(p.id);
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 text-[13px]"
                >
                  <span className="truncate font-medium text-foreground">{p.full_name}</span>
                  <span className="truncate text-muted-foreground">
                    {t(
                      p.role === "super_admin"
                        ? "admin.roleAdmin"
                        : p.role === "rop"
                          ? "admin.roleRop"
                          : "admin.roleRep",
                    )}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {exts.length === 0 ? (
                      <span className="text-[12.5px] text-amber-600 dark:text-amber-400">
                        {t("callSet.opsNone")}
                      </span>
                    ) : (
                      exts.map((e) => (
                        <span
                          key={`${e.provider.id}-${e.code}`}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-[12px] font-semibold tabular-nums text-foreground",
                          )}
                          title={t(e.provider.labelKey)}
                        >
                          <Phone className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          {e.code}
                        </span>
                      ))
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[8px] border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
      {children}
    </p>
  );
}
