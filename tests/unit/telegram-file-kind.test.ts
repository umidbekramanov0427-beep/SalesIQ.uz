import { telegramFileKind } from "@/lib/telegram-report.server";

describe("telegramFileKind", () => {
  it("sends videos, GIFs and round videos as themselves", () => {
    expect(telegramFileKind("video/mp4", "clip.mp4")).toBe("video");
    expect(telegramFileKind("video/quicktime", "IMG_1.MOV")).toBe("video");
    expect(telegramFileKind("image/gif", "fun.gif")).toBe("animation");
    expect(telegramFileKind("video/mp4", "round-101500.mp4")).toBe("video_note");
  });

  it("keeps photos, voice notes, songs and documents", () => {
    expect(telegramFileKind("image/jpeg", "a.jpg")).toBe("photo");
    expect(telegramFileKind("audio/ogg", "voice-101500.ogg")).toBe("voice");
    expect(telegramFileKind("audio/mpeg", "song.mp3")).toBe("audio");
    expect(telegramFileKind("application/pdf", "offer.pdf")).toBe("document");
  });
});
