"""Port of src/routes/ai-assistant.chat.ts -- the AI assistant chat
endpoint. Loads a scoped CRM data snapshot, gives Gemini a set of
function-calling tools (search_leads, get_funnel_stats, create_my_task,
add_lead_note, update_lead_stage) scoped to the same ownerIds visibility
as the snapshot, and loops until it produces a final text reply or a
tool-round cap is hit. No AmoCRM dependency -- self-contained.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.auth import get_request_user_id
from app.db import get_supabase_admin

router = APIRouter()


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing environment variable: {name}. Add it in Settings -> Secrets.")
    return value


async def _reconstruct_as_of(org_id: str, entity_type: str, as_of: str) -> list[dict[str, Any]]:
    """Reconstructs the latest-known state of every row of `entity_type` at
    or before `as_of`, straight from the audit trail -- same idea as the
    entities_as_of() RPC, done here directly since the RPC's internal
    current_user_org_id() only resolves for a real user session, not
    service-role calls."""
    admin = get_supabase_admin()
    rows = (
        admin.table("audit_logs")
        .select("entity_id, action, meta, created_at")
        .eq("organization_id", org_id)
        .eq("entity_type", entity_type)
        .lte("created_at", as_of)
        .order("created_at")
        .execute()
        .data
        or []
    )
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        latest[row["entity_id"]] = row
    out: list[dict[str, Any]] = []
    for row in latest.values():
        if row["action"] != "delete" and (row.get("meta") or {}).get("new"):
            out.append(row["meta"]["new"])
    return out


async def _visible_owner_ids(org_id: str, caller_id: str, role: str) -> list[str] | None:
    """None = unrestricted (super_admin/platform_owner sees the whole
    company). A rop only ever gets their own subordinates' data, a
    sotuv_menejeri only their own."""
    if role in ("super_admin", "platform_owner"):
        return None
    admin = get_supabase_admin()
    if role == "rop":
        reports = (
            admin.table("profiles")
            .select("id")
            .eq("organization_id", org_id)
            .eq("manager_id", caller_id)
            .execute()
            .data
            or []
        )
        return [caller_id] + [r["id"] for r in reports]
    return [caller_id]


async def _load_data_snapshot(org_id: str, as_of: str | None, owner_ids: list[str] | None) -> str:
    admin = get_supabase_admin()
    stages = (
        admin.table("pipeline_stages")
        .select("id, name, is_won, is_lost")
        .eq("organization_id", org_id)
        .execute()
        .data
        or []
    )
    stage_by_id = {s["id"]: s for s in stages}

    if as_of:
        leads = await _reconstruct_as_of(org_id, "leads", as_of)
        tasks = await _reconstruct_as_of(org_id, "tasks", as_of)
    else:
        leads = (
            admin.table("leads")
            .select("stage_id, temperature, expected_revenue, owner_id")
            .eq("organization_id", org_id)
            .execute()
            .data
            or []
        )
        tasks = (
            admin.table("tasks")
            .select("status, due_date, assignee_id")
            .eq("organization_id", org_id)
            .execute()
            .data
            or []
        )

    if owner_ids is not None:
        owners = set(owner_ids)
        leads = [l for l in leads if l.get("owner_id") and l["owner_id"] in owners]
        tasks = [t for t in tasks if t.get("assignee_id") and t["assignee_id"] in owners]

    lead_count_by_stage: dict[str, int] = {}
    lead_revenue = 0.0
    leads_won = 0
    leads_lost = 0
    lead_revenue_won = 0.0
    for l in leads:
        stage = stage_by_id.get(l.get("stage_id")) if l.get("stage_id") else None
        stage_name = (stage or {}).get("name") or "No stage"
        lead_count_by_stage[stage_name] = lead_count_by_stage.get(stage_name, 0) + 1
        lead_revenue += l.get("expected_revenue") or 0
        if stage and stage.get("is_won"):
            leads_won += 1
            lead_revenue_won += l.get("expected_revenue") or 0
        elif stage and stage.get("is_lost"):
            leads_lost += 1

    as_of_moment = (
        datetime.fromisoformat(as_of.replace("Z", "+00:00")) if as_of else datetime.now(timezone.utc)
    )
    tasks_done = 0
    tasks_open = 0
    tasks_overdue = 0
    for t in tasks:
        if t.get("status") == "Done":
            tasks_done += 1
        else:
            tasks_open += 1
            if t.get("due_date"):
                due = datetime.fromisoformat(t["due_date"].replace("Z", "+00:00"))
                if due < as_of_moment:
                    tasks_overdue += 1

    stage_summary = ", ".join(f"{name} ({count})" for name, count in lead_count_by_stage.items()) or "none"
    lines = [
        (
            f"CRM data snapshot as it stood on {as_of_moment.date().isoformat()} (the user has selected this "
            "past date to review — answer using ONLY these historical numbers, not current live figures):"
            if as_of
            else "Current live CRM data snapshot:"
        ),
        f"- Leads: {len(leads)} total, {lead_revenue:,.0f} total expected revenue. By stage: {stage_summary}",
        f"- Won/lost: {leads_won} won (value {lead_revenue_won:,.0f}), {leads_lost} lost",
        f"- Tasks: {tasks_open} open ({tasks_overdue} overdue), {tasks_done} done",
    ]
    return "\n".join(lines)


TOOLS = [
    {
        "name": "search_leads",
        "description": (
            "Search the caller's visible leads by name or company name. Call this first to find a "
            "lead's id before using add_lead_note or update_lead_stage."
        ),
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Part of the lead's name or company name"}},
            "required": ["query"],
        },
    },
    {
        "name": "get_funnel_stats",
        "description": (
            "Get real lead counts, stage breakdown and conversion rate for one funnel (or every funnel "
            "if funnel_name is omitted). Always call this instead of guessing or telling the user to go "
            "look at the Funnels page themselves -- you have this data directly."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "funnel_name": {
                    "type": "string",
                    "description": 'Exact or partial funnel name, e.g. "Super rus tili 19.0". Omit to get every funnel.',
                }
            },
            "required": [],
        },
    },
    {
        "name": "create_my_task",
        "description": (
            "Create a new task assigned to the current user (the person chatting). Use this when they ask "
            "you to remind them of something or create a task/to-do for themselves."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "due_date": {"type": "string", "description": "ISO date, e.g. 2026-08-25. Optional."},
                "lead_id": {
                    "type": "string",
                    "description": "Optional lead id (from search_leads) to attach this task to.",
                },
            },
            "required": ["title"],
        },
    },
    {
        "name": "add_lead_note",
        "description": (
            "Add a note to a lead's activity timeline. Requires the lead's id -- call search_leads first "
            "if you don't already have it from this conversation."
        ),
        "parameters": {
            "type": "object",
            "properties": {"lead_id": {"type": "string"}, "note": {"type": "string"}},
            "required": ["lead_id", "note"],
        },
    },
    {
        "name": "update_lead_stage",
        "description": (
            "Move a lead to a different pipeline stage by name (the stage must belong to that lead's own "
            "funnel). Requires the lead's id -- call search_leads first if you don't already have it."
        ),
        "parameters": {
            "type": "object",
            "properties": {"lead_id": {"type": "string"}, "stage_name": {"type": "string"}},
            "required": ["lead_id", "stage_name"],
        },
    },
]

# Mirrors normalizeStageName()/SALES_STAGE_KEYWORDS in
# src/hooks/use-crm-data.ts exactly -- the same "reached a late/sales-track
# stage" definition the Funnels page itself uses for its conversion %.
_SALES_KEYWORDS = ["predoplata", "peredoplata", "yarim", "toliq", "won", "успешно", "rop closed"]


def _is_sales_stage(stage_name: str) -> bool:
    norm = "".join(c for c in stage_name.lower() if c not in "'’ʼ`")
    return any(kw in norm for kw in _SALES_KEYWORDS)


async def _execute_tool(name: str, args: dict[str, Any], org_id: str, caller_id: str, owner_ids: list[str] | None) -> Any:
    admin = get_supabase_admin()

    def in_scope(owner_id: str | None) -> bool:
        return owner_ids is None or (owner_id is not None and owner_id in owner_ids)

    if name == "search_leads":
        query = str(args.get("query") or "").strip()
        if not query:
            return {"error": "query is required"}
        rows = (
            admin.table("leads")
            .select("id, name, company_name, stage_id, owner_id, temperature")
            .eq("organization_id", org_id)
            .or_(f"name.ilike.%{query}%,company_name.ilike.%{query}%")
            .limit(20)
            .execute()
            .data
            or []
        )
        rows = [l for l in rows if in_scope(l.get("owner_id"))][:5]
        if not rows:
            return {"results": []}
        stage_ids = list({l["stage_id"] for l in rows if l.get("stage_id")})
        stages = (
            admin.table("pipeline_stages").select("id, name").in_("id", stage_ids).execute().data
            if stage_ids
            else []
        )
        stage_by_id = {s["id"]: s["name"] for s in stages}
        return {
            "results": [
                {
                    "id": l["id"],
                    "name": l["name"],
                    "company": l.get("company_name"),
                    "stage": stage_by_id.get(l["stage_id"]) if l.get("stage_id") else None,
                    "temperature": l.get("temperature"),
                    "path": f"/crm/leads/{l['id']}",
                }
                for l in rows
            ]
        }

    if name == "get_funnel_stats":
        wanted = str(args.get("funnel_name") or "").strip()

        # Supabase/PostgREST caps a single select() at 1000 rows -- page
        # through so an org with more than 1000 leads gets true totals.
        page_size = 1000
        lead_rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            page = (
                admin.table("leads")
                .select("funnel, stage_id, owner_id, expected_revenue")
                .eq("organization_id", org_id)
                .range(offset, offset + page_size - 1)
                .execute()
                .data
                or []
            )
            lead_rows.extend(page)
            if len(page) < page_size:
                break
            offset += page_size

        stage_rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            page = (
                admin.table("pipeline_stages")
                .select("id, name")
                .eq("organization_id", org_id)
                .range(offset, offset + page_size - 1)
                .execute()
                .data
                or []
            )
            stage_rows.extend(page)
            if len(page) < page_size:
                break
            offset += page_size
        stage_name_by_id = {s["id"]: s["name"] for s in stage_rows}

        scoped = [l for l in lead_rows if in_scope(l.get("owner_id"))]
        by_funnel: dict[str, dict[str, Any]] = {}
        for l in scoped:
            fn = l.get("funnel") or "Direct Sales"
            bucket = by_funnel.setdefault(
                fn, {"total": 0, "lateFunnel": 0, "revenue": 0.0, "stageCounts": {}}
            )
            bucket["total"] += 1
            bucket["revenue"] += l.get("expected_revenue") or 0
            stage_name = stage_name_by_id.get(l.get("stage_id"), "No stage") if l.get("stage_id") else "No stage"
            bucket["stageCounts"][stage_name] = bucket["stageCounts"].get(stage_name, 0) + 1
            if _is_sales_stage(stage_name):
                bucket["lateFunnel"] += 1

        def summarize(fn: str) -> dict[str, Any]:
            b = by_funnel[fn]
            return {
                "funnel": fn,
                "total_leads": b["total"],
                "conversion_pct": round((b["lateFunnel"] / b["total"]) * 1000) / 10 if b["total"] else 0,
                "total_expected_revenue": b["revenue"],
                "by_stage": b["stageCounts"],
            }

        if not wanted:
            return {"funnels": [summarize(fn) for fn in by_funnel]}
        match = next((fn for fn in by_funnel if wanted.lower() in fn.lower()), None)
        if not match:
            return {"error": f"No funnel matching \"{wanted}\". Known funnels: {', '.join(by_funnel) or 'none'}"}
        return summarize(match)

    if name == "create_my_task":
        title = str(args.get("title") or "").strip()
        if not title:
            return {"error": "title is required"}
        lead_id = args.get("lead_id") if isinstance(args.get("lead_id"), str) else None
        if lead_id:
            lead = (
                admin.table("leads")
                .select("id, owner_id, organization_id")
                .eq("id", lead_id)
                .maybe_single()
                .execute()
                .data
            )
            if not lead or lead["organization_id"] != org_id or not in_scope(lead.get("owner_id")):
                return {"error": "Unknown lead_id."}
        try:
            data = (
                admin.table("tasks")
                .insert(
                    {
                        "organization_id": org_id,
                        "title": title,
                        "assignee_id": caller_id,
                        "created_by": caller_id,
                        "due_date": args.get("due_date") if isinstance(args.get("due_date"), str) else None,
                        "lead_id": lead_id,
                    }
                )
                .execute()
                .data
            )
            return {"created": True, "task_id": (data or [{}])[0].get("id")}
        except Exception as err:
            return {"error": str(err)}

    if name == "add_lead_note":
        lead_id = str(args.get("lead_id") or "")
        note = str(args.get("note") or "").strip()
        if not lead_id or not note:
            return {"error": "lead_id and note are required"}
        lead = (
            admin.table("leads")
            .select("id, owner_id, organization_id")
            .eq("id", lead_id)
            .maybe_single()
            .execute()
            .data
        )
        if not lead or lead["organization_id"] != org_id or not in_scope(lead.get("owner_id")):
            return {"error": "Unknown lead_id."}
        try:
            admin.table("lead_activities").insert(
                {
                    "lead_id": lead_id,
                    "organization_id": org_id,
                    "type": "note",
                    "content": note,
                    "created_by": caller_id,
                }
            ).execute()
            return {"added": True}
        except Exception as err:
            return {"error": str(err)}

    if name == "update_lead_stage":
        lead_id = str(args.get("lead_id") or "")
        stage_name = str(args.get("stage_name") or "").strip()
        if not lead_id or not stage_name:
            return {"error": "lead_id and stage_name are required"}
        lead = (
            admin.table("leads")
            .select("id, owner_id, organization_id, stage_id")
            .eq("id", lead_id)
            .maybe_single()
            .execute()
            .data
        )
        if not lead or lead["organization_id"] != org_id or not in_scope(lead.get("owner_id")):
            return {"error": "Unknown lead_id."}
        current_pipeline_name = None
        if lead.get("stage_id"):
            current_stage = (
                admin.table("pipeline_stages")
                .select("pipeline_name")
                .eq("id", lead["stage_id"])
                .maybe_single()
                .execute()
                .data
            )
            current_pipeline_name = (current_stage or {}).get("pipeline_name")
        query = (
            admin.table("pipeline_stages")
            .select("id, name, pipeline_name")
            .eq("organization_id", org_id)
            .ilike("name", stage_name)
        )
        if current_pipeline_name:
            query = query.eq("pipeline_name", current_pipeline_name)
        targets = query.limit(1).execute().data or []
        if not targets:
            return {"error": f'No stage named "{stage_name}" found in this lead\'s funnel.'}
        target = targets[0]
        try:
            admin.table("leads").update({"stage_id": target["id"]}).eq("id", lead_id).execute()
            return {"moved": True, "new_stage": target["name"]}
        except Exception as err:
            return {"error": str(err)}

    return {"error": f"Unknown tool: {name}"}


NAV_GUIDE = """- / — Leaderboard: live revenue ranking, KPI and bonus per rep
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
- /platform — Platform (platform_owner only): manage every company on the platform"""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatBody(BaseModel):
    messages: list[ChatMessage] | None = None
    asOf: str | None = None


@router.post("/ai-assistant/chat")
async def chat(body: ChatBody, authorization: str | None = Header(default=None)):
    user_id = await get_request_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    messages = (body.messages or [])[-20:]
    as_of = body.asOf
    if not messages:
        raise HTTPException(status_code=400, detail="No messages provided.")

    try:
        api_key = _require_env("GEMINI_API_KEY")
    except RuntimeError as err:
        raise HTTPException(status_code=500, detail=str(err)) from err

    admin = get_supabase_admin()
    caller = (
        admin.table("profiles")
        .select("organization_id, role")
        .eq("id", user_id)
        .maybe_single()
        .execute()
        .data
    )

    profile = None
    if caller and caller.get("organization_id"):
        profile = (
            admin.table("business_profile")
            .select("company_name, description, competitors, terminology, tone")
            .eq("organization_id", caller["organization_id"])
            .maybe_single()
            .execute()
            .data
        )

    chat_agent = None
    if caller and caller.get("organization_id"):
        chat_agent = (
            admin.table("ai_agents")
            .select("system_prompt, active")
            .eq("organization_id", caller["organization_id"])
            .eq("kind", "chat")
            .maybe_single()
            .execute()
            .data
        )
    if chat_agent and chat_agent.get("active") is False:
        raise HTTPException(
            status_code=400, detail="AI yordamchi admin tomonidan o'chirilgan. Admin panelidan yoqing."
        )

    intro_prompt = (
        ((chat_agent or {}).get("system_prompt") or "").strip()
        or "You are the AI assistant built into SalesIQ, a CRM for sales teams. Be concise and practical. Reply in the same language the user writes in."
    )

    system_prompt = (
        intro_prompt
        + "\n\nWhen the user asks HOW to do something or WHERE a feature lives in the app (a navigation "
        "question), name the exact page and, when useful, give the numbered steps to get there — for "
        "example: '1. Open Sozlamalar (Settings) in the sidebar. 2. Click Biznes profili. 3. Fill in the "
        "form and press Saqlash.' Always include the page's path in parentheses so it's unambiguous, e.g. "
        "(/settings). Only reference pages from this list — never invent a path that isn't here:\n"
        + NAV_GUIDE
        + "\n\nBut when the user asks WHAT a number, rate, or fact actually IS (e.g. a funnel's conversion "
        "rate, who a lead's owner is, how many leads are in some stage), you must answer with the real "
        "value itself, using your tools -- never reply with only navigation instructions ('go check the "
        "Funnels page') when a tool can get you the actual answer. That is a wrong answer, not a helpful "
        "one.\n\n"
        "You also have tools to actually look things up and act, not just describe: search_leads, "
        "get_funnel_stats, create_my_task, add_lead_note, update_lead_stage. Use search_leads or "
        "get_funnel_stats whenever the answer depends on real data you don't already have in this "
        "conversation. Use create_my_task/add_lead_note/update_lead_stage whenever the user asks you to do "
        "something rather than just explain it (e.g. 'remind me to call Aziz tomorrow', 'add a note on the "
        "Akmal deal', 'move that lead to negotiation'). Never invent a lead_id — call search_leads first if "
        "you don't already have the right id from earlier in this conversation, and if multiple leads "
        "match, ask which one they mean instead of guessing. Whenever you mention a specific lead, include "
        "the exact `path` search_leads gave you for it verbatim in your reply (e.g. /crm/leads/3fa2...) so "
        "the chat can turn it into a clickable link -- never paraphrase or shorten that path. After a tool "
        "call succeeds, confirm plainly what you did."
    )
    if profile:
        context_lines = [
            f"Company: {profile['company_name']}" if profile.get("company_name") else None,
            f"About the business: {profile['description']}" if profile.get("description") else None,
            f"Known competitors: {profile['competitors']}" if profile.get("competitors") else None,
            f"Business-specific terms/jargon: {profile['terminology']}" if profile.get("terminology") else None,
            f"Preferred tone of voice: {profile['tone']}" if profile.get("tone") else None,
        ]
        context = "\n".join(c for c in context_lines if c)
        if context:
            system_prompt += f"\n\nBusiness context:\n{context}"

    owner_ids: list[str] | None = None
    if caller and caller.get("organization_id"):
        try:
            owner_ids = await _visible_owner_ids(caller["organization_id"], user_id, caller["role"])
            snapshot = await _load_data_snapshot(caller["organization_id"], as_of, owner_ids)
            system_prompt += f"\n\n{snapshot}"
        except Exception:
            pass

    contents: list[dict[str, Any]] = [
        {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]}
        for m in messages
    ]
    function_declarations = TOOLS
    reply = ""
    # Capped: one round to call tools, one to answer using their results is
    # the common case, but a request can chain a couple of tools.
    max_tool_rounds = 4
    for _ in range(max_tool_rounds):
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                res = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={api_key}",
                    json={
                        "systemInstruction": {"parts": [{"text": system_prompt}]},
                        "contents": contents,
                        "tools": [{"functionDeclarations": function_declarations}],
                        "generationConfig": {"temperature": 0.4},
                    },
                )
        except httpx.HTTPError:
            raise HTTPException(
                status_code=504, detail="AI yordamchi javob bermadi (timeout). Qayta urinib ko'ring."
            )

        if res.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Gemini error ({res.status_code}): {res.text}")

        json_res = res.json()
        candidates = json_res.get("candidates") or []
        parts = ((candidates[0].get("content") or {}).get("parts") or []) if candidates else []
        if not parts:
            reason = json_res.get("promptFeedback", {}).get("blockReason") or (
                candidates[0].get("finishReason") if candidates else "unknown"
            )
            raise HTTPException(
                status_code=502,
                detail=f"AI yordamchi javob bera olmadi (sabab: {reason}). Qayta urinib ko'ring.",
            )

        function_calls = [p for p in parts if "functionCall" in p]

        if function_calls and caller and caller.get("organization_id"):
            contents.append({"role": "model", "parts": parts})
            response_parts = []
            for call in function_calls:
                fc = call["functionCall"]
                result = await _execute_tool(
                    fc["name"], fc.get("args") or {}, caller["organization_id"], user_id, owner_ids
                )
                response_parts.append(
                    {
                        "functionResponse": {
                            "name": fc["name"],
                            "response": result if isinstance(result, dict) else {"result": result},
                        }
                    }
                )
            contents.append({"role": "user", "parts": response_parts})
            continue

        reply = "".join(p.get("text", "") for p in parts if "text" in p)
        break

    if not reply.strip():
        raise HTTPException(status_code=502, detail="AI yordamchi javob bera olmadi. Qayta urinib ko'ring.")

    return {"reply": reply}
