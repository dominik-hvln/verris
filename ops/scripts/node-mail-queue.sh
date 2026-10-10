#!/usr/bin/env bash
# =============================================================================
# Verris — kolejka poczty exima na węźle (F3.1, zadanie MAIL_QUEUE).
# Uruchamiany przez agenta zadań z env:
#   MQ_MODE      list | remove | flush
#   MQ_USER      (konto) użytkownik DA — lista zawężona do konta, remove tylko z nim
#   MQ_DOMAINS   (konto) domeny konta po przecinku (z API, nie od klienta)
#   MQ_IDS       (remove) identyfikatory wiadomości po przecinku (z podglądu operatora)
#   MQ_SZUKAJ    (list, opcjonalnie) fragment nadawcy, odbiorcy albo tematu
# Komendy wyłącznie z dokumentacji DirectAdmina / Exima i tylko z tej białej listy:
#   exim -bp (lista), exim -bpc (liczba), exim -Mvh <id> (nagłówki -H, bez treści), exim -Mrm <id>… (usuń),
#   exim -qff (wypchnij kolejkę, także zamrożone)
#   https://docs.directadmin.com/other-hosting-services/exim/maintaining-email-queue.html
#   https://www.exim.org/exim-html-current/doc/html/spec_html/ch-the_exim_command_line.html
#   https://www.exim.org/exim-html-current/doc/html/spec_html/ch-format_of_spool_files.html
# Dane wejściowe nie trafiają do powłoki: Python woła exim listą argumentów (bez shell=True), każdy identyfikator
# sprawdzony wzorcem Exima (6-11-4 od 4.97, wcześniej 6-6-2). Treści wiadomości (-Mvb) skrypt nie czyta nigdy.
# Wyjście: VERRIS_MQ <id>|<wiek>|<rozmiar>|<zamrożona 0/1>|<nadawca>|<odbiorcy>|<temat>
#          VERRIS_MQ_RAZEM <w kolejce> <przeczytano> <pasuje> <pokazano>
#          VERRIS_MQ_USUNIETO <n> / VERRIS_MQ_POMINIETO <n> / VERRIS_MQ_PRZED <n> / VERRIS_MQ_PO <n>
# =============================================================================
set -Eeuo pipefail

: "${MQ_MODE:?}"; : "${MQ_USER:=}"; : "${MQ_DOMAINS:=}"; : "${MQ_IDS:=}"; : "${MQ_SZUKAJ:=}"

