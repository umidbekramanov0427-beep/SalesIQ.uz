// Server-only. Builds the full, fully-configurable "Kunlik hisobot" content
// (every section gated by its daily_report_settings.*_enabled flag, numeric
// aggregates plus one Gemini-narrated pass for manager strengths/attention
// and anketa-savollari summaries) -- extracted out of
// daily-report-settings.preview.ts so the interactive "Hisobot namunasi"
// preview and the real scheduled Telegram send (telegram.send-daily-report.ts)
// call the exact same code and can never drift apart.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callGemini } from "@/lib/gemini.server";

function dayBounds(daysAgo: number): { start: string; end: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysAgo);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function fmtDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m} daqiqa`;
  return `${h} soat ${m} daqiqa`;
}

function fmtPct(part: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function scopeIds(configured: string[] | null | undefined, allIds: string[]): Set<string> {
  return new Set(configured == null ? allIds : configured);
}

type NarrativeResult = {
  managers: { n: number; strengths: string[]; attention: string[] }[];
  intakeSummaries: { n: number; count: number; summary: string }[];
  recommendations: string[];
  summary: string;
};

async function generateNarrative(input: {
  statsBlock: string;
  managers: { n: number; name: string; strengthsRaw: string[]; improvementsRaw: string[] }[];
  intakeQuestions: { n: number; label: string; answers: string[] }[];
}): Promise<NarrativeResult> {
  const apiKey = process.env["GEMINI_API_KEY"];
  const empty: NarrativeResult = {
    managers: [],
    intakeSummaries: [],
    recommendations: [],
    summary: "",
  };
  if (!apiKey) return empty;
  if (
    input.managers.length === 0 &&
    input.intakeQuestions.length === 0 &&
    !input.statsBlock.trim()
  ) {
    return empty;
  }

  const managerBlock = input.managers
    .map(
      (m) =>
        `Menejer ${m.n} (${m.name}):\nKuchli tomonlar (xom): ${m.strengthsRaw.slice(0, 15).join("; ") || "yo'q"}\nYaxshilash kerak (xom): ${m.improvementsRaw.slice(0, 15).join("; ") || "yo'q"}`,
    )
    .join("\n\n");
  const questionBlock = input.intakeQuestions
    .map(
      (q) =>
        `Savol ${q.n} (${q.label}) — ${q.answers.length} ta javob:\n` +
        q.answers
          .slice(0, 20)
          .map((a) => `- ${a}`)
          .join("\n"),
    )
    .join("\n\n");

  const prompt =
    "Siz sotuv bo'limi rahbari uchun kunlik hisobot yozuvchisisiz. Quyidagi bugungi statistika va xom ma'lumotlar asosida FAQAT quyidagi JSON formatida javob ber, boshqa hech qanday matn yozma:\n" +
    '{"managers": [{"n": <menejer raqami>, "strengths": ["qisqa band", ...max 3], "attention": ["qisqa band", ...max 3]}, ...], ' +
    '"intake_summaries": [{"n": <savol raqami>, "count": <shu mazmunga mos javoblar soni>, "summary": "eng ko\'p uchragan javob mazmuni, 1 jumla"}, ...], ' +
    '"recommendations": ["ertangi kun uchun aniq harakat", ... 3 ta], ' +
    '"summary": "hisobot uchun 1-2 jumlali yakuniy xulosa"}\n\n' +
    "Bugungi statistika:\n" +
    input.statsBlock +
    (managerBlock ? "\n\nMenejerlar bo'yicha xom ma'lumot:\n" + managerBlock : "") +
    (questionBlock ? "\n\nAnketa savollari bo'yicha xom javoblar:\n" + questionBlock : "");

  try {
    const res = await callGemini(
      apiKey,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
      },
      25_000,
    );
    if (!res.ok) return empty;
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const parsed = JSON.parse(content) as {
      managers?: { n?: number; strengths?: string[]; attention?: string[] }[];
      intake_summaries?: { n?: number; count?: number; summary?: string }[];
      recommendations?: string[];
      summary?: string;
    };
    return {
      managers: Array.isArray(parsed.managers)
        ? parsed.managers
            .filter(
              (m): m is { n: number; strengths?: string[]; attention?: string[] } =>
                typeof m.n === "number",
            )
            .map((m) => ({
              n: m.n,
              strengths: (m.strengths ?? []).filter((s) => typeof s === "string"),
              attention: (m.attention ?? []).filter((s) => typeof s === "string"),
            }))
        : [],
      intakeSummaries: Array.isArray(parsed.intake_summaries)
        ? parsed.intake_summaries
            .filter(
              (q): q is { n: number; count?: number; summary?: string } => typeof q.n === "number",
            )
            .map((q) => ({ n: q.n, count: Number(q.count) || 0, summary: q.summary ?? "" }))
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.filter((r) => typeof r === "string")
        : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    };
  } catch {
    return empty;
  }
}

/**
 * The full "Kunlik hisobot" -- every section from daily_report_settings,
 * computed from today's real data (or the saved report_sample_override
 * text, returned as-is). Shared by the "Hisobot namunasi" preview, the
 * real daily Telegram send to Super Admin, and (via `ownerScope`) the
 * team-scoped send to each ROP.
 *
 * `ownerScope`, when given, restricts every section to leads/calls/tasks
 * owned by those profile ids -- a ROP's report passes [rop.id, ...their
 * reports] so they see only their own team's numbers, never the whole
 * company's. Left null (the Super Admin case) it's the original
 * company-wide report. `includeMarketingSection` adds a per-source
 * qualified/unqualified breakdown for the marketing team -- Super Admin
 * only, since it needs the company-wide picture to be useful.
 */
export async function buildFullDailyReport(
  organizationId: string,
  opts?: { ownerScope?: string[] | null; includeMarketingSection?: boolean },
): Promise<{ text: string; override: boolean }> {
  const { data: settings } = await supabaseAdmin
    .from("daily_report_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (settings?.report_sample_override) {
    return { text: settings.report_sample_override, override: true };
  }

  const today = dayBounds(0);
  const yesterday = dayBounds(1);

  const [
    profilesRes,
    callsTodayRes,
    callsYesterdayRes,
    tasksRes,
    leadsTodayRes,
    stagesRes,
    leadQualityStagesRes,
    serviceLinesRes,
    intakeQuestionsRes,
    transitionRulesRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("amocrm_calls")
      .select(
        "id, lead_id, connected, duration_seconds, recording_url, analyzed_at, score, service_line_id, intake_answers, analysis",
      )
      .eq("organization_id", organizationId)
      .gte("occurred_at", today.start)
      .lt("occurred_at", today.end),
    supabaseAdmin
      .from("amocrm_calls")
      .select("id, lead_id, connected")
      .eq("organization_id", organizationId)
      .gte("occurred_at", yesterday.start)
      .lt("occurred_at", yesterday.end),
    supabaseAdmin
      .from("tasks")
      .select("id, status, assignee_id, due_date, updated_at")
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("leads")
      .select(
        "id, owner_id, funnel, stage_id, expected_revenue, created_at, updated_at, lead_quality_stage_id, source",
      )
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("pipeline_stages")
      .select("id, name, is_won, is_lost")
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("lead_quality_stages")
      .select("id, title, qualified")
      .eq("organization_id", organizationId)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("service_lines")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("intake_questions")
      .select("id, label")
      .eq("organization_id", organizationId)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("daily_report_stage_transition_rules")
      .select("id, manager_scope, manager_id, funnel, from_stage_id, to_stage_id")
      .eq("organization_id", organizationId)
      .order("position", { ascending: true }),
  ]);

  const profiles = profilesRes.data ?? [];
  const stages = stagesRes.data ?? [];
  const leadQualityStages = leadQualityStagesRes.data ?? [];
  const serviceLines = serviceLinesRes.data ?? [];
  const intakeQuestions = intakeQuestionsRes.data ?? [];
  const transitionRules = transitionRulesRes.data ?? [];

  const ownerScope = opts?.ownerScope ?? null;
  const scopeSet = ownerScope ? new Set(ownerScope) : null;
  const inScope = (id: string | null | undefined): boolean =>
    !scopeSet || (!!id && scopeSet.has(id));

  // A ROP-scoped report only ever sees their own team's calls/tasks/leads --
  // filtering once here (rather than threading ownerScope through every
  // section below) means every section further down runs exactly as
  // written for the company-wide (ownerScope == null) case.
  const allLeadsRaw = leadsTodayRes.data ?? [];
  const leadOwnerById = new Map(allLeadsRaw.map((l) => [l.id, l.owner_id]));
  const callsToday = (callsTodayRes.data ?? []).filter((c) =>
    inScope(leadOwnerById.get(c.lead_id ?? "")),
  );
  const callsYesterday = (callsYesterdayRes.data ?? []).filter((c) =>
    inScope(leadOwnerById.get(c.lead_id ?? "")),
  );
  const tasks = (tasksRes.data ?? []).filter((t) => inScope(t.assignee_id));
  const allLeads = allLeadsRaw.filter((l) => inScope(l.owner_id));
  const managers = profiles.filter((p) => p.role === "sotuv_menejeri" && inScope(p.id));
  const leadsCreatedToday = allLeads.filter((l) => l.created_at >= today.start);
  const wonStageIds = new Set(stages.filter((s) => s.is_won).map((s) => s.id));
  const lostStageIds = new Set(stages.filter((s) => s.is_lost).map((s) => s.id));

  const sections: string[] = [];
  const s = settings;

  // --- CRM faolligi ---
  if (s?.crm_activity_enabled ?? true) {
    const total = callsToday.length;
    const connected = callsToday.filter((c) => c.connected).length;
    const totalSeconds = callsToday.reduce((sum, c) => sum + c.duration_seconds, 0);
    const yTotal = callsYesterday.length;
    const yConnected = callsYesterday.filter((c) => c.connected).length;
    sections.push(
      [
        "CRM faolligi",
        `- Jami qo'ng'iroqlar: ${total}`,
        `- Bog'langan qo'ng'iroqlar: ${connected}`,
        `- Mijozga yetib borilmagan qo'ng'iroqlar: ${total - connected}`,
        `- Bog'lanish darajasi: ${fmtPct(connected, total)}`,
        `- Umumiy suhbat vaqti: ${fmtDuration(totalSeconds)}`,
        `- Oldingi ish kuni: jami qo'ng'iroqlar ${yTotal}, bog'langan qo'ng'iroqlar ${yConnected}, bog'lanish darajasi ${fmtPct(yConnected, yTotal)}`,
      ].join("\n"),
    );
  }

  // --- Vazifalar rejasi ---
  const managerScope = scopeIds(
    s?.managers_activity_manager_ids,
    managers.map((m) => m.id),
  );
  if (s?.tasks_plan_enabled ?? true) {
    const dueToday = tasks.filter(
      (t) => t.due_date && t.due_date >= today.start && t.due_date < today.end,
    );
    const doneOfDue = dueToday.filter((t) => t.status === "Done");
    const doneToday = tasks.filter(
      (t) => t.status === "Done" && t.updated_at >= today.start && t.updated_at < today.end,
    );
    const perManager = managers
      .filter((m) => managerScope.has(m.id))
      .map((m) => {
        const mine = dueToday.filter((t) => t.assignee_id === m.id);
        const mineDone = mine.filter((t) => t.status === "Done");
        return `- ${m.full_name || m.email}: ${mineDone.length} / ${mine.length}, qoldi ${mine.length - mineDone.length}, jami ${mine.length}`;
      });
    sections.push(
      [
        "Vazifalar rejasi",
        `- Bugungi reja vazifalaridan bajarilgani: ${doneOfDue.length} / ${dueToday.length}`,
        `- Bugungi reja vazifalaridan qolgani: ${dueToday.length - doneOfDue.length}`,
        `- Bugun yakunlangan vazifalar: ${doneToday.length}`,
        ...(perManager.length > 0
          ? ["", "Menejerlar bo'yicha (bajarildi/reja, qoldi, jami):", ...perManager]
          : []),
      ].join("\n"),
    );
  }

  // --- Qo'ng'iroqlar sifati ---
  if (s?.call_quality_enabled ?? true) {
    const analyzed = callsToday.filter((c) => c.analyzed_at);
    const withChecklist = analyzed.filter((c) => {
      const a = c.analysis as { checklist?: unknown[] } | null;
      return Array.isArray(a?.checklist) && a.checklist.length > 0;
    });
    const operational = analyzed.length - withChecklist.length;
    const unconnected = callsToday.filter((c) => !c.connected).length;
    const scores = analyzed.map((c) => c.score).filter((n): n is number => n != null);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const noAudio = callsToday.filter((c) => !c.recording_url).length;
    sections.push(
      [
        "Qo'ng'iroqlar sifati",
        `- Tahlil qilingan qo'ng'iroqlar: ${analyzed.length}`,
        `- Savdo ssenariysi asosidagi qo'ng'iroqlar: ${withChecklist.length} (${fmtPct(withChecklist.length, analyzed.length)})`,
        `- Operatsion yoki chiqarilgan qo'ng'iroqlar: ${operational}`,
        `- Bog'lanilmagan holatlar: ${unconnected}`,
        `- O'rtacha ball: ${avgScore.toFixed(1)}`,
        `- Material audio muammolari: no_audio: ${noAudio}`,
      ].join("\n"),
    );
  }

  // --- Menejerlar faoliyati (+ AI narrative) ---
  const scopedManagers = managers.filter((m) => managerScope.has(m.id));
  const managerStats = scopedManagers.map((m, i) => {
    const mine = callsToday.filter((c) => leadOwnerById.get(c.lead_id ?? "") === m.id);
    const connected = mine.filter((c) => c.connected).length;
    const seconds = mine.reduce((sum, c) => sum + c.duration_seconds, 0);
    const scores = mine.map((c) => c.score).filter((n): n is number => n != null);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const strengthsRaw: string[] = [];
    const improvementsRaw: string[] = [];
    for (const c of mine) {
      const a = c.analysis as { strengths?: string[]; improvements?: string[] } | null;
      strengthsRaw.push(...(a?.strengths ?? []));
      improvementsRaw.push(...(a?.improvements ?? []));
    }
    return {
      n: i + 1,
      manager: m,
      total: mine.length,
      connected,
      seconds,
      avgScore,
      strengthsRaw,
      improvementsRaw,
    };
  });

  // --- Lidlar harakati ---
  const funnelScope = scopeIds(
    s?.leads_movement_funnels,
    Array.from(new Set(allLeads.map((l) => l.funnel).filter((f): f is string => !!f))),
  );
  const leadsInScope = leadsCreatedToday.filter((l) => l.funnel && funnelScope.has(l.funnel));
  if (s?.leads_movement_enabled ?? true) {
    const wonToday = allLeads.filter(
      (l) =>
        l.funnel &&
        funnelScope.has(l.funnel) &&
        l.stage_id &&
        wonStageIds.has(l.stage_id) &&
        l.updated_at >= today.start,
    );
    const lostToday = allLeads.filter(
      (l) =>
        l.funnel &&
        funnelScope.has(l.funnel) &&
        l.stage_id &&
        lostStageIds.has(l.stage_id) &&
        l.updated_at >= today.start,
    );
    const wonRevenue = wonToday.reduce((sum, l) => sum + Number(l.expected_revenue), 0);
    const includedFunnels = Array.from(funnelScope);
    sections.push(
      [
        "Lidlar harakati",
        `- Yangi lidlar: ${leadsInScope.length}`,
        `- Yutilgan bitimlar: ${wonToday.length}`,
        `- Yo'qotilgan lidlar: ${lostToday.length}`,
        `- Yutilgan qiymat: ${wonRevenue.toLocaleString("en-US")}`,
        `- Kiritilgan voronkalar: ${includedFunnels.join(", ")}`,
        `Bugun tizimga ${leadsInScope.length} ta yangi lid qo'shildi va ${wonToday.length} ta muvaffaqiyatli kelishuv qayd etildi.`,
      ].join("\n"),
    );
  }

  // --- Voronka bosqichlari harakati ---
  if (transitionRules.length > 0) {
    const stageNameById = new Map(stages.map((st) => [st.id, st.name]));
    const managerLabelById = new Map(profiles.map((p) => [p.id, p.full_name || p.email]));
    const { data: leadAuditRows } = await supabaseAdmin
      .from("audit_logs")
      .select("meta")
      .eq("organization_id", organizationId)
      .eq("entity_type", "leads")
      .eq("action", "update")
      .gte("created_at", today.start)
      .lt("created_at", today.end);

    const transitionsToday = (leadAuditRows ?? [])
      .map((row) => {
        const meta = row.meta as {
          old?: { stage_id?: string | null };
          new?: {
            stage_id?: string | null;
            funnel?: string | null;
            owner_id?: string | null;
          };
        } | null;
        return {
          fromStageId: meta?.old?.stage_id ?? null,
          toStageId: meta?.new?.stage_id ?? null,
          funnel: meta?.new?.funnel ?? null,
          ownerId: meta?.new?.owner_id ?? null,
        };
      })
      .filter((t) => t.toStageId && t.fromStageId !== t.toStageId);

    const ruleLines = transitionRules.map((rule) => {
      const count = transitionsToday.filter(
        (t) =>
          t.funnel === rule.funnel &&
          t.toStageId === rule.to_stage_id &&
          (rule.from_stage_id == null || t.fromStageId === rule.from_stage_id) &&
          (rule.manager_scope === "all" || t.ownerId === rule.manager_id),
      ).length;
      const managerLabel =
        rule.manager_scope === "specific"
          ? (managerLabelById.get(rule.manager_id ?? "") ?? "Noma'lum menejer")
          : "Barcha menejerlar";
      const fromLabel = rule.from_stage_id
        ? (stageNameById.get(rule.from_stage_id) ?? "?")
        : "Hamma bosqichdan";
      const toLabel = stageNameById.get(rule.to_stage_id) ?? "?";
      return `- ${managerLabel} | ${rule.funnel}: ${fromLabel} → ${toLabel}: ${count} ta`;
    });
    sections.push(["Voronka bosqichlari harakati", ...ruleLines].join("\n"));
  }

  // --- Lid sifati ---
  const qualityScope = scopeIds(
    s?.lead_quality_stage_ids,
    leadQualityStages.map((q) => q.id),
  );
  if (s?.lead_quality_enabled ?? true) {
    const worked = leadsCreatedToday.filter((l) => callsToday.some((c) => c.lead_id === l.id));
    const unreachable = leadsCreatedToday.filter(
      (l) => !callsToday.some((c) => c.lead_id === l.id),
    );
    const qualified = leadsCreatedToday.filter((l) => {
      const stage = leadQualityStages.find((q) => q.id === l.lead_quality_stage_id);
      return stage?.qualified === true;
    });
    const unqualified = leadsCreatedToday.filter((l) => {
      const stage = leadQualityStages.find((q) => q.id === l.lead_quality_stage_id);
      return stage != null && stage.qualified === false;
    });
    const groupLines = leadQualityStages
      .filter((q) => qualityScope.has(q.id))
      .map((q) => {
        const count = leadsCreatedToday.filter((l) => l.lead_quality_stage_id === q.id).length;
        return `- ${q.title}: ${count}`;
      });
    sections.push(
      [
        "Lid sifati",
        `- Jami yangi lidlar: ${leadsCreatedToday.length}`,
        `- Ishlangan lidlar: ${worked.length}`,
        `- Sifatli: ${qualified.length}`,
        `- Sifatsiz: ${unqualified.length}`,
        `- Bog'lana olinmagan: ${unreachable.length}`,
        ...(groupLines.length > 0 ? ["Guruhlar:", ...groupLines] : []),
      ].join("\n"),
    );
  }

  // --- Marketing uchun lid tahlili (Super Admin only -- see includeMarketingSection) ---
  // Same qualified/unqualified split as "Lid sifati" above, broken down by
  // leads.source so marketing can see which channel brings leads that
  // actually pass the AI's call-audio qualification, not just volume.
  if (opts?.includeMarketingSection) {
    const bySource = new Map<
      string,
      { total: number; qualified: number; unqualified: number; unscored: number }
    >();
    for (const l of leadsCreatedToday) {
      const bucket = bySource.get(l.source || "—") ?? {
        total: 0,
        qualified: 0,
        unqualified: 0,
        unscored: 0,
      };
      bucket.total++;
      const stage = leadQualityStages.find((q) => q.id === l.lead_quality_stage_id);
      if (stage?.qualified === true) bucket.qualified++;
      else if (stage != null && stage.qualified === false) bucket.unqualified++;
      else bucket.unscored++;
      bySource.set(l.source || "—", bucket);
    }
    const sourceLines = Array.from(bySource.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(
        ([src, b]) =>
          `- ${src}: jami ${b.total}, sifatli ${b.qualified}, sifatsiz ${b.unqualified}, hali baholanmagan ${b.unscored}`,
      );
    sections.push(
      [
        "Marketing uchun lid tahlili",
        "Sun'iy intellekt menejer-mijoz suhbatini tinglab baholagan holat bo'yicha, manba kesimida:",
        ...(sourceLines.length > 0 ? sourceLines : ["Bugun manbasi ko'rsatilgan lid kelmadi."]),
      ].join("\n"),
    );
  }

  // --- Xizmat yo'nalishlari ---
  if (s?.service_lines_enabled ?? true) {
    const lines = serviceLines.map((line) => {
      const count = callsToday.filter((c) => c.service_line_id === line.id).length;
      return `- ${line.name}: ${count}`;
    });
    sections.push(
      [
        "Xizmat yo'nalishlari",
        ...lines,
        "Muloqotlarning asosiy qismi sozlangan shu sotuv yo'nalishlariga to'g'ri kelgani ko'rsatiladi.",
      ].join("\n"),
    );
  }

  // --- Anketa savollari ---
  const questionScope = scopeIds(
    s?.intake_question_ids,
    intakeQuestions.map((q) => q.id),
  );
  const scopedQuestions = intakeQuestions
    .filter((q) => questionScope.has(q.id))
    .map((q, i) => {
      const answers = callsToday
        .map((c) => {
          const raw = c.intake_answers as Record<string, string> | null;
          return raw?.[q.id]?.trim() ?? "";
        })
        .filter((a) => a !== "");
      return { n: i + 1, id: q.id, label: q.label, answers };
    });

  // --- Menejerlar faoliyati / Anketa savollari narrative ---
  const narrative = await generateNarrative({
    statsBlock: sections.join("\n\n"),
    managers: managerStats.map((m) => ({
      n: m.n,
      name: m.manager.full_name || m.manager.email,
      strengthsRaw: m.strengthsRaw,
      improvementsRaw: m.improvementsRaw,
    })),
    intakeQuestions: scopedQuestions.map((q) => ({
      n: q.n,
      label: q.label,
      answers: q.answers,
    })),
  });

  if (s?.managers_activity_enabled ?? true) {
    const narrativeByN = new Map(narrative.managers.map((m) => [m.n, m]));
    const managerLines = managerStats.map((m) => {
      const nar = narrativeByN.get(m.n);
      const lines = [
        `${m.manager.full_name || m.manager.email}`,
        `- Ko'rsatkichlar: Jami qo'ng'iroqlar: ${m.total}; Bog'langan qo'ng'iroqlar: ${m.connected}; Bog'lanish darajasi: ${fmtPct(m.connected, m.total)}; Umumiy suhbat vaqti: ${fmtDuration(m.seconds)}; O'rtacha ball: ${m.avgScore.toFixed(1)}`,
      ];
      if (nar?.strengths.length) lines.push(`- Kuchli tomonlar: ${nar.strengths.join("; ")}`);
      if (nar?.attention.length)
        lines.push(`- E'tibor kerak bo'lgan jihatlar: ${nar.attention.join("; ")}`);
      return lines.join("\n");
    });
    sections.splice(
      sections.findIndex((sec) => sec.startsWith("Lidlar harakati")) === -1
        ? sections.length
        : sections.findIndex((sec) => sec.startsWith("Lidlar harakati")),
      0,
      ["Menejerlar faoliyati", ...managerLines].join("\n\n"),
    );
  }

  if (scopedQuestions.length > 0 && (s?.intake_questions_enabled ?? true)) {
    const narrativeByN = new Map(narrative.intakeSummaries.map((q) => [q.n, q]));
    const lines = scopedQuestions.map((q) => {
      const nar = narrativeByN.get(q.n);
      const header = `- ${q.label}`;
      const body = nar?.summary
        ? `Bugungi holat: ${q.answers.length} ta javobdan eng ko'p uchragan mazmun: ${nar.summary} (${nar.count} ta suhbat).`
        : `Bugungi holat: ${q.answers.length} ta javob olindi.`;
      return `${header}\n${body}`;
    });
    sections.push(["Anketa savollari", ...lines].join("\n"));
  }

  if (s?.recommendations_enabled ?? true) {
    const recs =
      narrative.recommendations.length > 0
        ? narrative.recommendations
        : ["Hozircha tavsiya generatsiya qilinmadi."];
    sections.push(["Tavsiyalar", ...recs.map((r, i) => `${i + 1}. ${r}`)].join("\n"));
  }

  if (s?.summary_enabled ?? true) {
    sections.push(
      ["Xulosa", narrative.summary || "Hozircha xulosa generatsiya qilinmadi."].join("\n"),
    );
  }

  return { text: sections.join("\n\n"), override: false };
}

