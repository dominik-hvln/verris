#!/usr/bin/env bash
# =============================================================================
# Verris — blokady adresów IP fail2ban na węźle (F3.2, zadanie IP_BLOCKS; decyzja D5: zostajemy przy fail2ban).
# Uruchamiany przez agenta zadań z env:
#   IPB_MODE   list | unban | allow | disallow
#   IPB_IP     (list — opcjonalnie: tylko blokady tego adresu; unban/allow/disallow — wymagany) jeden adres IPv4/IPv6
#              Po unban/allow/disallow wypisywana jest pełna lista blokad węzła (API zawęża ją dla karty usługi).
# Komendy wyłącznie z oficjalnej dokumentacji fail2ban (man fail2ban-client, v1.1):
#   https://github.com/fail2ban/fail2ban/blob/master/man/fail2ban-client.1
#   status                               — lista jaili („Jail list:”)
#   get <JAIL> banip --with-time         — zablokowane IP z czasem („IP \t<od> + <sekundy> = <do>”, format
#                                          BanManager.getBanList: fail2ban/server/banmanager.py)
#   unban <IP>                           — odblokowanie we wszystkich jailach i w bazie (wynik: liczba odblokowań)
#   set <JAIL> addignoreip <IP> / delignoreip <IP> — biała lista w działającym fail2ban (bez przeładowania)
# Biała lista przeżywa restart dzięki plikowi jail.d (ignoreip w [DEFAULT]; wartość domyślna z jail.conf
# „127.0.0.1/8 ::1” zostaje). Jeśli ignoreip jest ustawione w innym pliku, skrypt odmawia (nie nadpisze cudzej listy).
# Dane wejściowe nie trafiają do powłoki: Python woła fail2ban-client listą argumentów (bez shell=True), adres
# sprawdza moduł ipaddress (postać kanoniczna), nazwy jaili — wzorzec. Błąd fail2ban = błąd zadania.
# Wyjście:
#   VERRIS_IPB_JAIL <jail>
#   VERRIS_IPB <ip>|<jail>|<od ISO UTC>|<do ISO UTC albo „-” dla stałej>|<sekundy>
#   VERRIS_IPB_RAZEM <wszystkich blokad> <pokazano>
#   VERRIS_IPB_ALLOW <ip>                (biała lista zarządzana przez Verris)
#   VERRIS_IPB_ODBLOKOWANO <n>           (unban/allow — ile blokad zdjęto)
# F2B_BIN i IPB_JAIL_D dają się podmienić wyłącznie w testach.
# =============================================================================
set -Eeuo pipefail

: "${IPB_MODE:?}"; : "${IPB_IP:=}"

fail() { echo "[ip-blocks] BŁĄD: $*" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || fail "brak python3 na serwerze"

IPB_MODE="$IPB_MODE" IPB_IP="$IPB_IP" python3 -I - <<'PY'
import calendar, ipaddress, os, re, shutil, subprocess, sys, time

def fail(msg):
    print(f"[ip-blocks] BŁĄD: {msg}", file=sys.stderr)
    sys.exit(1)

LIMIT_WIERSZY = 2000
LIMIT_ZNAKOW = 80000  # agent wysyła do API ostatnie 100 000 znaków logu
JAIL_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
JAIL_D = os.environ.get("IPB_JAIL_D") or "/etc/fail2ban/jail.d"
F2B_ETC = os.path.dirname(JAIL_D.rstrip("/"))
PLIK = os.path.join(JAIL_D, "zz-verris-biala-lista.local")
NAGLOWEK = "# Verris — biała lista fail2ban (zarządzana z panelu operatora, nie edytuj ręcznie)"
DOMYSLNE = "127.0.0.1/8 ::1"  # wartość z komentarza jail.conf („#ignoreip = 127.0.0.1/8 ::1”)

tryb = os.environ["IPB_MODE"]
surowy = os.environ["IPB_IP"].strip()
if tryb not in ("list", "unban", "allow", "disallow"):
    fail("nieznany tryb")

def adres(s):
    if len(s) > 45 or not re.fullmatch(r"[0-9A-Fa-f:.]+", s):
        fail("nieprawidłowy adres IP")
    try:
        ip = ipaddress.ip_address(s)
    except ValueError:
        fail("nieprawidłowy adres IP")
    if str(ip) != s:
        fail("adres IP w postaci niekanonicznej")
    return ip

ip = adres(surowy) if surowy else None
if tryb != "list" and ip is None:
    fail("brak adresu IP")
if tryb == "allow" and (ip.is_unspecified or ip.is_loopback or ip.is_multicast or ip.is_link_local or ip.is_reserved):
    fail("tego adresu nie dodaje się do białej listy")

F2B = os.environ.get("F2B_BIN") or shutil.which("fail2ban-client") or "/usr/bin/fail2ban-client"

def f2b(*argumenty, timeout=60):
    dozwolone = (
        argumenty == ("status",)
        or (len(argumenty) == 4 and argumenty[0] == "get" and argumenty[2:] == ("banip", "--with-time"))
        or (len(argumenty) == 2 and argumenty[0] == "unban")
        or (len(argumenty) == 4 and argumenty[0] == "set" and argumenty[2] in ("addignoreip", "delignoreip"))
    )
    if not dozwolone:
        fail("komenda spoza białej listy")
    if argumenty[0] in ("get", "set") and not JAIL_RE.match(argumenty[1]):
        fail("nieprawidłowa nazwa jaila")
    try:
        r = subprocess.run([F2B, *argumenty], capture_output=True, text=True, errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        fail(f"fail2ban-client {argumenty[0]} przekroczył czas")
    except OSError:
        fail("brak fail2ban-client na serwerze")
    if r.returncode != 0:
        fail(f"fail2ban-client {' '.join(argumenty[:1] + argumenty[2:3])}: " + ((r.stderr or r.stdout).strip()[:200] or f"kod {r.returncode}"))
    return r.stdout

def jaile():
    m = re.search(r"Jail list:\s*(.*)$", f2b("status"), re.M)
    if not m:
        fail("fail2ban-client status: nieczytelna odpowiedź")
    lista = [j.strip() for j in m.group(1).split(",") if j.strip()]
    for j in lista:
        if not JAIL_RE.match(j):
            fail("fail2ban-client status: nieprawidłowa nazwa jaila")
    return lista

def iso(lokalny):
    # MyTime.time2str — czas lokalny serwera „%Y-%m-%d %H:%M:%S”; ten sam proces/strefa co fail2ban.
    try:
        epoka = time.mktime(time.strptime(lokalny.strip(), "%Y-%m-%d %H:%M:%S"))
    except ValueError:
        return None
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoka))