fail() { echo "[mail-queue] BŁĄD: $*" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || fail "brak python3 na serwerze"

MQ_MODE="$MQ_MODE" MQ_USER="$MQ_USER" MQ_DOMAINS="$MQ_DOMAINS" MQ_IDS="$MQ_IDS" MQ_SZUKAJ="$MQ_SZUKAJ" python3 -I - <<'PY'
import os, re, shutil, subprocess, sys
from email.header import decode_header, make_header

def fail(msg):
    print(f"[mail-queue] BŁĄD: {msg}", file=sys.stderr)
    sys.exit(1)

LIMIT_CZYTANYCH = 3000   # ile wiadomości najwyżej sprawdzamy nagłówkami (-Mvh) w jednym przebiegu
LIMIT_WIERSZY = 300      # ile wierszy oddajemy do panelu
LIMIT_ZNAKOW = 80000     # budżet wyjścia: agent wysyła do API ostatnie 100 000 znaków logu
ID_RE = re.compile(r"^(?:[0-9A-Za-z]{6}-[0-9A-Za-z]{11}-[0-9A-Za-z]{4}|[0-9A-Za-z]{6}-[0-9A-Za-z]{6}-[0-9A-Za-z]{2})$")
DOM_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$")
USER_RE = re.compile(r"^[a-z][a-z0-9]{0,15}$")

tryb = os.environ["MQ_MODE"]
uzytkownik = os.environ["MQ_USER"]
domeny = [d for d in os.environ["MQ_DOMAINS"].split(",") if d]
szukaj = os.environ["MQ_SZUKAJ"].strip().lower()
ids = [i for i in os.environ["MQ_IDS"].split(",") if i]

if tryb not in ("list", "remove", "flush"):
    fail("nieznany tryb")
if uzytkownik and not USER_RE.match(uzytkownik):
    fail("nieprawidłowy użytkownik")
if len(domeny) > 200 or any(not DOM_RE.match(d) for d in domeny):
    fail("nieprawidłowa lista domen")
if bool(uzytkownik) != bool(domeny):
    fail("konto wymaga użytkownika i domen")
if len(szukaj) > 100 or any(ord(c) < 32 for c in szukaj):
    fail("nieprawidłowa fraza")
if len(ids) > 500 or any(not ID_RE.match(i) for i in ids):
    fail("nieprawidłowy identyfikator wiadomości")
if tryb == "remove" and (not uzytkownik or not ids):
    fail("usuwanie tylko wiadomości konta, z listą identyfikatorów")
if tryb == "flush" and uzytkownik:
    fail("wypchnięcie dotyczy całej kolejki węzła")

EXIM = shutil.which("exim") or "/usr/sbin/exim"
KOMENDY = {"-bp", "-bpc", "-Mvh", "-Mrm", "-qff"}

def exim(opcja, *argumenty, timeout=120):
    if opcja not in KOMENDY:
        fail("komenda spoza białej listy")
    for a in argumenty:
        if not ID_RE.match(a):
            fail("nieprawidłowy identyfikator wiadomości")
    try:
        r = subprocess.run([EXIM, opcja, *argumenty], capture_output=True, text=True, errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        fail(f"exim {opcja} przekroczył czas")
    except OSError:
        fail("brak exima na serwerze")
    return r

def liczba():
    r = exim("-bpc")
    if r.returncode != 0:
        fail("exim -bpc: " + (r.stderr.strip()[:200] or f"kod {r.returncode}"))
    try:
        return int(r.stdout.strip() or "0")
    except ValueError:
        fail("exim -bpc: nieczytelna odpowiedź")

def lista():
    """exim -bp: „<wiek> <rozmiar> <id> <nadawca> [*** frozen ***]” + wiersze odbiorców (D = dostarczony)."""
    r = exim("-bp", timeout=300)
    if r.returncode != 0:
        fail("exim -bp: " + (r.stderr.strip()[:200] or f"kod {r.returncode}"))
    out, biezaca = [], None
    pierwszy = re.compile(r"^\s*(\d+[smhdw])\s+(\S+)\s+(\S+)\s+<([^>]*)>(.*)$")
    for l in r.stdout.splitlines():
        m = pierwszy.match(l)
        if m and ID_RE.match(m.group(3)):
            biezaca = {"id": m.group(3), "wiek": m.group(1), "rozmiar": m.group(2), "nadawca": m.group(4).lower(),
                       "zamrozona": "*** frozen ***" in m.group(5), "odbiorcy": []}
            out.append(biezaca)
        elif biezaca is not None and l.strip():
            s = l.strip()
            if s.startswith("D ") or s.startswith("+D "):
                continue
            biezaca["odbiorcy"].append(s.strip("<>").lower())
    return out

def naglowki(mid):
    """exim -Mvh: plik -H (koperta + nagłówki), bez treści. Login wywołującego, -auth_id, temat."""
    r = exim("-Mvh", mid)
    if r.returncode != 0:
        return None
    linie = r.stdout.splitlines()
    if linie and linie[0].endswith("-H"):
        linie = linie[1:]
    login = linie[0].split()[0] if linie and linie[0].split() else ""
    nadawca = linie[1].strip().strip("<>").lower() if len(linie) > 1 else ""
    auth = next((l.split(" ", 1)[1].strip().lower() for l in linie if l.startswith("-auth_id ")), "")
    temat, w_temacie = [], False
    for l in linie:
        m = re.match(r"^\d{3,}([A-Za-z* ]) ([^:\s]+):\s?(.*)$", l)
        if m:
            w_temacie = m.group(2).lower() == "subject" and m.group(1) != "*" and not temat
            if w_temacie:
                temat.append(m.group(3))
        elif w_temacie and l[:1] in (" ", "\t"):
            temat.append(l.strip())
        else:
            w_temacie = False
    surowy = " ".join(temat)
    try:
        temat_txt = str(make_header(decode_header(surowy)))
    except Exception:
        temat_txt = surowy
    return {"login": login, "auth": auth, "nadawca": nadawca, "temat": temat_txt}

def w_domenach(adres):
    return any(adres.endswith("@" + d) for d in domeny)

def konta(h):
    """Wiadomość konta: wysłana przez użytkownika DA (mail() z PHP), z logowaniem skrzynki konta albo z adresu konta."""
    return h["login"] == uzytkownik or h["auth"] == uzytkownik or w_domenach(h["auth"]) or w_domenach(h["nadawca"])

def czysc(s, n):
    return re.sub(r"[\x00-\x1f|]", " ", s).strip()[:n]

if tryb == "flush":
    przed = liczba()
    print(f"VERRIS_MQ_PRZED {przed}")
    r = exim("-qff", timeout=1800)
    if r.returncode != 0:
        fail("exim -qff: " + (r.stderr.strip()[:200] or f"kod {r.returncode}"))
    print(f"VERRIS_MQ_PO {liczba()}")
    print("[mail-queue] Gotowe.")
    sys.exit(0)

if tryb == "remove":
    do_usuniecia, pominiete = [], 0
    for mid in dict.fromkeys(ids):
        h = naglowki(mid)
        # Wiadomości już nie ma (wysłana, usunięta) albo nie należy do konta — nie ruszamy.
        if h is None or not konta(h):
            pominiete += 1
            continue
        do_usuniecia.append(mid)
    usunieto = 0
    for i in range(0, len(do_usuniecia), 50):
        r = exim("-Mrm", *do_usuniecia[i:i + 50])
        usunieto += len(re.findall(r"has been removed", r.stdout + r.stderr))
    print(f"VERRIS_MQ_USUNIETO {usunieto}")
    print(f"VERRIS_MQ_POMINIETO {pominiete + len(do_usuniecia) - usunieto}")
    print("[mail-queue] Gotowe.")
    sys.exit(0)

# list
razem = liczba()
wpisy = lista()
przeczytano, pasuje, wiersze, znaki = 0, 0, [], 0
for w in wpisy:
    if przeczytano >= LIMIT_CZYTANYCH:
        break
    przeczytano += 1
    h = naglowki(w["id"])
    if h is None:
        continue
    if uzytkownik and not konta(h):
        continue
    if szukaj and szukaj not in " ".join([w["nadawca"], *w["odbiorcy"], h["temat"].lower()]):
        continue
    pasuje += 1
    if len(wiersze) >= LIMIT_WIERSZY:
        continue
    odbiorcy = ",".join(w["odbiorcy"][:3]) + (f",+{len(w['odbiorcy']) - 3}" if len(w["odbiorcy"]) > 3 else "")
    linia = "VERRIS_MQ " + "|".join([w["id"], w["wiek"], w["rozmiar"], "1" if w["zamrozona"] else "0",
                                       czysc(w["nadawca"], 120), czysc(odbiorcy, 200), czysc(h["temat"], 120)])
    if znaki + len(linia) > LIMIT_ZNAKOW:
        continue
    znaki += len(linia) + 1
    wiersze.append(linia)
for l in wiersze:
    print(l)
print(f"VERRIS_MQ_RAZEM {razem} {przeczytano} {pasuje} {len(wiersze)}")
print("[mail-queue] Gotowe.")
PY
