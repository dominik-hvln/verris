#!/usr/bin/env bash
# =============================================================================
# Verris — dziennik dostarczania poczty konta (E-19: „gdzie jest mój mail”).
# Uruchamiany przez agenta zadań (MAIL_LOG) z env:
#   ML_DOMAINS   domeny konta, po przecinku (z API — tylko domeny tej usługi)
#   ML_ADDRESS   (opcjonalnie) adres do zawężenia wyników
# Czyta log exima (mainlog + poprzedni po rotacji) i zwraca tylko wpisy, w których występuje adres
# w domenach konta — cudzej poczty nie pokazujemy. Najwyżej 300 ostatnich zdarzeń.
# Wynik: VERRIS_ML <czas>|<id>|<znak>|<adres>|<szczegóły>   (znak: <= odebrana, => / -> dostarczona,
#        ** odrzucona, == opóźniona)
# ML_LOG_DIR daje się podmienić wyłącznie w testach.
#
# F3.1 — ML_MODE=stats (zadanie MAIL_LOG bez konta, tylko NOC/ADMIN): agregat wysyłki NA ZEWNĄTRZ całego węzła z tych
# samych plików logu — najwięksi nadawcy (domena nadawcy + użytkownik DA z U=) i odrzucenia (kod SMTP + domena serwera
# odbiorcy). Bez adresów, tematów i treści. Format wierszy logu wg specyfikacji Exima:
#   https://www.exim.org/exim-html-current/doc/html/spec_html/ch-log_files.html („Log line flags”: <= => -> ** ==,
#   pola U= A= H= R= T=). Dostawa „na zewnątrz” = wiersz z H= (serwer zdalny) albo T=remote_smtp / R=lookuphost /
#   R=dnslookup — NIEZWERYFIKOWANE na logu t1 (nazwy routerów/transportów z exim.conf DirectAdmina), sprawdzić na t1.
# Wynik: VERRIS_MS <domena nadawcy>|<użytkownik DA|->|<wiadomości>|<odrzucone>|<opóźnione>   (do 30 największych)
#        VERRIS_MB <kod SMTP|->|<domena serwera odbiorcy|->|<liczba>                       (do 20 najczęstszych)
#        VERRIS_MS_OKNO <pierwszy wpis> <ostatni wpis> <wiadomości razem>   (czasy w UTC, ISO z „Z”)
# Exim pisze czas w logu w strefie lokalnej serwera, bez strefy (domyślnie log_timezone = false):
#   https://www.exim.org/exim-html-current/doc/html/spec_html/ch-main_configuration.html (opcja log_timezone).
# Weryfikacja 11.10 (t1, strefa Europe/Warsaw): panel brał ten czas za UTC — koniec okna 16:42 o 14:52. Okno idzie
# więc w UTC przeliczonym ze strefy węzła (z uwzględnieniem czasu letniego). Tryb „konto” zostawia czas z logu
# (czas serwera) — panel pokazuje go wprost, bez przeliczania.
# =============================================================================
set -Eeuo pipefail

: "${ML_MODE:=konto}"
[ "$ML_MODE" = "konto" ] || [ "$ML_MODE" = "stats" ] || { echo "[mail-log] BŁĄD: nieznany tryb" >&2; exit 1; }
if [ "$ML_MODE" != "stats" ]; then : "${ML_DOMAINS:?}"; fi
: "${ML_DOMAINS:=}"; : "${ML_ADDRESS:=}"

