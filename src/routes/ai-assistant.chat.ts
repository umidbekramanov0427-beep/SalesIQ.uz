import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ChatMessage = { role: "user" | "assistant"; content: string };

// Neither Node's nor Gemini's fetch has a default timeout -- if Gemini's
// endpoint stalls (slow model, network stall, dropped connection), this
// await just hangs forever with no error, which the client can't tell apart
// from "still legitimately working": the spinner spins indefinitely. Same
// reasoning as the client-side timeout in useAiAssistantChat.
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `Environment o'zgaruvchisi topilmadi: ${name}. Uni Vercel loyihasi -> Settings -> Environment Variables bo'limiga qo'shing.`,
    );
  return value;
}

type LeadSnap = {
  stage_id: string | null;
  temperature: string;
  expected_revenue: number;
  owner_id: string | null;
};
type TaskSnap = { status: string; due_date: string | null; assignee_id: string | null };
type StageRow = { id: string; name: string; is_won: boolean; is_lost: boolean };

// Reconstructs the latest-known state of every row of `entityType` at or
// before `asOf`, straight from the audit trail — same idea as the
// entities_as_of() RPC, but done in JS so it can run under the service-role
// client (the RPC's internal current_user_org_id() check only resolves for
// a real user session, not service-role calls, since auth.uid() is null there).
async function reconstructAsOf<T>(orgId: string, entityType: string, asOf: string): Promise<T[]> {
  const { data: rows } = await supabaseAdmin
    .from("audit_logs")
    .select("entity_id, action, meta, created_at")
    .eq("organization_id", orgId)
    .eq("entity_type", entityType)
    .lte("created_at", asOf)
    .order("created_at", { ascending: true });

  const latest = new Map<string, { action: string; meta: { new?: T } }>();
  for (const row of rows ?? []) {
    latest.set(row.entity_id as string, row as { action: string; meta: { new?: T } });
  }
  const out: T[] = [];
  for (const row of latest.values()) {
    if (row.action !== "delete" && row.meta?.new) out.push(row.meta.new);
  }
  return out;
}

// null = unrestricted (super_admin/platform_owner sees the whole company).
// A rop only ever gets their own subordinates' data, a sotuv_menejeri only
// their own — same scoping the rest of the app applies at the client-hook
// layer, mirrored here since this snapshot is built with the service-role
// client and bypasses RLS entirely.
async function visibleOwnerIds(
  orgId: string,
  callerId: string,
  role: string,
): Promise<string[] | null> {
  if (role === "super_admin" || role === "platform_owner") return null;
  if (role === "rop") {
    const { data: reports } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("manager_id", callerId);
    return [callerId, ...(reports ?? []).map((r) => r.id)];
  }
  return [callerId];
}

