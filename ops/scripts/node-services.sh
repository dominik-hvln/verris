#!/usr/bin/env bash
# =============================================================================
# Verris — usługi i logi węzła (F3.4, zadanie NODE_SERVICES). Uruchamiany przez agenta zadań z env:
#   SVC_MODE        status | restart | log
#   SVC_NAME        restart: klucz usługi z białej listy; log: klucz logu z białej listy
#   SVC_ONLY_DOWN   restart: „1” = uruchom tylko, jeśli usługa NIE działa (NOC przy usłudze wspólnej — start stojącej
#                   usługi niczego nie przerywa; działającą restartuje wyłącznie administrator)
#   SVC_LINES       log: ile ostatnich linii (20–500, domyślnie 200)
#   SVC_FILTER      log: (opcjonalnie) fragment tekstu, bez rozróżniania wielkości liter, bez wyrażeń regularnych
#   SVC_MASK        log: „1” = maskuj adresy e-mail i IP (STAFF, decyzja 14.10 — we wszystkich logach); sekrety
#                   maskowane zawsze
#   SVC_DOMAIN      log: (opcjonalnie) domena — log domeny (ścieżka z {domena}) albo filtr linii z tą domeną
#   SVC_USER        log: (opcjonalnie) użytkownik — linie z tym słowem (konto panelu, login SSH/FTP, użytkownik systemu)
#   SVC_SINCE/SVC_UNTIL  log: (opcjonalnie) zakres czasu, sekundy od epoki (UTC); linie bez znacznika czasu dziedziczą
#                   czas poprzedniej linii (wpisy wielowierszowe), znacznik bez strefy = czas lokalny węzła
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
#   VERRIS_LOG_ZAKRES <najstarszy znacznik w oknie, epoka|->|<najnowszy|->   (przeszukane okno, przed filtrami)
#   VERRIS_LOG_FILTRY <zastosowane: tekst,domena,uzytkownik,czas albo ->
#   VERRIS_LOG <linia>
# Ścieżki logów: dokumentacja DirectAdmina „Directories and locations” (Log files):
#   https://docs.directadmin.com/directadmin/general-usage/directories-and-locations.html
# SYSTEMCTL_BIN, JOURNALCTL_BIN, SVC_ROOT (przedrostek ścieżek logów), SVC_UPTIME dają się podmienić wyłącznie w testach.
# =============================================================================
set -Eeuo pipefail

: "${SVC_MODE:?}"; : "${SVC_NAME:=}"; : "${SVC_ONLY_DOWN:=0}"; : "${SVC_LINES:=200}"; : "${SVC_FILTER:=}"; : "${SVC_MASK:=1}"
: "${SVC_DOMAIN:=}"; : "${SVC_USER:=}"; : "${SVC_SINCE:=}"; : "${SVC_UNTIL:=}"

fail() { echo "[services] BŁĄD: $*" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || fail "brak python3 na serwerze"

SVC_MODE="$SVC_MODE" SVC_NAME="$SVC_NAME" SVC_ONLY_DOWN="$SVC_ONLY_DOWN" SVC_LINES="$SVC_LINES" SVC_FILTER="$SVC_FILTER" \
SVC_MASK="$SVC_MASK" SVC_DOMAIN="$SVC_DOMAIN" SVC_USER="$SVC_USER" SVC_SINCE="$SVC_SINCE" SVC_UNTIL="$SVC_UNTIL" \
python3 -I - <<'PY'
import calendar, os, re, shutil, subprocess, sys, time

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
    "ssh": ("/var/log/secure", None, False),
    "cron": ("/var/log/cron", None, False),
    "exim-main": ("/var/log/exim/mainlog", None, True),
    "exim-reject": ("/var/log/exim/rejectlog", None, True),
    "exim-panic": ("/var/log/exim/paniclog", None, True),
    "maillog": ("/var/log/maillog", None, True),
    "www": ("/usr/local/lsws/logs/error.log", None, False),
    "www-domena": ("/var/log/httpd/domains/{domena}.log", None, False),
    "www-domena-bledy": ("/var/log/httpd/domains/{domena}.error.log", None, False),
    "directadmin": ("/var/log/directadmin/error.log", None, False),
    "directadmin-zadania": ("/var/log/directadmin/errortaskq.log", None, False),
    "directadmin-system": ("/var/log/directadmin/system.log", None, False),
    "directadmin-bezpieczenstwo": ("/var/log/directadmin/security.log", None, False),
    "directadmin-logowania": ("/var/log/directadmin/login.log", None, False),
    "mariadb": (None, "mariadb", False),
    "named": (None, "named", False),
    "ftp": (None, "ftp", False),
    "ftp-pureftpd": ("/var/log/pureftpd.log", None, False),
    "fail2ban": ("/var/log/fail2ban.log", None, False),
    "agent": ("/var/log/verris-tasks.log", None, False),
    "agent-lve": ("/var/log/verris-lve.log", None, False),
}

