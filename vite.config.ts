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
      // Production is one long-lived Node server on the VPS
      // (.output/server/index.mjs, run by salesiq.service).
      // scripts/build.mjs builds into .output-next and swaps it in after.
      nitro({
        preset: "node-server",
        ...(process.env["NITRO_OUTPUT_DIR"]
          ? { output: { dir: process.env["NITRO_OUTPUT_DIR"] } }
          : {}),
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
