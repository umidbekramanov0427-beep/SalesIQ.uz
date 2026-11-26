// «Sozlash xaritasi»: everything a company sets up on the platform, in the
// order worth doing it, with whether it is done (setup-map.server.ts reads
// that from the data). The AI assistant shows it as a card and leads the
// admin through what is left: items with a setup card (lib/ai/setup-cards)
// it can do itself, the rest it does together with the admin, page by page.
// Pure: the route, the card and the tests share it.
import type { SetupCardKind } from "@/lib/ai/setup-cards";

export const SETUP_TOPICS = [
  "business",
  "my_telegram",
  "team",
  "funnel",
  "client_bot",
  "salesbot",
  "automation",
  "telephony",
  "instagram",
  "payments",
  "crm_import",
  "first_lead",
] as const;
export type SetupTopic = (typeof SETUP_TOPICS)[number];

export type SetupTopicInfo = {
  /** The page where it is set up by hand. */
  path: string;
  /** The setup card that does it from the chat; null = done together, by the page. */
  card: SetupCardKind | null;
  /** Worth doing but not needed by every company. */
  optional?: boolean;
  /** What it is, for the model (English). */
  about: string;
};

export const SETUP_TOPIC_INFO: Record<SetupTopic, SetupTopicInfo> = {
  business: {
    path: "/settings?section=business",
    card: "business_profile",
    about:
      "Business profile: what the company sells, to whom, how it talks (the AI uses it everywhere)",
  },
  my_telegram: {
    path: "/welcome/telegram",
    card: "my_telegram",
    about: "The admin's own Telegram linked to the SalesIQ bot (reports, reminders, sign-in codes)",
  },
  team: {
    path: "/admin/employees",
    card: "employee",
    about: "The team: employees added with their logins",
  },
  funnel: {
    path: "/funnels/settings",
    card: "funnel",
    about: "Sales funnel and its stages",
  },
  client_bot: {
    path: "/bots",
    card: "client_bot",
    about:
      "The company's own Telegram bot for its clients (the shared trial bot takes new clients only for 14 days)",
  },
  salesbot: {
    path: "/bots?tab=salesbots",
    card: "salesbot",
    about: "A salesbot that talks to new clients and fills the lead",
  },
  automation: {
    path: "/funnels/settings",
    card: null,
    about: "Funnel triggers (tasks, messages, moves done automatically on a stage)",
  },
  telephony: {
    path: "/admin/telephony",
    card: null,
    about: "IP telephony (calls from the CRM, recordings for the AI call analysis)",
  },
  instagram: {
    path: "/integrations/instagram",
    card: null,
    optional: true,
    about: "Instagram Direct: messages become leads, answered from the lead card",
  },
  payments: {
    path: "/integrations/payments",
    card: null,
    optional: true,
    about: "The company's own Payme/Click cashbox for payment links to clients",
  },
  crm_import: {
    path: "/integrations/amocrm",
    card: null,
    optional: true,
    about: "Bring leads from amoCRM or Bitrix24",
  },
  first_lead: {
    path: "/funnels",
    card: null,
    about: "The first lead in the funnel (from the bot, a form, an import or by hand)",
  },
};

export type SetupMapState = Record<SetupTopic, boolean>;

/** The next topic to do: required ones first, in order, then the optional ones. */
export function nextSetupTopic(state: SetupMapState): SetupTopic | null {
  const todo = SETUP_TOPICS.filter((k) => !state[k]);
  return todo.find((k) => !SETUP_TOPIC_INFO[k].optional) ?? todo[0] ?? null;
}

export function setupDone(state: SetupMapState): { done: number; total: number } {
  return { done: SETUP_TOPICS.filter((k) => state[k]).length, total: SETUP_TOPICS.length };
}

/** The map for the assistant's prompt. */
export function setupMapPrompt(state: SetupMapState, labels: Record<SetupTopic, string>): string {
  const { done, total } = setupDone(state);
  const lines = [`COMPANY SETUP MAP (${done}/${total} done). Topic -- status -- page -- how:`];
  for (const k of SETUP_TOPICS) {
    const info = SETUP_TOPIC_INFO[k];
    lines.push(
      `- ${labels[k]} (${info.about}) -- ${state[k] ? "DONE" : info.optional ? "not done, optional" : "NOT DONE"} -- [${labels[k]}](${info.path}) -- ${info.card ? `you can do it: show_setup_card kind ${info.card}` : "together, step by step on its page"}`,
    );
  }
  const next = nextSetupTopic(state);
  lines.push(
    next
      ? `The next topic to suggest: ${labels[next]}.`
      : "Everything is set up: suggest using it (salesbot texts, triggers, call scoring) when they ask what next.",
  );
  return lines.join("\n");
}
