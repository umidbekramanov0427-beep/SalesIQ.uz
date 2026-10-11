import { isPublicHttpUrl } from "@/lib/telephony/telephony-data.server";

describe("isPublicHttpUrl (recording links from webhooks)", () => {
  it("allows public http(s) hosts", () => {
    expect(isPublicHttpUrl("https://records.onpbx.ru/abc.mp3")).toBe(true);
    expect(isPublicHttpUrl("http://8.8.8.8/file.mp3")).toBe(true);
  });

  it.each([
    "http://localhost/x",
    "http://127.0.0.1/x",
    "http://10.1.2.3/x",
    "http://172.20.0.1/x",
    "http://192.168.1.10/x",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.0.1/x",
    "http://[::1]/x",
    "http://[fd00::1]/x",
    "http://metadata.internal/x",
    "http://intranet/x",
    "ftp://example.com/x",
    "file:///etc/passwd",
    "https://user:pass@example.com/x",
    "not a url",
  ])("blocks %s", (url) => {
    expect(isPublicHttpUrl(url)).toBe(false);
  });
});
