// Unit tests (tests/unit). vitest is not a project dependency on purpose:
// `npm test` runs it through npx, so the lockfiles stay untouched. That is also why nothing here imports from "vitest" -- the test
// API comes in as globals.
export default {
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Server modules build the Supabase admin client lazily; these values
    // only satisfy that constructor -- tests never talk to a database.
    env: {
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    },
  },
};
