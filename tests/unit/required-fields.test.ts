import { isRequirableKey, missingRequired, type RequirableLead } from "@/lib/required-fields";

const lead = (over: Partial<RequirableLead> = {}): RequirableLead => ({
  source: "Instagram",
  campaign: "",
  stream: "",
  phone: "+998904823715",
  altPhone: "",
  email: "",
  telegram: "",
  company: "",
  position: "",
  customFields: {},
  ...over,
});
const defs = [
  { id: "f1", key: "oylik" },
  { id: "f2", key: "kurs" },
];

describe("required fields", () => {
  it("knows which rows can be required", () => {
    expect(isRequirableKey("cf:f1")).toBe(true);
    expect(isRequirableKey("source")).toBe(true);
    expect(isRequirableKey("c:email")).toBe(true);
    expect(isRequirableKey("owner")).toBe(false);
    expect(isRequirableKey("c:nope")).toBe(false);
    expect(isRequirableKey("cf:")).toBe(false);
  });

  it("lists the empty required rows in order", () => {
    const req = ["cf:f1", "campaign", "c:phone", "c:email", "cf:f2", "cf:gone"];
    expect(missingRequired(req, lead({ customFields: { kurs: ["Ingliz"] } }), defs)).toEqual([
      "cf:f1",
      "campaign",
      "c:email",
    ]);
    expect(
      missingRequired(
        req,
        lead({ campaign: "Kuz", email: "a@b.uz", customFields: { oylik: 0, kurs: [] } }),
        defs,
      ),
    ).toEqual(["cf:f2"]);
  });

  it("treats blanks as empty and skips amoCRM leads", () => {
    expect(missingRequired(["source"], lead({ source: "  " }), defs)).toEqual(["source"]);
    expect(missingRequired(["source"], lead({ source: "", amocrmId: 77 }), defs)).toEqual([]);
  });
});
