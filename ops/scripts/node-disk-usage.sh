#!/usr/bin/env bash
# =============================================================================
# Verris — co zajmuje miejsce na koncie (C-15) i ile plików (i-węzłów) jest w katalogach (K-03).
# Uruchamiany przez agenta zadań (DISK_USAGE) z env:
#   DU_DA_USER   login konta DA (z rekordu konta w API)
# Liczy KLIENT (runuser — widzi tylko swoje pliki), dwa poziomy katalogów od katalogu domowego.
# Wynik dla API:
#   VERRIS_DU_RAZEM <kB>|<i-węzły>
#   VERRIS_DU <kB>|<i-węzły>|<ścieżka względna>   (najwyżej 80 największych)
#   VERRIS_DU_SKRZYNKA <kB>|<domena>|<login>      (E-06: zajętość skrzynek z ~/imap/<domena>/<login>)
# =============================================================================
set -Eeuo pipefail

: "${DU_DA_USER:?}"

log() { echo "[disk-usage] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

[[ "$DU_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
id "$DU_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $DU_DA_USER"
HOME_DIR="$(getent passwd "$DU_DA_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ] || fail "brak katalogu domowego konta"

jako_klient() { runuser -u "$DU_DA_USER" -- "$@"; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Błędy odczytu pojedynczych plików (np. gniazda, pliki bez prawa odczytu) nie przerywają liczenia.
jako_klient timeout 900 du -xk --max-depth=2 -- "$HOME_DIR" > "$TMP/kb" 2>/dev/null || [ -s "$TMP/kb" ] || fail "nie udało się policzyć zajętości"
jako_klient timeout 900 du -x --inodes --max-depth=2 -- "$HOME_DIR" > "$TMP/in" 2>/dev/null || true
if [ -d "$HOME_DIR/imap" ]; then
  jako_klient timeout 600 du -xk --max-depth=2 -- "$HOME_DIR/imap" > "$TMP/imap" 2>/dev/null || true
fi

HOME_DIR="$HOME_DIR" python3 - "$TMP/kb" "$TMP/in" "$TMP/imap" <<'PY'
import os, sys
home = os.environ["HOME_DIR"].rstrip("/")
def wczytaj(p):
    out = {}
    try:
        for l in open(p, encoding="utf-8", errors="replace"):
            n, _, sciezka = l.rstrip("\n").partition("\t")
            if n.isdigit():
                out[sciezka] = int(n)
    except OSError:
        pass
    return out
kb, ino = wczytaj(sys.argv[1]), wczytaj(sys.argv[2])
print(f"VERRIS_DU_RAZEM {kb.get(home, 0)}|{ino.get(home, -1)}")
wpisy = [(v, s) for s, v in kb.items() if s != home and s.startswith(home + "/")]
for v, s in sorted(wpisy, reverse=True)[:80]:
    wzgl = s[len(home) + 1:]
    if any(c in wzgl for c in "\n\r|"):
        continue
    print(f"VERRIS_DU {v}|{ino.get(s, -1)}|{wzgl}")
imap = home + "/imap/"
for s, v in sorted(wczytaj(sys.argv[3]).items()):
    czesci = s[len(imap):].split("/") if s.startswith(imap) else []
    if len(czesci) == 2 and all(c and "|" not in c and "\n" not in c for c in czesci):
        print(f"VERRIS_DU_SKRZYNKA {v}|{czesci[0]}|{czesci[1]}")
PY
log "Gotowe."
