#!/usr/bin/env node
// Smoke test of a running SalesIQ: the public pages, the health check,
// the pricing API, the PWA files, and that protected and payment
// endpoints refuse strangers cleanly (4xx / a JSON-RPC error, never a
// 500). No dependencies, read-only, nothing is created.
//
//   node scripts/smoke.mjs https://salesiq.uz
//
// Exit code 1 when anything fails; the last line is a one-line summary
// (the uptime workflow puts it in its Telegram alert).

const base = (process.argv[2] || process.env.BASE_URL || "https://salesiq.uz").replace(/\/$/, "");
const ZERO = "00000000-0000-0000-0000-000000000000";

/** @type {{ name: string; path: string; init?: RequestInit; status: number; check?: (body: string) => boolean }[]} */
const checks = [
  {
    name: "health",
    path: "/health",
    status: 200,
    check: (b) => JSON.parse(b).ok === true,
  },
  { name: "landing", path: "/", status: 200, check: (b) => b.includes("SalesIQ") },
  { name: "pricing", path: "/pricing", status: 200, check: (b) => b.includes("<html") },
  { name: "login", path: "/login", status: 200, check: (b) => b.includes("<html") },
  { name: "signup", path: "/signup", status: 200, check: (b) => b.includes("<html") },
  {
    name: "pricing api",
    path: "/api/pricing",
    status: 200,
    // 0 is allowed: the landing then shows "Biz bilan bog'laning".
    check: (b) => typeof JSON.parse(b).priceStartIqUzs === "number",
  },
  { name: "manifest", path: "/manifest.webmanifest", status: 200 },
  { name: "service worker", path: "/sw.js", status: 200 },
  { name: "pay page", path: `/pay/${ZERO}`, status: 200, check: (b) => b.includes("<html") },
  { name: "unknown pay link", path: `/lead-payments/public?id=${ZERO}`, status: 404 },
  { name: "signed-out API", path: "/account/first-steps", status: 401 },
  {
    name: "payme callback, no key",
    path: `/lead-payments/payme/${ZERO}`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1, method: "CheckPerformTransaction", params: {} }),
    },
    status: 200,
    check: (b) => JSON.parse(b).error?.code === -32504,
  },
];

const failures = [];
for (const c of checks) {
  const started = Date.now();
  let line;
  try {
    const res = await fetch(base + c.path, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      ...c.init,
    });
    const body = await res.text();
    let ok = res.status === c.status;
    if (ok && c.check) {
      try {
        ok = c.check(body);
      } catch {
        ok = false;
      }
    }
    const ms = Date.now() - started;
    const cache = res.headers.get("x-vercel-cache");
    line = `${ok ? "ok  " : "FAIL"} ${c.name.padEnd(24)} ${res.status} ${String(ms).padStart(5)} ms${cache ? ` ${cache}` : ""}`;
    if (!ok) failures.push(`${c.name} (${res.status})`);
  } catch (err) {
    line = `FAIL ${c.name.padEnd(24)} ${err instanceof Error ? err.message : err}`;
    failures.push(`${c.name} (no answer)`);
  }
  console.log(line);
}

console.log(
  failures.length
    ? `Smoke: ${failures.length}/${checks.length} failed — ${failures.join(", ")}`
    : `Smoke: all ${checks.length} checks passed on ${base}`,
);
process.exit(failures.length ? 1 : 0);
