// Server-only. The AI tahlilchi's work for one company: the figures with
// the previous period and the rule alerts (no AI), the AI's findings
// (cached by the facts' hash -- the same numbers are never paid for twice),
// the forecast (statistics only), the chat (answers only from the company's
// figures, says what it used), and the recommendations being tracked
// (metric before; after = measured 14 days after it was done).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  gatherInputs,
  gatherMetrics,
  previousScope,
  type Scope,
} from "@/lib/marketing-ai/metrics.server";
import { computeMetrics, metricValue, ruleAlerts, type Metrics } from "@/lib/marketing-ai/metrics";
import {
  ANALYSIS_SYSTEM,
  factsOf,
  inputHash,
  validateFindings,
  type Finding,
} from "@/lib/marketing-ai/diagnose";
import { forecast, weekly, type Forecast } from "@/lib/marketing-ai/forecast";
import { qualOf } from "@/lib/marketing-ai/qual";
import { aiCall, parseJsonReply } from "@/lib/marketing-ai/provider.server";

export async function overview(orgId: string, scope: Scope) {
  const [current, previous] = await Promise.all([
    gatherMetrics(orgId, scope),
    gatherMetrics(orgId, previousScope(scope)),
  ]);
  const { data: last } = await supabaseAdmin
    .from("marketing_ai_runs")
    .select("result, created_at, provider, model, period_from, period_to")
    .eq("organization_id", orgId)
    .eq("kind", "analysis")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    current,
    previous,
    alerts: ruleAlerts(current, previous),
    lastAnalysis: last ?? null,
  };
}

export type AnalysisResult = {
  findings: Finding[];
  rejected: number;
  cached: boolean;
  at: string;
  provider: string | null;
  model: string | null;
  period: { from: string; to: string };
};

export async function analyze(
  orgId: string,
  scope: Scope,
  profileId: string | null,
  force = false,
): Promise<AnalysisResult> {
  const [current, previous] = await Promise.all([
    gatherMetrics(orgId, scope),
    gatherMetrics(orgId, previousScope(scope)),
  ]);
  const facts = factsOf(current, previous);
  const hash = inputHash(facts);
  if (!force) {
    const { data: hit } = await supabaseAdmin
      .from("marketing_ai_runs")
      .select("result, created_at, provider, model")
      .eq("organization_id", orgId)
      .eq("kind", "analysis")
      .eq("input_hash", hash)
      .maybeSingle();
    if (hit) {
      const r = hit.result as { findings?: Finding[]; rejected?: number };
      return {
        findings: r.findings ?? [],
        rejected: r.rejected ?? 0,
        cached: true,
        at: hit.created_at,
        provider: hit.provider,
        model: hit.model,
        period: current.period,
      };
    }
  }
  const ask = async (extra = "") =>
    aiCall(
      orgId,
      "analysis",
      {
        system: ANALYSIS_SYSTEM + extra,
        messages: [{ role: "user", content: JSON.stringify(facts) }],
        json: true,
      },
      profileId,
    );
  let reply = await ask();
  let checked = validateFindings(parseJsonReply(reply.text), facts);
  // Every finding cited a figure that is not in the data: ask once more.
  if (!checked.findings.length && checked.rejected > 0) {
    reply = await ask(
      "\n\nDIQQAT: oldingi javobingizda ma'lumotda yo'q raqamlar bor edi. Faqat JSON'dagi raqamlarni aynan shu ko'rinishda yozing.",
    );
    checked = validateFindings(parseJsonReply(reply.text), facts);
  }
  const at = new Date().toISOString();
  await supabaseAdmin.from("marketing_ai_runs").upsert(
    {
      organization_id: orgId,
      kind: "analysis",
      input_hash: hash,
      scope: scope as never,
      period_from: scope.from.slice(0, 10),
      period_to: scope.to.slice(0, 10),
      result: { findings: checked.findings, rejected: checked.rejected } as never,
      provider: reply.provider,
      model: reply.model,
      created_by: profileId,
      created_at: at,
    },
    { onConflict: "organization_id,kind,input_hash" },
  );
  return {
    ...checked,
    cached: false,
    at,
    provider: reply.provider,
    model: reply.model,
    period: current.period,
  };
}

/* ---- Prognoz ------------------------------------------------------------ */

