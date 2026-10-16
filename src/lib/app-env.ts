// Which copy of SalesIQ this is: production (salesiq.uz), staging (the
// `staging` branch's Vercel preview with its own test database) or a
// developer's machine. Staging shows a strip on every page and marks the
// owner's Telegram messages, so test data is never mistaken for real.

export type AppEnv = "production" | "staging" | "development";

const asEnv = (v: unknown): AppEnv | null =>
  v === "production" || v === "staging" || v === "development" ? v : null;

/** In the browser: VITE_APP_ENV if set, else by the address. */
export function clientAppEnv(hostname?: string): AppEnv {
  const fixed = asEnv(import.meta.env["VITE_APP_ENV"]);
  if (fixed) return fixed;
  const host = hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");
  if (!host || host === "localhost" || host === "127.0.0.1") return "development";
  if (host.endsWith(".vercel.app")) return "staging";
  return "production";
}

/** On the server: APP_ENV if set, else Vercel's own environment. */
export function serverAppEnv(): AppEnv {
  const fixed = asEnv(process.env["APP_ENV"]);
  if (fixed) return fixed;
  const vercel = process.env["VERCEL_ENV"];
  if (vercel === "production") return "production";
  if (vercel === "preview") return "staging";
  return "development";
}
