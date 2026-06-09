#!/usr/bin/env bash
# Instaluje szablon domyślnej strony Verris dla nowych domen/kont DirectAdmin.
# Uruchom na węźle jako root (np. po node-hosting-profile lub osobno).
#
# Opcje:
#   --dry-run              tylko wypisz plan
#   --reseller NAME        reseller tworzący konta (domyślnie: admin)
#   --replace-existing     podmień index.html w public_html, jeśli wygląda na stock DA / stary Verris
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SRC_DIR="${REPO_ROOT}/ops/hosting-default-page"

DRY_RUN=0
RESELLER="admin"
REPLACE_EXISTING=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --reseller) RESELLER="${2:-admin}"; shift 2 ;;
    --reseller=*) RESELLER="${1#*=}"; shift ;;
    --replace-existing) REPLACE_EXISTING=1; shift ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *) echo "Nieznana opcja: $1" >&2; exit 2 ;;
  esac
done

log() { echo "[verris-default-page] $*"; }

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Uruchom jako root na węźle DirectAdmin." >&2
    exit 1
  fi
}

install_to_dir() {
  local dest_dir="$1"
  local label="$2"

  if [ ! -f "${SRC_DIR}/index.html" ]; then
    echo "Brak pliku źródłowego: ${SRC_DIR}/index.html" >&2
    exit 1
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log "DRY-RUN: rsync ${SRC_DIR}/ -> ${dest_dir}/ (${label})"
    return 0
  fi

  mkdir -p "${dest_dir}"
  rsync -a --delete "${SRC_DIR}/" "${dest_dir}/"
  chmod -R a+rX "${dest_dir}"
  chmod 755 "${dest_dir}/index.html"
  if id "${RESELLER}" &>/dev/null; then
    chown -R "${RESELLER}:${RESELLER}" "${dest_dir}" 2>/dev/null || true
  fi
  log "OK: ${label} -> ${dest_dir}/"
}

install_da_templates() {
  install_to_dir "/usr/local/directadmin/data/templates/custom/default" "DA templates/custom/default"
}

install_reseller_default() {
  install_to_dir "/home/${RESELLER}/domains/default" "reseller ${RESELLER} domains/default"
}

is_stock_index() {
  local file="$1"
  [ -f "$file" ] || return 1
  grep -qiE 'directadmin|Something amazing will be constructed|layers.*l10 5|#10b981|#10B981' "$file" 2>/dev/null
}

replace_existing_public_html() {
  if [ "$REPLACE_EXISTING" != "1" ]; then
    return 0
  fi

  log "Szukam public_html/index.html ze stockową lub starą stroną…"
  local count=0
  while IFS= read -r -d '' idx; do
    if is_stock_index "$idx"; then
      local pub_dir
      pub_dir="$(dirname "$idx")"
      if [ "$DRY_RUN" = "1" ]; then
        log "DRY-RUN: rsync do ${pub_dir}"
      else
        rsync -a "${SRC_DIR}/" "${pub_dir}/"
        chmod -R a+rX "${pub_dir}"
        local user
        user="$(stat -c '%U' "$(dirname "$(dirname "$pub_dir")")" 2>/dev/null || echo "")"
        if [ -n "$user" ] && id "$user" &>/dev/null; then
          chown -R "$user:$user" "${pub_dir}/index.html" "${pub_dir}/assets" 2>/dev/null || true
        fi
        log "Podmieniono: ${pub_dir}"
      fi
      count=$((count + 1))
    fi
  done < <(find /home -path '*/domains/*/public_html/index.html' -print0 2>/dev/null)

  log "Zaktualizowano (lub zaplanowano) ${count} katalogów public_html"
}

require_root

if [ ! -f "${SRC_DIR}/index.html" ]; then
  echo "Uruchom z katalogu repozytorium ekohost (brak ops/hosting-default-page/index.html)." >&2
  exit 1
fi

log "Źródło: ${SRC_DIR}"
install_da_templates
install_reseller_default
replace_existing_public_html

log "Gotowe. Nowe domeny od ${RESELLER} dostaną stronę Verris (tokeny |DOMAIN| itd.)."
log "Istniejące domeny: uruchom z --replace-existing."
