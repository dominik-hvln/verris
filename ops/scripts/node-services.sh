#!/usr/bin/env bash
# =============================================================================
# Verris — usługi i logi węzła (F3.4, zadanie NODE_SERVICES). Uruchamiany przez agenta zadań z env:
#   SVC_MODE        status | restart | log
#   SVC_NAME        restart: klucz usługi z białej listy; log: klucz logu z białej listy
#   SVC_ONLY_DOWN   restart: „1” = uruchom tylko, jeśli usługa NIE działa (NOC przy usłudze wspólnej — start stojącej
#                   usługi niczego nie przerywa; działającą restartuje wyłącznie administrator)
#   SVC_LINES       log: ile ostatnich linii (20–500, domyślnie 200)
#   SVC_FILTER      log: (opcjonalnie) fragment tekstu, bez rozróżniania wielkości liter, bez wyrażeń regularnych
#   SVC_MASK        log: „1” = maskuj adresy e-mail w logach poczty (STAFF); sekrety maskowane zawsze
# Biała lista usług i logów = libs/contracts/src/uslugi-wezla.ts (zgodność pilnuje test uslugi-wezla-skrypt.spec.ts).
# Dane wejściowe nie trafiają do powłoki: Python woła systemctl/journalctl listą argumentów (bez shell=True), klucze
# tylko ze słownika, ścieżki logów stałe. Błąd systemd = błąd zadania (bez zamiany na sukces).
# systemd (oficjalna dokumentacja freedesktop.org):
#   https://www.freedesktop.org/software/systemd/man/latest/systemctl.html  — show -p …, restart
#   https://www.freedesktop.org/software/systemd/man/latest/journalctl.html — -u UNIT -n N --no-pager -o short-iso
#   https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.systemd1.html — LoadState, ActiveState,
#     SubState, ActiveEnterTimestampMonotonic, NRestarts
# Nazwy jednostek i ścieżki logów DirectAdmina/LiteSpeeda/Exima: NIEZWERYFIKOWANE z dokumentacją — sprawdzić na t1.
# Wyjście:
#   VERRIS_SVC <klucz>|<jednostka|->|<LoadState>|<ActiveState>|<SubState>|<od ISO UTC|->|<NRestarts|->
#   VERRIS_SVC_RESTART <klucz>|<jednostka>|<ActiveState po restarcie>
#   VERRIS_LOG_ZRODLO <klucz>|<plik albo journal:jednostka>|<dopasowanych>|<pokazano>|<maska 0/1>
#   VERRIS_LOG <linia>
# SYSTEMCTL_BIN, JOURNALCTL_BIN, SVC_ROOT (przedrostek ścieżek logów), SVC_UPTIME dają się podmienić wyłącznie w testach.
# =============================================================================
set -Eeuo pipefail

: "${SVC_MODE:?}"; : "${SVC_NAME:=}"; : "${SVC_ONLY_DOWN:=0}"; : "${SVC_LINES:=200}"; : "${SVC_FILTER:=}"; : "${SVC_MASK:=1}"

fail() { echo "[services] BŁĄD: $*" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || fail "brak python3 na serwerze"

SVC_MODE="$SVC_MODE" SVC_NAME="$SVC_NAME" SVC_ONLY_DOWN="$SVC_ONLY_DOWN" SVC_LINES="$SVC_LINES" SVC_FILTER="$SVC_FILTER" \
SVC_MASK="$SVC_MASK" python3 -I - <<'PY'
import os, re, shutil, subprocess, sys, time

def fail(msg):
    print(f"[services] BŁĄD: {msg}", file=sys.stderr)
    sys.exit(1)

# klucz: (jednostki w kolejności prób, przerwa dla wszystkich kont, restart dozwolony)
USLUGI = {
    "www": (["lsws.service", "litespeed.service", "httpd.service"], True, True),
    "exim": (["exim.service"], True, True),
    "dovecot": (["dovecot.service"], True, True),
    "mariadb": (["mariadb.service", "mysqld.service", "mysql.service"], True, True),
    "named": (["named.service"], True, True),
    "ftp": (["pure-ftpd.service", "pureftpd.service", "proftpd.service"], True, True),
    "directadmin": (["directadmin.service"], False, True),
    "fail2ban": (["fail2ban.service"], False, True),
    "sshd": (["sshd.service"], False, False),
    "agent": (["verris-tasks.timer"], False, False),
    "agent-lve": (["verris-lve.timer"], False, False),
}

# klucz: (plik albo None, klucz usługi dla dziennika systemd albo None, log poczty)
LOGI = {
    "system": ("/var/log/messages", None, False),
    "exim-main": ("/var/log/exim/mainlog", None, True),
    "exim-reject": ("/var/log/exim/rejectlog", None, True),
    "exim-panic": ("/var/log/exim/paniclog", None, True),
    "maillog": ("/var/log/maillog", None, True),
    "www": ("/usr/local/lsws/logs/error.log", None, False),
    "directadmin": ("/var/log/directadmin/error.log", None, False),
    "directadmin-zadania": ("/var/log/directadmin/errortaskq.log", None, False),
    "mariadb": (None, "mariadb", False),
    "named": (None, "named", False),
    "ftp": (None, "ftp", False),
    "fail2ban": ("/var/log/fail2ban.log", None, False),
    "agent": ("/var/log/verris-tasks.log", None, False),
    "agent-lve": ("/var/log/verris-lve.log", None, False),
}

SEKRET = re.compile(r"\b(pass(?:word|wd)?|token|secret|auth)=\S+", re.I)
ADRES = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)")
STEROWANIE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]|[\x00-\x08\x0b-\x1f\x7f]")
ZLY_FILTR = re.compile(r"[\x00-\x1f\x7f]")
OKNO_BAJTOW = 4 * 1024 * 1024
LIMIT_ZNAKOW = 80000  # agent wysyła do API ostatnie 100 000 znaków logu zadania
DLUGOSC_LINII = 400

