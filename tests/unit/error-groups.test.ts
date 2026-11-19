import { groupErrors, maskMessage, maskRoute, type ErrorRow } from "@/lib/error-groups";

const row = (p: Partial<ErrorRow>): ErrorRow => ({
  id: Math.random().toString(36).slice(2),
  created_at: "2026-11-19T10:00:00Z",
  message: "boom",
  source: "client",
  route: null,
  organization_id: null,
  resolved: false,
  ...p,
});

describe("error groups", () => {
  it("masks what changes between occurrences", () => {
    expect(maskMessage('Lead 123 not found for "Ali"')).toBe("Lead <n> not found for <v>");
    expect(maskMessage("row 0b6c9b8e-1f0a-4c2b-9a51-1c2d3e4f5a6b missing")).toBe(
      "row <id> missing",
    );
    expect(maskRoute("/platform/organizations/0b6c9b8e-1f0a-4c2b-9a51-1c2d3e4f5a6b?x=1")).toBe(
      "/platform/organizations/<id>",
    );
    expect(maskRoute("/leads/42/edit")).toBe("/leads/<n>/edit");
    expect(maskRoute(null)).toBeNull();
  });

  it("groups the same error and counts companies, open and time span", () => {
    const g = groupErrors([
      row({ message: "Lead 1 failed", organization_id: "a", created_at: "2026-11-19T09:00:00Z" }),
      row({ message: "Lead 2 failed", organization_id: "b", created_at: "2026-11-19T11:00:00Z" }),
      row({ message: "Lead 3 failed", organization_id: "a", resolved: true }),
      row({ message: "Lead 4 failed", source: "server_error" }),
    ]);
    expect(g).toHaveLength(2);
    const client = g.find((x) => x.kind === "client")!;
    expect(client.count).toBe(3);
    expect(client.open).toBe(2);
    expect(client.orgs).toEqual(["a", "b"]);
    expect(client.first).toBe("2026-11-19T09:00:00Z");
    expect(client.last).toBe("2026-11-19T11:00:00Z");
    expect(client.message).toBe("Lead 2 failed");
    expect(client.items[0]!.created_at).toBe("2026-11-19T11:00:00Z");
  });

  it("puts open groups first, then the most recent", () => {
    const g = groupErrors([
      row({ message: "old open", created_at: "2026-11-01T00:00:00Z" }),
      row({ message: "new closed", resolved: true, created_at: "2026-11-19T00:00:00Z" }),
    ]);
    expect(g.map((x) => x.message)).toEqual(["old open", "new closed"]);
  });
});
