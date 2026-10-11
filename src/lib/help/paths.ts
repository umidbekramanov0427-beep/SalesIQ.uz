// Kept apart from the guides' text so the header button that uses it
// doesn't pull every guide into the main bundle.

// Which guide a page's "Qo'llanma" button opens: longest matching prefix
// wins, so "/admin/pipelines" beats "/admin".
const GUIDE_FOR_PATH: [string, string][] = [
  ["/integrations/amocrm", "amocrm"],
  ["/integrations/bitrix24", "bitrix24"],
  ["/integrations/sms", "sms"],
  ["/integrations/email", "email"],
  ["/integrations/webhook", "webhook"],
  ["/integrations/telegram-app", "telegram-app"],
  ["/integrations", "start"],
  ["/admin/employees", "employees"],
  ["/admin/org-structure", "employees"],
  ["/admin/permissions", "permissions"],
  ["/admin/security", "permissions"],
  ["/admin/pipelines", "pipelines"],
  ["/admin/lead-fields", "lead-fields"],
  ["/admin/lead-sources", "lead-sources"],
  ["/admin/web-forms", "web-forms"],
  ["/admin/task-control", "task-control"],
  ["/admin/duplicates", "duplicates"],
  ["/admin/automations", "automations"],
  ["/admin/salesbots", "salesbots"],
  ["/admin/auto-responders", "auto-responders"],
  ["/admin/contract-templates", "contracts"],
  ["/admin/amocrm-import", "amocrm"],
  ["/admin/telephony", "telephony"],
  ["/admin/ai-agents", "ai-agents"],
  ["/admin", "start"],
  ["/rollout-plan", "start"],
  ["/daily-report-settings", "telegram-report"],
  ["/funnels", "funnels"],
  ["/crm", "funnels"],
  ["/audio-analytics", "audio"],
  ["/scoring-criteria", "audio"],
  ["/lead-analytics", "lead-analytics"],
  ["/attendance", "attendance"],
  ["/content-library", "classroom"],
  ["/settings", "settings"],
  ["/ai-assistant", "ai-assistant"],
];

export function guideForPath(pathname: string): string | null {
  if (pathname === "/") return "home";
  let best: [string, string] | null = null;
  for (const entry of GUIDE_FOR_PATH) {
    const [prefix] = entry;
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      if (!best || prefix.length > best[0].length) best = entry;
    }
  }
  return best ? best[1] : null;
}
