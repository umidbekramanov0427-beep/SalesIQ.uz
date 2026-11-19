import {
  announcementApplies,
  announcementTelegramText,
  visibleAnnouncements,
  type AnnouncementRow,
} from "@/lib/announcements";

const now = new Date("2026-11-05T10:00:00Z");
const row = (p: Partial<AnnouncementRow>): AnnouncementRow => ({
  id: "a1",
  title: "Yangilanish",
  body: "",
  kind: "news",
  audience: "all",
  org_ids: [],
  link_url: null,
  link_label: null,
  dismissible: true,
  starts_at: "2026-11-01T00:00:00Z",
  ends_at: null,
  active: true,
  ...p,
});
const org = { id: "o1", phase: "trial" as const };

describe("announcements", () => {
  it("respects audience, period and the active switch", () => {
    expect(announcementApplies(row({}), org, now)).toBe(true);
    expect(announcementApplies(row({ audience: "paid" }), org, now)).toBe(false);
    expect(announcementApplies(row({ audience: "trial" }), org, now)).toBe(true);
    expect(announcementApplies(row({ audience: "orgs", org_ids: ["o1"] }), org, now)).toBe(true);
    expect(announcementApplies(row({ audience: "orgs", org_ids: ["o2"] }), org, now)).toBe(false);
    expect(announcementApplies(row({ starts_at: "2026-11-06T00:00:00Z" }), org, now)).toBe(false);
    expect(announcementApplies(row({ ends_at: "2026-11-04T00:00:00Z" }), org, now)).toBe(false);
    expect(announcementApplies(row({ active: false }), org, now)).toBe(false);
  });

  it("hides dismissed ones and puts warnings first", () => {
    const list = visibleAnnouncements(
      [
        row({ id: "n", kind: "news" }),
        row({ id: "w", kind: "warning" }),
        row({ id: "d", kind: "update" }),
        row({ id: "x", kind: "payment", dismissible: false }),
      ],
      org,
      new Set(["d", "x"]),
      now,
    );
    expect(list.map((a) => a.id)).toEqual(["w", "x", "n"]);
  });

  it("escapes the Telegram text", () => {
    expect(
      announcementTelegramText(
        { title: "<b>", body: "a & b", link_url: null, link_label: null },
        "Yangilik",
      ),
    ).toBe("📣 <b>Yangilik: &lt;b&gt;</b>\n\na &amp; b");
  });
});

describe("announcements by plan and start time", () => {
  it("shows a plan-limited one only to companies on those plans", () => {
    const a = row({ plans: ["analyst_iq", "master_iq"] });
    expect(announcementApplies(a, { ...org, plan: "master_iq" }, now)).toBe(true);
    expect(announcementApplies(a, { ...org, plan: "start_iq" }, now)).toBe(false);
    expect(announcementApplies(a, { ...org, plan: null }, now)).toBe(false);
    expect(announcementApplies(row({ plans: [] }), { ...org, plan: "start_iq" }, now)).toBe(true);
    expect(announcementApplies(row({ plans: null }), org, now)).toBe(true);
  });
  it("waits for a scheduled start", () => {
    const a = row({ starts_at: "2026-11-05T12:00:00Z" });
    expect(announcementApplies(a, org, now)).toBe(false);
    expect(announcementApplies(a, org, new Date("2026-11-05T12:00:01Z"))).toBe(true);
  });
});
