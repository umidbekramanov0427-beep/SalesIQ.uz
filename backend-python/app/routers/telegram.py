"""Port of src/routes/telegram.send-test.ts, telegram.send-daily-report.ts,
telegram.link.ts and telegram.webhook.ts.

Not yet ported: telegram.hr-webhook.ts (separate HR candidate-chat bot --
different token, different conversation shape, kept out of this file same
as the original keeps it a separate route) -- see PORT_STATUS.md.
"""

from __future__ import annotations

import os
import random
import re
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.auth import AuthedAdmin, require_cron_secret_dep, require_org_member
from app.daily_report_builder import build_full_daily_report, build_personal_daily_report
from app.db import get_supabase_admin
from app.telegram_report import send_daily_report_to_linked_managers, send_telegram_message

router = APIRouter()


@router.post("/telegram/send-test")
async def send_test(authorization: str | None = Header(default=None)):
    user: AuthedAdmin | None = await require_org_member(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    admin = get_supabase_admin()
    profile = (
        admin.table("profiles")
        .select("telegram_chat_id, organization_id, role")
        .eq("id", user.id)
        .maybe_single()
        .execute()
        .data
    )
    if not profile or not profile.get("telegram_chat_id"):
        raise HTTPException(status_code=400, detail="Telegram not linked yet")
    if not profile.get("organization_id"):
        raise HTTPException(status_code=400, detail="No organization")

    try:
        if profile["role"] == "sotuv_menejeri":
            text = await build_personal_daily_report(profile["organization_id"], user.id)
        else:
            text = (await build_full_daily_report(profile["organization_id"]))["text"]
        await send_telegram_message(profile["telegram_chat_id"], text)
        return {"ok": True}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err) or "Failed to send") from err


@router.post("/telegram/send-daily-report", dependencies=[Depends(require_cron_secret_dep)])
async def send_daily_report():
    try:
        return await send_daily_report_to_linked_managers()
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err) or "Failed to send report") from err


# --- telegram.link.ts --------------------------------------------------

_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _random_code() -> str:
    return "".join(random.choice(_CODE_ALPHABET) for _ in range(8))


