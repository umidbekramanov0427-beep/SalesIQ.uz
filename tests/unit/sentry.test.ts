import { buildEnvelope, captureToSentry, parseDsn, parseStack } from "@/lib/sentry.server";

const DSN = "https://abc123@o42.ingest.us.sentry.io/777";

describe("sentry forwarding", () => {
  it("turns a DSN into the envelope endpoint and key", () => {
    expect(parseDsn(DSN)).toEqual({
      endpoint: "https://o42.ingest.us.sentry.io/api/777/envelope/",
      publicKey: "abc123",
      raw: DSN,
    });
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn("not a url")).toBeNull();
  });

  it("parses V8 and Firefox stacks, oldest call first", () => {
    const frames = parseStack(
      [
        "TypeError: x is undefined",
        "    at load (https://salesiq.uz/assets/app.js:10:5)",
        "    at https://salesiq.uz/node_modules/react.js:1:2",
      ].join("\n"),
    );
    expect(frames.map((f) => [f.function, f.lineno, f.in_app])).toEqual([
      [undefined, 1, false],
      ["load", 10, true],
    ]);
    expect(parseStack("render@https://salesiq.uz/a.js:3:4")[0]).toMatchObject({
      function: "render",
      lineno: 3,
    });
  });

  it("builds an envelope with the error type, tags and user", () => {
    const [header, item, payload] = buildEnvelope(parseDsn(DSN)!, {
      message: "TypeError: boom",
      level: "error",
      source: "client",
      transaction: "/crm/leads",
      userId: "u1",
      tags: { status: 500, skip: undefined },
    }).split("\n");
    expect(JSON.parse(header!).dsn).toBe(DSN);
    expect(JSON.parse(item!)).toEqual({ type: "event" });
    const event = JSON.parse(payload!);
    expect(event.exception.values[0]).toMatchObject({ type: "TypeError", value: "boom" });
    expect(event.tags).toEqual({ source: "client", status: "500" });
    expect(event.user).toEqual({ id: "u1" });
    expect(event.transaction).toBe("/crm/leads");
  });

  it("does nothing without SENTRY_DSN and never throws", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SENTRY_DSN", "");
    await captureToSentry({ message: "x", level: "error", source: "client" });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("SENTRY_DSN", DSN);
    await expect(
      captureToSentry({ message: "x", level: "error", source: "client" }),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
