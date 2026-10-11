#!/usr/bin/env bash
# =============================================================================
# Verris — kolejka poczty exima na węźle (F3.1, zadanie MAIL_QUEUE).
# Uruchamiany przez agenta zadań z env:
#   MQ_MODE      list | remove | flush | limit
#   MQ_USER      (konto) użytkownik DA — lista zawężona do konta, remove tylko z nim
#   MQ_DOMAINS   (konto) domeny konta po przecinku (z API, nie od klienta)
#   MQ_IDS       (remove) identyfikatory wiadomości po przecinku (z podglądu operatora)
#   MQ_SZUKAJ    (list, opcjonalnie) fragment nadawcy, odbiorcy albo tematu
#   MQ_LIMIT     (limit, opcjonalnie) dobowy limit wysyłki konta 1–100000 albo „domyslny”; pusty = tylko odczyt
# F3.1 — tryb `limit`: dobowy limit wysyłki użytkownika DA = plik /etc/virtual/limit_<użytkownik> (jedna liczba, bez
# nowej linii), domyślny dla wszystkich — /etc/virtual/limit. Dokumentacja DirectAdmina:
#   https://docs.directadmin.com/other-hosting-services/preventing-spam/outgoing-spam.html#how-to-customize-the-daily-user-email-limit-based-on-a-custom-package-item
#   (zapis `echo -n "$limit" > /etc/virtual/limit_$username` tylko dla liczby > 0; per-User limit „daily cap … sum of all
#   their email account's sends”). „domyslny” usuwa plik konta — NIEZWERYFIKOWANE z dokumentacją, że bez pliku exim.pl
#   bierze /etc/virtual/limit (dokumentacja tego nie mówi wprost) — sprawdzić na t1. Wartości 0 („bez limitu” dla
#   limit_unknown) nie przyjmujemy. Zapis atomowy (plik tymczasowy w /etc/virtual + rename) z właścicielem i prawami
#   pliku /etc/virtual/limit; po zapisie ponowny odczyt — rozjazd = błąd.
# Komendy wyłącznie z dokumentacji DirectAdmina / Exima i tylko z tej białej listy:
#   exim -bp (lista), exim -bpc (liczba), exim -Mvh <id> (nagłówki -H, bez treści), exim -Mrm <id>… (usuń),
#   exim -qff (wypchnij kolejkę, także zamrożone)
#   https://docs.directadmin.com/other-hosting-services/exim/maintaining-email-queue.html
#   https://www.exim.org/exim-html-current/doc/html/spec_html/ch-the_exim_command_line.html
#   https://www.exim.org/exim-html-current/doc/html/spec_html/ch-format_of_spool_files.html
# Dane wejściowe nie trafiają do powłoki: Python woła exim listą argumentów (bez shell=True), każdy identyfikator
# sprawdzony wzorcem Exima (6-11-4 od 4.97, wcześniej 6-6-2). Treści wiadomości (-Mvb) skrypt nie czyta nigdy.
# Wyjście: VERRIS_MQ <id>|<wiek>|<rozmiar>|<zamrożona 0/1>|<nadawca>|<odbiorcy>|<temat>
#          VERRIS_MQ_LIMIT <użytkownik> <limit konta|domyslny> <limit domyślny|->
#          VERRIS_MQ_RAZEM <w kolejce> <przeczytano> <pasuje> <pokazano>
#          VERRIS_MQ_USUNIETO <n> / VERRIS_MQ_POMINIETO <n> / VERRIS_MQ_PRZED <n> / VERRIS_MQ_PO <n>
# =============================================================================
set -Eeuo pipefail

: "${MQ_MODE:?}"; : "${MQ_USER:=}"; : "${MQ_DOMAINS:=}"; : "${MQ_IDS:=}"; : "${MQ_SZUKAJ:=}"; : "${MQ_LIMIT:=}"
# Katalogi podmieniane wyłącznie w testach (test/kolejka-poczty-wezla.spec.ts).
: "${MQ_VIRTUAL_DIR:=/etc/virtual}"; : "${MQ_DA_USERS:=/usr/local/directadmin/data/users}"

