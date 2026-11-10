#!/bin/sh
# Stalwart'ni qo'lda sozlamasdan ishga tushirish.
#  1) /secrets/admin_password — administrator paroli (yo'q bo'lsa tasodifiy yaratiladi; sayt konteyneri ham shu fayldan o'qiydi);
#  2) birinchi ishga tushishda (config.json yo'q) Stalwart «bootstrap» rejimida ochiladi — skript JMAP orqali
#     server nomi va domenni yozadi (x:Bootstrap/set), so'ng serverni oddiy rejimda qayta ishga tushiradi;
#  3) keyingi ishga tushishlarda to'g'ridan-to'g'ri oddiy rejim.
set -u
CFG=/etc/stalwart/config.json
SECRET=/secrets/admin_password
HOSTNAME_="${MAIL_HOSTNAME:-mail.${MAIL_DOMAIN:-example.edu}}"
DOMAIN="${MAIL_DOMAIN:-${HOSTNAME_#mail.}}"
ACME=false
case "${MAIL_ACME:-0}" in 1|true|yes) ACME=true ;; esac

if [ ! -s "$SECRET" ]; then
  umask 027
  head -c 24 /dev/urandom | base64 | tr -d '/+=\n' | head -c 24 > "$SECRET"
  echo "University mail: admin password created ($SECRET)"
fi
export STALWART_RECOVERY_ADMIN="admin:$(cat "$SECRET")"

PID=""
stop() { [ -n "$PID" ] && kill -TERM "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; exit 0; }
trap stop TERM INT

if [ ! -f "$CFG" ]; then
  /usr/local/bin/stalwart --config "$CFG" &
  PID=$!
  BODY=$(printf '{"using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"],"methodCalls":[["x:Bootstrap/set",{"update":{"singleton":{"serverHostname":"%s","defaultDomain":"%s","requestTlsCertificate":%s}}},"c1"]]}' "$HOSTNAME_" "$DOMAIN" "$ACME")
  i=0
  while [ ! -f "$CFG" ] && [ $i -lt 90 ]; do
    i=$((i + 1))
    sleep 2
    curl -fsS -u "$STALWART_RECOVERY_ADMIN" -H 'Content-Type: application/json' -d "$BODY" http://127.0.0.1:8080/jmap/ >/dev/null 2>&1 \
      && echo "University mail: initial configuration complete ($HOSTNAME_, @$DOMAIN)"
  done
  sleep 3
  kill -TERM "$PID" 2>/dev/null
  wait "$PID" 2>/dev/null
  PID=""
  [ -f "$CFG" ] || { echo "University mail: auto-setup skipped — configure manually at http://server:8080/admin"; }
fi

/usr/local/bin/stalwart --config "$CFG" &
PID=$!
wait "$PID"
