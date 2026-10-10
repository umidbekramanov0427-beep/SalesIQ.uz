import type { ReactNode } from "react";
import { TabbedSection, type TabItem } from "@/components/layout/SectionNav";
import { useSettingsNav } from "@/components/settings/settings-nav";
import { useI18n } from "@/lib/i18n";

// Every Settings page sits under one "Settings" header: the overview and
// each group (general, call analysis, leads & CRM, reports) as tabs, the
// group's own pages as pills under them.
export function SettingsTabbedLayout({
  activeKey,
  children,
}: {
  activeKey: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const groups = useSettingsNav();
  const activeGroup = groups.find((g) => g.items.some((i) => i.key === activeKey));

  const tabs: TabItem[] = [
    { key: "overview", label: t("adminTabs.overview"), to: "/settings", active: false },
    ...groups.map((g) => ({
      key: g.key,
      label: g.label,
      to: g.items[0]!.to,
      search: g.items[0]!.search,
      active: activeGroup?.key === g.key,
    })),
  ];
  const subTabs: TabItem[] | undefined = activeGroup?.items.map((i) => ({
    key: i.key,
    label: i.label,
    to: i.to,
    search: i.search,
    active: i.key === activeKey,
  }));

  return (
    <TabbedSection title={t("settings.title")} tabs={tabs} subTabs={subTabs}>
      {children}
    </TabbedSection>
  );
}
