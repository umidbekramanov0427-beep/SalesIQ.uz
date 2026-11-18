import { OWNER_HUBS, OWNER_SETTINGS_HUB, ownerHubOf } from "@/lib/owner-hubs";
import { NAV_ITEMS } from "@/lib/nav";

describe("owner menu sections", () => {
  it("holds every owner page exactly once", () => {
    const tabs = [...OWNER_HUBS.flat(), OWNER_SETTINGS_HUB].flatMap((h) => h.tabs);
    const owner = NAV_ITEMS.filter((i) => i.platformOwnerOnly).map((i) => i.to);
    expect([...tabs].sort()).toEqual([...owner].sort());
  });

  it("finds the section and tab of a page", () => {
    expect(ownerHubOf("/platform/errors")).toMatchObject({
      hub: { id: "control" },
      tab: "/platform/errors",
    });
    expect(ownerHubOf("/platform/organizations/x")?.tab).toBe("/platform/companies");
    expect(ownerHubOf("/platform/visit/abc")?.hub.id).toBe("control");
    expect(ownerHubOf("/platform/applications/1")?.hub.id).toBe("applications");
    expect(ownerHubOf("/platform/insights")).toBeNull();
  });
});
