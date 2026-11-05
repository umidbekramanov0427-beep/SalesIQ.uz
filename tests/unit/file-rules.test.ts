import {
  formatBytes,
  purgeBefore,
  retentionCutoff,
  shouldCopyChatFile,
  trashDaysLeft,
} from "@/lib/file-rules";

const DAY = 24 * 60 * 60 * 1000;

describe("file rules", () => {
  it("copies chat files by the company's choice, Instagram-only by default", () => {
    expect(shouldCopyChatFile(null, "instagram")).toBe(true);
    expect(shouldCopyChatFile(null, "telegram")).toBe(false);
    expect(shouldCopyChatFile("smart", "telegram")).toBe(false);
    expect(shouldCopyChatFile("all", "telegram")).toBe(true);
    expect(shouldCopyChatFile("none", "instagram")).toBe(false);
    expect(shouldCopyChatFile("weird", "instagram")).toBe(true);
  });

  it("counts the days a trashed file has left", () => {
    const now = Date.UTC(2026, 10, 5);
    expect(trashDaysLeft(new Date(now).toISOString(), now)).toBe(30);
    expect(trashDaysLeft(new Date(now - 29.5 * DAY).toISOString(), now)).toBe(1);
    expect(trashDaysLeft(new Date(now - 40 * DAY).toISOString(), now)).toBe(0);
    expect(purgeBefore(now)).toBe(new Date(now - 30 * DAY).toISOString());
  });

  it("works out the rule cut-offs and sizes", () => {
    const now = Date.UTC(2026, 10, 5);
    expect(retentionCutoff(null, now)).toBeNull();
    expect(retentionCutoff(10, now)).toBe(new Date(now - 10 * DAY).toISOString());
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(1536)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });
});
