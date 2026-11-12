import {
  backupDueDay,
  backupFileName,
  isSecretKey,
  splitParts,
  stripSecrets,
} from "@/lib/telegram-backup";
import { encryptForOpenssl } from "@/lib/telegram-backup.server";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";

describe("telegram backup", () => {
  it("is due once the Tashkent time has passed", () => {
    // 22:59Z = 03:59 Tashkent next day
    expect(backupDueDay("04:00", new Date("2026-11-12T22:59:00Z"))).toBeNull();
    expect(backupDueDay("04:00", new Date("2026-11-12T23:00:00Z"))).toBe("2026-11-13");
    expect(backupDueDay("23:30", new Date("2026-11-13T18:31:00Z"))).toBe("2026-11-13");
    expect(backupDueDay("7:00", new Date())).toBeNull();
  });

  it("never lets secrets out, at any depth", () => {
    expect(isSecretKey("access_token")).toBe(true);
    expect(isSecretKey("payme_key_sealed")).toBe(true);
    expect(isSecretKey("p256dh")).toBe(true);
    expect(isSecretKey("phone")).toBe(false);
    expect(isSecretKey("stage_key")).toBe(false);
    expect(
      stripSecrets([{ id: 1, phone: "+998", api_key: "x", config: { url: "u", secret: "s" } }]),
    ).toEqual([{ id: 1, phone: "+998", config: { url: "u" } }]);
  });

  it("names files and splits big ones", () => {
    expect(backupFileName({ name: "Demo savdo", subdomain: "demo" }, "2026-11-13")).toBe(
      "salesiq-demo-2026-11-13.json.gz",
    );
    expect(backupFileName({ name: "O'quv markazi №1" }, "2026-11-13")).toBe(
      "salesiq-o-quv-markazi-no1-2026-11-13.json.gz",
    );
    const parts = splitParts(new Uint8Array(10), 4);
    expect(parts.map((p) => p.length)).toEqual([4, 4, 2]);
  });

  it("encrypts the way openssl enc -aes-256-cbc -pbkdf2 reads", () => {
    const data = new TextEncoder().encode('{"ok":true}');
    const enc = Buffer.from(encryptForOpenssl(data, "parol"));
    expect(enc.subarray(0, 8).toString()).toBe("Salted__");
    const kv = pbkdf2Sync("parol", enc.subarray(8, 16), 100_000, 48, "sha256");
    const d = createDecipheriv("aes-256-cbc", kv.subarray(0, 32), kv.subarray(32, 48));
    const out = Buffer.concat([d.update(enc.subarray(16)), d.final()]).toString();
    expect(out).toBe('{"ok":true}');
  });
});