async function loadDataSnapshot(
  orgId: string,
  asOf: string | null,
  ownerIds: string[] | null,
): Promise<string> {
  const { data: stages } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, name, is_won, is_lost")
    .eq("organization_id", orgId);
  const stageById = new Map((stages ?? []).map((s: StageRow) => [s.id, s]));

  let leads: LeadSnap[];
  let tasks: TaskSnap[];

  if (asOf) {
    [leads, tasks] = await Promise.all([
      reconstructAsOf<LeadSnap>(orgId, "leads", asOf),
      reconstructAsOf<TaskSnap>(orgId, "tasks", asOf),
    ]);
  } else {
    const [leadsRes, tasksRes] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("stage_id, temperature, expected_revenue, owner_id")
        .eq("organization_id", orgId),
      supabaseAdmin
        .from("tasks")
        .select("status, due_date, assignee_id")
        .eq("organization_id", orgId),
    ]);
    leads = leadsRes.data ?? [];
    tasks = tasksRes.data ?? [];
  }

  if (ownerIds) {
    const owners = new Set(ownerIds);
    leads = leads.filter((l) => l.owner_id && owners.has(l.owner_id));
    tasks = tasks.filter((t) => t.assignee_id && owners.has(t.assignee_id));
  }

  const leadCountByStage = new Map<string, number>();
  let leadRevenue = 0;
  let leadsWon = 0;
  let leadsLost = 0;
  let leadRevenueWon = 0;
  for (const l of leads) {
    const stage = l.stage_id ? stageById.get(l.stage_id) : null;
    const stageName = stage?.name || "No stage";
    leadCountByStage.set(stageName, (leadCountByStage.get(stageName) ?? 0) + 1);
    leadRevenue += l.expected_revenue ?? 0;
    if (stage?.is_won) {
      leadsWon++;
      leadRevenueWon += l.expected_revenue ?? 0;
    } else if (stage?.is_lost) {
      leadsLost++;
    }
  }

  const asOfMoment = asOf ? new Date(asOf) : new Date();
  let tasksDone = 0;
  let tasksOpen = 0;
  let tasksOverdue = 0;
  for (const t of tasks) {
    if (t.status === "Done") {
      tasksDone++;
    } else {
      tasksOpen++;
      if (t.due_date && new Date(t.due_date) < asOfMoment) tasksOverdue++;
    }
  }

  const lines = [
    asOf
      ? `CRM data snapshot as it stood on ${asOfMoment.toISOString().slice(0, 10)} (the user has selected this past date to review — answer using ONLY these historical numbers, not current live figures):`
      : "Current live CRM data snapshot:",
    `- Leads: ${leads.length} total, ${leadRevenue.toLocaleString("en-US")} total expected revenue. By stage: ${
      [...leadCountByStage.entries()].map(([name, count]) => `${name} (${count})`).join(", ") ||
      "none"
    }`,
    `- Won/lost: ${leadsWon} won (value ${leadRevenueWon.toLocaleString("en-US")}), ${leadsLost} lost`,
    `- Tasks: ${tasksOpen} open (${tasksOverdue} overdue), ${tasksDone} done`,
  ];
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Tool use -- the assistant used to be read-only advice. These let it   */
/* actually act on the caller's behalf: look up a lead, leave a note,    */
/* move a stage, or create a task for themselves. Every tool is scoped   */
/* to the same ownerIds visibility the data snapshot above already      */
/* uses, and task creation is always self-assigned (never lets the AI    */
/* assign work to someone else -- that would need reconstructing the     */
/* full manager/rep assignment RLS rule here, which isn't worth the risk */
/* for a chat tool call).                                                */
/* ------------------------------------------------------------------ */

