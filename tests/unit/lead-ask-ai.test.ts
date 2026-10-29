import { readyMessage } from "@/components/lead/LeadAskAi";

describe("readyMessage", () => {
  it("takes the longest quoted message from an answer", () => {
    const text =
      'Qisqa "ha" demang. Shunday yozing: «Olma aka, vaqtingiz tig\'izligini tushunaman. Tizimni bugun yoqib bersak, ertadanoq boshlanadi.»';
    expect(readyMessage(text)).toMatch(/^Olma aka/);
  });
  it("is null without a quoted message", () => {
    expect(readyMessage("1. Qo'ng'iroq qiling. 2. Narxni eslating.")).toBeNull();
  });
});
