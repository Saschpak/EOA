#!/bin/bash
# Lokalen Test-Postgres (Port 54329) starten, Datenbank "t" neu anlegen und alle Migrationen einspielen.
# Nachgebaut: auth, storage, net, vault (stubs.sql, mailstubs.sql). claude_key_ok() liefert danach immer true.
P=$(ls -d /usr/lib/postgresql/*/bin | tail -1); H=$(cd "$(dirname "$0")" && pwd); M="$H/../../supabase/migrations"; D=/var/lib/postgresql/claudetest
(ls $D/PG_VERSION >/dev/null 2>&1 || (mkdir -p $D && chown postgres $D && su postgres -c "$P/initdb -D $D -A trust" >/dev/null))
su postgres -c "$P/pg_ctl -D $D -o '-p 54329 -k /tmp' -l /tmp/pg.log start" >/dev/null 2>&1; sleep 2
psql -h /tmp -p 54329 -U postgres -qc "drop database if exists t" -c "create database t" 2>&1 | grep -v NOTICE
psql -h /tmp -p 54329 -U postgres -d t -q -f "$H/stubs.sql" 2>&1 | grep -v "already exists" | head -3
psql -h /tmp -p 54329 -U postgres -d t -q -f "$H/mailstubs.sql" 2>&1 | grep -v "already exists" | head -3
for f in "$M"/*.sql; do grep -v -i "^create extension" "$f" | psql -h /tmp -p 54329 -U postgres -d t -q -v ON_ERROR_STOP=1 >/dev/null 2>/tmp/err || { echo "FEHLER in $f"; cat /tmp/err; exit 1; }; done
psql -h /tmp -p 54329 -U postgres -d t -qc "create or replace function public.claude_key_ok() returns boolean language sql as \$\$ select true \$\$;"
echo "alle Migrationen eingespielt (psql -h /tmp -p 54329 -U postgres -d t)"
