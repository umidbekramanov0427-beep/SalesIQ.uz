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
    // Flip a bit of the ciphertext (a fixed replacement byte matched it 1 time in 256).
    const body = Buffer.from(parts[3]!, "base64url");
    body[0] = body[0]! ^ 1;
    parts[3] = body.toString("base64url");
    expect(openSecret(parts.join("."))).toBeNull();
    expect(openSecret("garbage")).toBeNull();
    expect(openSecret(null)).toBeNull();
    process.env["INTEGRATIONS_SECRET"] = "another-key";
    expect(openSecret(sealed)).toBeNull();
  });
});