export async function forecasts(
  orgId: string,
  scope: Omit<Scope, "from" | "to">,
  now = new Date(),
) {
  const to = now.toISOString();
  const from = new Date(now.getTime() - 12 * 7 * 86_400_000).toISOString();
  const input = await gatherInputs(orgId, { ...scope, from, to });
  // Only full weeks: the running week is left out.
  const complete = new Date(Date.parse(to) - 7 * 86_400_000).toISOString();
  const series = (pick: (l: (typeof input.leads)[number]) => number) =>
    weekly(
      input.leads.map((l) => ({ at: l.createdAt, value: pick(l) })),
      from,
      complete,
    );
  const qualified = (l: (typeof input.leads)[number]) =>
    qualOf({
      phone: l.phone,
      answeredCalls: l.answered,
      unansweredCalls: l.unanswered,
      watched: l.watched,
      manualStatus: l.qualStatus,
      manualReason: l.notQualReason,
    }).status === "qualified"
      ? 1
      : 0;
  const leadsF = forecast(series(() => 1));
  const qualF = forecast(series(qualified));
  const advanceF = forecast(series((l) => (l.advance || l.full ? 1 : 0)));
  const fullF = forecast(series((l) => (l.full ? 1 : 0)));
  const revenueF = forecast(series((l) => l.paid));
  const spendF = forecast(
    weekly(
      input.spend.map((s) => ({ at: `${s.day}T12:00:00Z`, value: s.amount })),
      from,
      complete,
    ),
  );
  // Audience loss: what the average drop from the peak costs in viewers.
  const m = computeMetrics(input);
  const lossViewers =
    m.audience.peakAvg != null && m.audience.dropAvg != null
      ? Math.round(m.audience.peakAvg * m.audience.dropAvg)
      : null;
  const qualPerViewer =
    m.audience.peakAvg && m.funnel.qualified && m.audience.webinars
      ? m.funnel.qualified / (m.audience.peakAvg * m.audience.webinars)
      : null;
  const conv = (a: Forecast, b: Forecast) =>
    a.enough && b.enough && a.next[0] && b.next[0]?.value
      ? Math.round((a.next[0].value / b.next[0].value) * 1000) / 10
      : null;
  return {
    period: { from, to: complete },
    leads: leadsF,
    qualified: qualF,
    prepaid: advanceF,
    paid: fullF,
    revenue: revenueF,
    spend: spendF,
    conversion: {
      qualRateNext: conv(qualF, leadsF),
      qualRateNow: m.rates.qual != null ? Math.round(m.rates.qual * 1000) / 10 : null,
    },
    audienceLoss:
      lossViewers != null
        ? {
            viewersLostPerWebinar: lossViewers,
            qualifiedLostPerWebinar:
              qualPerViewer != null ? Math.round(lossViewers * qualPerViewer * 10) / 10 : null,
          }
        : null,
    budget: {
      cplNow: m.efficiency.cpl,
      cplNext:
        spendF.enough && leadsF.enough && leadsF.next[0]?.value
          ? Math.round((spendF.next[0]?.value ?? 0) / leadsF.next[0].value)
          : null,
    },
  };
}

/* ---- Chat --------------------------------------------------------------- */

const CHAT_SYSTEM = `Siz kompaniyaning marketing yordamchisisiz (o'zbek tilida, qisqa va aniq yozing).
Javobni FAQAT quyidagi JSON'dagi SalesIQ raqamlaridan bering. Raqam o'ylab topmang. Ma'lumot yo'q bo'lsa, "bu haqda ma'lumot yo'q" deb ochiq ayting va qanday ma'lumot kerakligini yozing.
Kval lid = telefonni ko'targan va vebinarni ko'rgan lid. Pul so'mda.
Fakt, taxmin va tavsiyani ajrating ("Fakt:", "Taxmin:", "Tavsiya:" bilan boshlang, kerak bo'lsa).
Har javob oxirida qaysi davr ishlatilganini yozing.`;

export async function chatReply(
  orgId: string,
  profileId: string,
  input: { chatId?: string | null; message: string; scope: Scope },
): Promise<{ chatId: string; reply: string; period: { from: string; to: string } }> {
  const message = input.message.trim().slice(0, 4000);
  if (!message) throw new Error("Savol bo'sh");
  let chatId = input.chatId ?? null;
  if (chatId) {
    const { data } = await supabaseAdmin
      .from("marketing_ai_chats")
      .select("id")
      .eq("id", chatId)
      .eq("organization_id", orgId)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (!data) chatId = null;
  }
  if (!chatId) {
    const { data, error } = await supabaseAdmin
      .from("marketing_ai_chats")
      .insert({
        organization_id: orgId,
        profile_id: profileId,
        title: message.slice(0, 80),
        scope: input.scope as never,
      })
      .select("id")
      .single();
    if (error) throw error;
    chatId = data.id;
  }
  const { data: history } = await supabaseAdmin
    .from("marketing_ai_chat_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(12);
  const [current, previous] = await Promise.all([
    gatherMetrics(orgId, input.scope),
    gatherMetrics(orgId, previousScope(input.scope)),
  ]);
  const facts = factsOf(current, previous);
  const scopeNote = [
    input.scope.campaign ? `Kampaniya: ${input.scope.campaign}` : null,
    input.scope.webinarId ? "Bitta vebinar tanlangan" : null,
    input.scope.projectId ? "Bitta loyiha tanlangan" : null,
  ]
    .filter(Boolean)
    .join("; ");
  const reply = await aiCall(
    orgId,
    "chat",
    {
      system: `${CHAT_SYSTEM}\n\nRaqamlar (JSON):\n${JSON.stringify(facts)}${scopeNote ? `\nTanlov: ${scopeNote}` : ""}`,
      messages: [
        ...(history ?? [])
          .reverse()
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: message },
      ],
    },
    profileId,
  );
  const text = reply.text.slice(0, 19_000) || "Javob bo'sh qaytdi.";
  await supabaseAdmin.from("marketing_ai_chat_messages").insert([
    { chat_id: chatId, organization_id: orgId, role: "user", content: message },
    {
      chat_id: chatId,
      organization_id: orgId,
      role: "assistant",
      content: text,
      meta: { period: current.period, model: reply.model } as never,
    },
  ]);
  await supabaseAdmin
    .from("marketing_ai_chats")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", chatId);
  return { chatId, reply: text, period: current.period };
}