# Przegląd F3.4 — log agenta (/var/log/verris-tasks.log) zbiera też stdout KAŻDEGO zadania (verris-task@.service:
# StandardOutput=append:/var/log/verris-tasks.log): dziennik poczty kont (MAIL_LOG), ogon logu poczty zamówiony przez
# administratora bez maski, wyniki dostępów. Z tego logu pokazujemy wyłącznie wiersze samego agenta.
TYLKO_WIERSZE_AGENTA = {"agent": ("[verris-tasks]", "[verris-task-run]")}

SEKRET = re.compile(r"\b(pass(?:word|wd)?|token|secret|auth)=\S+", re.I)
ADRES = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)")
STEROWANIE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]|[\x00-\x08\x0b-\x1f\x7f]")
ZLY_FILTR = re.compile(r"[\x00-\x1f\x7f]")
# Te same reguły co maskujIp, LOG_WEZLA_DOMENA i LOG_WEZLA_UZYTKOWNIK w libs/contracts/src/uslugi-wezla.ts.
OKTET = r"(?:25[0-5]|2[0-4]\d|1?\d?\d)"
IPV4 = re.compile(r"(?<![\w.])(" + OKTET + r"\." + OKTET + r"\." + OKTET + r")\." + OKTET + r"(?![\w.])", re.A)
IPV6 = re.compile(r"(?<![\w:.])[0-9A-Fa-f:]{3,39}(?![\w:])", re.A)
DOMENA = re.compile(r"(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+", re.A)
UZYTKOWNIK = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}", re.A)
OKNO_BAJTOW = 4 * 1024 * 1024
LIMIT_BAJTOW = 80000  # budżet w BAJTACH UTF-8: agent wysyła do API ostatnie 100 000 bajtów logu zadania (tail -c)
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
maska = os.environ.get("SVC_MASK") != "0"
domena = (os.environ.get("SVC_DOMAIN") or "").strip().lower().rstrip(".")
if domena and not DOMENA.fullmatch(domena):
    fail("nieprawidłowa domena")
uzytkownik = (os.environ.get("SVC_USER") or "").strip()
if uzytkownik and not UZYTKOWNIK.fullmatch(uzytkownik):
    fail("nieprawidłowy użytkownik")

def epoka(nazwa):
    v = (os.environ.get(nazwa) or "").strip()
    if not v:
        return None
    if not re.fullmatch(r"\d{1,11}", v):
        fail("nieprawidłowy zakres czasu")
    return int(v)

od, do = epoka("SVC_SINCE"), epoka("SVC_UNTIL")
if od is not None and do is not None and od > do:
    fail("początek zakresu czasu jest po końcu")
if plik and "{domena}" in plik:
    if not domena:
        fail("ten log dotyczy jednej domeny — podaj domenę")
    plik = plik.replace("{domena}", domena)

def maska_ip6(m):
    t = m.group(0)
    if t.count(":") < 2 or ("::" not in t and not re.search(r"[A-Fa-f]", t)):
        return t
    grupy = t.split(":")
    if any(len(g) > 4 for g in grupy):
        return t
    return ":".join(grupy[:2]) + ":•••"

def oczysc(l):
    l = STEROWANIE.sub("", l.rstrip("\r\n"))
    l = SEKRET.sub(lambda m: m.group(1) + "=•••", l)
    if maska:
        l = ADRES.sub(lambda m: "•••@" + m.group(1), l)
        l = IPV4.sub(lambda m: m.group(1) + ".•••", l)
        l = IPV6.sub(maska_ip6, l)
    return l[:DLUGOSC_LINII]

# Znaczniki czasu w logach z listy: ISO (exim, journal short-iso, fail2ban, LiteSpeed), syslog „Oct 14 00:34:12”
# (messages, secure, cron, maillog, pureftpd), Apache access „[14/Oct/2026:00:34:12 +0200]”, Apache error
# „[Wed Oct 14 00:34:12.123 2026]”, DirectAdmin „2026:10:14-00:34:12”. Bez strefy = czas lokalny węzła.
MIESIACE = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
CZ_ACCESS = re.compile(r"\[(\d\d)/([A-Z][a-z]{2})/(\d{4}):(\d\d):(\d\d):(\d\d) ([+-])(\d\d)(\d\d)\]")
CZ_APACHE_ERR = re.compile(r"\[[A-Z][a-z]{2} ([A-Z][a-z]{2}) +(\d{1,2}) (\d\d):(\d\d):(\d\d)(?:\.\d+)? (\d{4})\]")
CZ_ISO = re.compile(r"(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)(?:[.,]\d+)?(Z|[+-]\d\d:?\d\d)?")
CZ_DA = re.compile(r"(\d{4}):(\d\d):(\d\d)-(\d\d):(\d\d):(\d\d)")
CZ_SYSLOG = re.compile(r"^([A-Z][a-z]{2}) +(\d{1,2}) (\d\d):(\d\d):(\d\d)\b")
TERAZ = time.time()

def lokalny(r, mies, d, h, mi, s):
    try:
        return int(time.mktime((r, mies, d, h, mi, s, 0, 0, -1)))
    except (OverflowError, ValueError):
        return None

