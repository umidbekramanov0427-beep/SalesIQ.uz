import { ownRecordingPath } from "@/lib/recording-url";

describe("ownRecordingPath", () => {
  it("finds the path of recordings in our own bucket", () => {
    expect(
      ownRecordingPath(
        "https://api.salesiq.uz/storage/v1/object/public/call-recordings/dfca943e/1789756855813-7pry3mh0y.mp3",
      ),
    ).toBe("dfca943e/1789756855813-7pry3mh0y.mp3");
    expect(
      ownRecordingPath(
        "https://old-host.example/storage/v1/object/public/call-recordings/pbx/org-1/call-2.wav",
      ),
    ).toBe("pbx/org-1/call-2.wav");
  });

  it("drops the query of signed links and decodes the path", () => {
    expect(
      ownRecordingPath(
        "https://api.salesiq.uz/storage/v1/object/sign/call-recordings/u1/a%20b.mp3?token=abc",
      ),
    ).toBe("u1/a b.mp3");
  });

  it("leaves other links alone", () => {
    expect(ownRecordingPath(null)).toBeNull();
    expect(ownRecordingPath("")).toBeNull();
    expect(ownRecordingPath("https://records.onpbx.ru/abc.mp3")).toBeNull();
    expect(
      ownRecordingPath("https://api.salesiq.uz/storage/v1/object/public/lesson-videos/x.mp4"),
    ).toBeNull();
  });
});
