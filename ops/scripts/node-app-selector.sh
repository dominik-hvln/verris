#!/usr/bin/env bash
# =============================================================================
# Verris — aplikacje Node.js i Python konta (B-08/B-09) przez CloudLinux Selector.
# Składnia: docs.cloudlinux.com → Command-line tools → Node.js Selector / Python Selector
# („When running user command as root, please use --user option”). Uruchamiany przez agenta
# zadań (APP_SELECTOR) z env:
#   AS_MODE         list | create | update | start | stop | restart | destroy | install
#   AS_INTERPRETER  nodejs | python          (poza list)
#   AS_DA_USER      login konta DA
#   AS_ROOT         katalog aplikacji względem katalogu domowego (np. apps/sklep-api) — poza domains/
#   AS_DOMAIN       (create/update) domena konta
#   AS_URI          (create/update) ścieżka pod domeną, pusta = cała domena
#   AS_VERSION      (create/update) wersja interpretera (np. 22, 3.12)
#   AS_STARTUP      (create/update) plik startowy (app.js, passenger_wsgi.py)
#   AS_ENTRY        (create, python) obiekt aplikacji WSGI (np. application)
#   AS_ENV_B64      (create/update) base64 JSON {"ZMIENNA":"wartość"} — zmienne środowiskowe
# Każdy argument idzie osobnym elementem argv (bez eval/sh -c) — wartości klienta nie trafiają do powłoki.
# Wynik (zawsze, także po zmianie): VERRIS_APPS=<base64 JSON {apps:[…], versions:{nodejs:[…], python:[…]}}>.
# AS_SELECTOR_BIN daje się podmienić wyłącznie w testach.
# =============================================================================
set -Eeuo pipefail

: "${AS_MODE:?}"; : "${AS_DA_USER:?}"
: "${AS_INTERPRETER:=}"; : "${AS_ROOT:=}"; : "${AS_DOMAIN:=}"; : "${AS_URI:=}"; : "${AS_VERSION:=}"
: "${AS_STARTUP:=}"; : "${AS_ENTRY:=}"; : "${AS_ENV_B64:=}"
SEL="${AS_SELECTOR_BIN:-cloudlinux-selector}"

