#!/usr/bin/env bash
# =============================================================================
# Verris — podgląd archiwum kopii i odtworzenie pojedynczego pliku/katalogu (H-10, H-11).
# Uruchamiany przez agenta zadań (FILE_RESTORE) z env:
#   FR_MODE      list | extract
#   FR_DA_USER   login konta DA (z rekordu konta w API)
#   FR_ARCHIVE   nazwa archiwum w ~/backups (.tar.gz | .tar.zst | .tar)
#   FR_PATH      list: prefiks wewnątrz archiwum (np. domains/x.pl/public_html/wp-content)
#                extract: plik albo katalog wewnątrz archiwum
#
# Całość działa jako KLIENT (runuser): czytamy tylko jego archiwum, a odtworzone pliki trafiają
# do NOWEGO katalogu ~/verris-odtworzone/<czas>/ — niczego na koncie nie nadpisujemy. Przeniesienie
# na miejsce robi klient menedżerem plików, świadomie.
# Wynik dla API:
#   list:    linie `VERRIS_WPIS <typ>|<rozmiar>|<ścieżka>` (typ f/d/l), najwyżej 2000
#   extract: `VERRIS_WYNIK_KATALOG=verris-odtworzone/<czas>`
# =============================================================================
set -Eeuo pipefail

: "${FR_MODE:?}"; : "${FR_DA_USER:?}"; : "${FR_ARCHIVE:?}"; : "${FR_PATH:=}"

log() { echo "[file-restore] $*"; }
fail() { log "BŁĄD: $*"; exit 1; }

LIMIT_WPISOW=2000

[[ "$FR_MODE" == "list" || "$FR_MODE" == "extract" ]] || fail "nieznany tryb: $FR_MODE"
[[ "$FR_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$FR_ARCHIVE" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,200}\.(tar\.gz|tar\.zst|tar)$ ]] || fail "nieprawidłowa nazwa archiwum"
# Ścieżka w archiwum: względna, bez „..”, bez znaków sterujących; przy extract niepusta.
if [ -n "$FR_PATH" ]; then
  [[ "$FR_PATH" != /* && "$FR_PATH" != *..* && ${#FR_PATH} -le 1024 ]] || fail "nieprawidłowa ścieżka w archiwum"
  [[ "$FR_PATH" =~ ^[^[:cntrl:]]+$ ]] || fail "nieprawidłowa ścieżka w archiwum"
fi
[ "$FR_MODE" = "list" ] || [ -n "$FR_PATH" ] || fail "wskaż plik albo katalog do odtworzenia"
id "$FR_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $FR_DA_USER"

HOME_DIR="$(getent passwd "$FR_DA_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ] || fail "brak katalogu domowego konta"
ARCHIWUM="$HOME_DIR/backups/$FR_ARCHIVE"

jako_klient() { runuser -u "$FR_DA_USER" -- "$@"; }
jako_klient test -f "$ARCHIWUM" || fail "brak archiwum ~/backups/$FR_ARCHIVE"

case "$FR_ARCHIVE" in
  *.tar.gz) KOMPRESJA=(-z) ;;
  *.tar.zst) KOMPRESJA=(--zstd) ;;
  *) KOMPRESJA=() ;;
esac

if [ "$FR_MODE" = "list" ]; then
  PREFIKS="${FR_PATH%/}"
  # tar -tv: „typ+uprawnienia właściciel rozmiar data czas ścieżka”; ścieżki ze spacjami zostają całe.
  jako_klient tar "${KOMPRESJA[@]}" -tvf "$ARCHIWUM" \
    | awk -v p="$PREFIKS" -v lim="$LIMIT_WPISOW" '
        {
          typ = substr($1, 1, 1); rozmiar = $3
          sciezka = $0; for (i = 1; i <= 5; i++) sub(/^[^ ]+ +/, "", sciezka)
          sub(/ -> .*$/, "", sciezka); sub(/\/$/, "", sciezka)
          if (p != "" && sciezka != p && index(sciezka, p "/") != 1) next
          if (++n > lim) { obciete = 1; exit }
          print "VERRIS_WPIS " (typ == "d" ? "d" : typ == "l" ? "l" : "f") "|" rozmiar "|" sciezka
        }
        END { if (obciete) print "VERRIS_OBCIETE " lim }'
  log "Gotowe."
  exit 0
fi

TS="$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 2)"
CEL_WZGL="verris-odtworzone/$TS"
jako_klient mkdir -p "$HOME_DIR/$CEL_WZGL"
if ! jako_klient tar "${KOMPRESJA[@]}" -xf "$ARCHIWUM" -C "$HOME_DIR/$CEL_WZGL" --no-same-owner -- "$FR_PATH"; then
  fail "nie znaleziono „$FR_PATH” w archiwum albo nie udało się go rozpakować"
fi
log "odtworzono „$FR_PATH” z $FR_ARCHIVE → ~/$CEL_WZGL/$FR_PATH"
echo "VERRIS_WYNIK_KATALOG=$CEL_WZGL"
