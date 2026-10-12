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