log() { echo "[app-selector] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

SEG='[A-Za-z0-9][A-Za-z0-9._-]{0,63}'
[[ "$AS_MODE" =~ ^(list|create|update|start|stop|restart|destroy|install)$ ]] || fail "nieznany tryb: $AS_MODE"
[[ "$AS_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
id "$AS_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $AS_DA_USER"
HOME_DIR="$(getent passwd "$AS_DA_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ] || fail "brak katalogu domowego konta"
command -v "$SEL" >/dev/null 2>&1 || fail "CloudLinux Selector nie jest zainstalowany na serwerze"

if [ "$AS_MODE" != "list" ]; then
  [[ "$AS_INTERPRETER" =~ ^(nodejs|python)$ ]] || fail "nieznany język aplikacji"
  [[ "$AS_ROOT" =~ ^$SEG(/$SEG){0,3}$ ]] && [[ "$AS_ROOT" != *..* ]] || fail "nieprawidłowy katalog aplikacji"
  case "$AS_ROOT" in domains|domains/*|public_html|public_html/*|mail|mail/*|imap|imap/*|.*) fail "katalog aplikacji musi być poza domains/, public_html/ i katalogami systemowymi";; esac
  # katalog (i każdy nadrzędny) nie może być dowiązaniem — root nie wyjdzie poza konto
  p="$HOME_DIR"
  IFS=/ read -ra CZ <<< "$AS_ROOT"
  for c in "${CZ[@]}"; do p="$p/$c"; [ ! -L "$p" ] || fail "katalog aplikacji jest dowiązaniem symbolicznym"; done
fi
if [[ "$AS_MODE" =~ ^(create|update)$ ]]; then
  [[ "$AS_DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || fail "nieprawidłowa domena"
  DL="/usr/local/directadmin/data/users/$AS_DA_USER/domains.list"
  [ ! -f "$DL" ] || grep -qxF "$AS_DOMAIN" "$DL" || fail "domena nie należy do konta"
  [ -z "$AS_URI" ] || { [[ "$AS_URI" =~ ^$SEG(/$SEG){0,3}$ ]] && [[ "$AS_URI" != *..* ]]; } || fail "nieprawidłowa ścieżka aplikacji pod domeną"
  [[ "$AS_VERSION" =~ ^[0-9]{1,2}(\.[0-9]{1,2}){0,2}$ ]] || fail "nieprawidłowa wersja"
  [[ "$AS_STARTUP" =~ ^$SEG(/$SEG){0,3}$ ]] && [[ "$AS_STARTUP" != *..* ]] || fail "nieprawidłowy plik startowy"
  [ -z "$AS_ENTRY" ] || [[ "$AS_ENTRY" =~ ^[A-Za-z_][A-Za-z0-9_]{0,63}$ ]] || fail "nieprawidłowy obiekt aplikacji"
  ENV_JSON="$(AS_ENV_B64="$AS_ENV_B64" python3 - <<'PY'
import base64, json, os, re, sys
raw = os.environ.get("AS_ENV_B64", "")
try:
    d = json.loads(base64.b64decode(raw).decode("utf-8")) if raw else {}
except Exception:
    sys.exit("zmienne środowiskowe: niepoprawny format")
if not isinstance(d, dict) or len(d) > 30:
    sys.exit("zmienne środowiskowe: najwyżej 30 wpisów")
for k, v in d.items():
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,63}", k) or not isinstance(v, str) or len(v) > 1000 or "\n" in v or "\x00" in v:
        sys.exit("zmienne środowiskowe: nazwa A-Z0-9_, wartość do 1000 znaków w jednej linii")
print(json.dumps(d, ensure_ascii=False))
PY
)" || fail "zmienne środowiskowe są niepoprawne"
fi

# uruchom selektor; przy result != success przerwij z komunikatem selektora (bez reszty wyjścia)
sel() {
  local out msg
  out="$("$SEL" "$@" --json 2>&1)" || true
  msg="$(printf '%s' "$out" | python3 -c '
import json, sys
t = sys.stdin.read()
try:
    j = json.loads(t[t.index("{"):])
except Exception:
    print("selektor zwrócił nieoczekiwaną odpowiedź"); sys.exit(0)
if j.get("result") != "success":
    print(" ".join(str(j.get("result") or "operacja nie powiodła się").split())[:300])
')"
  [ -z "$msg" ] || fail "$msg"
}

I=(--interpreter "$AS_INTERPRETER" --user "$AS_DA_USER" --app-root "$AS_ROOT")
case "$AS_MODE" in
  create)
    # --user i --domain wykluczają się; create wskazuje konto przez domenę aplikacji (sprawdzoną wyżej)
    ARGS=(create --interpreter "$AS_INTERPRETER" --domain "$AS_DOMAIN" --app-root "$AS_ROOT" --app-uri "$AS_URI" --version "$AS_VERSION" --startup-file "$AS_STARTUP" --env-vars "$ENV_JSON")
    [ "$AS_INTERPRETER" = "nodejs" ] && ARGS+=(--app-mode production)
    [ "$AS_INTERPRETER" = "python" ] && [ -n "$AS_ENTRY" ] && ARGS+=(--entry-point "$AS_ENTRY")
    log "tworzę aplikację $AS_INTERPRETER $AS_ROOT → $AS_DOMAIN/$AS_URI"
    sel "${ARGS[@]}"
    ;;
  update)
    ARGS=(set "${I[@]}" --new-version "$AS_VERSION" --startup-file "$AS_STARTUP" --env-vars "$ENV_JSON")
    log "zmieniam ustawienia aplikacji $AS_ROOT"
    sel "${ARGS[@]}"
    ;;
  start|stop|restart|destroy)
    log "$AS_MODE: $AS_ROOT"
    sel "$AS_MODE" "${I[@]}"
    ;;
  install)
    if [ "$AS_INTERPRETER" = "python" ]; then
      runuser -u "$AS_DA_USER" -- test -f "$HOME_DIR/$AS_ROOT/requirements.txt" || fail "brak pliku requirements.txt w katalogu aplikacji"
      sel install-modules "${I[@]}" --requirements-file requirements.txt
    else
      runuser -u "$AS_DA_USER" -- test -f "$HOME_DIR/$AS_ROOT/package.json" || fail "brak pliku package.json w katalogu aplikacji"
      sel install-modules "${I[@]}"
    fi
    log "zależności zainstalowane: $AS_ROOT"
    ;;
esac

# stan aplikacji konta i dostępne wersje (get jako root → wszystkie wersje; bierzemy tylko to konto)
LISTA=()
for interp in nodejs python; do
  out="$("$SEL" get --json --interpreter "$interp" 2>/dev/null || true)"
  LISTA+=("$interp" "$(printf '%s' "$out" | base64 -w0)")
done
AS_U="$AS_DA_USER" python3 - "${LISTA[@]}" <<'PY'
import base64, json, os, sys
u = os.environ["AS_U"]
wynik = {"apps": [], "versions": {}}
a = sys.argv[1:]
for interp, b64 in zip(a[0::2], a[1::2]):
    try:
        t = base64.b64decode(b64).decode("utf-8", "replace")
        j = json.loads(t[t.index("{"):])
    except Exception:
        wynik["versions"][interp] = []
        continue
    wersje = []
    for ver, v in (j.get("available_versions") or {}).items():
        if not isinstance(v, dict):
            continue
        if v.get("status") == "enabled":
            wersje.append(ver)
        apps = (((v.get("users") or {}).get(u) or {}).get("applications") or {})
        for root, ap in apps.items():
            if not isinstance(ap, dict):
                continue
            wynik["apps"].append({
                "interpreter": interp, "root": str(root)[:200], "version": ver,
                "domain": str(ap.get("domain", ""))[:253], "uri": str(ap.get("app_uri", ""))[:200],
                "startup": str(ap.get("startup_file", ""))[:200], "entry": str(ap.get("entry_point", "") or "")[:64],
                "status": "started" if ap.get("app_status") == "started" else "stopped",
                "env": {str(k)[:64]: str(x)[:1000] for k, x in list((ap.get("env_vars") or {}).items())[:30]},
            })
    wynik["versions"][interp] = sorted(wersje, key=lambda s: [int(x) if x.isdigit() else 0 for x in s.split(".")], reverse=True)
print("VERRIS_APPS=" + base64.b64encode(json.dumps(wynik, separators=(",", ":"), ensure_ascii=False).encode()).decode())
PY