type ToolContext = { orgId: string; callerId: string; ownerIds: string[] | null };

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_leads",
      description:
        "Search the caller's visible leads by name or company name. Call this first to find a lead's id before using add_lead_note or update_lead_stage.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Part of the lead's name or company name" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_funnel_stats",
      description:
        "Get real lead counts, stage breakdown and conversion rate for one funnel (or every funnel if funnel_name is omitted). Always call this instead of guessing or telling the user to go look at the Funnels page themselves -- you have this data directly.",
      parameters: {
        type: "object",
        properties: {
          funnel_name: {
            type: "string",
            description:
              'Exact or partial funnel name, e.g. "Super rus tili 19.0". Omit to get every funnel.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_my_task",
      description:
        "Create a new task assigned to the current user (the person chatting). Use this when they ask you to remind them of something or create a task/to-do for themselves.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          due_date: { type: "string", description: "ISO date, e.g. 2026-08-25. Optional." },
          lead_id: {
            type: "string",
            description: "Optional lead id (from search_leads) to attach this task to.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_lead_note",
      description:
        "Add a note to a lead's activity timeline. Requires the lead's id -- call search_leads first if you don't already have it from this conversation.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          note: { type: "string" },
        },
        required: ["lead_id", "note"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead_stage",
      description:
        "Move a lead to a different pipeline stage by name (the stage must belong to that lead's own funnel). Requires the lead's id -- call search_leads first if you don't already have it.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          stage_name: { type: "string" },
        },
        required: ["lead_id", "stage_name"],
      },
    },
  },
] as const;

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const inScope = (ownerId: string | null) =>
    !ctx.ownerIds || (ownerId != null && ctx.ownerIds.includes(ownerId));

  if (name === "search_leads") {
    const query = String(args["query"] ?? "").trim();
    if (!query) return { error: "query is required" };
    const { data } = await supabaseAdmin
      .from("leads")
      .select("id, name, company_name, stage_id, owner_id, temperature")
      .eq("organization_id", ctx.orgId)
      .or(`name.ilike.%${query}%,company_name.ilike.%${query}%`)
      .limit(20);
    const rows = (data ?? []).filter((l) => inScope(l.owner_id)).slice(0, 5);
    if (rows.length === 0) return { results: [] };
    const stageIds = [...new Set(rows.map((r) => r.stage_id).filter(Boolean))] as string[];
    const { data: stages } = stageIds.length
      ? await supabaseAdmin.from("pipeline_stages").select("id, name").in("id", stageIds)
      : { data: [] };
    const stageById = new Map((stages ?? []).map((s) => [s.id, s.name]));
    return {
      results: rows.map((l) => ({
        id: l.id,
        name: l.name,
        company: l.company_name,
        stage: l.stage_id ? (stageById.get(l.stage_id) ?? null) : null,
        temperature: l.temperature,
        // The app's own in-page path for this lead -- include it verbatim
        // (e.g. "/crm/leads/<id>") whenever you mention this lead in your
        // reply so the chat UI can turn it into a clickable link.
        path: `/crm/leads/${l.id}`,
      })),
    };
  }

  if (name === "get_funnel_stats") {
    const wanted = typeof args["funnel_name"] === "string" ? args["funnel_name"].trim() : "";

    // Supabase/PostgREST caps a single select() response at 1000 rows --
    // without paging through, any org with more than 1000 leads (common:
    // this tool exists precisely for orgs with large, multi-funnel AmoCRM
    // accounts) silently got only a fraction of one funnel's true leads,
    // making the assistant's own numbers wildly wrong (reported: it said
    // 14 leads for a funnel that actually has 3491). Same fix as every
    // other bulk fetch in this codebase.
    type LeadStatsRow = {
      funnel: string | null;
      stage_id: string | null;
      owner_id: string | null;
      expected_revenue: number | null;
    };
    const LEAD_PAGE_SIZE = 1000;
    const leadRows: LeadStatsRow[] = [];
    for (let from = 0; ; from += LEAD_PAGE_SIZE) {
      const { data: page } = await supabaseAdmin
        .from("leads")
        .select("funnel, stage_id, owner_id, expected_revenue")
        .eq("organization_id", ctx.orgId)
        .range(from, from + LEAD_PAGE_SIZE - 1);
      leadRows.push(...(page ?? []));
      if (!page || page.length < LEAD_PAGE_SIZE) break;
    }
    const stageRows: { id: string; name: string }[] = [];
    for (let from = 0; ; from += LEAD_PAGE_SIZE) {
      const { data: page } = await supabaseAdmin
        .from("pipeline_stages")
        .select("id, name")
        .eq("organization_id", ctx.orgId)
        .range(from, from + LEAD_PAGE_SIZE - 1);
      stageRows.push(...(page ?? []));
      if (!page || page.length < LEAD_PAGE_SIZE) break;
    }
    const stageNameById = new Map(stageRows.map((s) => [s.id, s.name]));

    const scoped = leadRows.filter((l) => inScope(l.owner_id));
    const funnelOf = (f: string | null) => f || "Direct Sales";
    // Mirrors normalizeStageName()/SALES_STAGE_KEYWORDS in
    // src/hooks/use-crm-data.ts exactly -- this is the same "reached a
    // late/sales-track stage" definition the Funnels page itself uses for
    // its conversion %, duplicated here (same convention as every other
    // copy of this list in the codebase) so the assistant's number never
    // disagrees with what the user sees on that page.
    const salesKeywords = [
      "predoplata",
      "peredoplata",
      "yarim",
      "toliq",
      "won",
      "успешно",
      "rop closed",
    ];
    const isSalesStage = (stageName: string) => {
      const norm = stageName.toLowerCase().replace(/['’ʼ`]/g, "");
      return salesKeywords.some((kw) => norm.includes(kw));
    };

    const byFunnel = new Map<
      string,
      { total: number; lateFunnel: number; revenue: number; stageCounts: Map<string, number> }
    >();
    for (const l of scoped) {
      const fn = funnelOf(l.funnel);
      if (!byFunnel.has(fn)) {
        byFunnel.set(fn, { total: 0, lateFunnel: 0, revenue: 0, stageCounts: new Map() });
      }
      const bucket = byFunnel.get(fn)!;
      bucket.total += 1;
      bucket.revenue += l.expected_revenue ?? 0;
      const stageName = l.stage_id ? (stageNameById.get(l.stage_id) ?? "No stage") : "No stage";
      bucket.stageCounts.set(stageName, (bucket.stageCounts.get(stageName) ?? 0) + 1);
      if (isSalesStage(stageName)) bucket.lateFunnel += 1;
    }

    const summarize = (fn: string) => {
      const b = byFunnel.get(fn);
      if (!b) return null;
      return {
        funnel: fn,
        total_leads: b.total,
        conversion_pct: b.total ? Math.round((b.lateFunnel / b.total) * 1000) / 10 : 0,
        total_expected_revenue: b.revenue,
        by_stage: Object.fromEntries(b.stageCounts),
      };
    };

    if (!wanted) {
      return { funnels: [...byFunnel.keys()].map(summarize) };
    }
    const match = [...byFunnel.keys()].find((fn) =>
      fn.toLowerCase().includes(wanted.toLowerCase()),
    );
    if (!match) {
      return {
        error: `No funnel matching "${wanted}". Known funnels: ${[...byFunnel.keys()].join(", ") || "none"}`,
      };
    }
    return summarize(match);
  }

  if (name === "create_my_task") {
    const title = String(args["title"] ?? "").trim();
    if (!title) return { error: "title is required" };
    const leadId = typeof args["lead_id"] === "string" ? args["lead_id"] : null;
    if (leadId) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id, owner_id, organization_id")
        .eq("id", leadId)
        .maybeSingle();
      if (!lead || lead.organization_id !== ctx.orgId || !inScope(lead.owner_id)) {
        return { error: "Unknown lead_id." };
      }
    }
    const { data, error } = await supabaseAdmin
      .from("tasks")
      .insert({
        organization_id: ctx.orgId,
        title,
        assignee_id: ctx.callerId,
        created_by: ctx.callerId,
        due_date: typeof args["due_date"] === "string" ? args["due_date"] : null,
        lead_id: leadId,
      })
      .select("id")
      .maybeSingle();
    if (error) return { error: error.message };
    return { created: true, task_id: data?.id };
  }

  if (name === "add_lead_note") {
    const leadId = String(args["lead_id"] ?? "");
    const note = String(args["note"] ?? "").trim();
    if (!leadId || !note) return { error: "lead_id and note are required" };
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, owner_id, organization_id")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead || lead.organization_id !== ctx.orgId || !inScope(lead.owner_id)) {
      return { error: "Unknown lead_id." };
    }
    const { error } = await supabaseAdmin.from("lead_activities").insert({
      lead_id: leadId,
      organization_id: ctx.orgId,
      type: "note",
      content: note,
      created_by: ctx.callerId,
    });
    if (error) return { error: error.message };
    return { added: true };
  }

  if (name === "update_lead_stage") {
    const leadId = String(args["lead_id"] ?? "");
    const stageName = String(args["stage_name"] ?? "").trim();
    if (!leadId || !stageName) return { error: "lead_id and stage_name are required" };
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, owner_id, organization_id, stage_id")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead || lead.organization_id !== ctx.orgId || !inScope(lead.owner_id)) {
      return { error: "Unknown lead_id." };
    }
    const { data: currentStage } = lead.stage_id
      ? await supabaseAdmin
          .from("pipeline_stages")
          .select("pipeline_name")
          .eq("id", lead.stage_id)
          .maybeSingle()
      : { data: null };
    let stageQuery = supabaseAdmin
      .from("pipeline_stages")
      .select("id, name, pipeline_name")
      .eq("organization_id", ctx.orgId)
      .ilike("name", stageName);
    if (currentStage?.pipeline_name) {
      stageQuery = stageQuery.eq("pipeline_name", currentStage.pipeline_name);
    }
    const { data: targetStages } = await stageQuery.limit(1);
    const target = targetStages?.[0];
    if (!target) return { error: `No stage named "${stageName}" found in this lead's funnel.` };
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ stage_id: target.id })
      .eq("id", leadId);
    if (error) return { error: error.message };
    return { moved: true, new_stage: target.name };
  }

  return { error: `Unknown tool: ${name}` };
}

