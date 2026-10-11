import { attachDomain, detachDomain, domainStatus } from "@/lib/vercel-domains.server";

// Company subdomains are attached to the Vercel project one by one; these
// pin how the API answers map to what the settings card shows.
const json = (body: unknown, status = 200) => Response.json(body, { status });

function useEnv() {
  vi.stubEnv("VERCEL_API_TOKEN", "tok");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_1");
  vi.stubEnv("VERCEL_TEAM_ID", "team_1");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("vercel company domains", () => {
  it("does nothing without the API token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VERCEL_API_TOKEN", "");
    expect(await domainStatus("acme.salesiq.uz")).toBe("unconfigured");
    expect(await attachDomain("acme.salesiq.uz")).toBe("unconfigured");
    await detachDomain("acme.salesiq.uz");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads missing, pending and active", async () => {
    useEnv();
    const fetchMock = vi.fn(async () => json({}, 404));
    vi.stubGlobal("fetch", fetchMock);
    expect(await domainStatus("acme.salesiq.uz")).toBe("missing");

    fetchMock.mockImplementation(async () => json({ verified: false }));
    expect(await domainStatus("acme.salesiq.uz")).toBe("pending");

    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/config") ? json({ misconfigured: true }) : json({ verified: true }),
    );
    expect(await domainStatus("acme.salesiq.uz")).toBe("pending");

    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/config") ? json({ misconfigured: false }) : json({ verified: true }),
    );
    expect(await domainStatus("acme.salesiq.uz")).toBe("active");
    expect(fetchMock.mock.calls[0]![0]).toContain("/v9/projects/prj_1/domains/acme.salesiq.uz");
    expect(fetchMock.mock.calls[0]![0]).toContain("teamId=team_1");
  });

  it("attaches the host to the project with the token", async () => {
    useEnv();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return json({ name: "acme.salesiq.uz", verified: true });
      return url.includes("/config") ? json({ misconfigured: false }) : json({ verified: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await attachDomain("acme.salesiq.uz")).toBe("active");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/v10/projects/prj_1/domains");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "acme.salesiq.uz" });
    expect((init?.headers as Record<string, string>)["authorization"]).toBe("Bearer tok");
  });

  it("reports an error when the API refuses and the host isn't attached", async () => {
    useEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "POST" ? json({ error: { code: "forbidden" } }, 403) : json({}, 404),
      ),
    );
    expect(await attachDomain("acme.salesiq.uz")).toBe("error");
  });
});
