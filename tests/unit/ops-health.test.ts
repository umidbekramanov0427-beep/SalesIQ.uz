import {
  alertsFor,
  buildCompaniesList,
  buildErrorsReport,
  buildHealthReport,
  buildIntegrationsReport,
  companyIssues,
  parseOpsCommand,
  platformIssues,
  sinceLabel,
  worstLevel,
  type CompanyFacts,
  type PlatformFacts,
} from "@/lib/ops/health";

const NOW = Date.parse("2026-10-16T04:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const company = (over: Partial<CompanyFacts> = {}): CompanyFacts => ({
  id: "c1",
  name: "Acme",
  plan: "analyst_iq",
  phase: "paid",
  frozen: false,
  endsAt: null,
  users: 5,
  sessions24h: 4,
  activeUsers24h: 3,
  lastSeenAt: hoursAgo(1),
  leads24h: 12,
  callsAnalyzed24h: 7,
  aiPending: 0,
  aiFailed24h: 0,
  errors24h: 0,
  amocrm: null,
  bitrix24: null,
  telephony: [],
  paused: [],
  ...over,
});

const platform = (over: Partial<PlatformFacts> = {}): PlatformFacts => ({
  serverErrors1h: 0,
  serverErrors24h: 0,
  slowRequests24h: 0,
  clientErrors24h: 0,
  topErrors: [],
  aiPending: 0,
  aiOldestPendingAt: null,
  aiFailed24h: 0,
  supportWaiting: 0,
  newSignups24h: 0,
  lastAmoSyncAt: null,
  amoConnections: 0,
  ...over,
});

const amo = (over: Partial<NonNullable<CompanyFacts["amocrm"]>> = {}) => ({
  lastSyncedAt: hoursAgo(0.1),
  error: null,
  tokenExpiresAt: hoursAgo(-48),
  syncInProgress: false,
  syncStartedAt: null,
  ...over,
});

describe("companyIssues", () => {
  it("a healthy company has none", () => {
    expect(companyIssues(company({ amocrm: amo() }), NOW)).toEqual([]);
    expect(worstLevel([])).toBe("ok");
  });

  it("flags amoCRM errors, expired tokens, stale and stuck syncs", () => {
    const codes = (c: CompanyFacts) => companyIssues(c, NOW).map((i) => i.code);
    expect(codes(company({ amocrm: amo({ error: "401 Unauthorized" }) }))).toEqual([
      "amocrm_error",
    ]);
    expect(codes(company({ amocrm: amo({ tokenExpiresAt: hoursAgo(1) }) }))).toEqual([
      "amocrm_token",
    ]);
    expect(codes(company({ amocrm: amo({ lastSyncedAt: hoursAgo(5) }) }))).toEqual([
      "amocrm_stale",
    ]);
    expect(
      codes(company({ amocrm: amo({ syncInProgress: true, syncStartedAt: hoursAgo(2) }) })),
    ).toEqual(["amocrm_stuck"]);
  });

  it("skips paused integrations and frozen companies", () => {
    const broken = amo({ error: "boom" });
    expect(
      companyIssues(company({ amocrm: broken, paused: ["amocrm"] }), NOW).map((i) => i.code),
    ).toEqual(["paused"]);
    expect(companyIssues(company({ amocrm: broken, frozen: true }), NOW)).toEqual([]);
  });

  it("notices silent telephony after the first day", () => {
    const tel = (lastEventAt: string | null, connectedAt: string) => ({
      provider: "onlinepbx",
      lastEventAt,
      connectedAt,
    });
    const codes = (t: ReturnType<typeof tel>) =>
      companyIssues(company({ telephony: [t] }), NOW).map((i) => i.code);
    expect(codes(tel(null, hoursAgo(2)))).toEqual([]);
    expect(codes(tel(null, hoursAgo(30)))).toEqual(["telephony_none:onlinepbx"]);
    expect(codes(tel(hoursAgo(100), hoursAgo(500)))).toEqual(["telephony_silent:onlinepbx"]);
    expect(codes(tel(hoursAgo(2), hoursAgo(500)))).toEqual([]);
  });

  it("warns about idle paying companies, AI failures and ending subscriptions", () => {
    const issues = companyIssues(
      company({ lastSeenAt: hoursAgo(100), aiFailed24h: 6, endsAt: hoursAgo(-30) }),
      NOW,
    );
    expect(issues.map((i) => i.code)).toEqual(["ai_failed", "idle", "ending"]);
    expect(worstLevel(issues)).toBe("warning");
    // Trial companies are covered by the trial digest instead.
    expect(
      companyIssues(company({ phase: "trial", lastSeenAt: hoursAgo(100) }), NOW).map((i) => i.code),
    ).toEqual([]);
  });
});

