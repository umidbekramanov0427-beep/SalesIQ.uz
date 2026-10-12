import { durationLabel, placeLabel, timelineLabel } from "@/lib/visit-labels";

// A stand-in t(): returns the key with its variables, so the tests check
// which message is chosen and what goes into it.
const t = (key: string, vars?: Record<string, string>) =>
  vars ? `${key}(${Object.values(vars).join(",")})` : key;

describe("visit labels", () => {
  it("names the place without repeating the city", () => {
    expect(placeLabel({ city: "Tashkent", region: "TO", country: "UZ" })).toBe("Tashkent, TO, UZ");
    expect(placeLabel({ city: "Tashkent", region: "Tashkent", country: "UZ" })).toBe(
      "Tashkent, UZ",
    );
    expect(placeLabel({ city: null, region: null, country: null })).toBeNull();
  });

  it("says how long a visit lasted", () => {
    const at = "2026-10-10T10:00:00Z";
    expect(durationLabel(at, null, t)).toBe("visits.lessThanMinute");
    expect(durationLabel(at, "2026-10-10T10:12:00Z", t)).toBe("visits.minutes(12)");
    expect(durationLabel(at, "2026-10-10T11:05:00Z", t)).toBe("visits.hoursMinutes(1,5)");
  });

  it("puts timeline entries into words", () => {
    expect(timelineLabel({ kind: "change", label: "insert:leads", path: null }, t)).toBe(
      "visits.entity.leads — visits.created",
    );
    expect(timelineLabel({ kind: "change", label: "delete:mystery", path: null }, t)).toBe(
      "mystery — visits.deleted",
    );
    expect(timelineLabel({ kind: "action", label: "first_sign_in", path: null }, t)).toBe(
      "visits.firstSignIn",
    );
    expect(timelineLabel({ kind: "blocked", label: "feature:telephony", path: "/" }, t)).toBe(
      "visits.blockedFeature(telephony)",
    );
    expect(timelineLabel({ kind: "page", label: "/funnels", path: "/funnels" }, t)).toBe(
      "nav./funnels",
    );
    expect(timelineLabel({ kind: "failed", label: "Lid saqlanmadi", path: "/" }, t)).toBe(
      "Lid saqlanmadi",
    );
  });
});
