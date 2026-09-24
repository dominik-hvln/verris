#!/usr/bin/env bash
# =============================================================================
# Verris — wyszukiwanie plików w katalogu strony (C-14): po fragmencie nazwy i/lub po tekście
# w treści (np. „gdzie jest ta stara wtyczka”, „który plik wstawia ten skrypt”). Szuka KLIENT
# (runuser) — nie wyjdzie poza to, co i tak może czytać. Uruchamiany przez agenta zadań
# (FILE_SEARCH) z env:
#   FS_DA_USER   login konta DA
#   FS_DOMAIN    domena konta — zakres: domains/<domena>/public_html
#   FS_NAME      fragment nazwy pliku (bez wieloznaczników), może być pusty
#   FS_TEXT      tekst w treści (dosłownie, bez regex), może być pusty; co najmniej jedno z dwóch
# Wynik: VERRIS_SZUKAJ=<base64 JSON {pliki:[{p,s,t}],ucieto:bool}> (ścieżki względem public_html).
# =============================================================================
set -Eeuo pipefail

: "${FS_DA_USER:?}"; : "${FS_DOMAIN:?}"; : "${FS_NAME:=}"; : "${FS_TEXT:=}"

log() { echo "[file-search] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

LIMIT=500
[[ "$FS_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$FS_DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || fail "nieprawidłowa domena"
[ -n "$FS_NAME$FS_TEXT" ] || fail "podaj fragment nazwy albo tekst do znalezienia"
[ "${#FS_NAME}" -le 100 ] && [[ "$FS_NAME" != *[*?\[\]/]* ]] || fail "nazwa: do 100 znaków, bez * ? [ ] /"
[ "${#FS_TEXT}" -le 200 ] && [[ "$FS_TEXT" != *$'\n'* ]] || fail "tekst: do 200 znaków w jednej linii"
id "$FS_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $FS_DA_USER"
HOME_DIR="$(getent passwd "$FS_DA_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ] || fail "brak katalogu domowego konta"
DOCROOT="$HOME_DIR/domains/$FS_DOMAIN/public_html"
[ -d "$DOCROOT" ] && [ ! -L "$DOCROOT" ] || fail "brak katalogu strony domains/$FS_DOMAIN/public_html"

jako_klient() { runuser -u "$FS_DA_USER" -- "$@"; }

# find → „ścieżka\trozmiar\tmtime” (bez podążania za dowiązaniami, jeden system plików), potem
# opcjonalnie filtr treści grep -F (tylko pliki tekstowe, do 5 MB). Całość do 90 s.
WYNIK="$(jako_klient timeout 90 env NAZWA="$FS_NAME" TEKST="$FS_TEXT" DOC="$DOCROOT" LIMIT="$LIMIT" bash -c '
  cd -- "$DOC" || exit 3
  if [ -n "$NAZWA" ]; then set -- -iname "*$NAZWA*"; else set --; fi
  find . -xdev -type f "$@" -size -5M -printf "%P\t%s\t%T@\n" 2>/dev/null | while IFS=$'"'"'\t'"'"' read -r p s t; do
    if [ -n "$TEKST" ]; then grep -qIF -- "$TEKST" "$p" 2>/dev/null || continue; fi
    printf "%s\t%s\t%s\n" "$p" "$s" "${t%%.*}"
  done | head -n $((LIMIT + 1))
')" || { rc=$?; [ "$rc" -ne 124 ] || fail "przeszukiwanie trwało dłużej niż 90 s — zawęź nazwę albo tekst"; }

printf '%s\n' "$WYNIK" | LIMIT="$LIMIT" python3 -c '
import base64, json, os, sys
limit = int(os.environ["LIMIT"])
rows = [l.split("\t") for l in sys.stdin.read().splitlines() if l.count("\t") == 2]
pliki = [{"p": p[:500], "s": int(s) if s.isdigit() else 0, "t": int(t) if t.isdigit() else 0} for p, s, t in rows[:limit]]
out = {"pliki": pliki, "ucieto": len(rows) > limit}
print("VERRIS_SZUKAJ=" + base64.b64encode(json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode()).decode())
'
log "Gotowe."