describe("platformIssues", () => {
  it("spots error spikes, a stalled cron and a stuck AI queue", () => {
    const codes = platformIssues(
      platform({
        serverErrors1h: 12,
        amoConnections: 3,
        lastAmoSyncAt: hoursAgo(2),
        aiPending: 4,
        aiOldestPendingAt: hoursAgo(5),
        supportWaiting: 2,
      }),
      NOW,
    ).map((i) => i.code);
    expect(codes).toEqual([
      "server_errors_spike",
      "cron_stalled",
      "ai_queue_stale",
      "support_waiting",
    ]);
    expect(
      platformIssues(platform({ amoConnections: 3, lastAmoSyncAt: hoursAgo(0.2) }), NOW),
    ).toEqual([]);
  });
});

describe("alertsFor", () => {
  it("sends critical problems only, keyed per company and Tashkent day", () => {
    const alerts = alertsFor(
      [
        company({ amocrm: amo({ error: "401" }) }),
        company({ id: "c2", name: "Beta", lastSeenAt: hoursAgo(100) }),
      ],
      platform(),
      NOW,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.key).toBe("alert:amocrm_error:c1:2026-10-16");
    expect(alerts[0]!.text).toContain("Acme");
  });

  it("repeats an error spike each hour", () => {
    const [a] = alertsFor([], platform({ serverErrors1h: 15 }), NOW);
    expect(a!.key).toBe("alert:server_errors_spike:2026-10-16T04");
  });
});

describe("reports", () => {
  const companies = [
    company({ amocrm: amo({ error: "Token <revoked>" }) }),
    company({ id: "c2", name: "Beta", phase: "trial" }),
    company({ id: "c3", name: "Gamma", frozen: true }),
  ];

  it("puts companies needing attention first and escapes HTML", () => {
    const text = buildHealthReport({ companies, platform: platform(), url: "https://x/p" }, NOW);
    expect(text).toContain("1 pullik · 1 sinovda · 0 tugagan · 1 muzlatilgan");
    expect(text).toContain("E'tibor kerak (1)");
    expect(text).toContain("Token &lt;revoked&gt;");
    expect(text).toContain("Yaxshi ishlayapti: 1");
    expect(text).not.toContain("Gamma");
  });

  it("says when everything is fine", () => {
    const text = buildHealthReport(
      { companies: [company()], platform: platform(), url: "https://x/p" },
      NOW,
    );
    expect(text).toContain("Barcha kompaniyalarda muammo yo'q");
  });

  it("lists companies, integrations and errors", () => {
    expect(buildCompaniesList(companies, NOW).indexOf("Acme")).toBeLessThan(
      buildCompaniesList(companies, NOW).indexOf("Beta"),
    );
    expect(buildIntegrationsReport(companies, NOW)).toContain("🔴 amoCRM");
    expect(buildIntegrationsReport([company()], NOW)).toContain("integratsiya ulamagan");
    expect(buildErrorsReport(platform(), "u")).toContain("xatolik yo'q");
    expect(
      buildErrorsReport(
        platform({
          serverErrors24h: 3,
          topErrors: [
            { route: "POST /x", message: "boom\nstack", count: 3, source: "server_error" },
          ],
        }),
        "u",
      ),
    ).toContain("<b>3×</b> [server] <code>POST /x</code> boom");
  });
});

describe("parseOpsCommand", () => {
  it("understands commands with or without the slash in the monitoring bot", () => {
    expect(parseOpsCommand("/holat")).toBe("holat");
    expect(parseOpsCommand("/Holat@salesiq_bot")).toBe("holat");
    expect(parseOpsCommand("xatolar")).toBe("xatolar");
    expect(parseOpsCommand("/start")).toBe("help");
    expect(parseOpsCommand("salom qalaysan")).toBeNull();
  });
  it("needs the slash and leaves /start alone in the shared bot", () => {
    expect(parseOpsCommand("holat", true)).toBeNull();
    expect(parseOpsCommand("/holat", true)).toBe("holat");
    expect(parseOpsCommand("/start", true)).toBeNull();
  });
});

describe("sinceLabel", () => {
  it("formats durations", () => {
    expect(sinceLabel(5 * 60_000)).toBe("5 daq");
    expect(sinceLabel(5 * 3_600_000)).toBe("5 soat");
    expect(sinceLabel(72 * 3_600_000)).toBe("3 kun");
    expect(sinceLabel(Infinity)).toBe("hech qachon");
  });
});