export async function chatList(orgId: string, profileId: string) {
  const { data } = await supabaseAdmin
    .from("marketing_ai_chats")
    .select("id, title, updated_at")
    .eq("organization_id", orgId)
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false })
    .limit(30);
  return data ?? [];
}

export async function chatMessages(orgId: string, profileId: string, chatId: string) {
  const { data: chat } = await supabaseAdmin
    .from("marketing_ai_chats")
    .select("id")
    .eq("id", chatId)
    .eq("organization_id", orgId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!chat) return [];
  const { data } = await supabaseAdmin
    .from("marketing_ai_chat_messages")
    .select("id, role, content, meta, created_at")
    .eq("chat_id", chatId)
    .order("created_at")
    .limit(200);
  return data ?? [];
}

/* ---- Tavsiyalar ------------------------------------------------------- */

const MEASURE_AFTER_DAYS = 14;

export async function recommendations(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from("marketing_ai_recommendations")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = data ?? [];
  // "After": measured once, 14 days after it was done, over those 14 days.
  for (const r of rows) {
    if (r.status !== "done" || !r.done_at || r.metric_after != null || !r.metric_key) continue;
    const end = Date.parse(r.done_at) + MEASURE_AFTER_DAYS * 86_400_000;
    if (end > Date.now()) continue;
    const scope = (r.scope ?? {}) as Partial<Scope>;
    const m = await gatherMetrics(orgId, {
      from: r.done_at,
      to: new Date(end).toISOString(),
      projectId: scope.projectId ?? null,
      campaign: scope.campaign ?? null,
    });
    const after = metricValue(m, r.metric_key);
    if (after != null) {
      r.metric_after = after;
      r.measured_at = new Date().toISOString();
      await supabaseAdmin
        .from("marketing_ai_recommendations")
        .update({ metric_after: after, measured_at: r.measured_at })
        .eq("id", r.id);
    }
  }
  return rows;
}

export async function createRecommendation(
  orgId: string,
  by: string,
  input: {
    title: string;
    problem?: string | null;
    priority?: string;
    metricKey?: string | null;
    scope: Scope;
    assigneeId?: string | null;
  },
) {
  let before: number | null = null;
  if (input.metricKey) {
    const m: Metrics = await gatherMetrics(orgId, input.scope);
    before = metricValue(m, input.metricKey);
  }
  const { data, error } = await supabaseAdmin
    .from("marketing_ai_recommendations")
    .insert({
      organization_id: orgId,
      title: input.title.trim().slice(0, 300),
      problem: input.problem?.slice(0, 2000) ?? null,
      priority: ["critical", "warning", "opportunity"].includes(input.priority ?? "")
        ? input.priority!
        : "warning",
      metric_key: input.metricKey ?? null,
      metric_before: before,
      scope: input.scope as never,
      assignee_id: input.assigneeId ?? null,
      created_by: by,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateRecommendation(
  orgId: string,
  id: string,
  patch: { status?: string; assigneeId?: string | null; title?: string },
) {
  const p: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status && ["new", "in_progress", "done", "rejected"].includes(patch.status)) {
    p["status"] = patch.status;
    p["done_at"] = patch.status === "done" ? new Date().toISOString() : null;
    if (patch.status !== "done") {
      p["metric_after"] = null;
      p["measured_at"] = null;
    }
  }
  if (patch.assigneeId !== undefined) p["assignee_id"] = patch.assigneeId;
  if (patch.title?.trim()) p["title"] = patch.title.trim().slice(0, 300);
  const { error } = await supabaseAdmin
    .from("marketing_ai_recommendations")
    .update(p as never)
    .eq("organization_id", orgId)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteRecommendation(orgId: string, id: string) {
  await supabaseAdmin
    .from("marketing_ai_recommendations")
    .delete()
    .eq("organization_id", orgId)
    .eq("id", id);
}
