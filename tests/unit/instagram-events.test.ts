import { isInstagramCdnUrl, parseInstagramWebhook, safeReturnOrigin } from "@/lib/instagram/events";

const ACC = "17841400000000001";
const wrap = (messaging: unknown[]) => ({
  object: "instagram",
  entry: [{ id: ACC, time: 1, messaging }],
});

describe("parseInstagramWebhook", () => {
  it("reads a client's text message", () => {
    const [m] = parseInstagramWebhook(
      wrap([
        {
          sender: { id: "C1" },
          recipient: { id: ACC },
          timestamp: 1700000000000,
          message: { mid: "m1", text: " Salom " },
        },
      ]),
    );
    expect(m).toEqual({
      accountId: ACC,
      clientId: "C1",
      echo: false,
      mid: "m1",
      text: "Salom",
      file: null,
      at: 1700000000000,
    });
  });

  it("treats our own replies as echoes to the client", () => {
    const [m] = parseInstagramWebhook(
      wrap([
        {
          sender: { id: ACC },
          recipient: { id: "C1" },
          message: { mid: "m2", text: "Javob", is_echo: true },
        },
      ]),
    );
    expect(m).toMatchObject({ clientId: "C1", echo: true, text: "Javob" });
  });

  it("keeps one file and turns other attachments into text", () => {
    const [m] = parseInstagramWebhook(
      wrap([
        {
          sender: { id: "C1" },
          recipient: { id: ACC },
          message: {
            mid: "m3",
            attachments: [
              { type: "image", payload: { url: "https://scontent.cdninstagram.com/a.jpg" } },
              { type: "share", payload: { url: "https://www.instagram.com/p/x" } },
            ],
          },
        },
      ]),
    );
    expect(m!.file).toEqual({ kind: "photo", url: "https://scontent.cdninstagram.com/a.jpg" });
    expect(m!.text).toContain("https://www.instagram.com/p/x");
  });

  it("skips reads, reactions, deletions and other objects", () => {
    expect(
      parseInstagramWebhook(
        wrap([
          { sender: { id: "C1" }, recipient: { id: ACC }, read: { mid: "m1" } },
          {
            sender: { id: "C1" },
            recipient: { id: ACC },
            message: { mid: "m4", is_deleted: true },
          },
        ]),
      ),
    ).toEqual([]);
    expect(parseInstagramWebhook({ object: "page", entry: [] })).toEqual([]);
    expect(parseInstagramWebhook(null)).toEqual([]);
  });
});

describe("isInstagramCdnUrl", () => {
  it("only allows Meta's CDNs over https", () => {
    expect(isInstagramCdnUrl("https://scontent-arn2-1.cdninstagram.com/v/x.jpg")).toBe(true);
    expect(isInstagramCdnUrl("https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1")).toBe(
      true,
    );
    expect(isInstagramCdnUrl("http://scontent.cdninstagram.com/x.jpg")).toBe(false);
    expect(isInstagramCdnUrl("https://evil.com/cdninstagram.com")).toBe(false);
    expect(isInstagramCdnUrl("https://127.0.0.1/x")).toBe(false);
  });
});

describe("safeReturnOrigin", () => {
  it("keeps company addresses and refuses other sites", () => {
    expect(safeReturnOrigin("https://acme.salesiq.uz", "salesiq.uz")).toBe(
      "https://acme.salesiq.uz",
    );
    expect(safeReturnOrigin("http://localhost:8080", "salesiq.uz")).toBe("http://localhost:8080");
    expect(safeReturnOrigin("https://salesiq.uz.evil.com", "salesiq.uz")).toBe(
      "https://salesiq.uz",
    );
    expect(safeReturnOrigin("http://acme.salesiq.uz", "salesiq.uz")).toBe("https://salesiq.uz");
    expect(safeReturnOrigin(null, "salesiq.uz")).toBe("https://salesiq.uz");
  });
});
