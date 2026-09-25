#!/usr/bin/env bash
# =============================================================================
# Verris — widok strony: technologia, ruch 7 dni, błędy 5xx i TTFB (PB-19). Uruchamiany przez agenta
# zadań (SITE_STATS) z env:
#   SS_DA_USER   login konta DA
#   SS_DOMAIN    domena konta
# Ruch i 5xx: log dostępu domeny prowadzony przez DirectAdmin (/var/log/httpd/domains/<domena>.log,
# format combined), ostatnie 7 dni, najwyżej ostatnie 100 MB pliku; ścieżki bez parametrów (?…).
# TTFB: 5 żądań do strony z samego serwera (127.0.0.1 + nagłówek Host) — czas serwera bez sieci klienta.
# Technologia: pliki w public_html sprawdzane jako KLIENT (runuser) — dowiązanie nie wyprowadzi poza konto.
# Wynik: VERRIS_SITESTATS=<base64 JSON>.
# SS_LOG_DIR / SS_HOME / SS_SKIP_TTFB / SS_JAKO_ROOT dają się podmienić wyłącznie w testach.
# =============================================================================
set -Eeuo pipefail

: "${SS_DA_USER:?}"; : "${SS_DOMAIN:?}"
log() { echo "[site-stats] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }
[[ "$SS_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$SS_DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || fail "nieprawidłowa domena"

if [ -n "${SS_HOME:-}" ]; then HOME_DIR="$SS_HOME"; else
  id "$SS_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $SS_DA_USER"
  HOME_DIR="$(getent passwd "$SS_DA_USER" | cut -d: -f6)"
  DL="/usr/local/directadmin/data/users/$SS_DA_USER/domains.list"
  [ ! -f "$DL" ] || grep -qxF "$SS_DOMAIN" "$DL" || fail "domena nie należy do konta"
fi
DOCROOT="$HOME_DIR/domains/$SS_DOMAIN/public_html"
[ -d "$DOCROOT" ] && [ ! -L "$DOCROOT" ] || fail "brak katalogu strony domains/$SS_DOMAIN/public_html"
jako_klient() { if [ "${SS_JAKO_ROOT:-0}" = 1 ]; then "$@"; else runuser -u "$SS_DA_USER" -- "$@"; fi; }

# --- technologia (odczyt jako klient; wypisuje „nazwa|wersja”) ---
TECH="$(jako_klient python3 - "$DOCROOT" <<'PY' || echo "nieznana|"
import os, re, sys
d = sys.argv[1]
def jest(*p): return os.path.exists(os.path.join(d, *p))
def wersja(plik, wzor):
    try:
        t = open(os.path.join(d, plik), encoding="utf-8", errors="replace").read(200000)
        m = re.search(wzor, t)
        return m.group(1)[:20] if m and re.fullmatch(r"[0-9][0-9A-Za-z.\-]*", m.group(1)[:20]) else ""
    except OSError:
        return ""
if jest("wp-includes", "version.php"):
    print("WordPress|" + wersja("wp-includes/version.php", r"\$wp_version\s*=\s*'([^']+)'"))
elif jest("classes", "PrestaShopAutoload.php") or jest("app", "AppKernel.php") and jest("classes"):
    print("PrestaShop|" + wersja("app/AppKernel.php", r"VERSION\s*=\s*'([^']+)'"))
elif jest("libraries", "src", "Version.php") and jest("configuration.php"):
    print("Joomla|" + wersja("libraries/src/Version.php", r"MAJOR_VERSION\s*=\s*(\d+)"))
elif jest("core", "lib", "Drupal.php"):
    print("Drupal|" + wersja("core/lib/Drupal.php", r"VERSION\s*=\s*'([^']+)'"))
elif jest("occ") and jest("version.php"):
    print("Nextcloud|" + wersja("version.php", r"OC_VersionString\s*=\s*'([^']+)'"))
elif jest("includes", "Defines.php") and jest("LocalSettings.php"):
    print("MediaWiki|" + wersja("includes/Defines.php", r"MW_VERSION'\s*,\s*'([^']+)'"))
elif jest("artisan") or jest("..", "artisan"):
    print("Laravel|")
elif jest("index.php"):
    print("PHP|")
elif jest("index.html") or jest("index.htm"):
    try:
        t = open(os.path.join(d, "index.html"), encoding="utf-8", errors="replace").read(20000)
    except OSError:
        t = ""
    print(("domyślna Verris" if "hosting verris" in t.lower() else "statyczna HTML") + "|")
else:
    print("pusta|")
PY
)"

# --- TTFB z serwera (mediana z 5 prób) ---
TTFB=""
if [ "${SS_SKIP_TTFB:-0}" != 1 ] && command -v curl >/dev/null 2>&1; then
  for _ in 1 2 3 4 5; do
    t="$(curl -s --noproxy '*' -o /dev/null -k -w '%{time_starttransfer}' --max-time 15 \
      --resolve "$SS_DOMAIN:443:127.0.0.1" "https://$SS_DOMAIN/" 2>/dev/null || true)"
    [[ "$t" =~ ^[0-9]+([.,][0-9]+)?$ ]] && TTFB="$TTFB ${t/,/.}"
  done
fi

LOGF="${SS_LOG_DIR:-/var/log/httpd/domains}/$SS_DOMAIN.log"
SS_TECH="$TECH" SS_TTFB="$TTFB" python3 - "$LOGF" <<'PY'
import base64, datetime as dt, json, os, re, statistics, sys
nazwa, _, wer = os.environ["SS_TECH"].partition("|")
wynik = {"technologia": {"nazwa": nazwa[:40], "wersja": wer[:20] or None}, "ruch": [], "top5xx": [], "ttfbMs": None, "log": True}
probki = [float(x) * 1000 for x in os.environ["SS_TTFB"].split() if x]
if probki:
    wynik["ttfbMs"] = {"mediana": round(statistics.median(probki)), "probki": len(probki)}
wiersz = re.compile(r'^(\S+) \S+ \S+ \[(\d{2})/(\w{3})/(\d{4}):[^\]]+\] "[A-Z]+ (\S+)[^"]*" (\d{3}) ')
MIES = {m: i for i, m in enumerate(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], 1)}
dzis = dt.date.today()
dni = {(dzis - dt.timedelta(days=i)).isoformat(): {"zadania": 0, "ip": set(), "bledy5xx": 0} for i in range(7)}
bledy = {}
try:
    with open(sys.argv[1], "rb") as f:
        f.seek(0, 2); r = f.tell(); f.seek(max(0, r - 100 * 1024 * 1024))
        for linia in f.read().decode("utf-8", "replace").splitlines():
            m = wiersz.match(linia)
            if not m or m.group(3) not in MIES:
                continue
            try:
                d = dt.date(int(m.group(4)), MIES[m.group(3)], int(m.group(2))).isoformat()
            except ValueError:
                continue
            if d not in dni:
                continue
            x = dni[d]; x["zadania"] += 1; x["ip"].add(m.group(1))
            if m.group(6).startswith("5"):
                x["bledy5xx"] += 1
                sc = m.group(5).split("?", 1)[0][:200]
                bledy[sc] = bledy.get(sc, 0) + 1
except OSError:
    wynik["log"] = False
wynik["ruch"] = [{"dzien": d, "zadania": v["zadania"], "odwiedzajacy": len(v["ip"]), "bledy5xx": v["bledy5xx"]} for d, v in sorted(dni.items())]
wynik["top5xx"] = [{"sciezka": s, "liczba": n} for s, n in sorted(bledy.items(), key=lambda kv: -kv[1])[:5]]
print("VERRIS_SITESTATS=" + base64.b64encode(json.dumps(wynik, separators=(",", ":"), ensure_ascii=False).encode()).decode())
PY
