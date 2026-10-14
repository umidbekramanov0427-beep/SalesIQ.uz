import {
  claimPlayback,
  nextChainPlayer,
  registerChainPlayer,
  releasePlayback,
} from "@/lib/audio/playback";

// Elements standing in a row on the page: index = document order.
function row(n: number) {
  const els = Array.from({ length: n }, (_, i) => ({
    i,
    compareDocumentPosition(other: { i: number }) {
      return other.i > i ? 4 : other.i < i ? 2 : 0;
    },
  }));
  return els;
}

function media() {
  return {
    paused: true,
    pause() {
      this.paused = true;
    },
  };
}

describe("claimPlayback", () => {
  it("pauses the sound that was playing", () => {
    const a = media();
    const b = media();
    a.paused = false;
    claimPlayback(a);
    b.paused = false;
    claimPlayback(b);
    expect(a.paused).toBe(true);
    expect(b.paused).toBe(false);
    releasePlayback(b);
  });
});

describe("nextChainPlayer", () => {
  it("is the closest player below, in page order", () => {
    const els = row(4);
    const offs = [3, 1, 2].map((i) => registerChainPlayer({ el: els[i]!, play: () => {} }));
    expect((nextChainPlayer(els[0]!)?.el as { i: number }).i).toBe(1);
    expect((nextChainPlayer(els[1]!)?.el as { i: number }).i).toBe(2);
    expect((nextChainPlayer(els[2]!)?.el as { i: number }).i).toBe(3);
    expect(nextChainPlayer(els[3]!)).toBeNull();
    offs.forEach((off) => off());
    expect(nextChainPlayer(els[0]!)).toBeNull();
  });
});
