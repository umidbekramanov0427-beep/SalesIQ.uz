// Runs before every build (package.json "build"). A browser tab opened
// before a deploy still asks for the previous build's page chunks
// (/assets/<name>-<hash>.js); the new build renamed them, so opening another
// section failed to load and the person stayed where they were. Copying the
// previous build's assets into public/assets (gitignored) makes Vite ship
// them again next to the new ones, so old tabs keep working until they
// reload. Copies older than KEEP_DAYS are dropped, so the folder stays small.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const KEEP_DAYS = 3;
const built = ".output/public/assets";
const kept = "public/assets";

mkdirSync(kept, { recursive: true });
let copied = 0;
if (existsSync(built)) {
  for (const name of readdirSync(built)) {
    if (!/\.(js|css|mjs)$/.test(name) || existsSync(join(kept, name))) continue;
    copyFileSync(join(built, name), join(kept, name));
    copied++;
  }
}
let dropped = 0;
const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
for (const name of readdirSync(kept)) {
  const file = join(kept, name);
  if (statSync(file).mtimeMs < cutoff) {
    unlinkSync(file);
    dropped++;
  }
}
console.log(`keep-old-assets: kept ${copied} new, dropped ${dropped} old`);
