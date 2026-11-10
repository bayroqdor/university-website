#!/usr/bin/env bash
# Saytni lokal ishga tushirish (Linux/macOS). Talablar: Python 3.11+, Node.js 20+, PostgreSQL 12+.
# SITE_DATABASE_URL berilmasa — ./var/pg da lokal PostgreSQL klasteri yaratiladi va ishga tushiriladi (initdb, pg_ctl kerak).
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
./.venv/bin/pip install -q -r backend/requirements.txt
# PDF va og:image uchun headless Chromium (Linux'da tizim kutubxonalari: sudo ./.venv/bin/python -m playwright install-deps chromium)
./.venv/bin/python -m playwright install --only-shell chromium || echo "Diqqat: Chromium o'rnatilmadi — PDF yuklab olish ishlamaydi"
(cd frontend && npm ci --silent && npm run build --silent)
export SITE_DATA_DIR="${SITE_DATA_DIR:-$PWD/var}"
mkdir -p "$SITE_DATA_DIR"

if [ -z "${SITE_DATABASE_URL:-}" ]; then
  # lokal PostgreSQL: tizimdagi initdb/pg_ctl (Debian/Ubuntu'da /usr/lib/postgresql/<versiya>/bin)
  PGBIN=""
  if command -v pg_ctl >/dev/null 2>&1; then PGBIN="$(dirname "$(command -v pg_ctl)")"; else
    for d in /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin; do
      [ -x "$d/pg_ctl" ] && PGBIN="$d"
    done
  fi
  if [ -z "$PGBIN" ]; then
    echo "PostgreSQL topilmadi. O'rnating (Ubuntu: sudo apt install postgresql; macOS: brew install postgresql@16)" >&2
    echo "yoki tayyor bazani bering: SITE_DATABASE_URL=postgresql://user:password@host:5432/university ./run.sh" >&2
    exit 1
  fi
  PGDIR="$SITE_DATA_DIR/pg"
  PGPORT_LOCAL="${PGPORT_LOCAL:-55433}"
  if [ ! -s "$PGDIR/PG_VERSION" ]; then
    echo "Lokal PostgreSQL klasteri yaratilmoqda: $PGDIR"
    "$PGBIN/initdb" -D "$PGDIR" -U university --auth=trust -E UTF8 --locale=C >/dev/null
  fi
  if ! "$PGBIN/pg_ctl" -D "$PGDIR" status >/dev/null 2>&1; then
    "$PGBIN/pg_ctl" -D "$PGDIR" -l "$PGDIR/server.log" -w \
      -o "-p $PGPORT_LOCAL -k $PGDIR -c listen_addresses=127.0.0.1" start >/dev/null
  fi
  "$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT_LOCAL" -U university -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='university'" | grep -q 1 \
    || "$PGBIN/createdb" -h 127.0.0.1 -p "$PGPORT_LOCAL" -U university university
  export SITE_DATABASE_URL="postgresql://university@127.0.0.1:$PGPORT_LOCAL/university"
  echo "PostgreSQL: $SITE_DATABASE_URL (to'xtatish: $PGBIN/pg_ctl -D $PGDIR stop)"
fi

cd backend
echo "Sayt: http://127.0.0.1:${PORT:-8000}   Admin: http://127.0.0.1:${PORT:-8000}/admin"
exec ../.venv/bin/uvicorn university.api.main:app --host 127.0.0.1 --port "${PORT:-8000}"
