import { recentReplies } from "@/lib/quick-replies";

describe("quick replies", () => {
  it("keeps the newest distinct answers that are not pinned", () => {
    const sent = ["Salom!", "salom! ", "Narxi 790 000", "", "a", "Rahmat", "Narxi 790 000"];
    expect(recentReplies(sent, ["Rahmat"])).toEqual(["Salom!", "Narxi 790 000"]);
    expect(recentReplies(sent, [], 1)).toEqual(["Salom!"]);
  });
});