WIERSZ = re.compile(r"^(\S+)\s+\t?(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) \+ (-?\d+) = (.+)$")

def blokady(lista_jaili, tylko=None):
    out = []
    for j in lista_jaili:
        for l in f2b("get", j, "banip", "--with-time").splitlines():
            m = WIERSZ.match(l.strip("\r"))
            if not m:
                continue
            try:
                a = ipaddress.ip_address(m.group(1))
            except ValueError:
                continue
            if tylko is not None and a != tylko:
                continue
            sekundy = int(m.group(3))
            od = iso(m.group(2))
            do = "-" if sekundy < 0 else (iso(m.group(4)) or "-")
            out.append((str(a), j, od or "-", do, sekundy))
    return out

# --- biała lista (plik jail.d) ---
def wpis_ignoreip_obcy():
    """Czy ignoreip ustawiono gdzie indziej (jail.local, jail.d/*) — wtedy nie zarządzamy listą."""
    pliki = [os.path.join(F2B_ETC, "jail.local")]
    if os.path.isdir(JAIL_D):
        pliki += [os.path.join(JAIL_D, n) for n in sorted(os.listdir(JAIL_D)) if n.endswith((".conf", ".local"))]
    for p in pliki:
        if os.path.abspath(p) == os.path.abspath(PLIK) or not os.path.isfile(p):
            continue
        with open(p, encoding="utf-8", errors="replace") as f:
            for l in f:
                if re.match(r"^\s*ignoreip\s*=", l):
                    return p
    return None

def czytaj_liste():
    if not os.path.exists(PLIK):
        return []
    if os.path.islink(PLIK):
        fail("plik białej listy jest dowiązaniem")
    lista = []
    with open(PLIK, encoding="utf-8") as f:
        for l in f:
            m = re.match(r"^ignoreip\s*=\s*(.*)$", l.strip())
            if m:
                for x in m.group(1).split():
                    if x in DOMYSLNE.split():
                        continue
                    lista.append(str(ipaddress.ip_address(x)))
    return lista

def zapisz_liste(lista):
    os.makedirs(JAIL_D, exist_ok=True)
    tmp = PLIK + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(f"{NAGLOWEK}\n[DEFAULT]\nignoreip = {' '.join([DOMYSLNE, *lista])}\n")
    os.chmod(tmp, 0o644)
    os.replace(tmp, PLIK)

def drukuj(lista_jaili, wpisy, biala):
    for j in lista_jaili:
        print(f"VERRIS_IPB_JAIL {j}")
    pokazano, znaki = 0, 0
    for a, j, od, do, s in wpisy:
        if pokazano >= LIMIT_WIERSZY:
            break
        linia = f"VERRIS_IPB {a}|{j}|{od}|{do}|{s}"
        if znaki + len(linia) > LIMIT_ZNAKOW:
            break
        print(linia)
        znaki += len(linia) + 1
        pokazano += 1
    print(f"VERRIS_IPB_RAZEM {len(wpisy)} {pokazano}")
    for a in biala:
        print(f"VERRIS_IPB_ALLOW {a}")

lista_jaili = jaile()

if tryb in ("allow", "disallow"):
    obcy = wpis_ignoreip_obcy()
    if obcy:
        fail(f"ignoreip ustawione poza panelem ({os.path.basename(obcy)}) — białą listę zmień ręcznie na serwerze")
    biala = czytaj_liste()
    s = str(ip)
    if tryb == "allow":
        if s not in biala:
            biala.append(s)
        if len(biala) > 200:
            fail("biała lista: najwyżej 200 adresów")
        zapisz_liste(biala)
        for j in lista_jaili:
            f2b("set", j, "addignoreip", s)
    else:
        biala = [a for a in biala if a != s]
        zapisz_liste(biala)
        for j in lista_jaili:
            f2b("set", j, "delignoreip", s)
    print(f"[ip-blocks] biała lista: {'dodano' if tryb == 'allow' else 'usunięto'} {s}")

if tryb in ("unban", "allow"):
    out = f2b("unban", str(ip)).strip()
    if not re.fullmatch(r"\d+", out):
        fail("fail2ban-client unban: nieczytelna odpowiedź")
    print(f"VERRIS_IPB_ODBLOKOWANO {int(out)}")

# Lista po operacji jest pełna (stan węzła); zawężona do adresu tylko przy „sprawdź IP” (list z IPB_IP).
drukuj(lista_jaili, blokady(lista_jaili, ip if tryb == "list" else None), czytaj_liste() if not wpis_ignoreip_obcy() else [])
print("[ip-blocks] Gotowe.")
PY
