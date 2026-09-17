import { defineMcp } from "@lovable.dev/mcp-js";

type McpTools = Parameters<typeof defineMcp>[0]["tools"];
import listLeads from "./tools/list-leads";
import getLead from "./tools/get-lead";
import pipelineSummary from "./tools/pipeline-summary";
import leaderboardRanking from "./tools/leaderboard";

export default defineMcp({
  name: "salesos-elite-crm",
  title: "SalesIQ CRM",
  version: "0.1.0",
  instructions:
    "Read-only tools for the SalesIQ sales operating system. Use `list_leads` and `get_lead` for CRM lead research, `pipeline_summary` for pipeline value analysis, and `leaderboard_ranking` for sales-team performance rankings and insights.",
  tools: [listLeads, getLead, pipelineSummary, leaderboardRanking] as unknown as McpTools,
});
