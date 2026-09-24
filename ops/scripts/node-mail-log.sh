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
# =============================================================================
set -Eeuo pipefail

: "${ML_DOMAINS:?}"; : "${ML_ADDRESS:=}"

log() { echo "[mail-log] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

DOM_RE='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
IFS=',' read -r -a DOMENY <<< "$ML_DOMAINS"
[ "${#DOMENY[@]}" -ge 1 ] && [ "${#DOMENY[@]}" -le 200 ] || fail "nieprawidłowa lista domen"
for d in "${DOMENY[@]}"; do [[ "$d" =~ $DOM_RE ]] || fail "nieprawidłowa domena"; done
if [ -n "$ML_ADDRESS" ]; then
  [[ "$ML_ADDRESS" =~ ^[A-Za-z0-9._%+-]{1,64}@[a-z0-9.-]{3,253}$ ]] || fail "nieprawidłowy adres"
fi

DIR="${ML_LOG_DIR:-/var/log/exim}"
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
