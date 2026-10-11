// src/server.ts wraps every request: 5xx responses and slow person-facing
// requests are handed to recordServerIssue; normal traffic is not touched.
const handlerFetch = vi.fn<(r: Request) => Promise<Response>>();
const recordServerIssue = vi.fn(async () => undefined);

vi.mock("@tanstack/react-start/server-entry", () => ({ default: { fetch: handlerFetch } }));
vi.mock("@/lib/monitoring.server", () => ({ recordServerIssue }));

const { default: server } = await import("@/server");

const call = (url: string, init?: RequestInit) => server.fetch(new Request(url, init), {}, {});

beforeEach(() => {
  handlerFetch.mockReset();
  recordServerIssue.mockClear();
  vi.useRealTimers();
});

describe("server monitoring", () => {
  it("ignores normal fast responses", async () => {
    handlerFetch.mockResolvedValue(new Response("ok"));
    const res = await call("https://salesiq.uz/dashboard");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-app-build")).toBeTruthy();
    expect(recordServerIssue).not.toHaveBeenCalled();
  });

  it("records a 5xx with the route's own error message and no query string", async () => {
    handlerFetch.mockResolvedValue(Response.json({ error: "boom" }, { status: 500 }));
    await call("https://salesiq.uz/integrations/telephony/call?secret=abc", { method: "POST" });
    expect(recordServerIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "server_error",
        method: "POST",
        path: "/integrations/telephony/call",
        status: 500,
        message: "boom",
      }),
    );
  });

  it("records a thrown error as a 500", async () => {
    handlerFetch.mockRejectedValue(new Error("kaboom"));
    const res = await call("https://salesiq.uz/x");
    expect(res.status).toBe(500);
    expect(recordServerIssue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "server_error", message: "kaboom", status: 500 }),
    );
  });

  it("records slow requests, but not slow background jobs", async () => {
    const start = Date.now();
    const now = vi.spyOn(Date, "now");
    handlerFetch.mockImplementation(async () => {
      now.mockReturnValue(start + 12_000);
      return new Response("ok");
    });
    now.mockReturnValue(start);
    await call("https://salesiq.uz/lead-analytics");
    expect(recordServerIssue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "slow_request", path: "/lead-analytics", status: 200 }),
    );

    recordServerIssue.mockClear();
    now.mockReturnValue(start);
    await call("https://salesiq.uz/audio-analytics/analyze-pending", {
      method: "POST",
      headers: { "x-cron-secret": "s" },
    });
    expect(recordServerIssue).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it("never records failures of the error logger itself", async () => {
    handlerFetch.mockResolvedValue(Response.json({ error: "db down" }, { status: 500 }));
    await call("https://salesiq.uz/errors/log", { method: "POST" });
    expect(recordServerIssue).not.toHaveBeenCalled();
  });
});
