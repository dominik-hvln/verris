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

resolve_src_dir() {
  if [ -n "${VERRIS_DEFAULT_PAGE_SRC:-}" ] && [ -f "${VERRIS_DEFAULT_PAGE_SRC}/index.html" ]; then
    echo "${VERRIS_DEFAULT_PAGE_SRC}"
    return 0
  fi
  if [ -f "${SCRIPT_DIR}/hosting-default-page/index.html" ]; then
    echo "${SCRIPT_DIR}/hosting-default-page"
    return 0
  fi
  if [ -f "/var/lib/verris/hosting-default-page/index.html" ]; then
    echo "/var/lib/verris/hosting-default-page"
    return 0
  fi
  local repo_root
  repo_root="$(cd "${SCRIPT_DIR}/../.." && pwd)"
  if [ -f "${repo_root}/ops/hosting-default-page/index.html" ]; then
    echo "${repo_root}/ops/hosting-default-page"
    return 0
  fi
  return 1
}

SRC_DIR="$(resolve_src_dir || true)"

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

is_verris_unhydrated_index() {
  local file="$1"
  [ -f "$file" ] || return 1
  grep -q '|DOMAIN|' "$file" 2>/dev/null && grep -qi 'witamy na stronie' "$file" 2>/dev/null
}

is_verris_hosting_index() {
  local file="$1"
  [ -f "$file" ] || return 1
  grep -qi 'witamy na stronie' "$file" 2>/dev/null && grep -qi 'hosting verris' "$file" 2>/dev/null
}

should_replace_index() {
  is_stock_index "$1" || is_verris_unhydrated_index "$1" || is_verris_hosting_index "$1"
}

cleanup_public_html_artifacts() {
  local pub_dir="$1"
  find "${pub_dir}" -name '._*' -delete 2>/dev/null || true
  find "${pub_dir}" -name '.DS_Store' -delete 2>/dev/null || true
}

fix_public_html_permissions() {
  local pub_dir="$1"
  local user="$2"
  local idx="${pub_dir}/index.html"

  chmod 755 "${pub_dir}" 2>/dev/null || true
  [ -d "${pub_dir}/assets" ] && chmod 755 "${pub_dir}/assets"
  [ -f "$idx" ] && chmod 644 "$idx"
  if [ -d "${pub_dir}/assets" ]; then
    find "${pub_dir}/assets" -type f -exec chmod 644 {} \;
    find "${pub_dir}/assets" -type d -exec chmod 755 {} \;
  fi
  if [ -n "$user" ] && id "$user" &>/dev/null; then
    chown -R "${user}:${user}" "${pub_dir}"
  fi
}

parse_public_html_context() {
  local pub_dir="$1"
  PUBLIC_HTML_USER="$(sed -n 's#^/home/\([^/]*\)/domains/\([^/]*\)/public_html$#\1#p' <<<"$pub_dir")"
  PUBLIC_HTML_DOMAIN="$(sed -n 's#^/home/\([^/]*\)/domains/\([^/]*\)/public_html$#\2#p' <<<"$pub_dir")"
}

format_date_created() {
  local raw="$1"
  if [ -z "$raw" ]; then
    echo "—"
    return 0
  fi
  if formatted="$(date -d "$raw" +"%d.%m.%Y" 2>/dev/null)"; then
    echo "$formatted"
  else
    echo "$raw"
  fi
}

read_da_tokens() {
  local user="$1"
  local domain="$2"
  local user_conf="/usr/local/directadmin/data/users/${user}/user.conf"
  local domain_conf="/usr/local/directadmin/data/users/${user}/domains/${domain}.conf"

  DA_TOKEN_USERNAME="$user"
  DA_TOKEN_DOMAIN="$domain"
  DA_TOKEN_DATE_CREATED="$(format_date_created "$(grep -m1 '^date_created=' "$user_conf" 2>/dev/null | cut -d= -f2- || true)")"
  DA_TOKEN_IP="$(grep -m1 '^ip=' "$domain_conf" 2>/dev/null | cut -d= -f2- || true)"
  if [ -z "$DA_TOKEN_IP" ]; then
    DA_TOKEN_IP="$(grep -m1 '^ip=' "$user_conf" 2>/dev/null | cut -d= -f2- || true)"
  fi
  if [ -z "$DA_TOKEN_IP" ]; then
    DA_TOKEN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
}

