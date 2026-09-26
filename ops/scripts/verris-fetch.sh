#!/usr/bin/env bash
# Verris — pobranie pliku z control-plane z weryfikacją podpisu Ed25519 (PB-36).
# Użycie: verris-fetch <ścieżka /agent/...> <plik docelowy | -> [limit czasu s]
# Kody: 0 OK, 1 pobranie/HTTP, 2 brak klucza publicznego, 3 podpis nieprawidłowy, 4 HTTP 404.
set -uo pipefail
P="${1:?ścieżka}"
DEST="${2:?plik docelowy albo -}"
TMO="${3:-60}"
PUB="${VERRIS_SIG_PUB:-/etc/verris/script-signing.pub}"
# shellcheck disable=SC1090
. "${VERRIS_CONF:-/etc/verris.conf}"
err() { echo "[verris-fetch] $P: $*" >&2; }
[ -r "$PUB" ] || { err "brak klucza podpisu $PUB — uruchom ponownie instalację agenta z panelu"; exit 2; }
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
code=$(curl -sS --max-time "$TMO" -H "X-Server-Id: $VERRIS_SERVER_ID" -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \
  -D "$T/h" -o "$T/b" -w '%{http_code}' "$VERRIS_API_URL$P") || { err "błąd połączenia"; exit 1; }
[ "$code" = "404" ] && exit 4
[ "$code" = "200" ] || { err "HTTP $code"; exit 1; }
hdr() { tr -d '\r' < "$T/h" | awk -v n="$1" '{ i = index($0, ":"); if (i && tolower(substr($0, 1, i - 1)) == n) v = substr($0, i + 2) } END { print v }'; }
sig=$(hdr x-verris-signature)
ts=$(hdr x-verris-signed-at)
case "$ts" in ''|*[!0-9]*) err "brak podpisu control-plane — plik odrzucony"; exit 3 ;; esac
d=$(( $(date +%s) - ts ))
[ "${d#-}" -le 300 ] || { err "podpis sprzed ${d}s (zegar węzła albo powtórzona odpowiedź) — plik odrzucony"; exit 3; }
printf 'verris-sig-v1\n%s\n%s\n%s\n%s' "$P" "$VERRIS_SERVER_ID" "$ts" "$(sha256sum "$T/b" | cut -d' ' -f1)" > "$T/m"
if ! printf '%s' "$sig" | base64 -d > "$T/s" 2>/dev/null || [ ! -s "$T/s" ] \
  || ! openssl pkeyutl -verify -pubin -inkey "$PUB" -rawin -in "$T/m" -sigfile "$T/s" >/dev/null 2>&1; then
  err "PODPIS NIEPRAWIDŁOWY — plik odrzucony"
  exit 3
fi
if [ "$DEST" = "-" ]; then
  cat "$T/b"
else
  install -m 0600 "$T/b" "$DEST.verris-new" && mv -f "$DEST.verris-new" "$DEST"
fi
