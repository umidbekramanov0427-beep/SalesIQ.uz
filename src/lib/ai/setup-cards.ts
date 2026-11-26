// «AI bilan sozlash»: the assistant sets the platform up together with the
// company admin. Three ways, picked by the admin: «O'zim» (steps and a page
// link), «Birga» (one step at a time) or «AI qilsin» -- the assistant asks
// what is missing and shows a setup card in the chat. The card is filled
// and confirmed by the admin and runs through the same endpoints the
// settings pages use; secrets typed into a card (bot tokens, passwords)
// never reach the model. Pure: the route, the chat and the tests share it.

export const SETUP_CARD_KINDS = [
  "client_bot",
  "my_telegram",
  "salesbot",
  "employee",
  "funnel",
  "business_profile",
] as const;
export type SetupCardKind = (typeof SETUP_CARD_KINDS)[number];

export type SetupQuestion = { text: string; saveTo: "name" | "phone" | "email" | "note" | "none" };

export type SetupCardPrefill = {
  name?: string;
  greeting?: string;
  questions?: SetupQuestion[];
  finish?: string;
  tag?: string;
  full_name?: string;
  email?: string;
  stages?: string[];
  company_name?: string;
  description?: string;
  target_customer?: string;
  value_proposition?: string;
  tone?: string;
};

export type SetupCardSpec = { kind: SetupCardKind; prefill: SetupCardPrefill };

const str = (v: unknown, max = 600) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
const SAVE_TO = new Set(["name", "phone", "email", "note", "none"]);

/** A card the model asked for, cleaned: unknown kinds -> null, fields trimmed and capped. */
export function parseSetupCard(args: Record<string, unknown>): SetupCardSpec | null {
  const kind = args["kind"];
  if (!(SETUP_CARD_KINDS as readonly unknown[]).includes(kind)) return null;
  const raw = (
    args["prefill"] && typeof args["prefill"] === "object" ? args["prefill"] : {}
  ) as Record<string, unknown>;
  const prefill: SetupCardPrefill = {};
  for (const k of [
    "name",
    "greeting",
    "finish",
    "tag",
    "full_name",
    "email",
    "company_name",
    "description",
    "target_customer",
    "value_proposition",
    "tone",
  ] as const) {
    const v = str(raw[k], k === "description" ? 1500 : 600);
    if (v) prefill[k] = v;
  }
  if (Array.isArray(raw["questions"])) {
    prefill.questions = (raw["questions"] as unknown[])
      .map((q) => {
        const o = (q && typeof q === "object" ? q : { text: q }) as Record<string, unknown>;
        const text = str(o["text"], 300);
        const saveTo = SAVE_TO.has(o["saveTo"] as string)
          ? (o["saveTo"] as SetupQuestion["saveTo"])
          : "note";
        return text ? { text, saveTo } : null;
      })
      .filter((q): q is SetupQuestion => !!q)
      .slice(0, 8);
  }
  if (Array.isArray(raw["stages"])) {
    prefill.stages = (raw["stages"] as unknown[])
      .map((s) => str(s, 60))
      .filter((s): s is string => !!s)
      .slice(0, 12);
  }
  return { kind: kind as SetupCardKind, prefill };
}

/** A Telegram bot token (from @BotFather) somewhere in a message. */
const BOT_TOKEN_RE = /\b\d{5,15}:[A-Za-z0-9_-]{30,}\b/;

/** The token typed into the chat, if any -- it is taken out before anything goes to the model. */
export function findBotToken(text: string): string | null {
  return BOT_TOKEN_RE.exec(text)?.[0] ?? null;
}

export function redactBotToken(text: string): string {
  return text.replace(new RegExp(BOT_TOKEN_RE.source, "g"), "[token]");
}

/**
 * Quick replies the assistant offers as buttons: `[[Birga sozlaymiz]]`.
 * Returns the text without them and the reply labels in order.
 */
export function splitQuickReplies(text: string): { text: string; replies: string[] } {
  const replies: string[] = [];
  const cleaned = text.replace(/\[\[([^\[\]\n]{1,60})\]\]/g, (_m, label: string) => {
    const l = label.trim();
    if (l && !replies.includes(l)) replies.push(l);
    return "";
  });
  return {
    text: cleaned
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    replies,
  };
}

