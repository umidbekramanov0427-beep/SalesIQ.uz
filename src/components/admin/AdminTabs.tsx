import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { TabbedSection, type TabItem } from "@/components/layout/SectionNav";
import { useCrmPageGroups } from "@/components/admin/crm-pages";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCrmEnabled } from "@/lib/use-org-access";

// Every page the admin panel opens sits under the same header: "Admin panel"
// with its areas as tabs, and inside CRM, the CRM pages as pills. Only
// admins get it -- anyone else who can reach a page here (integrations) just
// sees the page itself.
export function AdminTabbedLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const crmEnabled = useCrmEnabled();
  const crmGroups = useCrmPageGroups();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  if (!isAdmin) return <>{children}</>;

  const crmPages = crmGroups.flatMap((g) => g.items).filter((i) => i.to.startsWith("/admin/"));
  const inCrm = pathname === "/admin/crm" || crmPages.some((p) => pathname.startsWith(p.to));
  const at = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  const tabs: TabItem[] = [
    {
      key: "overview",
      label: t("adminTabs.overview"),
      to: "/admin",
      active: pathname === "/admin",
    },
    {
      key: "permissions",
      label: t("adminTabs.permissions"),
      to: "/admin/permissions",
      active: at("/admin/permissions"),
    },
    {
      key: "integrations",
      label: t("adminTabs.integrations"),
      to: "/integrations",
      active: at("/integrations"),
    },
    { key: "ai", label: t("adminTabs.ai"), to: "/admin/ai-agents", active: at("/admin/ai-agents") },
    {
      key: "security",
      label: t("adminTabs.security"),
      to: "/admin/security",
      active: at("/admin/security"),
    },
    {
      key: "amocrm",
      label: t("adminTabs.amocrm"),
      to: "/admin/amocrm-import",
      active: at("/admin/amocrm-import"),
    },
    ...(crmEnabled
      ? [{ key: "crm", label: t("adminTabs.crm"), to: "/admin/crm", active: inCrm }]
      : []),
  ];

  const subTabs: TabItem[] | undefined = inCrm
    ? [
        {
          key: "crm-home",
          label: t("adminTabs.crmOverview"),
          to: "/admin/crm",
          active: pathname === "/admin/crm",
        },
        ...crmPages.map((p) => ({ key: p.to, label: p.label, to: p.to, active: at(p.to) })),
      ]
    : undefined;

  return (
    <TabbedSection title={t("admin.title")} tabs={tabs} subTabs={subTabs}>
      {children}
    </TabbedSection>
  );
}