def strefa(znak, hh, mm):
    return (1 if znak == "+" else -1) * (int(hh) * 3600 + int(mm) * 60)

def znacznik(l):
    glowa = l[:160]
    try:
        m = CZ_ACCESS.search(glowa)
        if m and m.group(2) in MIESIACE:
            utc = calendar.timegm((int(m.group(3)), MIESIACE[m.group(2)], int(m.group(1)), int(m.group(4)), int(m.group(5)), int(m.group(6))))
            return utc - strefa(m.group(7), m.group(8), m.group(9))
        m = CZ_APACHE_ERR.search(glowa)
        if m and m.group(1) in MIESIACE:
            return lokalny(int(m.group(6)), MIESIACE[m.group(1)], int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5)))
        m = CZ_ISO.search(glowa)
        if m:
            r, mies, d, h, mi, s = (int(x) for x in m.groups()[:6])
            tz = m.group(7)
            if tz is None:
                return lokalny(r, mies, d, h, mi, s)
            utc = calendar.timegm((r, mies, d, h, mi, s))
            if tz == "Z":
                return utc
            tz = tz.replace(":", "")
            return utc - strefa(tz[0], tz[1:3], tz[3:5])
        m = CZ_DA.search(glowa)
        if m:
            return lokalny(*(int(x) for x in m.groups()))
        m = CZ_SYSLOG.match(l)
        if m and m.group(1) in MIESIACE:
            rok = time.localtime(TERAZ).tm_year
            t = lokalny(rok, MIESIACE[m.group(1)], int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5)))
            if t is not None and t > TERAZ + 86400:  # syslog bez roku: grudniowe wpisy czytane w styczniu
                t = lokalny(rok - 1, MIESIACE[m.group(1)], int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5)))
            return t
    except (OverflowError, ValueError):
        return None
    return None

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

if nazwa in TYLKO_WIERSZE_AGENTA:
    linie = [l for l in linie if l.lstrip().startswith(TYLKO_WIERSZE_AGENTA[nazwa])]
# Znacznik czasu z SUROWEJ linii (przed maską), linia bez znacznika dziedziczy poprzedni (wpisy wielowierszowe).
z_czasem, ostatni = [], None
for l in linie:
    if not l.strip():
        continue
    t = znacznik(l)
    if t is not None:
        ostatni = t
    z_czasem.append((ostatni, oczysc(l)))
znane = [t for t, _ in z_czasem if t is not None]
zakres = (min(znane), max(znane)) if znane else (None, None)
zastosowane = []
log_domeny = "{domena}" in (LOGI[nazwa][0] or "")
if domena and not log_domeny:
    # Domena i jej subdomeny („www.firma.pl”), ale nie „mojafirma.pl”.
    wzor_domeny = re.compile(r"(?<![a-z0-9-])" + re.escape(domena) + r"(?![a-z0-9-])")
    z_czasem = [(t, l) for t, l in z_czasem if wzor_domeny.search(l.lower())]
if domena:
    zastosowane.append("domena")
if uzytkownik:
    wzor = re.compile(r"(?<![A-Za-z0-9_.-])" + re.escape(uzytkownik) + r"(?![A-Za-z0-9_-])")
    z_czasem = [(t, l) for t, l in z_czasem if wzor.search(l)]
    zastosowane.append("uzytkownik")
if filtr:
    f_male = filtr.lower()
    z_czasem = [(t, l) for t, l in z_czasem if f_male in l.lower()]
    zastosowane.insert(0, "tekst")
if od is not None or do is not None:
    z_czasem = [(t, l) for t, l in z_czasem if t is not None and (od is None or t >= od) and (do is None or t <= do)]
    zastosowane.append("czas")
linie = [l for _, l in z_czasem]
wybrane = linie[-ile:]
# Audyt Fali 3 — budżet w bajtach (maska „•••@” i U+FFFD z bajtów spoza UTF-8 to 3 bajty na znak), a nagłówek źródła
# PO liniach: agent obcina log od początku (tail -c), więc ewentualne obcięcie zabiera najstarsze linie, nie nagłówek.
wyjscie, bajty = [], 0
for l in reversed(wybrane):
    rozmiar = len(("VERRIS_LOG " + l).encode("utf-8")) + 1
    if bajty + rozmiar > LIMIT_BAJTOW - 300:  # zapas na wiersze ZAKRES, FILTRY i ZRODLO po liniach
        break
    wyjscie.append(l)
    bajty += rozmiar
wyjscie.reverse()
for l in wyjscie:
    print("VERRIS_LOG " + l)
print(f"VERRIS_LOG_ZAKRES {zakres[0] if zakres[0] is not None else '-'}|{zakres[1] if zakres[1] is not None else '-'}")
print("VERRIS_LOG_FILTRY " + (",".join(zastosowane) or "-"))
print(f"VERRIS_LOG_ZRODLO {nazwa}|{zrodlo}|{len(linie)}|{len(wyjscie)}|{1 if maska else 0}")
print("[services] Gotowe.")
PY
