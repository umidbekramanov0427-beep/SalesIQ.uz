import {
  backupDueDay,
  errText,
  isRetryable,
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

describe("company backup rules", () => {
  it("is on only with a chat and a valid time", async () => {
    const { parseCompanyBackup } = await import("@/lib/telegram-backup");
    expect(parseCompanyBackup(null)).toEqual({ enabled: false, time: "03:30", chatId: null });
    expect(parseCompanyBackup({ enabled: true, time: "05:00" }).enabled).toBe(false);
    expect(parseCompanyBackup({ enabled: true, time: "25:00", chatId: -100 })).toEqual({
      enabled: true,
      time: "03:30",
      chatId: -100,
    });
  });
});

describe("errText / isRetryable", () => {
  const netErr = () =>
    new TypeError("fetch failed", {
      cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
    });

  it("shows the network cause behind 'fetch failed'", () => {
    expect(errText(netErr())).toBe("fetch failed (UND_ERR_SOCKET: other side closed)");
    expect(errText(new Error("plain"))).toBe("plain");
    expect(errText("x")).toBe("x");
  });

  it("retries network trouble and Telegram 5xx/429, not other refusals", () => {
    expect(isRetryable(netErr())).toBe(true);
    expect(isRetryable(new Error("Telegram sendDocument: fetch failed (ECONNRESET)"))).toBe(true);
    expect(isRetryable(new Error("Telegram sendDocument failed (502): Bad Gateway"))).toBe(true);
    expect(isRetryable(new Error("Telegram sendDocument failed (429): Too Many"))).toBe(true);
    expect(isRetryable(new Error("Telegram sendDocument failed (400): chat not found"))).toBe(
      false,
    );
    expect(isRetryable(new Error("Telegram sendDocument failed (403): bot was kicked"))).toBe(
      false,
    );
  });
});