@router.post("/telegram/link")
async def link(authorization: str | None = Header(default=None)):
    user: AuthedAdmin | None = await require_org_member(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    admin = get_supabase_admin()
    code = _random_code()
    caller = (
        admin.table("profiles")
        .update({"telegram_link_code": code, "telegram_chat_id": None})
        .eq("id", user.id)
        .select("organization_id")
        .single()
        .execute()
        .data
    )

    bot_setting = None
    if caller and caller.get("organization_id"):
        bot_setting = (
            admin.table("integration_settings")
            .select("config")
            .eq("organization_id", caller["organization_id"])
            .eq("key", "telegram_bot")
            .maybe_single()
            .execute()
            .data
        )
    config = (bot_setting or {}).get("config") or {}
    return {"code": code, "botUsername": config.get("username")}


# --- telegram.webhook.ts -------------------------------------------------
# Main bot: chat-linking-code matching, plus a conversational business-
# profile onboarding flow that fires the first time a Super Admin/ROP/
# Platform Owner links their chat, if their org has no business_profile yet.

_CODE_RE = re.compile(r"[A-Z0-9]{8}")

# Asks the same 5 fields the in-app "AI bot bilan to'ldirish" widget does,
# one per message -- since each answer maps to exactly one field, this needs
# no AI parsing (unlike the in-app widget, which extracts fields from a
# free-form transcript).
_ONBOARDING_QUESTIONS: list[dict[str, str]] = [
    {"field": "company_name", "text": "Kompaniyangiz nomi qanday?"},
    {
        "field": "description",
        "text": "Biznesingiz haqida qisqacha yozing — nima bilan shug'ullanasiz?",
    },
    {
        "field": "competitors",
        "text": 'Asosiy raqobatchilaringiz kimlar? Bo\'lmasa "yo\'q" deb yozing.',
    },
    {
        "field": "terminology",
        "text": 'Biznesingizga xos atamalar yoki jargon bormi? Bo\'lmasa "yo\'q" deb yozing.',
    },
    {
        "field": "tone",
        "text": "AI yordamchi qanday ohangda gapirishini xohlaysiz? (masalan: rasmiy, do'stona, qisqa)",
    },
]


async def _continue_onboarding(chat_id: int, profile: dict[str, Any], answer_text: str) -> None:
    admin = get_supabase_admin()
    step = profile.get("telegram_onboarding_step") or 0
    current = (
        admin.table("profiles")
        .select("telegram_onboarding_answers")
        .eq("id", profile["id"])
        .maybe_single()
        .execute()
        .data
    )
    answers = {
        **((current or {}).get("telegram_onboarding_answers") or {}),
        _ONBOARDING_QUESTIONS[step]["field"]: answer_text.strip(),
    }

    next_step = step + 1
    if next_step < len(_ONBOARDING_QUESTIONS):
        admin.table("profiles").update(
            {"telegram_onboarding_step": next_step, "telegram_onboarding_answers": answers}
        ).eq("id", profile["id"]).execute()
        try:
            await send_telegram_message(chat_id, _ONBOARDING_QUESTIONS[next_step]["text"])
        except Exception:
            pass
        return

    admin.table("business_profile").upsert(
        {"organization_id": profile["organization_id"], "updated_by": profile["id"], **answers},
        on_conflict="organization_id",
    ).execute()
    admin.table("profiles").update(
        {"telegram_onboarding_step": None, "telegram_onboarding_answers": None}
    ).eq("id", profile["id"]).execute()
    try:
        await send_telegram_message(
            chat_id,
            "✅ Rahmat! Biznes profili to'ldirildi — buni istalgan vaqt Sozlamalar → "
            "Biznes profili bo'limida tahrirlashingiz mumkin.",
        )
    except Exception:
        pass


async def _maybe_start_onboarding(chat_id: int, profile: dict[str, Any]) -> bool:
    if profile["role"] not in ("super_admin", "rop", "platform_owner"):
        return False
    admin = get_supabase_admin()
    bp = (
        admin.table("business_profile")
        .select("company_name")
        .eq("organization_id", profile["organization_id"])
        .maybe_single()
        .execute()
        .data
    )
    if bp and (bp.get("company_name") or "").strip():
        return False

    admin.table("profiles").update(
        {"telegram_onboarding_step": 0, "telegram_onboarding_answers": {}}
    ).eq("id", profile["id"]).execute()
    try:
        await send_telegram_message(
            chat_id,
            f"Salom, {profile.get('full_name') or 'hurmatli foydalanuvchi'}! Endi biznes "
            "profilingizni birga to'ldiramiz — AI yordamchi shu ma'lumotlardan foydalanadi. "
            f"{_ONBOARDING_QUESTIONS[0]['text']}",
        )
    except Exception:
        pass
    return True


@router.post("/telegram/webhook")
async def webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    expected = os.environ.get("TELEGRAM_WEBHOOK_SECRET")
    if expected and x_telegram_bot_api_secret_token != expected:
        raise HTTPException(status_code=401, detail="ok: false")

    try:
        update = await request.json()
    except Exception:
        update = {}
    message = update.get("message") or {}
    chat_id = (message.get("chat") or {}).get("id")
    raw_text = message.get("text") or ""
    if not chat_id:
        return {"ok": True}

    admin = get_supabase_admin()

    # An ongoing onboarding conversation takes priority over code matching --
    # an answer like a company name could otherwise accidentally look like
    # an 8-character link code.
    linked_profile = (
        admin.table("profiles")
        .select("id, organization_id, telegram_onboarding_step")
        .eq("telegram_chat_id", chat_id)
        .maybe_single()
        .execute()
        .data
    )
    if linked_profile and linked_profile.get("telegram_onboarding_step") is not None:
        await _continue_onboarding(chat_id, linked_profile, raw_text)
        return {"ok": True}

    match = _CODE_RE.search(raw_text.upper())
    if not match:
        try:
            await send_telegram_message(
                chat_id,
                "Ulash kodini topolmadim. SalesIQ ➝ Sozlamalar ➝ Telegram bot "
                "bo'limidan kodni oling va shu yerga yuboring.",
            )
        except Exception:
            pass
        return {"ok": True}

    code = match.group(0)
    profile = (
        admin.table("profiles")
        .select("id, full_name, organization_id, role")
        .eq("telegram_link_code", code)
        .maybe_single()
        .execute()
        .data
    )
    if not profile:
        try:
            await send_telegram_message(
                chat_id, "Bu kod topilmadi yoki eskirgan. Sozlamalardan yangi kod oling."
            )
        except Exception:
            pass
        return {"ok": True}

    admin.table("profiles").update(
        {"telegram_chat_id": chat_id, "telegram_link_code": None}
    ).eq("id", profile["id"]).execute()

    try:
        await send_telegram_message(
            chat_id,
            f"✅ Ulandi! Endi kunlik hisobotlar shu yerga keladi, "
            f"{profile.get('full_name') or 'hurmatli foydalanuvchi'}.",
        )
    except Exception:
        pass

    await _maybe_start_onboarding(chat_id, profile)

    return {"ok": True}
