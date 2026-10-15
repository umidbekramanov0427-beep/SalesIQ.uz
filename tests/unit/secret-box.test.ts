import { openSecret, sealSecret } from "@/lib/secret-box.server";

describe("secret box", () => {
  beforeAll(() => {
    process.env["INTEGRATIONS_SECRET"] = "test-key";
  });
  it("round-trips and never stores the plain text", () => {
    const sealed = sealSecret("parol-123");
    expect(sealed).not.toContain("parol");
    expect(openSecret(sealed)).toBe("parol-123");
    expect(sealSecret("parol-123")).not.toBe(sealed);
  });
  it("refuses tampered or foreign values", () => {
    const sealed = sealSecret("x");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("y").toString("base64url");
    expect(openSecret(parts.join("."))).toBeNull();
    expect(openSecret("garbage")).toBeNull();
    expect(openSecret(null)).toBeNull();
    process.env["INTEGRATIONS_SECRET"] = "another-key";
    expect(openSecret(sealed)).toBeNull();
  });
});
