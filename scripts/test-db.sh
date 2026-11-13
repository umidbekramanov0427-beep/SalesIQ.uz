#!/usr/bin/env bash
# Database rule tests (supabase/tests): applies a minimal stand-in of the
# production schema plus the migrations under test to a throwaway local
# PostgreSQL, then runs assertion scripts. Nothing touches Supabase.
#   npm run test:db
# Needs PostgreSQL server binaries (initdb, pg_ctl) and psql. Set
# PG_TEST_URL to use an existing empty database instead.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS=(
  20261104000000_plan_seats_v2
  20261105000000_telephony_missed_calls
  20261106000000_telegram_mini_app
  20261107000000_ai_worker
  20261108000000_task_control_auto_merge
  20261109000000_fix_missed_call_callback
  20261110000000_cron_secret_private_config
  20261111000000_owner_mfa_required
  20261120000000_owner_controls
  20261121000000_visits_insights
  20261128000000_support_messages
  20261128010000_platform_ops
  20261129000000_workspace_modules
  20261129010000_invoices
  20261129020000_lead_followups
  20261129030000_lead_ai_score
  20261129040000_sales_plans
  20261207000000_sales_growth_pack
  20261207000000_sales_growth_pack # twice: it must be safe to re-run
  20261208000000_live_notifications
  20261208000000_live_notifications # twice
  20261209000000_stage_plan_fact
  20261209000000_stage_plan_fact # twice
  20261210000000_stage_value_quality_hint
  20261210000000_stage_value_quality_hint # twice
  20261211000000_platform_announcements
  20261211000000_platform_announcements # twice
  20261212000000_platform_applications
  20261212000000_platform_applications # twice
  20261213000000_login_codes
  20261213000000_login_codes # twice
  20261214000000_funnel_dedupe_modes_archive
  20261214000000_funnel_dedupe_modes_archive # twice
  20261215000000_automation_more_actions
  20261215000000_automation_more_actions # twice
  20261216000000_chat_templates
  20261216000000_chat_templates # twice
  20261218000000_funnel_settings_amo
  20261218000000_funnel_settings_amo # twice
  20261219000000_inbox_close_block
  20261219000000_inbox_close_block # twice
  20261220000000_org_access_rules
  20261220000000_org_access_rules # twice
  20261221000000_after_hours_logo_date_format
  20261221000000_after_hours_logo_date_format # twice
  20261222000000_files_trash_autoload
  20261222000000_files_trash_autoload # twice
  20261223000000_leads_trash
  20261223000000_leads_trash # twice
  20261224000000_client_cabinet
  20261224000000_client_cabinet # twice
  20261225000000_api_keys
  20261225000000_api_keys # twice
  20261227000000_lead_merge_history
  20261227000000_lead_merge_history # twice
  20261231000000_reminders
  20261231000000_reminders # twice
  20270101000000_attendance_rules
  20270101000000_attendance_rules # twice
  20270102000000_payroll_schemes
  20270102000000_payroll_schemes # twice
  20270103000000_finance_entries
  20270103000000_finance_entries # twice
  20270104000000_marketing_panel
  20270104000000_marketing_panel # twice
  20270105000000_lead_refunds
  20270105000000_lead_refunds # twice
  20270106000000_marketing_channels_webinars
  20270106000000_marketing_channels_webinars # twice
  20270107000000_live_updates_refund_rules
  20270107000000_live_updates_refund_rules # twice
  20270108000000_refund_reminders
  20270108000000_refund_reminders # twice
  20270109000000_marketing_projects
  20270109000000_marketing_projects # twice
  20270110000000_marketing_channel_events
  20270110000000_marketing_channel_events # twice
  20270111000000_telegram_backups
  20270111000000_telegram_backups # twice
  20270112000000_platform_bots
  20270112000000_platform_bots # twice
  20270113000000_ui_settings
  20270113000000_ui_settings # twice
  20270114000000_push_keys
  20270114000000_push_keys # twice
  20270115000000_attendance_notes
  20270115000000_attendance_notes # twice
)

cleanup() { :; }
trap 'cleanup' EXIT

if [ -z "${PG_TEST_URL:-}" ]; then
  BIN="$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb 2>/dev/null | sort -V | tail -1)")"
  [ -x "$BIN/initdb" ] || { echo "PostgreSQL server binaries not found (initdb)"; exit 1; }
  DIR="$(mktemp -d)"
  PORT=$((20000 + RANDOM % 20000))
  RUN=""
  if [ "$(id -u)" = "0" ]; then
    chown -R postgres "$DIR"
    RUN="su postgres -c"
  fi
  if [ -n "$RUN" ]; then
    $RUN "$BIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
    $RUN "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start >/dev/null"
    cleanup() { $RUN "$BIN/pg_ctl -D $DIR/data stop -m fast >/dev/null" || true; rm -rf "$DIR"; }
  else
    "$BIN/initdb" -D "$DIR/data" -A trust -U postgres >/dev/null
    "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" start >/dev/null
    cleanup() { "$BIN/pg_ctl" -D "$DIR/data" stop -m fast >/dev/null || true; rm -rf "$DIR"; }
  fi
  PG_TEST_URL="postgresql://postgres@localhost:$PORT/postgres?host=$DIR"
fi

PSQL=(psql "$PG_TEST_URL" -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$ROOT/supabase/tests/stub-schema.sql" 2>&1 | grep -v "wal_level\|HINT" || true
for m in "${MIGRATIONS[@]}"; do
  "${PSQL[@]}" -f "$ROOT/supabase/migrations/$m.sql" 2>&1 | grep -v "NOTICE" || true
done
fail=0
for t in "$ROOT"/supabase/tests/*.test.sql; do
  if "${PSQL[@]}" -f "$t" >/dev/null 2>"$t.err.tmp"; then
    echo "ok    $(basename "$t")"
  else
    echo "FAIL  $(basename "$t")"; sed 's/^/      /' "$t.err.tmp"; fail=1
  fi
  rm -f "$t.err.tmp"
done
exit $fail
