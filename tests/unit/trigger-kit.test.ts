import {
  apiPayload,
  classifyChat,
  conditionsToRule,
  ruleToConditions,
  taskDueFields,
  taskDueOf,
  waitMinutes,
  waitParts,
} from "@/lib/automations/trigger-kit";

describe("trigger kit", () => {
  it("stores one condition as is and several as multi", () => {
    expect(conditionsToRule([])).toEqual({
      condition_field: null,
      condition_operator: null,
      condition_value: null,
    });
    const one = conditionsToRule([{ field: "budget", operator: "gte", value: "5" }]);
    expect(one.condition_field).toBe("budget");
    const two = [
      { field: "budget", operator: "gte", value: "5" },
      { field: "tags", operator: "eq", value: "vip" },
    ];
    const multi = conditionsToRule(two);
    expect(multi.condition_field).toBe("multi");
    expect(ruleToConditions(multi)).toEqual(two);
    expect(ruleToConditions(one)).toEqual([two[0]]);
  });
  it("turns task deadlines and waits into minutes and back", () => {
    expect(taskDueFields("tomorrow")).toEqual({ dueInDays: 1 });
    expect(taskDueFields("h3")).toEqual({ dueInMinutes: 180 });
    expect(taskDueOf({ dueInMinutes: 240 })).toBe("h4");
    expect(taskDueOf({})).toBe("tomorrow");
    expect(waitMinutes(2, "hour")).toBe(120);
    expect(waitParts(2880)).toEqual({ n: 2, unit: "day" });
    expect(waitParts(45)).toEqual({ n: 45, unit: "minute" });
  });
  it("builds the API body in both formats", () => {
    const lead = { name: "Ali", tags: ["a", "b"], custom_fields: { age: 30 } };
    const f = [
      { name: "name", label: "Ism", source: "name" },
      { name: "age", label: "Yosh", source: "custom:age" },
      { name: "tags", label: "Teglar", source: "tags" },
    ];
    expect(apiPayload(lead, f, "flat")).toEqual({ name: "Ali", age: "30", tags: "a, b" });
    expect(apiPayload(lead, f, "fields")).toEqual({
      fields: [
        { type: "name", label: "Ism", value: "Ali" },
        { type: "age", label: "Yosh", value: "30" },
        { type: "tags", label: "Teglar", value: "a, b" },
      ],
    });
  });
  it("reads the chat for price questions and media only", () => {
    expect(classifyChat([{ text: "Kurs narxi qancha?", media: false }])).toBe("price");
    expect(
      classifyChat([
        { text: "", media: true },
        { text: null, media: true },
      ]),
    ).toBe("media");
    expect(classifyChat([{ text: "Salom", media: false }])).toBeNull();
    expect(classifyChat([{ text: "chegirma bormi", media: false }], ["chegirma"])).toBe("price");
    expect(classifyChat([])).toBeNull();
  });
});