fail() { echo "[mail-queue] BŁĄD: $*" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || fail "brak python3 na serwerze"

MQ_MODE="$MQ_MODE" MQ_USER="$MQ_USER" MQ_DOMAINS="$MQ_DOMAINS" MQ_IDS="$MQ_IDS" MQ_SZUKAJ="$MQ_SZUKAJ" MQ_LIMIT="$MQ_LIMIT" \
  MQ_VIRTUAL_DIR="$MQ_VIRTUAL_DIR" MQ_DA_USERS="$MQ_DA_USERS" python3 -I - <<'PY'
import os, re, shutil, subprocess, sys, tempfile
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

limit = os.environ["MQ_LIMIT"].strip()

if tryb not in ("list", "remove", "flush", "limit"):
    fail("nieznany tryb")
if uzytkownik and not USER_RE.match(uzytkownik):
    fail("nieprawidłowy użytkownik")
if len(domeny) > 200 or any(not DOM_RE.match(d) for d in domeny):
    fail("nieprawidłowa lista domen")
if tryb != "limit" and bool(uzytkownik) != bool(domeny):
    fail("konto wymaga użytkownika i domen")
if len(szukaj) > 100 or any(ord(c) < 32 for c in szukaj):
    fail("nieprawidłowa fraza")
if len(ids) > 500 or any(not ID_RE.match(i) for i in ids):
    fail("nieprawidłowy identyfikator wiadomości")
if tryb == "remove" and (not uzytkownik or not ids):
    fail("usuwanie tylko wiadomości konta, z listą identyfikatorów")
if tryb == "flush" and uzytkownik:
    fail("wypchnięcie dotyczy całej kolejki węzła")

if tryb == "limit":
    # Bez exima: tylko plik limitu konta w katalogu exima DirectAdmina (komentarz w nagłówku, link do dokumentacji).
    VIRTUAL = os.environ["MQ_VIRTUAL_DIR"]
    if not uzytkownik:
        fail("limit dotyczy konta — brak użytkownika")
    if limit and limit != "domyslny" and not re.fullmatch(r"[1-9][0-9]{0,5}", limit):
        fail("limit: liczba 1–100000 albo „domyslny”")
    if limit and limit != "domyslny" and int(limit) > 100000:
        fail("limit: liczba 1–100000 albo „domyslny”")
    if not os.path.isfile(os.path.join(os.environ["MQ_DA_USERS"], uzytkownik, "user.conf")):
        fail("nie ma takiego konta na serwerze")
    if not os.path.isdir(VIRTUAL):
        fail("brak katalogu ustawień poczty na serwerze")
    plik = os.path.join(VIRTUAL, "limit_" + uzytkownik)

    def czytaj(sciezka):
        try:
            with open(sciezka, encoding="ascii", errors="replace") as f:
                t = f.read().strip()
        except FileNotFoundError:
            return None
        return t if re.fullmatch(r"[0-9]{1,9}", t) else "?"

    if limit == "domyslny":
        try:
            os.unlink(plik)
        except FileNotFoundError:
            pass
        except OSError as e:
            fail(f"nie usunięto limitu konta: {e.strerror}")
    elif limit:
        wzor = os.path.join(VIRTUAL, "limit")
        try:
            st = os.stat(wzor)
            tryb_pliku, wlasciciel, grupa = st.st_mode & 0o777, st.st_uid, st.st_gid
        except FileNotFoundError:
            tryb_pliku, wlasciciel, grupa = 0o644, None, None
        fd, tmp = tempfile.mkstemp(prefix=".limit_" + uzytkownik + ".", dir=VIRTUAL)
        try:
            with os.fdopen(fd, "w", encoding="ascii") as f:
                f.write(limit)
            os.chmod(tmp, tryb_pliku)
            if wlasciciel is not None and os.geteuid() == 0:
                os.chown(tmp, wlasciciel, grupa)
            os.replace(tmp, plik)
        except OSError as e:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            fail(f"nie zapisano limitu konta: {e.strerror}")
    teraz = czytaj(plik)
    oczekiwane = None if limit == "domyslny" else (limit or teraz)
    if limit and teraz != oczekiwane:
        fail("serwer nie potwierdził limitu po zapisie")
    domyslny = czytaj(os.path.join(VIRTUAL, "limit"))
    print(f"VERRIS_MQ_LIMIT {uzytkownik} {teraz if teraz is not None else 'domyslny'} {domyslny if domyslny is not None else '-'}")
    print("[mail-queue] Gotowe.")
    sys.exit(0)

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
    protokol = next((l.split(" ", 1)[1].strip().lower() for l in linie if l.startswith("-received_protocol ")), "")
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
    return {"login": login, "auth": auth, "protokol": protokol, "nadawca": nadawca, "temat": temat_txt}

def w_domenach(adres):
    return any(adres.endswith("@" + d) for d in domeny)

# Użytkownik, jako który działa sam exim (DirectAdmin: exim_user = mail; inne dystrybucje: mailnull, exim).
SYSTEMOWI = {"mail", "mailnull", "exim", "Debian-exim"}

def konta(h):
    """Wiadomość konta — o przynależności decyduje TOŻSAMOŚĆ, nie nadawca koperty (ten może podać każdy: mail() z -f,
    MAIL FROM po SMTP AUTH innej skrzynki, poczta z zewnątrz):
      - z uwierzytelnieniem (-auth_id): skrzynka w domenach konta albo login użytkownika DA;
      - bez uwierzytelnienia: wywołujący to użytkownik DA konta (mail() z PHP, sendmail);
      - nadawca w domenach konta liczy się tylko dla wiadomości, które exim wytworzył lokalnie sam (login exima,
        -received_protocol local*: autoresponder, przekierowanie, zwrotka) — nie dla poczty przyjętej po SMTP
        bez uwierzytelnienia ani wysłanej lokalnie przez innego użytkownika.
    Plik -H: pierwsza linia „login uid gid”, -auth_id, -received_protocol
    (https://www.exim.org/exim-html-current/doc/html/spec_html/ch-format_of_spool_files.html)."""
    if h["auth"]:
        return h["auth"] == uzytkownik or w_domenach(h["auth"])
    if h["login"] == uzytkownik:
        return True
    return h["login"] in SYSTEMOWI and h["protokol"].startswith("local") and w_domenach(h["nadawca"])

def czysc(s, n):
    """Pole wiersza VERRIS_MQ: bez znaków sterujących (C0, DEL, C1 z NEL), separatorów wiersza U+2028/U+2029
    i „|”; długość w punktach kodowych — tak liczy parser API (wiadomosciZLogu, regex z flagą u)."""
    s = s.encode("utf-8", "replace").decode("utf-8")
    return re.sub("[\x00-\x1f\x7f-\x9f\u2028\u2029|]", " ", s).strip()[:n]

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
    usunieto, zniknely = 0, 0
    # Exim (-Mrm, każda wiadomość osobno): „Message <id> has been removed” albo „… has been removed or did not exist”
    # (spool już pusty: wiadomość wyszła albo wygasła między -Mvh a -Mrm — liczona jako pominięta; exim kończy wtedy
    # kodem ≠ 0). Kod ≠ 0 z wiadomością bez żadnego z tych wierszy (zablokowana, brak uprawnień) = błąd zadania,
    # ale liczby już usuniętych (nieodwracalne) idą do logu PRZED błędem — API zapisze je w dzienniku.
    for i in range(0, len(do_usuniecia), 50):
        paczka = do_usuniecia[i:i + 50]
        r = exim("-Mrm", *paczka)
        wyjscie = r.stdout + "\n" + r.stderr
        usuniete = set(re.findall(r"^Message (\S+) has been removed$", wyjscie, re.M)) & set(paczka)
        brak = set(re.findall(r"^Message (\S+) has been removed or did not exist$", wyjscie, re.M)) & set(paczka)
        usunieto += len(usuniete)
        zniknely += len(brak - usuniete)
        nieznane = [m for m in paczka if m not in usuniete and m not in brak]
        if r.returncode != 0 and nieznane:
            print(f"VERRIS_MQ_USUNIETO {usunieto}")
            print(f"VERRIS_MQ_POMINIETO {pominiete + zniknely}")
            sys.stdout.flush()
            fail(f"exim -Mrm: nie usunięto {len(nieznane)} — " + (r.stderr.strip()[:200] or f"kod {r.returncode}"))
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
