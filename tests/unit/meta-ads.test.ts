import { metaCampaigns, parseInsights, toUzs } from "@/lib/meta-ads";

describe("meta ads", () => {
  it("reads campaign insights and counts leads", () => {
    const rows = parseInsights([
      {
        campaign_id: "1",
        campaign_name: "Kuz aksiyasi",
        spend: "12.345",
        impressions: "1000",
        clicks: "40",
        date_start: "2026-11-10",
        actions: [
          { action_type: "lead", value: "3" },
          { action_type: "link_click", value: "40" },
          { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "2" },
        ],
      },
      { campaign_name: "no id" },
    ]);
    expect(rows).toEqual([
      {
        day: "2026-11-10",
        campaign_id: "1",
        campaign_name: "Kuz aksiyasi",
        spend: 12.35,
        impressions: 1000,
        clicks: 40,
        leads: 5,
      },
    ]);
  });

  it("joins spend with CRM leads by campaign and turns it into so'm", () => {
    expect(toUzs(10, "USD")).toBe(129_000);
    expect(toUzs(5000, "uzs")).toBe(5000);
    const c = metaCampaigns(
      [
        {
          day: "2026-11-10",
          campaign_id: "1",
          campaign_name: "Kuz aksiyasi",
          spend: 10,
          impressions: 100,
          clicks: 5,
          leads: 4,
          currency: "USD",
        },
        {
          day: "2026-11-11",
          campaign_id: "1",
          campaign_name: "Kuz aksiyasi",
          spend: 10,
          impressions: 100,
          clicks: 5,
          leads: 2,
          currency: "USD",
        },
        {
          day: "2026-11-11",
          campaign_id: "2",
          campaign_name: "Retarget",
          spend: 1,
          impressions: 10,
          clicks: 1,
          leads: 0,
          currency: "USD",
        },
      ],
      new Map([["kuz aksiyasi", 3]]),
    );
    expect(c[0]).toEqual({
      campaign: "Kuz aksiyasi",
      spend: 258_000,
      impressions: 200,
      clicks: 10,
      metaLeads: 6,
      crmLeads: 3,
      cpl: 86_000,
    });
    expect(c[1]!.cpl).toBeNull();
  });
});
