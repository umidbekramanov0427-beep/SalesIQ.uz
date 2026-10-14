import { readFileSync, writeFileSync } from "node:fs";
import { oggCrc, opusPacketSamples, readWebmOpus, webmToOgg } from "@/lib/audio/webm-to-ogg";

const webm = new Uint8Array(readFileSync(new URL("../fixtures/voice.webm", import.meta.url)));

describe("webmToOgg", () => {
  it("reads the Opus packets and the OpusHead out of a WebM recording", () => {
    const track = readWebmOpus(webm);
    expect(track.head && new TextDecoder().decode(track.head.slice(0, 8))).toBe("OpusHead");
    // 2 s of 20 ms frames.
    expect(track.packets.length).toBeGreaterThanOrEqual(95);
    const samples = track.packets.reduce((n, p) => n + opusPacketSamples(p.data), 0);
    expect(samples / 48000).toBeCloseTo(2, 0);
  });

  it("writes valid Ogg pages: magic, CRC, BOS/EOS, OpusHead then OpusTags", () => {
    const ogg = webmToOgg(webm);
    if (process.env["OGG_OUT"]) writeFileSync(process.env["OGG_OUT"], ogg);
    let pos = 0;
    let pages = 0;
    const flags: number[] = [];
    while (pos < ogg.length) {
      expect(new TextDecoder().decode(ogg.slice(pos, pos + 4))).toBe("OggS");
      const nseg = ogg[pos + 26]!;
      const body = ogg.slice(pos + 27, pos + 27 + nseg).reduce((n, s) => n + s, 0);
      const page = ogg.slice(pos, pos + 27 + nseg + body);
      const crc = new DataView(page.buffer).getUint32(22, true);
      page.set([0, 0, 0, 0], 22);
      expect(oggCrc(page)).toBe(crc);
      if (pages === 0) {
        expect(new TextDecoder().decode(page.slice(27 + nseg, 35 + nseg))).toBe("OpusHead");
      }
      if (pages === 1) {
        expect(new TextDecoder().decode(page.slice(27 + nseg, 35 + nseg))).toBe("OpusTags");
      }
      flags.push(page[5]!);
      pos += page.length;
      pages++;
    }
    expect(flags[0]).toBe(0x02);
    expect(flags[flags.length - 1]).toBe(0x04);
  });
});
