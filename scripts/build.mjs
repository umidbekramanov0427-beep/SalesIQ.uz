// `npm run build`: builds into .output-next and only then swaps it in for
// .output. The live server keeps serving from .output while the build runs
// (the deploy builds on the same VPS), so open tabs never lose their page
// files for the minutes a build takes, and a failed build leaves the
// running site untouched. The previous build's page chunks are kept for
// tabs opened before the deploy (keep-old-assets.mjs).
import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";

const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const NEXT = ".output-next";
rmSync(NEXT, { recursive: true, force: true });
run(process.execPath, ["scripts/keep-old-assets.mjs"]);
run(process.execPath, ["node_modules/vite/bin/vite.js", "build"], { NITRO_OUTPUT_DIR: NEXT });
if (!existsSync(`${NEXT}/server/index.mjs`)) {
  console.error(`build: ${NEXT}/server/index.mjs is missing, .output left as it was`);
  process.exit(1);
}
rmSync(".output-prev", { recursive: true, force: true });
if (existsSync(".output")) renameSync(".output", ".output-prev");
renameSync(NEXT, ".output");
rmSync(".output-prev", { recursive: true, force: true });
console.log("build: .output replaced");