SYSTEMCTL = os.environ.get("SYSTEMCTL_BIN") or shutil.which("systemctl") or "/usr/bin/systemctl"
JOURNALCTL = os.environ.get("JOURNALCTL_BIN") or shutil.which("journalctl") or "/usr/bin/journalctl"
ROOT = os.environ.get("SVC_ROOT", "")
UPTIME = os.environ.get("SVC_UPTIME") or "/proc/uptime"

tryb = os.environ["SVC_MODE"]
nazwa = os.environ["SVC_NAME"].strip()
if tryb not in ("status", "restart", "log"):
    fail("nieznany tryb")

def systemctl(*argumenty, timeout=60):
    dozwolone = (
        (len(argumenty) == 3 and argumenty[0] == "show" and argumenty[2].startswith("--property="))
        or (len(argumenty) == 2 and argumenty[0] == "restart")
    )
    if not dozwolone:
        fail("komenda spoza białej listy")
    jednostka = argumenty[1]
    if not any(jednostka in j for j, _, _ in USLUGI.values()):
        fail("jednostka spoza białej listy")
    try:
        r = subprocess.run([SYSTEMCTL, *argumenty], capture_output=True, text=True, errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        fail(f"systemctl {argumenty[0]} {jednostka} przekroczył czas")
    except OSError:
        fail("brak systemctl na serwerze")
    if r.returncode != 0:
        fail(f"systemctl {argumenty[0]} {jednostka}: " + ((r.stderr or r.stdout).strip()[:200] or f"kod {r.returncode}"))
    return r.stdout

POLA = "LoadState,ActiveState,SubState,ActiveEnterTimestampMonotonic,NRestarts"

def pokaz(jednostka):
    w = {}
    for l in systemctl("show", jednostka, f"--property={POLA}").splitlines():
        k, _, v = l.partition("=")
        if k in POLA.split(","):
            w[k] = v.strip()
    return w

def jednostka_uslugi(klucz):
    """Pierwsza załadowana jednostka z listy usługi (LoadState=loaded) albo None, gdy usługi nie ma na węźle."""
    for j in USLUGI[klucz][0]:
        w = pokaz(j)
        if w.get("LoadState") == "loaded":
            return j, w
    return None, None

def od_kiedy(w):
    try:
        mono = int(w.get("ActiveEnterTimestampMonotonic") or "0")
        if mono <= 0:
            return "-"
        with open(UPTIME) as f:
            uptime = float(f.read().split()[0])
    except (ValueError, OSError, IndexError):
        return "-"
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - (uptime - mono / 1e6)))

def bezpieczne(s, n=40):
    s = re.sub(r"[^A-Za-z0-9_.:@-]", "", s or "")
    return s[:n] or "-"

def wiersz(klucz, j, w):
    if not j:
        return f"VERRIS_SVC {klucz}|-|not-found|-|-|-|-"
    nr = w.get("NRestarts") or ""
    return "VERRIS_SVC " + "|".join([
        klucz, j, bezpieczne(w.get("LoadState")), bezpieczne(w.get("ActiveState")), bezpieczne(w.get("SubState")),
        od_kiedy(w) if w.get("ActiveState") == "active" else "-", nr if re.fullmatch(r"\d{1,9}", nr) else "-",
    ])