// Gemini's function-calling shape, not OpenAI's -- matches the provider
// audio-analytics.analyze.ts already uses successfully (GEMINI_API_KEY).
// This used to call DeepSeek directly; that account ran out of balance
// (every request failing with a 402) and was never actually switched over
// when the rest of the platform's AI features moved to Gemini.
type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
// Gemini rejects a "function" role outright ("Role 'function' is not
// supported") -- a functionResponse part is sent back as a "user" turn,
// same as any other content the caller supplies.
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

export const Route = createFileRoute("/ai-assistant/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as {
          messages?: ChatMessage[];
          asOf?: string | null;
        };
        const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
        const asOf = typeof body.asOf === "string" ? body.asOf : null;
        if (messages.length === 0) {
          return Response.json({ error: "No messages provided." }, { status: 400 });
        }

        let apiKey: string;
        try {
          apiKey = requireEnv("GEMINI_API_KEY");
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Missing GEMINI_API_KEY" },
            { status: 500 },
          );
        }

        const { data: caller } = await supabaseAdmin
          .from("profiles")
          .select("organization_id, role")
          .eq("id", userId)
          .maybeSingle();

        const { data: profile } = caller?.organization_id
          ? await supabaseAdmin
              .from("business_profile")
              .select("company_name, description, competitors, terminology, tone")
              .eq("organization_id", caller.organization_id)
              .maybeSingle()
          : { data: null };

        // Admin > AI agentlar > "Chat" toggle/prompt used to be stored but never
        // actually read here -- turning it off or customizing it in the admin UI
        // had zero effect on this endpoint (only the "Call" agent was wired, in
        // audio-analytics.analyze.ts). Wired the same way now.
        const { data: chatAgent } = caller?.organization_id
          ? await supabaseAdmin
              .from("ai_agents")
              .select("system_prompt, active")
              .eq("organization_id", caller.organization_id)
              .eq("kind", "chat")
              .maybeSingle()
          : { data: null };
        if (chatAgent && chatAgent.active === false) {
          return Response.json(
            { error: "AI yordamchi admin tomonidan o'chirilgan. Admin panelidan yoqing." },
            { status: 400 },
          );
        }

        const NAV_GUIDE = `- / — Leaderboard: live revenue ranking, KPI and bonus per rep
- /dashboard — Dashboard: today's/monthly revenue, pipeline value, recent activity
- /crm/leads — Leads register (search, filters, bulk actions)
- /crm/leads/$leadId — a single lead's full workspace: info, timeline, notes, tasks, AmoCRM link, call history, AI analysis
- /crm/contacts — Contacts
- /crm/companies — Companies
- /crm-stages — Permissions matrix: which roles can do what
- /funnels — Funnels: stage conversion analysis per funnel, plus (inside a funnel) a Kanban/list/gallery lead board synced from AmoCRM
- /rollout-plan — Amalga oshirish rejasi (super_admin only): a phased implementation checklist — day/week, phase, weight, status, note — with a planned-vs-actual completion chart
- /lead-tasks — Lead Tasks: every open task grouped by its lead
- /audio-analytics — Audio Analytics: call volume, connection rate, AI call summaries
- /attendance — Attendance & Quotas: clock in/out, call logs, daily/monthly pacing
- /inbox — Inbox: notifications and mentions, plus (super_admin/platform_owner only) an Alerts tab for AI-flagged risk signals
- /analytics — Analytics: revenue trend and forecasting reports
- /ai-assistant — this AI Assistant's own full-page chat
- /integrations — Integrations: connect AmoCRM, Telegram bot, Google Docs/Forms, etc.
- /settings — Settings: Profile, Personalization, Notifications, Business profile, Stages, Tags, Users, Telegram bot
- /admin — Admin Panel (super_admin only): employee/role management, org structure, auto-responders, AI agents, error logs
- /platform — Platform (platform_owner only): manage every company on the platform`;

        // The admin-configured prompt (if any) sets the assistant's persona/tone
        // as an intro layer; the navigation guide and tool-use rules below always
        // apply underneath it, since removing them would break the assistant's
        // ability to point users at real pages or actually act on their behalf.
        const introPrompt =
          chatAgent?.system_prompt?.trim() ||
          "You are the AI assistant built into SalesIQ, a CRM for sales teams. Be concise and practical. Reply in the same language the user writes in.";

        let systemPrompt =
          introPrompt +
          "\n\nWhen the user asks HOW to do something or WHERE a feature lives in the app (a navigation question), name the exact page and, when useful, give the numbered steps to get there — for example: '1. Open Sozlamalar (Settings) in the sidebar. 2. Click Biznes profili. 3. Fill in the form and press Saqlash.' Always include the page's path in parentheses so it's unambiguous, e.g. (/settings). Only reference pages from this list — never invent a path that isn't here:\n" +
          NAV_GUIDE +
          "\n\nBut when the user asks WHAT a number, rate, or fact actually IS (e.g. a funnel's conversion rate, who a lead's owner is, how many leads are in some stage), you must answer with the real value itself, using your tools -- never reply with only navigation instructions ('go check the Funnels page') when a tool can get you the actual answer. That is a wrong answer, not a helpful one.\n\n" +
          "You also have tools to actually look things up and act, not just describe: search_leads, get_funnel_stats, create_my_task, add_lead_note, update_lead_stage. Use search_leads or get_funnel_stats whenever the answer depends on real data you don't already have in this conversation. Use create_my_task/add_lead_note/update_lead_stage whenever the user asks you to do something rather than just explain it (e.g. 'remind me to call Aziz tomorrow', 'add a note on the Akmal deal', 'move that lead to negotiation'). Never invent a lead_id — call search_leads first if you don't already have the right id from earlier in this conversation, and if multiple leads match, ask which one they mean instead of guessing. Whenever you mention a specific lead, include the exact `path` search_leads gave you for it verbatim in your reply (e.g. /crm/leads/3fa2...) so the chat can turn it into a clickable link -- never paraphrase or shorten that path. After a tool call succeeds, confirm plainly what you did.";
        if (profile) {
          const context = [
            profile.company_name && `Company: ${profile.company_name}`,
            profile.description && `About the business: ${profile.description}`,
            profile.competitors && `Known competitors: ${profile.competitors}`,
            profile.terminology && `Business-specific terms/jargon: ${profile.terminology}`,
            profile.tone && `Preferred tone of voice: ${profile.tone}`,
          ]
            .filter(Boolean)
            .join("\n");
          if (context) systemPrompt += `\n\nBusiness context:\n${context}`;
        }

        let ownerIds: string[] | null = null;
        if (caller?.organization_id) {
          try {
            ownerIds = await visibleOwnerIds(caller.organization_id, userId, caller.role);
            const snapshot = await loadDataSnapshot(caller.organization_id, asOf, ownerIds);
            systemPrompt += `\n\n${snapshot}`;
          } catch {
            // Snapshot is best-effort context; a failure here shouldn't block the chat.
          }
        }

        const contents: GeminiContent[] = messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
        const functionDeclarations = TOOLS.map((t) => t.function);
        let reply = "";
        // Capped: one round to call tools, one to answer using their results is the
        // common case, but a request can chain a couple of tools (search then act).
        const MAX_TOOL_ROUNDS = 4;
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          let res: Response;
          try {
            res = await fetchWithTimeout(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: systemPrompt }] },
                  contents,
                  tools: [{ functionDeclarations }],
                  generationConfig: { temperature: 0.4 },
                }),
              },
              25_000,
            );
          } catch {
            return Response.json(
              { error: "AI yordamchi javob bermadi (timeout). Qayta urinib ko'ring." },
              { status: 504 },
            );
          }

          if (!res.ok) {
            const text = await res.text();
            return Response.json(
              { error: `Gemini error (${res.status}): ${text}` },
              { status: 502 },
            );
          }

          const json = (await res.json()) as {
            candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
            promptFeedback?: { blockReason?: string };
          };
          const parts = json.candidates?.[0]?.content?.parts ?? [];
          if (parts.length === 0) {
            // Gemini can return HTTP 200 with no usable content -- a
            // blocked prompt/response (safety filters) or a finish reason
            // other than a normal stop. Surfacing this as an error instead
            // of silently returning `{ reply: "" }` matters: the client
            // only shows an error banner when the request itself fails, so
            // a 200 with an empty reply used to render as a blank,
            // invisible assistant message with no indication anything went
            // wrong.
            const reason =
              json.promptFeedback?.blockReason ?? json.candidates?.[0]?.finishReason ?? "unknown";
            return Response.json(
              { error: `AI yordamchi javob bera olmadi (sabab: ${reason}). Qayta urinib ko'ring.` },
              { status: 502 },
            );
          }

          const functionCalls = parts.filter(
            (p): p is { functionCall: { name: string; args?: Record<string, unknown> } } =>
              "functionCall" in p,
          );

          if (functionCalls.length > 0 && caller?.organization_id) {
            contents.push({ role: "model", parts });
            const responseParts: GeminiPart[] = [];
            for (const call of functionCalls) {
              const result = await executeTool(
                call.functionCall.name,
                call.functionCall.args ?? {},
                {
                  orgId: caller.organization_id,
                  callerId: userId,
                  ownerIds,
                },
              );
              responseParts.push({
                functionResponse: {
                  name: call.functionCall.name,
                  response:
                    result && typeof result === "object"
                      ? (result as Record<string, unknown>)
                      : { result },
                },
              });
            }
            contents.push({ role: "user", parts: responseParts });
            continue;
          }

          reply = parts
            .filter((p): p is { text: string } => "text" in p)
            .map((p) => p.text)
            .join("");
          break;
        }

        // The loop can also exhaust MAX_TOOL_ROUNDS while still chaining
        // tool calls, without ever reaching a final text reply -- same
        // silent-blank-message risk as the empty-parts case above.
        if (!reply.trim()) {
          return Response.json(
            { error: "AI yordamchi javob bera olmadi. Qayta urinib ko'ring." },
            { status: 502 },
          );
        }

        return Response.json({ reply });
      },
    },
  },
});
