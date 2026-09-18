// Kept in a plain (non-.server) module so client components can read it
// without pulling in ai-onboarding.server.ts's Gemini/supabaseAdmin code.
// Must match AI_SETUP_QUESTIONS.length there.
export const AI_SETUP_QUESTIONS_COUNT = 5;
