#!/usr/bin/env bash
# One-time set-up on the VPS (run as root from /opt/salesiq):
#   bash services/tg-live/install.sh
# Installs ffmpeg and the Python packages (yt-dlp reads YouTube's player with Node), adds TGLIVE_URL / TGLIVE_SECRET to
# .env.server when missing, and starts salesiq-tglive.service on 127.0.0.1:3100.
# TELEGRAM_API_ID / TELEGRAM_API_HASH (my.telegram.org) must be in .env.server.
set -euo pipefail
cd "$(dirname "$0")"
ENV=/opt/salesiq/.env.server

apt-get install -y -q ffmpeg python3-venv >/dev/null
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
# YouTube changes often: keep yt-dlp (live frames) current.
.venv/bin/pip install -q -U 'yt-dlp[default]'

command -v node >/dev/null || echo "!! node is not on PATH: YouTube live frames need it"

grep -q '^TGLIVE_URL=' "$ENV" || echo 'TGLIVE_URL=http://127.0.0.1:3100' >> "$ENV"
grep -q '^TGLIVE_SECRET=' "$ENV" || echo "TGLIVE_SECRET=$(openssl rand -hex 24)" >> "$ENV"
for v in TELEGRAM_API_ID TELEGRAM_API_HASH; do
  grep -q "^$v=" "$ENV" || echo "!! $v is missing in $ENV (my.telegram.org -> API development tools)"
done

cp salesiq-tglive.service /etc/systemd/system/salesiq-tglive.service
systemctl daemon-reload
systemctl enable --now salesiq-tglive.service
systemctl restart salesiq-tglive.service
sleep 2
curl -s 127.0.0.1:3100/health && echo
# The app reads TGLIVE_URL / TGLIVE_SECRET at start.
systemctl restart salesiq
echo "tg-live: ok"
