import { fileKindOf, kindsFilter, parseMoreFileRules, uploadRefusal } from "@/lib/file-rules";

describe("more file rules", () => {
  it("parses safely: big-file rule needs both numbers, uploads capped at 20 MB", () => {
    expect(parseMoreFileRules(null).blockedExt).toEqual([]);
    const r = parseMoreFileRules({
      wonDays: 30,
      bigMb: 10,
      bigDays: null,
      oldKinds: ["video", "x", "audio"],
      maxUploadMb: 50,
      blockedExt: [".EXE", "apk", "bad ext", "apk"],
    });
    expect(r).toEqual({
      wonDays: 30,
      bigMb: null,
      bigDays: null,
      oldKinds: ["video", "audio"],
      maxUploadMb: null,
      blockedExt: ["exe", "apk"],
    });
    expect(parseMoreFileRules({ bigMb: 10, bigDays: 90 })).toMatchObject({
      bigMb: 10,
      bigDays: 90,
    });
  });

  it("tells file kinds by type or name", () => {
    expect(fileKindOf("video/mp4")).toBe("video");
    expect(fileKindOf("audio/ogg")).toBe("audio");
    expect(fileKindOf(null, "photo.JPG")).toBe("image");
    expect(fileKindOf("application/pdf", "shartnoma.pdf")).toBe("document");
  });

  it("refuses uploads over the limit or of a blocked type", () => {
    const rules = parseMoreFileRules({ maxUploadMb: 5, blockedExt: ["exe"] });
    expect(uploadRefusal(rules, { name: "a.pdf", size: 6 * 1024 * 1024 })).toEqual({
      reason: "size",
      limitMb: 5,
    });
    expect(uploadRefusal(rules, { name: "setup.EXE", size: 10 })).toEqual({
      reason: "type",
      ext: "exe",
    });
    expect(uploadRefusal(rules, { name: "a.pdf", size: 10 })).toBeNull();
    expect(
      uploadRefusal(parseMoreFileRules({}), { name: "big.mp4", size: 21 * 1024 * 1024 }),
    ).toEqual({
      reason: "size",
      limitMb: 20,
    });
  });

  it("builds the kind filter for the clean-up", () => {
    expect(kindsFilter([])).toBeNull();
    expect(kindsFilter(["video", "audio"])).toBe("mime_type.like.video/*,mime_type.like.audio/*");
    expect(kindsFilter(["document"])).toBe(
      "and(mime_type.not.like.image/*,mime_type.not.like.video/*,mime_type.not.like.audio/*),mime_type.is.null",
    );
  });
});
