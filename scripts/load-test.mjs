// Load test of the public pages (see .github/workflows/load-test.yml).
// Uses autocannon through npx (not a dependency: bun.lock resolves from a
// private registry). Prints a Markdown report.
import { execFileSync } from "node:child_process";

const BASE = (process.env.BASE_URL || "https://salesiq.uz").replace(/\/$/, "");
const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Number(v) || d));
const CONNECTIONS = clamp(process.env.CONNECTIONS, 1, 100, 20);
const SECONDS = clamp(process.env.SECONDS, 5, 60, 20);

const PAGES = [
  { path: "/", what: "Landing (SSR)" },
  { path: "/pricing", what: "Narxlar" },
  { path: "/login", what: "Kirish" },
  { path: "/api/pricing", what: "Narxlar API (baza)" },
  { path: "/health", what: "Health (ilova + baza)" },
];

function run(path) {
  const out = execFileSync(
    "npx",
    [
      "--yes",
      "autocannon@7.15.0",
      "--json",
      "-c",
      String(CONNECTIONS),
      "-d",
      String(SECONDS),
      "-H",
      "user-agent=salesiq-load-test",
      `${BASE}${path}`,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
  );
  return JSON.parse(out);
}

const rows = [];
for (const p of PAGES) {
  const r = run(p.path);
  const total = r.requests.total;
  const bad = (r.non2xx ?? 0) + (r.errors ?? 0) + (r.timeouts ?? 0);
  rows.push({
    ...p,
    rps: Math.round(r.requests.average),
    total,
    p50: r.latency.p50,
    p90: r.latency.p90,
    p99: r.latency.p99,
    max: r.latency.max,
    bad,
    errRate: total ? (bad / total) * 100 : 0,
  });
  // A short pause so one page's tail doesn't skew the next one.
  await new Promise((res) => setTimeout(res, 3000));
}

const verdict = (row) => (row.errRate > 1 ? "🔴" : row.p99 > 3000 || row.p90 > 1500 ? "🟡" : "🟢");

console.log(`## Yuklama testi — ${BASE}`);
console.log("");
console.log(
  `${new Date().toISOString()} · ${CONNECTIONS} ta ulanish · har sahifa ${SECONDS} soniya`,
);
console.log("");
console.log("| | Sahifa | So'rov/s | Jami | p50 ms | p90 ms | p99 ms | Max ms | Xato |");
console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|");
for (const r of rows) {
  console.log(
    `| ${verdict(r)} | \`${r.path}\` ${r.what} | ${r.rps} | ${r.total} | ${r.p50} | ${r.p90} | ${r.p99} | ${r.max} | ${r.bad} (${r.errRate.toFixed(1)}%) |`,
  );
}
console.log("");
console.log("🟢 yaxshi · 🟡 sekin (p90 > 1.5 s yoki p99 > 3 s) · 🔴 xatolar > 1%");
