// What the account panel's search finds besides leads: the settings and
// tools people look for by name ("telephony", "funnel stages", "password").
// Each entry is shown only if the role may open its page (canOpenPath) and,
// for settings sections, holds the minimum role the section needs.

export type CatalogItem = {
  to: string;
  section?: string;
  labelKey: string;
  // Extra words it should be found by, in all three languages.
  keywords: string;
  minRole?: "rop" | "super_admin";
};

export const SEARCH_CATALOG: CatalogItem[] = [
  {
    to: "/settings",
    section: "profile",
    labelKey: "settings.nav.profile",
    keywords: "profil profile профиль ism name имя parol password пароль telefon",
  },
  {
    to: "/settings",
    section: "personalization",
    labelKey: "settings.nav.personalization",
    keywords: "mavzu tema theme тема rang color цвет til language язык dark light",
  },
  {
    to: "/settings",
    section: "notifications",
    labelKey: "settings.nav.notifications",
    keywords: "bildirishnoma notification уведомления telegram",
    minRole: "rop",
  },
  {
    to: "/settings",
    section: "workSchedule",
    labelKey: "settings.nav.workSchedule",
    keywords: "ish vaqti jadval schedule график работы",
    minRole: "rop",
  },
  {
    to: "/settings",
    section: "business",
    labelKey: "settings.nav.business",
    keywords: "biznes kompaniya company компания",
    minRole: "super_admin",
  },
  {
    to: "/settings",
    section: "general",
    labelKey: "settings.nav.general",
    keywords: "umumiy general общие valyuta currency валюта",
    minRole: "super_admin",
  },
  {
    to: "/settings",
    section: "billing",
    labelKey: "trial.subscribe",
    keywords: "tarif obuna to'lov billing plan тариф оплата подписка",
    minRole: "super_admin",
  },
  {
    to: "/settings",
    section: "reportProblem",
    labelKey: "settings.nav.reportProblem",
    keywords: "muammo xato bug problem проблема ошибка",
  },
  {
    to: "/admin",
    labelKey: "nav./admin",
    keywords: "admin panel xodimlar users employees сотрудники пользователи",
  },
  {
    to: "/admin/permissions",
    labelKey: "search.item.permissions",
    keywords: "ruxsat rol huquq permissions roles права роли",
  },
  {
    to: "/admin/org-structure",
    labelKey: "search.item.orgStructure",
    keywords: "tuzilma bo'lim jamoa structure team отдел структура",
  },
  {
    to: "/admin/security",
    labelKey: "search.item.security",
    keywords: "xavfsizlik security безопасность",
  },
  { to: "/admin/crm", labelKey: "crm.title", keywords: "crm sozlamalari settings настройки crm" },
  {
    to: "/admin/pipelines",
    labelKey: "admin.pipelinesSettings",
    keywords: "voronka bosqich pipeline stage воронка этап",
  },
  {
    to: "/admin/lead-fields",
    labelKey: "admin.leadFieldsSettings",
    keywords: "maydon qo'shimcha field custom поле",
  },
  {
    to: "/admin/lead-sources",
    labelKey: "admin.leadSourcesSettings",
    keywords: "manba webhook source источник",
  },
  { to: "/admin/web-forms", labelKey: "admin.webFormsSettings", keywords: "forma veb form форма" },
  {
    to: "/admin/telephony",
    labelKey: "admin.telephonySettings",
    keywords: "telefoniya qo'ng'iroq onlinepbx sip call телефония звонки",
  },
  {
    to: "/admin/automations",
    labelKey: "admin.automationsSettings",
    keywords: "avtomatlashtirish trigger automation автоматизация триггер",
  },
  { to: "/admin/salesbots", labelKey: "dp.salesbots", keywords: "salesbot bot бот" },
  {
    to: "/admin/auto-responders",
    labelKey: "admin.autoResponders",
    keywords: "avtojavob autoresponder автоответ",
  },
  {
    to: "/admin/duplicates",
    labelKey: "crm.item.dupControlTitle",
    keywords: "dublikat nazorati takror birlashtirish duplicate merge дубли контроль",
  },
  {
    to: "/admin/task-control",
    labelKey: "taskControl.title",
    keywords: "vazifa nazorati majburiy zapret zadacha task control запрет задача обязательная",
  },
  {
    to: "/admin/contract-templates",
    labelKey: "admin.contractTemplatesSettings",
    keywords: "shartnoma contract договор shablon template",
  },
  {
    to: "/admin/ai-agents",
    labelKey: "search.item.aiAgents",
    keywords: "ai agent sun'iy intellekt ии агент",
  },
  {
    to: "/integrations",
    labelKey: "nav./integrations",
    keywords: "integratsiya amocrm bitrix telegram whatsapp integration интеграция",
  },
  {
    to: "/daily-report-settings",
    labelKey: "search.item.dailyReportSettings",
    keywords: "kunlik hisobot sozlama daily report отчёт",
    minRole: "rop",
  },
  {
    to: "/scoring-criteria",
    labelKey: "search.item.scoringCriteria",
    keywords: "baholash mezon scoring criteria критерии оценка",
    minRole: "rop",
  },
];

export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ʻʼ‘’`']/g, "'")
    .trim();
}

// Every word of the query must appear somewhere in the label or keywords.
export function catalogMatches(haystack: string, query: string): boolean {
  const h = normalizeSearch(haystack);
  return normalizeSearch(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => h.includes(w));
}
