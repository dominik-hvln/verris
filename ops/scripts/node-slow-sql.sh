#!/usr/bin/env bash
# =============================================================================
# Verris — wolne zapytania SQL konta (K-14). Uruchamiany przez agenta zadań (SLOW_SQL) z env:
#   SQ_DA_USER   login konta DA
# Czyta slow query log MariaDB (dokumentacja MariaDB: Slow Query Log Overview — wpis zaczyna
# „# User@Host: {User}[{User}] @ {Host}”, dalej „# Query_time: …”) i zwraca WYŁĄCZNIE zapytania
# użytkowników baz tego konta (login_*, schemat login_*). Zapytania są znormalizowane: wartości
# (napisy, liczby) zastąpione „?”, więc w panelu nie ma danych z baz — tylko kształt zapytania.
# Czyta najwyżej ostatnie 64 MB logu. Wynik: VERRIS_SLOWSQL=<base64 JSON>.
# SQ_LOG_FILE daje się podmienić wyłącznie w testach (wtedy bez pytania MariaDB o ustawienia).
# =============================================================================
set -Eeuo pipefail

: "${SQ_DA_USER:?}"
log() { echo "[slow-sql] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }
[[ "$SQ_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"

WLACZONY=1; PROG="?"; PLIK="${SQ_LOG_FILE:-}"
if [ -z "$PLIK" ]; then
  DA_MYCNF="/usr/local/directadmin/conf/my.cnf"
  ADMIN_OPTS=()
  if ! mysql -Nse 'SELECT 1' >/dev/null 2>&1; then
    [ -r "$DA_MYCNF" ] || fail "brak dostępu administracyjnego do MariaDB"
    ADMIN_OPTS=(--defaults-extra-file="$DA_MYCNF")
  fi
  read -r WLACZONY PROG PLIK DATADIR < <(mysql "${ADMIN_OPTS[@]}" -NBe \
    "SELECT @@slow_query_log, @@long_query_time, @@slow_query_log_file, @@datadir" | tr '\t' ' ') \
    || fail "MariaDB nie zwróciła ustawień slow query log"
  case "$PLIK" in /*) ;; *) PLIK="${DATADIR%/}/$PLIK" ;; esac
fi

SQ_USER="$SQ_DA_USER" SQ_ON="$WLACZONY" SQ_PROG="$PROG" python3 - "$PLIK" <<'PY'
import base64, json, os, re, sys
user, plik = os.environ["SQ_USER"], sys.argv[1]
wynik = {"wlaczony": os.environ["SQ_ON"] == "1", "prog": os.environ["SQ_PROG"], "grupy": []}
try:
    with open(plik, "rb") as f:
        f.seek(0, 2); rozm = f.tell(); f.seek(max(0, rozm - 64 * 1024 * 1024))
        tekst = f.read().decode("utf-8", "replace")
except OSError:
    tekst = ""
naglowek = re.compile(r"^# User@Host: ([^\[\s]+)\[")
schemat = re.compile(r"Schema: (\S+)")
czas = re.compile(r"^# Query_time: ([\d.]+)\s+Lock_time: ([\d.]+)\s+Rows_sent: (\d+)\s+Rows_examined: (\d+)")
kiedy = re.compile(r"^SET timestamp=(\d+);")
def swoj(u):
    return u == user or u.startswith(user + "_")
def normalizuj(sql):
    sql = re.sub(r"'(?:[^'\\]|\\.)*'", "?", sql)
    sql = re.sub(r'"(?:[^"\\]|\\.)*"', "?", sql)
    sql = re.sub(r"\b0x[0-9a-fA-F]+\b", "?", sql)
    sql = re.sub(r"\b\d+(?:\.\d+)?\b", "?", sql)
    sql = re.sub(r"\(\s*\?(?:\s*,\s*\?)+\s*\)", "(?…)", sql)
    return re.sub(r"\s+", " ", sql).strip()[:1500]
grupy = {}
wpis = None
def zamknij(w):
    if not w or not w.get("sql") or not swoj(w["user"]) or not (w.get("db") or "").startswith(user + "_"):
        return
    n = normalizuj(" ".join(w["sql"]))
    if not n or n.lower().startswith(("use ", "set timestamp")):
        return
    g = grupy.setdefault(n, {"sql": n, "baza": w["db"], "liczba": 0, "suma": 0.0, "max": 0.0, "przejrzane": 0, "ostatnio": 0})
    g["liczba"] += 1; g["suma"] += w["t"]; g["max"] = max(g["max"], w["t"]); g["przejrzane"] = max(g["przejrzane"], w["rows"])
    g["ostatnio"] = max(g["ostatnio"], w.get("ts", 0))
for linia in tekst.splitlines():
    m = naglowek.match(linia)
    if m:
        zamknij(wpis); wpis = {"user": m.group(1), "sql": [], "t": 0.0, "rows": 0}; continue
    if wpis is None:
        continue
    if linia.startswith("#"):
        s = schemat.search(linia)
        if s: wpis["db"] = s.group(1)
        c = czas.match(linia)
        if c: wpis["t"] = float(c.group(1)); wpis["rows"] = int(c.group(4))
        continue
    k = kiedy.match(linia)
    if k:
        wpis["ts"] = int(k.group(1)); continue
    if linia.lower().startswith("use "):
        continue
    wpis["sql"].append(linia)
zamknij(wpis)
lista = sorted(grupy.values(), key=lambda g: g["suma"], reverse=True)[:25]
for g in lista:
    g["suma"] = round(g["suma"], 3); g["max"] = round(g["max"], 3)
wynik["grupy"] = lista
print("VERRIS_SLOWSQL=" + base64.b64encode(json.dumps(wynik, separators=(",", ":"), ensure_ascii=False).encode()).decode())
PY