/** The Gemini declaration of the tool that shows a setup card. */
export const SHOW_SETUP_CARD_TOOL = {
  name: "show_setup_card",
  description:
    "Show the company admin a setup card inside this chat that does a setup for them after they check it and press its button. Kinds: client_bot -- connect the company's own Telegram bot for its clients (the card asks for the @BotFather token itself); my_telegram -- link the admin's own Telegram to the SalesIQ bot for reports, reminders and sign-in codes (the card shows a link and a code to send to the bot); salesbot -- create a simple salesbot (greeting, questions with where each answer is saved, final message, a tag); employee -- add an employee (name, email; the card makes a password); funnel -- create a funnel with work stages (won/lost stages are added by themselves); business_profile -- fill in what the company sells, for whom and how it talks. Fill prefill with everything you already know from the conversation and the business context so the admin only checks it.",
  parameters: {
    type: "object",
    properties: {
      kind: { type: "string", enum: [...SETUP_CARD_KINDS] },
      prefill: {
        type: "object",
        properties: {
          name: { type: "string", description: "Salesbot or funnel name" },
          greeting: { type: "string", description: "Salesbot: first message" },
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                saveTo: { type: "string", enum: ["name", "phone", "email", "note", "none"] },
              },
              required: ["text"],
            },
          },
          finish: { type: "string", description: "Salesbot: last message" },
          tag: { type: "string", description: "Salesbot: tag added to the lead" },
          full_name: { type: "string", description: "Employee: full name" },
          email: { type: "string", description: "Employee: email used to sign in" },
          stages: {
            type: "array",
            items: { type: "string" },
            description: "Funnel: the work stages in order (not won/lost)",
          },
          company_name: { type: "string" },
          description: { type: "string", description: "What the company sells" },
          target_customer: { type: "string" },
          value_proposition: { type: "string" },
          tone: { type: "string" },
        },
      },
    },
    required: ["kind"],
  },
} as const;

/** The prompt's rules for setting things up with the admin. */
export function setupRules(isAdmin: boolean): string {
  if (!isAdmin)
    return "Setting up the company (bots, salesbots, employees, funnels, integrations) is for the company admin. If this person asks to set something up, explain it briefly and say their company admin (super admin) can do it -- or do it together with you.";
  return [
    "SETTING THINGS UP WITH THE ADMIN. You can set the platform up together with this company admin:",
    "- When they want to set something up but did not say how (e.g. 'salesbot sozlamoqchiman', 'telefoniyani qanday ulayman', 'yordam bera olasanmi'), ask in one short sentence how they want it and offer exactly these quick replies, each on its own line: [[O'zim sozlayman]] [[Birga sozlaymiz]] [[AI o'zi qilsin]] (in the user's language).",
    "- «O'zim sozlayman»: give the short numbered steps with the page link.",
    "- «Birga sozlaymiz»: go ONE step at a time: say what to do now, give the page link, and end with the quick replies [[Tayyor]] [[Tushunmadim]]; when they say it is done, give the next step. At the end say what is set up and what is worth doing next.",
    "- «AI o'zi qilsin», or when they plainly ask you to do it ('ulab ber', 'qo'shib ber', 'yaratib ber'): ask only what you really need, one question at a time, with quick replies for the choices (for example for a bot: [[Mijozlar uchun Telegram bot]] [[Hisobot boti (o'z Telegramim)]] [[Salesbot]]), then call show_setup_card with the right kind and everything you know in prefill. Supported now: client_bot, my_telegram, salesbot, employee, funnel, business_profile. For anything else (telephony, Instagram, amoCRM, payments, triggers) go «Birga» with links.",
    "- After calling show_setup_card write ONE short sentence: what to check or fill in on the card and which button to press. Never ask them to type a token, password or secret key into the chat -- the card has its own safe field.",
    "- A user message starting with «✓» is the result of a card the admin ran: confirm it in one line and offer the next useful step (with quick replies), e.g. after a client bot: test it with /start; after a salesbot: open it or set it as the bot's start; after the Telegram link: suggest connecting the company's client bot.",
    "- Quick replies are written as [[Label]] -- the chat shows them as buttons. Use at most 4, short.",
  ].join("\n");
}
