import {
  DEFAULT_CLIENT_NOTIFY,
  matchKeyword,
  notifiesOwner,
  parseClientNotify,
} from "@/lib/client-notify";

describe("client message notifications", () => {
  it("is on for new and known clients unless switched off", () => {
    expect(parseClientNotify(undefined)).toEqual(DEFAULT_CLIENT_NOTIFY);
    const r = parseClientNotify({ existingClient: false });
    expect(notifiesOwner(r, true)).toBe(true);
    expect(notifiesOwner(r, false)).toBe(false);
  });

  it("finds a keyword as a word or its start, whatever the apostrophe or case", () => {
    const k = parseClientNotify({ keywords: ["Narx", "to‘lov", "x", "narx"] }).keywords;
    expect(k).toEqual(["narx", "to'lov"]);
    expect(matchKeyword("Narxi qancha?", k)).toBe("narx");
    expect(matchKeyword("TOʻLOV qildim", k)).toBe("to'lov");
    expect(matchKeyword("Salom, yaxshimisiz", k)).toBeNull();
    expect(matchKeyword("qonarx", k)).toBeNull();
  });
});