hydrate_index_tokens() {
  local index_file="$1"
  local user="$2"
  local domain="$3"
  [ -f "$index_file" ] || return 1

  read_da_tokens "$user" "$domain"
  local tmp
  tmp="$(mktemp)"
  sed \
    -e "s/|DOMAIN|/${DA_TOKEN_DOMAIN}/g" \
    -e "s/|USERNAME|/${DA_TOKEN_USERNAME}/g" \
    -e "s/|DATECREATED|/${DA_TOKEN_DATE_CREATED}/g" \
    -e "s/|IP|/${DA_TOKEN_IP}/g" \
    "$index_file" >"$tmp"
  mv "$tmp" "$index_file"
  chmod 644 "$index_file"
}

deploy_public_html() {
  local pub_dir="$1"
  local idx="${pub_dir}/index.html"

  if [ "$DRY_RUN" = "1" ]; then
    parse_public_html_context "$pub_dir"
    log "DRY-RUN: rsync + tokeny -> ${pub_dir} (${PUBLIC_HTML_DOMAIN:-?})"
    return 0
  fi

  rsync -a "${SRC_DIR}/" "${pub_dir}/"
  cleanup_public_html_artifacts "${pub_dir}"
  parse_public_html_context "$pub_dir"
  if [ -n "${PUBLIC_HTML_USER:-}" ] && [ -n "${PUBLIC_HTML_DOMAIN:-}" ]; then
    hydrate_index_tokens "$idx" "$PUBLIC_HTML_USER" "$PUBLIC_HTML_DOMAIN"
    read_da_tokens "$PUBLIC_HTML_USER" "$PUBLIC_HTML_DOMAIN"
    log "Tokeny: ${PUBLIC_HTML_DOMAIN} / ${PUBLIC_HTML_USER} / ${DA_TOKEN_DATE_CREATED} / ${DA_TOKEN_IP}"
  else
    log "WARN: nie udało się odczytać user/domeny z ${pub_dir} — tokeny bez zmian"
  fi

  fix_public_html_permissions "${pub_dir}" "${PUBLIC_HTML_USER:-}"
  log "Podmieniono: ${pub_dir}"
}

replace_existing_public_html() {
  if [ "$REPLACE_EXISTING" != "1" ]; then
    return 0
  fi

  log "Szukam public_html/index.html ze stockową lub nieuzupełnioną stroną Verris…"
  local count=0
  while IFS= read -r -d '' idx; do
    if should_replace_index "$idx"; then
      deploy_public_html "$(dirname "$idx")"
      count=$((count + 1))
    fi
  done < <(find /home -path '*/domains/*/public_html/index.html' -print0 2>/dev/null)

  log "Zaktualizowano (lub zaplanowano) ${count} katalogów public_html"
}

require_root

if [ -z "${SRC_DIR}" ] || [ ! -f "${SRC_DIR}/index.html" ]; then
  echo "Brak ops/hosting-default-page/index.html (repo, VERRIS_DEFAULT_PAGE_SRC lub ${SCRIPT_DIR}/hosting-default-page/)." >&2
  exit 1
fi

log "Źródło: ${SRC_DIR}"
install_da_templates
install_reseller_default
replace_existing_public_html

log "Gotowe. Nowe domeny od ${RESELLER} dostaną stronę Verris (tokeny |DOMAIN| itd.)."
log "Istniejące domeny: uruchom z --replace-existing."
echo "[VERRIS_DEFAULT_PAGE] status=installed reseller=${RESELLER} src=${SRC_DIR}"
