#!/usr/bin/env bash
# =============================================================================
# Verris — szyfrowanie backupów at-rest (age)  [S-2 / CYBER-8 / RODO art. 32]
# -----------------------------------------------------------------------------
# Współdzielone helpery szyfrujące/deszyfrujące dumpy przed wysyłką off-site.
# Model: szyfrowanie kopertowe age (X25519). Klucze PUBLICZNE (odbiorcy) leżą na
# control-plane; klucz PRYWATNY (identity) NIGDY nie jest trzymany na serwerze —
# przechowywany offline / w secret vault i używany tylko przy restore.
#
# Konfiguracja (.env.prod):
#   BACKUP_ENCRYPTION_ENABLED   (default: 1 — w prod OBOWIĄZKOWE, fail-closed)
#   BACKUP_AGE_RECIPIENTS       jeden lub więcej kluczy publicznych age
#                               ("age1..."), oddzielone spacją/przecinkiem/nową linią.
#                               Zalecane 2: klucz operacyjny + offline break-glass.
#   BACKUP_AGE_RECIPIENTS_FILE  (alternatywnie) ścieżka do pliku z kluczami (po jednym w linii).
#   BACKUP_AGE_IDENTITY_FILE    (tylko restore) ścieżka do pliku z kluczem prywatnym age.
#
# Wymaga binarki `age` (https://github.com/FiloSottile/age). Preflight próbuje ją
# doinstalować przez menedżer pakietów hosta; przy braku — twardy błąd.
# =============================================================================

backup_crypto_log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }
backup_crypto_fail() { backup_crypto_log "ERROR: $*"; exit "${2:-40}"; }

# Upewnij się, że `age` jest dostępny; spróbuj doinstalować (apt/dnf/apk).
backup_crypto_ensure_age() {
  if command -v age >/dev/null 2>&1; then return 0; fi
  backup_crypto_log "binarka 'age' nieobecna — próba instalacji…"
  if command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get update -qq && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq age >/dev/null 2>&1 || true
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q age >/dev/null 2>&1 || true
  elif command -v yum >/dev/null 2>&1; then
    yum install -y -q age >/dev/null 2>&1 || true
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache age >/dev/null 2>&1 || true
  fi
  command -v age >/dev/null 2>&1 || backup_crypto_fail \
    "binarka 'age' niedostępna i nie udało się jej doinstalować. Zainstaluj: 'apt-get install age' / 'dnf install age' / https://github.com/FiloSottile/age/releases" 41
}

# Zwraca 0 gdy szyfrowanie jest włączone (domyślnie tak).
backup_crypto_enabled() {
  local flag="${BACKUP_ENCRYPTION_ENABLED:-1}"
  [[ "$flag" == "1" || "$flag" == "true" || "$flag" == "yes" ]]
}

# Buduje listę argumentów -r/-R dla age z ENV. Ustawia globalną tablicę AGE_RECIPIENT_ARGS.
backup_crypto_collect_recipients() {
  AGE_RECIPIENT_ARGS=()
  local raw="${BACKUP_AGE_RECIPIENTS:-}"
  if [[ -n "$raw" ]]; then
    # normalizuj separatory (przecinki/nowe linie → spacje)
    raw="${raw//,/ }"
    local key
    for key in $raw; do
      [[ -n "$key" ]] && AGE_RECIPIENT_ARGS+=( -r "$key" )
    done
  fi
  if [[ -n "${BACKUP_AGE_RECIPIENTS_FILE:-}" ]]; then
    [[ -r "$BACKUP_AGE_RECIPIENTS_FILE" ]] || \
      backup_crypto_fail "BACKUP_AGE_RECIPIENTS_FILE nie istnieje/nieczytelny: $BACKUP_AGE_RECIPIENTS_FILE" 42
    AGE_RECIPIENT_ARGS+=( -R "$BACKUP_AGE_RECIPIENTS_FILE" )
  fi
  [[ "${#AGE_RECIPIENT_ARGS[@]}" -gt 0 ]] || backup_crypto_fail \
    "Szyfrowanie włączone, ale brak odbiorców. Ustaw BACKUP_AGE_RECIPIENTS (klucze 'age1...') lub BACKUP_AGE_RECIPIENTS_FILE. Aby świadomie WYŁĄCZYĆ (NIEZALECANE): BACKUP_ENCRYPTION_ENABLED=0." 43
}

# Szyfruje plik wejściowy → <plik>.age. Echo: ścieżka do zaszyfrowanego pliku.
# Usuwa plik źródłowy po udanym szyfrowaniu (dane w plaintext nie zostają w stagingu).
backup_crypto_encrypt_file() {
  local in_file="$1"
  [[ -f "$in_file" ]] || backup_crypto_fail "plik do zaszyfrowania nie istnieje: $in_file" 44
  backup_crypto_ensure_age
  backup_crypto_collect_recipients
  local out_file="${in_file}.age"
  local tmp="${out_file}.partial"
  if ! age --encrypt "${AGE_RECIPIENT_ARGS[@]}" -o "$tmp" "$in_file"; then
    rm -f "$tmp"
    backup_crypto_fail "szyfrowanie age nie powiodło się dla $in_file" 45
  fi
  # sanity: zaszyfrowany plik musi być niepusty i zaczynać się nagłówkiem age
  head -c 21 "$tmp" 2>/dev/null | grep -q '^age-encryption.org/v1' \
    || { rm -f "$tmp"; backup_crypto_fail "nieprawidłowy nagłówek szyfrogramu age" 46; }
  mv "$tmp" "$out_file"
  shred -u "$in_file" 2>/dev/null || rm -f "$in_file"
  printf '%s' "$out_file"
}

# Deszyfruje <plik>.age → <plik>. Echo: ścieżka do odszyfrowanego pliku.
backup_crypto_decrypt_file() {
  local in_file="$1"
  [[ -f "$in_file" ]] || backup_crypto_fail "plik do odszyfrowania nie istnieje: $in_file" 47
  backup_crypto_ensure_age
  local identity="${BACKUP_AGE_IDENTITY_FILE:?BACKUP_AGE_IDENTITY_FILE wymagany do odszyfrowania (klucz prywatny age — trzymany OFFLINE)}"
  [[ -r "$identity" ]] || backup_crypto_fail "BACKUP_AGE_IDENTITY_FILE nieczytelny: $identity" 48
  local out_file="${in_file%.age}"
  [[ "$out_file" != "$in_file" ]] || out_file="${in_file}.dec"
  local tmp="${out_file}.partial"
  if ! age --decrypt -i "$identity" -o "$tmp" "$in_file"; then
    rm -f "$tmp"
    backup_crypto_fail "deszyfrowanie age nie powiodło się (zły klucz identity?)" 49
  fi
  mv "$tmp" "$out_file"
  printf '%s' "$out_file"
}

# Liczy SHA-256 pliku i zapisuje obok jako <plik>.sha256 (format: "hash  basename").
backup_crypto_write_checksum() {
  local file="$1"
  local sum
  if command -v sha256sum >/dev/null 2>&1; then
    sum="$(sha256sum "$file" | awk '{print $1}')"
  else
    sum="$(shasum -a 256 "$file" | awk '{print $1}')"
  fi
  printf '%s  %s\n' "$sum" "$(basename "$file")" > "${file}.sha256"
  printf '%s' "$sum"
}
