// Chrome records voice as WebM/Opus, but Telegram takes a voice message
// only as OGG/Opus (or MP3/M4A). The sound itself is the same Opus either
// way, so this just moves the packets from the WebM container into an Ogg
// one -- no re-encoding, no dependency. Firefox records OGG already and
// Safari M4A, so they skip this.

// ---- WebM (EBML) reading -------------------------------------------------

const ID = {
  segment: 0x18538067,
  cluster: 0x1f43b675,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  blockGroup: 0xa0,
  codecPrivate: 0x63a2,
  timecode: 0xe7,
  simpleBlock: 0xa3,
  block: 0xa1,
} as const;

/** Elements whose children are read in place (sizes may be "unknown" while recording). */
const MASTERS = new Set<number>([
  ID.segment,
  ID.cluster,
  ID.tracks,
  ID.trackEntry,
  ID.blockGroup,
]);

function readVint(b: Uint8Array, pos: number, keepMarker: boolean) {
  const first = b[pos];
  if (first === undefined) return null;
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8 || pos + len > b.length) return null;
  let value = keepMarker ? first : first & (0xff >> len);
  let allOnes = value === (keepMarker ? first : 0xff >> len);
  for (let i = 1; i < len; i++) {
    value = value * 256 + b[pos + i]!;
    if (b[pos + i] !== 0xff) allOnes = false;
  }
  return { value, len, unknown: !keepMarker && allOnes };
}

export type OpusTrack = { head: Uint8Array | null; packets: { timeMs: number; data: Uint8Array }[] };

/** The Opus packets of a WebM file, with their times, plus the OpusHead if present. */
export function readWebmOpus(b: Uint8Array): OpusTrack {
  const out: OpusTrack = { head: null, packets: [] };
  let clusterTime = 0;
  let pos = 0;
  while (pos < b.length) {
    const id = readVint(b, pos, true);
    if (!id) break;
    const size = readVint(b, pos + id.len, false);
    if (!size) break;
    const start = pos + id.len + size.len;
    if (MASTERS.has(id.value)) {
      pos = start; // read the children in place
      continue;
    }
    const end = size.unknown ? b.length : Math.min(b.length, start + size.value);
    const data = b.subarray(start, end);
    if (id.value === ID.codecPrivate) out.head = data.slice();
    else if (id.value === ID.timecode) {
      clusterTime = 0;
      for (const byte of data) clusterTime = clusterTime * 256 + byte;
    } else if (id.value === ID.simpleBlock || id.value === ID.block) {
      const track = readVint(data, 0, false);
      if (track && data.length > track.len + 3) {
        const rel = (data[track.len]! << 8) | data[track.len + 1]!;
        const relSigned = rel & 0x8000 ? rel - 0x10000 : rel;
        const flags = data[track.len + 2]!;
        // MediaRecorder never laces audio frames; laced blocks are skipped.
        if ((flags & 0x06) === 0) {
          out.packets.push({
            timeMs: clusterTime + relSigned,
            data: data.slice(track.len + 3),
          });
        }
      }
    }
    pos = end;
  }
  return out;
}

// ---- Ogg writing ------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]!) >>> 0;
  return crc >>> 0;
}

function oggPage(
  packet: Uint8Array,
  granule: number,
  serial: number,
  seq: number,
  flags: number,
): Uint8Array {
  const segments: number[] = [];
  let left = packet.length;
  while (left >= 255) {
    segments.push(255);
    left -= 255;
  }
  segments.push(left);
  const page = new Uint8Array(27 + segments.length + packet.length);
  const v = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  page[4] = 0;
  page[5] = flags;
  v.setUint32(6, granule % 0x100000000, true);
  v.setUint32(10, Math.floor(granule / 0x100000000), true);
  v.setUint32(14, serial, true);
  v.setUint32(18, seq, true);
  page[26] = segments.length;
  page.set(segments, 27);
  page.set(packet, 27 + segments.length);
  v.setUint32(22, oggCrc(page), true);
  return page;
}

/** Samples (at 48 kHz) in one Opus packet, from its TOC byte (RFC 6716, 3.1). */
export function opusPacketSamples(p: Uint8Array): number {
  const toc = p[0];
  if (toc === undefined) return 0;
  const config = toc >> 3;
  const frame =
    config < 12
      ? [480, 960, 1920, 2880][config % 4]!
      : config < 16
        ? [480, 960][config % 2]!
        : [120, 240, 480, 960][config % 4]!;
  const code = toc & 0x03;
  const frames = code === 0 ? 1 : code === 3 ? (p[1] ?? 0) & 0x3f : 2;
  return frame * frames;
}

function defaultOpusHead(): Uint8Array {
  const h = new Uint8Array(19);
  h.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // "OpusHead"
  const v = new DataView(h.buffer);
  h[8] = 1; // version
  h[9] = 1; // mono
  v.setUint16(10, 312, true); // pre-skip
  v.setUint32(12, 48000, true);
  return h;
}

function opusTags(): Uint8Array {
  const vendor = new TextEncoder().encode("SalesIQ");
  const t = new Uint8Array(8 + 4 + vendor.length + 4);
  t.set(new TextEncoder().encode("OpusTags"), 0);
  new DataView(t.buffer).setUint32(8, vendor.length, true);
  t.set(vendor, 12);
  return t;
}

/** An Ogg/Opus file holding the same sound as the given WebM/Opus recording. */
export function webmToOgg(webm: Uint8Array): Uint8Array {
  const { head, packets } = readWebmOpus(webm);
  const serial = (Math.random() * 0x7fffffff) | 0;
  const pages: Uint8Array[] = [
    oggPage(head && head.length >= 19 ? head : defaultOpusHead(), 0, serial, 0, 0x02),
    oggPage(opusTags(), 0, serial, 1, 0),
  ];
  let granule = 0;
  packets.forEach((p, i) => {
    granule += opusPacketSamples(p.data);
    const last = i === packets.length - 1;
    pages.push(oggPage(p.data, granule, serial, i + 2, last ? 0x04 : 0));
  });
  const total = pages.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of pages) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