if tryb == "status":
    for klucz in USLUGI:
        j, w = jednostka_uslugi(klucz)
        print(wiersz(klucz, j, w))
    print("[services] Gotowe.")
    sys.exit(0)

if tryb == "restart":
    if nazwa not in USLUGI:
        fail("usługa spoza białej listy")
    _, przerwa, wolno = USLUGI[nazwa]
    if not wolno:
        fail("tej usługi nie restartuje się z panelu")
    j, w = jednostka_uslugi(nazwa)
    if not j:
        fail("usługi nie ma na tym serwerze")
    if os.environ.get("SVC_ONLY_DOWN") == "1" and w.get("ActiveState") in ("active", "activating", "reloading", "deactivating"):
        fail(f"usługa działa (stan: {bezpieczne(w.get('ActiveState'))}) — restart przerwie pracę kont, zleca go administrator")
    print(f"[services] restart {j} (stan przed: {bezpieczne(w.get('ActiveState'))}/{bezpieczne(w.get('SubState'))})")
    systemctl("restart", j, timeout=180)
    stan = ""
    for _ in range(30):
        stan = pokaz(j).get("ActiveState", "")
        if stan in ("active", "failed", "inactive"):
            break
        time.sleep(2)
    w = pokaz(j)
    print(wiersz(nazwa, j, w))
    print(f"VERRIS_SVC_RESTART {nazwa}|{j}|{bezpieczne(w.get('ActiveState'))}")
    if w.get("ActiveState") != "active":
        fail(f"usługa nie działa po restarcie (stan: {bezpieczne(w.get('ActiveState'))}/{bezpieczne(w.get('SubState'))}) — sprawdź jej log")
    print("[services] Gotowe.")
    sys.exit(0)

# --- log ---
if nazwa not in LOGI:
    fail("log spoza białej listy")
plik, usluga, poczta = LOGI[nazwa]
try:
    ile = int(os.environ.get("SVC_LINES") or "200")
except ValueError:
    fail("nieprawidłowa liczba linii")
if not 20 <= ile <= 500:
    fail("liczba linii poza zakresem 20–500")
filtr = os.environ.get("SVC_FILTER") or ""
if len(filtr) > 100 or ZLY_FILTR.search(filtr):
    fail("nieprawidłowy filtr")
maska = poczta and os.environ.get("SVC_MASK") != "0"

def oczysc(l):
    l = STEROWANIE.sub("", l.rstrip("\r\n"))
    l = SEKRET.sub(lambda m: m.group(1) + "=•••", l)
    if maska:
        l = ADRES.sub(lambda m: "•••@" + m.group(1), l)
    return l[:DLUGOSC_LINII]

if plik:
    sciezka = ROOT + plik
    if os.path.islink(sciezka):
        fail("plik logu jest dowiązaniem")
    if not os.path.isfile(sciezka):
        fail("tego logu nie ma na serwerze")
    with open(sciezka, "rb") as f:
        f.seek(0, os.SEEK_END)
        rozmiar = f.tell()
        f.seek(max(0, rozmiar - OKNO_BAJTOW))
        dane = f.read()
    linie = dane.decode("utf-8", errors="replace").split("\n")
    if rozmiar > OKNO_BAJTOW:
        linie = linie[1:]  # pierwsza linia okna jest ucięta
    zrodlo = plik
else:
    j, _ = jednostka_uslugi(usluga)
    if not j:
        fail("usługi nie ma na tym serwerze")
    try:
        r = subprocess.run([JOURNALCTL, "-u", j, "-n", "2000", "--no-pager", "-o", "short-iso", "-q"],
                           capture_output=True, text=True, errors="replace", timeout=60)
    except subprocess.TimeoutExpired:
        fail("journalctl przekroczył czas")
    except OSError:
        fail("brak journalctl na serwerze")
    if r.returncode != 0:
        fail("journalctl: " + ((r.stderr or r.stdout).strip()[:200] or f"kod {r.returncode}"))
    linie = r.stdout.split("\n")
    zrodlo = "journal:" + j

linie = [oczysc(l) for l in linie if l.strip()]
if filtr:
    f_male = filtr.lower()
    linie = [l for l in linie if f_male in l.lower()]
wybrane = linie[-ile:]
wyjscie, znaki = [], 0
for l in reversed(wybrane):
    if znaki + len(l) + 12 > LIMIT_ZNAKOW:
        break
    wyjscie.append(l)
    znaki += len(l) + 12
wyjscie.reverse()
print(f"VERRIS_LOG_ZRODLO {nazwa}|{zrodlo}|{len(linie)}|{len(wyjscie)}|{1 if maska else 0}")
for l in wyjscie:
    print("VERRIS_LOG " + l)
print("[services] Gotowe.")
PY