/**
 * A personal, self-scoped daily report for a single sotuv_menejeri -- their
 * own calls/tasks/leads only, not the full company report. Deliberately a
 * separate, simpler generator rather than a scoped call into
 * buildFullDailyReport: reps don't get AI narrative, transition rules, or
 * company-wide sections, just their own numbers.
 */
export async function buildPersonalDailyReport(
  organizationId: string,
  managerId: string,
): Promise<string> {
  const today = dayBounds(0);

  const [profileRes, callsTodayRes, tasksRes, leadsRes, stagesRes] = await Promise.all([
    supabaseAdmin.from("profiles").select("full_name, email").eq("id", managerId).maybeSingle(),
    supabaseAdmin
      .from("amocrm_calls")
      .select("id, lead_id, connected, duration_seconds, score, analyzed_at")
      .eq("organization_id", organizationId)
      .gte("occurred_at", today.start)
      .lt("occurred_at", today.end),
    supabaseAdmin
      .from("tasks")
      .select("id, status, assignee_id, due_date")
      .eq("organization_id", organizationId)
      .eq("assignee_id", managerId),
    supabaseAdmin
      .from("leads")
      .select("id, owner_id, stage_id, expected_revenue, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("owner_id", managerId),
    supabaseAdmin
      .from("pipeline_stages")
      .select("id, is_won, is_lost")
      .eq("organization_id", organizationId),
  ]);

  const name = profileRes.data?.full_name || profileRes.data?.email || "Menejer";
  const stages = stagesRes.data ?? [];
  const wonStageIds = new Set(stages.filter((s) => s.is_won).map((s) => s.id));
  const lostStageIds = new Set(stages.filter((s) => s.is_lost).map((s) => s.id));
  const leads = leadsRes.data ?? [];

  const myLeadIds = new Set(leads.map((l) => l.id));
  const myCalls = (callsTodayRes.data ?? []).filter((c) => c.lead_id && myLeadIds.has(c.lead_id));
  const total = myCalls.length;
  const connected = myCalls.filter((c) => c.connected).length;
  const seconds = myCalls.reduce((sum, c) => sum + c.duration_seconds, 0);
  const scores = myCalls.map((c) => c.score).filter((n): n is number => n != null);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const dueToday = (tasksRes.data ?? []).filter(
    (t) => t.due_date && t.due_date >= today.start && t.due_date < today.end,
  );
  const doneOfDue = dueToday.filter((t) => t.status === "Done");

  const newLeadsToday = leads.filter((l) => l.created_at >= today.start);
  const wonToday = leads.filter(
    (l) => l.stage_id && wonStageIds.has(l.stage_id) && l.updated_at >= today.start,
  );
  const lostToday = leads.filter(
    (l) => l.stage_id && lostStageIds.has(l.stage_id) && l.updated_at >= today.start,
  );
  const wonRevenue = wonToday.reduce((sum, l) => sum + Number(l.expected_revenue), 0);

  const dateLabel = new Date().toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return [
    `📊 <b>Shaxsiy kunlik hisobot — ${dateLabel}</b>`,
    `👤 ${name}`,
    "",
    `📞 Bugungi qo'ng'iroqlar: <b>${total}</b> (bog'langan: ${connected}, ${fmtPct(connected, total)})`,
    `⏱ Umumiy suhbat vaqti: <b>${fmtDuration(seconds)}</b>`,
    scores.length > 0 ? `⭐ O'rtacha ball: <b>${avgScore.toFixed(1)}</b>` : "",
    `✅ Bugungi vazifalar: <b>${doneOfDue.length}/${dueToday.length}</b> bajarildi`,
    `🆕 Yangi lidlar: <b>${newLeadsToday.length}</b>`,
    `🏆 Yutilgan bitimlar: <b>${wonToday.length}</b> (${wonRevenue.toLocaleString("en-US")})`,
    `❌ Yo'qotilgan lidlar: <b>${lostToday.length}</b>`,
  ]
    .filter(Boolean)
    .join("\n");
}
