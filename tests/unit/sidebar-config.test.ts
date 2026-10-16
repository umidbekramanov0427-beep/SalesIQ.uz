import {
  applyBusinessType,
  DEFAULT_SIDEBAR,
  moveItem,
  orderItems,
  parseSidebarConfig,
  resolveSidebar,
  toggleHidden,
  togglePinned,
} from "@/lib/sidebar-config";

const items = [
  { to: "/" },
  { to: "/funnels" },
  { to: "/audio-analytics" },
  { to: "/attendance" },
  { to: "/invoices", optional: true },
  { to: "/inbox", optional: true },
];
const paths = (list: { to: string }[]) => list.map((i) => i.to);

describe("parseSidebarConfig", () => {
  it("tolerates missing or broken values", () => {
    expect(parseSidebarConfig(null)).toEqual(DEFAULT_SIDEBAR);
    expect(parseSidebarConfig("x")).toEqual(DEFAULT_SIDEBAR);
    expect(
      parseSidebarConfig({ hidden: ["/", "/funnels", 3, "/funnels"], businessType: "nope" }),
    ).toEqual({ order: [], hidden: ["/funnels"], pinned: [], businessType: null });
  });
});

describe("resolveSidebar", () => {
  it("shows standard sections, not modules, by default", () => {
    expect(paths(resolveSidebar(items, DEFAULT_SIDEBAR))).toEqual([
      "/",
      "/funnels",
      "/audio-analytics",
      "/attendance",
    ]);
  });

  it("hides, pins and orders", () => {
    const config = {
      ...DEFAULT_SIDEBAR,
      hidden: ["/attendance"],
      pinned: ["/invoices"],
      order: ["/", "/invoices", "/funnels"],
    };
    expect(paths(resolveSidebar(items, config))).toEqual([
      "/",
      "/invoices",
      "/funnels",
      "/audio-analytics",
    ]);
  });

  it("never hides the home page", () => {
    expect(paths(resolveSidebar(items, toggleHidden(DEFAULT_SIDEBAR, "/")))).toContain("/");
  });
});

describe("applyBusinessType", () => {
  it("pins the type's modules and swaps them when the type changes", () => {
    const b2b = applyBusinessType(togglePinned(DEFAULT_SIDEBAR, "/x-own"), "b2b");
    expect(b2b.businessType).toBe("b2b");
    expect(b2b.pinned).toEqual(["/x-own", "/invoices", "/lead-tasks"]);
    const online = applyBusinessType(b2b, "online");
    // The hand-pinned page stays; B2B's own suggestion (/invoices) goes.
    expect(online.pinned).toEqual(["/x-own", "/lead-tasks"]);
  });
});

describe("ordering", () => {
  it("moves within the visible list", () => {
    expect(moveItem(["/", "/a", "/b"], "/b", -1)).toEqual(["/", "/b", "/a"]);
    expect(moveItem(["/", "/a"], "/", -1)).toEqual(["/", "/a"]);
    expect(moveItem(["/", "/a"], "/x", 1)).toEqual(["/", "/a"]);
  });
  it("keeps unknown items in their default place after the ordered ones", () => {
    expect(paths(orderItems(items.slice(0, 4), ["/attendance"]))).toEqual([
      "/attendance",
      "/",
      "/funnels",
      "/audio-analytics",
    ]);
  });
  it("toggles", () => {
    expect(toggleHidden(toggleHidden(DEFAULT_SIDEBAR, "/funnels"), "/funnels").hidden).toEqual([]);
    expect(togglePinned(DEFAULT_SIDEBAR, "/inbox").pinned).toEqual(["/inbox"]);
  });
});
