import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TIPS } from "@/lib/help/tips";
import { NAV_ITEMS } from "@/lib/nav";
import { MARKETING_NAV } from "@/components/marketing/MarketingShell";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("explainers (!)", () => {
  it("are written in all three languages", () => {
    for (const [key, tip] of Object.entries(TIPS)) {
      for (const part of [tip.what, tip.calc, tip.act]) {
        if (!part) continue;
        for (const l of ["uz", "ru", "en"] as const)
          expect(part[l].trim().length, `${key}.${l}`).toBeGreaterThan(3);
      }
    }
  });

  it("exist for every card that names its key", () => {
    const keys = new Set<string>();
    for (const f of files(fileURLToPath(new URL("../../src", import.meta.url))))
      for (const m of readFileSync(f, "utf8").matchAll(/tipKey="([^"]+)"/g)) keys.add(m[1]!);
    const missing = [...keys].filter((k) => !TIPS[k]);
    expect(missing).toEqual([]);
  });

  it("exist for every menu item", () => {
    const paths = [
      ...NAV_ITEMS.filter((i) => !i.optional).map((i) => i.to),
      ...MARKETING_NAV.map((i) => i.to),
    ];
    const missing = paths.filter((p) => !TIPS[`nav:${p}`]);
    expect(missing).toEqual([]);
  });
});
