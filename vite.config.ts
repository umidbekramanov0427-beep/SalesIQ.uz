import { defineConfig, loadEnv, type PluginOption } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Standalone Vite config (no Lovable sandbox dependency). Equivalent to what
// @lovable.dev/vite-tanstack-config wired up for us, minus the sandbox-only
// bits (dev proxy to lovable.app, HMR gate, sandbox error diagnostics) that
// only ever activated inside Lovable's own dev/build environment anyway.
export default defineConfig(async ({ mode, command }) => {
  const plugins: PluginOption[] = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    mcpPlugin(),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    viteReact(),
  ];

  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(
      // Vercel's Build Output API dictates its own output layout (.vercel/output),
      // so unlike the former cloudflare-module preset this is left unconfigured.
      // maxDuration is raised because audio transcription (gemini.server.ts)
      // deliberately retries a Gemini 503 "high demand" response for close
      // to a minute before giving up -- without this, Vercel's own default
      // limit could kill the function mid-retry and turn a clean "still
      // busy" error into an opaque platform timeout instead.
      // regions: the server runs next to the database (Supabase project in
      // ap-southeast-2, Sydney). From Vercel's default iad1 every query
      // crossed the globe (~200 ms each), and a salesbot step makes several.
      // NITRO_PRESET=node-server builds a plain Node server (.output/server/index.mjs)
      // for the self-hosted VPS; without it the build targets Vercel as before.
      process.env.NITRO_PRESET === "node-server"
        ? nitro({ preset: "node-server" })
        : nitro({
            preset: "vercel",
            vercel: { functions: { maxDuration: 120, regions: ["syd1"] } },
          }),
    );
  }

  // Vite already exposes VITE_*-prefixed vars via import.meta.env automatically;
  // loadEnv here only ensures .env is read the same way in every environment.
  loadEnv(mode, process.cwd(), "VITE_");

  return {
    css: { transformer: "lightningcss" as const },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },
    server: { host: "::" as const, port: 8080 },
    plugins,
  };
});
