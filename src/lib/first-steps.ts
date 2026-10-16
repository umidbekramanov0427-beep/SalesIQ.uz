// "Birinchi qadamlar": what a new company should do in its first days to
// get value out of the trial -- shown on the owner's home page until done,
// and named in the Telegram nudges to idle trials (trial-nudges.server.ts).
// Pure, so the order and the "next step" rule are unit-tested.

export const FIRST_STEPS = ["bot", "team", "lead", "integration", "business"] as const;
export type FirstStep = (typeof FIRST_STEPS)[number];

export type FirstStepsState = Record<FirstStep, boolean>;

export const FIRST_STEP_PATH: Record<FirstStep, string> = {
  bot: "/welcome/telegram",
  team: "/admin/employees",
  lead: "/funnels",
  integration: "/admin",
  business: "/settings?section=business",
};

/** FIRST_STEP_PATH split for a router link. */
export function firstStepLink(step: FirstStep): { to: string; search?: Record<string, string> } {
  const [to, query] = FIRST_STEP_PATH[step].split("?");
  if (!query) return { to: to! };
  return { to: to!, search: Object.fromEntries(new URLSearchParams(query)) };
}

/** The first step not done yet (null = all done). */
export function nextFirstStep(state: FirstStepsState): FirstStep | null {
  return FIRST_STEPS.find((s) => !state[s]) ?? null;
}

export function firstStepsDone(state: FirstStepsState): number {
  return FIRST_STEPS.filter((s) => state[s]).length;
}

/** The checklist shows while a company is new: on trial, or its first 14 days. */
export function showFirstSteps(input: {
  phase: string;
  createdAt: string | null;
  state: FirstStepsState;
  now?: number;
}): boolean {
  if (nextFirstStep(input.state) === null) return false;
  if (input.phase === "trial") return true;
  if (!input.createdAt) return false;
  return (input.now ?? Date.now()) - new Date(input.createdAt).getTime() < 14 * 86_400_000;
}
