import { clientAppEnv, serverAppEnv } from "@/lib/app-env";

describe("app environment", () => {
  it("tells copies apart by address", () => {
    expect(clientAppEnv("salesiq.uz")).toBe("production");
    expect(clientAppEnv("mvp.salesiq.uz")).toBe("production");
    expect(clientAppEnv("salesiq-git-staging-sales-os3.vercel.app")).toBe("staging");
    expect(clientAppEnv("localhost")).toBe("development");
  });

  it("follows Vercel's environment on the server unless APP_ENV is set", () => {
    const saved = { app: process.env["APP_ENV"], vercel: process.env["VERCEL_ENV"] };
    delete process.env["APP_ENV"];
    process.env["VERCEL_ENV"] = "preview";
    expect(serverAppEnv()).toBe("staging");
    process.env["VERCEL_ENV"] = "production";
    expect(serverAppEnv()).toBe("production");
    process.env["APP_ENV"] = "staging";
    expect(serverAppEnv()).toBe("staging");
    if (saved.app === undefined) delete process.env["APP_ENV"];
    else process.env["APP_ENV"] = saved.app;
    if (saved.vercel === undefined) delete process.env["VERCEL_ENV"];
    else process.env["VERCEL_ENV"] = saved.vercel;
  });
});