log() { echo "[mail-log] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

DIR="${ML_LOG_DIR:-/var/log/exim}"

if [ "$ML_MODE" = "stats" ]; then
  PLIKI=()
  [ -f "$DIR/mainlog.1" ] && PLIKI+=("$DIR/mainlog.1")
  [ -f "$DIR/mainlog" ] && PLIKI+=("$DIR/mainlog")
  [ "${#PLIKI[@]}" -gt 0 ] || fail "brak logu poczty na serwerze"
  python3 -I - "${PLIKI[@]}" <<'PY'
import re, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
wiersz = re.compile(r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\S* (?:\[\d+\] )?(\S{16,23}) (<=|=>|->|\*\*|==) (\S+)(.*)$")
USER = re.compile(r"^[a-z][a-z0-9]{0,15}$")
SYSTEMOWI = {"mail", "mailnull", "exim", "root", "nobody", "apache", "diradmin", "dovecot"}
DOM = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$")
nadawca = {}       # id → (domena nadawcy, użytkownik DA)
na_zewnatrz = set()
odrzucone, opoznione = Counter(), Counter()
powody = Counter()
od = do = None
def domena(adres):
    a = adres.strip("<>").lower()
    if not a:
        return "(zwrotki)"
    d = a.rsplit("@", 1)[-1] if "@" in a else ""
    return d if DOM.match(d) else "(inna)"
def host_domena(reszta):
    m = re.search(r" H=([A-Za-z0-9.-]+)", reszta)
    if not m:
        return "-"
    czesci = m.group(1).lower().strip(".").split(".")
    return ".".join(czesci[-2:]) if len(czesci) >= 2 else "-"
def uzytkownik_lokalny(adr, reszta):
    """
    Audyt Fali 3 — użytkownik DA tylko z pola U= poczty LOKALNEJ (PHP mail()/sendmail: bez H=, P=local*), gdzie Exim
    wpisuje konto systemowe procesu. Pole stoi tuż przed P= (spec Exima, „Log line flags”); wszystko za P= (A=, T="temat",
    from/for) i adres nadawcy w cudzysłowie (spacje) to dane od nadawcy — temat „Promocja U=klientb” albo ident
    zdalnego hosta nie mogą przypisać wysyłki cudzemu kontu. Poczta z SMTP (H=) — po domenie nadawcy, bez użytkownika.
    https://www.exim.org/exim-html-current/doc/html/spec_html/ch-log_files.html (received_protocol „local”:
    https://www.exim.org/exim-html-current/doc/html/spec_html/ch-expansion_strings.html — $received_protocol).
    NIEZWERYFIKOWANE na logu t1 (wiersze <= z exim.conf DirectAdmina) — sprawdzić na t1.
    """
    if '"' in adr:
        return "-"
    przed, jest, po = reszta.partition(" P=")
    if not jest or not po.startswith("local") or " H=" in przed or '"' in przed:
        return "-"
    u = re.fullmatch(r"(?: R=\S+)? U=([a-z][a-z0-9]{0,15})", przed)
    return u.group(1) if u and u.group(1) not in SYSTEMOWI else "-"
def zewnetrzna(reszta):
    return bool(re.search(r" H=\S| T=remote_smtp\b| R=(lookuphost|dnslookup)\b", reszta))
for plik in sys.argv[1:]:
    try:
        f = open(plik, encoding="utf-8", errors="replace")
    except OSError:
        continue
    with f:
        for l in f:
            m = wiersz.match(l.rstrip("\n"))
            if not m:
                continue
            czas, mid, znak, adr, reszta = m.groups()
            od = od or czas
            do = czas
            if znak == "<=":
                nadawca[mid] = (domena(adr), uzytkownik_lokalny(adr, reszta))
                continue
            if mid not in nadawca or not zewnetrzna(reszta):
                continue
            na_zewnatrz.add(mid)
            if znak == "**":
                odrzucone[mid] += 1
                k = re.search(r"\b([45]\d\d)[ -]", reszta)
                powody[(k.group(1) if k else "-", host_domena(reszta))] += 1
            elif znak == "==":
                opoznione[mid] += 1
agregat = defaultdict(lambda: [0, 0, 0])
for mid in na_zewnatrz:
    a = agregat[nadawca[mid]]
    a[0] += 1
    a[1] += odrzucone[mid]
    a[2] += 1 if opoznione[mid] else 0
for (dom, usr), (n, o, z) in sorted(agregat.items(), key=lambda x: (-x[1][0], x[0]))[:30]:
    print(f"VERRIS_MS {dom}|{usr}|{n}|{o}|{z}")
for (kod, host), n in powody.most_common(20):
    print(f"VERRIS_MB {kod}|{host}|{n}")
def utc(czas):
    # Czas lokalny serwera z logu → UTC; astimezone() na czasie bez strefy przyjmuje strefę systemu (TZ / localtime).
    return datetime.strptime(czas, "%Y-%m-%d %H:%M:%S").astimezone().astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
if od:
    print(f"VERRIS_MS_OKNO {utc(od)} {utc(do)} {len(na_zewnatrz)}")
else:
    print("VERRIS_MS_OKNO - - 0")
PY
  log "Gotowe."
  exit 0
fi

DOM_RE='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
IFS=',' read -r -a DOMENY <<< "$ML_DOMAINS"
[ "${#DOMENY[@]}" -ge 1 ] && [ "${#DOMENY[@]}" -le 200 ] || fail "nieprawidłowa lista domen"
for d in "${DOMENY[@]}"; do [[ "$d" =~ $DOM_RE ]] || fail "nieprawidłowa domena"; done
if [ -n "$ML_ADDRESS" ]; then
  [[ "$ML_ADDRESS" =~ ^[A-Za-z0-9._%+-]{1,64}@[a-z0-9.-]{3,253}$ ]] || fail "nieprawidłowy adres"
fi

PLIKI=()
[ -f "$DIR/mainlog.1" ] && PLIKI+=("$DIR/mainlog.1")
[ -f "$DIR/mainlog" ] && PLIKI+=("$DIR/mainlog")
[ "${#PLIKI[@]}" -gt 0 ] || fail "brak logu poczty na serwerze"

ML_DOMAINS="$ML_DOMAINS" ML_ADDRESS="$ML_ADDRESS" python3 - "${PLIKI[@]}" <<'PY'
import os, re, sys
domeny = [d.lower() for d in os.environ["ML_DOMAINS"].split(",")]
adres = os.environ["ML_ADDRESS"].lower()
wiersz = re.compile(r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\S* (?:\[\d+\] )?(\S{16,23}) (<=|=>|->|\*\*|==) (\S+)(.*)$")
def nasz(a):
    a = a.lower().strip("<>")
    return any(a.endswith("@" + d) for d in domeny)
wiersze = []
for plik in sys.argv[1:]:
    try:
        f = open(plik, encoding="utf-8", errors="replace")
    except OSError:
        continue
    with f:
        for l in f:
            m = wiersz.match(l.rstrip("\n"))
            if m:
                wiersze.append(m.groups())
def adresy(adr, reszta):
    return [a.lower().strip("<>") for a in [adr] + re.findall(r"[<(]([^<>()\s@]+@[^<>()\s]+)[>)]", reszta)]
# Wiadomość jest „nasza”, gdy którykolwiek jej wiersz (nadawca <= albo odbiorca) jest w domenach konta;
# wtedy pokazujemy wszystkie jej wiersze (np. dostarczenie do gmail.com wysłanej z konta).
nasze, z_adresem = set(), set()
for czas, mid, znak, adr, reszta in wiersze:
    a = adresy(adr, reszta)
    if any(nasz(x) for x in a):
        nasze.add(mid)
    if adres and adres in a:
        z_adresem.add(mid)
wynik = []
for czas, mid, znak, adr, reszta in wiersze:
    if mid not in nasze or (adres and mid not in z_adresem):
        continue
    szczegoly = re.sub(r"\s+", " ", reszta).strip()
    # tylko to, co pomaga klientowi: host docelowy, błąd, rozmiar — bez nagłówków i ID sesji TLS
    szczegoly = re.sub(r" (X|CV|DN|K|id|U)=\S+", "", " " + szczegoly).strip()[:300]
    wynik.append((czas, mid, znak, adr.strip("<>")[:254], szczegoly.replace("|", "/")))
for w in wynik[-300:]:
    print("VERRIS_ML " + "|".join(w))
print(f"VERRIS_ML_RAZEM {min(len(wynik), 300)}")
PY
log "Gotowe."
