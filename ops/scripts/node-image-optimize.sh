#!/usr/bin/env bash
# =============================================================================
# Verris — optymalizacja obrazów strony bez utraty jakości (J-06). Uruchamiany przez agenta zadań
# (IMAGE_OPTIMIZE) z env:
#   IO_DA_USER    login konta DA
#   IO_DOMAIN     domena konta
#   IO_DIR        podkatalog public_html (np. wp-content/uploads), pusty = cały public_html
#   IO_METADANE   1 = usuń metadane (EXIF, w tym lokalizację GPS), 0 = zostaw
# JPEG: jpegoptim (tryb bezstratny — optymalizacja tablic Huffmana; -p zachowuje daty, -P właściciela
# i uprawnienia, -T 1 zostawia plik, gdy zysk < 1%). PNG: optipng -o2 (bezstratny), -preserve.
# Wszystko jako klient (runuser, nice/ionice) — dowiązanie nie wyprowadzi poza konto. Do 5000 plików
# na uruchomienie, najstarsze pierwsze; znacznik w ~/.verris-obrazy/ pamięta, dokąd doszliśmy, więc
# kolejne uruchomienie bierze tylko nowe i jeszcze nieprzejrzane pliki.
# Wynik: VERRIS_IMG=<plików> <bajtów przed> <bajtów po> <zostało>.
# =============================================================================
set -Eeuo pipefail

: "${IO_DA_USER:?}"; : "${IO_DOMAIN:?}"; : "${IO_DIR:=}"; : "${IO_METADANE:=1}"
MAKS=5000

log() { echo "[obrazy] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

[[ "$IO_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$IO_DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || fail "nieprawidłowa domena"
[ -z "$IO_DIR" ] || { [[ "$IO_DIR" =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+){0,9}$ ]] && [[ "/$IO_DIR/" != */../* ]] && [[ "/$IO_DIR/" != */./* ]]; } || fail "nieprawidłowy katalog"
[[ "$IO_METADANE" =~ ^[01]$ ]] || fail "nieprawidłowe ustawienie metadanych"
command -v jpegoptim >/dev/null 2>&1 && command -v optipng >/dev/null 2>&1 || fail "narzędzia do optymalizacji nie są jeszcze zainstalowane na serwerze — napisz do nas"
id "$IO_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $IO_DA_USER"
HOME_DIR="$(getent passwd "$IO_DA_USER" | cut -d: -f6)"
DOCROOT="$HOME_DIR/domains/$IO_DOMAIN/public_html"
[ -d "$DOCROOT" ] && [ ! -L "$DOCROOT" ] || fail "brak katalogu strony domains/$IO_DOMAIN/public_html"
jako_klient() { runuser -u "$IO_DA_USER" -- nice -n 19 ionice -c3 "$@"; }

KATALOG="$(jako_klient realpath -e -- "$DOCROOT${IO_DIR:+/$IO_DIR}" 2>/dev/null)" || fail "katalog ${IO_DIR:-public_html} nie istnieje"
BAZA="$(realpath -e -- "$DOCROOT")"
[ "$KATALOG" = "$BAZA" ] || [[ "$KATALOG" == "$BAZA/"* ]] || fail "katalog ${IO_DIR} jest poza stroną"

ZNACZNIK="$HOME_DIR/.verris-obrazy/${IO_DOMAIN}__$(printf '%s' "${IO_DIR:-.}" | tr '/' '_')"
export IO_KATALOG="$KATALOG" IO_ZNACZNIK="$ZNACZNIK" IO_MAKS="$MAKS" IO_METADANE
# Całość jako klient: lista (najstarsze pierwsze), rozmiary przed/po, optymalizacja, przesunięcie znacznika.
jako_klient bash -c '
  set -uo pipefail
  mkdir -p "$(dirname "$IO_ZNACZNIK")" && chmod 700 "$(dirname "$IO_ZNACZNIK")"
  NOWSZE=(); [ -e "$IO_ZNACZNIK" ] && NOWSZE=(-newer "$IO_ZNACZNIK")
  LISTA="$(mktemp)"; trap "rm -f \"$LISTA\"" EXIT
  find "$IO_KATALOG" -xdev -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) -size +4k "${NOWSZE[@]}" -printf "%T@ %s %p\n" 2>/dev/null |
    sort -n > "$LISTA"
  WSZYSTKIE=$(wc -l < "$LISTA")
  head -n "$IO_MAKS" "$LISTA" > "$LISTA.w"; mv -f "$LISTA.w" "$LISTA"
  ILE=$(wc -l < "$LISTA"); PRZED=0; PO=0
  JPG=(-p -P -q -T 1); PNG=(-o2 -preserve -quiet)
  [ "$IO_METADANE" = "1" ] && { JPG+=(--strip-all); PNG+=(-strip all); }
  while read -r czas rozmiar plik; do
    PRZED=$((PRZED + rozmiar))
    case "${plik,,}" in
      *.png) optipng "${PNG[@]}" -- "$plik" >/dev/null 2>&1 || true ;;
      *) jpegoptim "${JPG[@]}" -- "$plik" >/dev/null 2>&1 || true ;;
    esac
    PO=$((PO + $(stat -c %s -- "$plik" 2>/dev/null || echo "$rozmiar")))
    OSTATNI="$czas"
  done < "$LISTA"
  [ "$ILE" -gt 0 ] && touch -d "@$OSTATNI" -- "$IO_ZNACZNIK"
  echo "VERRIS_IMG=$ILE $PRZED $PO $((WSZYSTKIE - ILE))"
'
log "Gotowe."
