import crypto from "node:crypto";
import { telegramDisplayName, validateInitData } from "@/lib/telegram/init-data.server";

const BOT_TOKEN = "123456:TEST-token";

function sign(fields: Record<string, string>, token = BOT_TOKEN): string {
  const dataCheck = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const now = () => String(Math.floor(Date.now() / 1000));
const user = JSON.stringify({ id: 42, first_name: "Ali", last_name: "Valiyev", username: "ali" });

describe("validateInitData", () => {
  it("accepts data signed with the bot token", () => {
    const v = validateInitData(sign({ auth_date: now(), user, start_param: "org-1" }), BOT_TOKEN);
    expect(v?.user.id).toBe(42);
    expect(v?.startParam).toBe("org-1");
  });

  it("rejects a different bot token, tampering and a missing hash", () => {
    const signed = sign({ auth_date: now(), user });
    expect(validateInitData(signed, "999:other")).toBeNull();
    expect(validateInitData(signed.replace("Ali", "Bob"), BOT_TOKEN)).toBeNull();
    expect(
      validateInitData(`auth_date=${now()}&user=${encodeURIComponent(user)}`, BOT_TOKEN),
    ).toBeNull();
  });

  it("rejects stale launch data and data without a user", () => {
    const old = String(Math.floor(Date.now() / 1000) - 2 * 86_400);
    expect(validateInitData(sign({ auth_date: old, user }), BOT_TOKEN)).toBeNull();
    expect(validateInitData(sign({ auth_date: now() }), BOT_TOKEN)).toBeNull();
  });

  it("builds a display name", () => {
    expect(telegramDisplayName({ first_name: "Ali", last_name: "Valiyev" })).toBe("Ali Valiyev");
    expect(telegramDisplayName({})).toBe("");
  });
});
