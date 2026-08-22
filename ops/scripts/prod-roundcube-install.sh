#!/usr/bin/env bash
#
# prod-roundcube-install.sh — Verris custom-branded Roundcube webmail (P-1).
#
# Installs Roundcube on a mail node and points it at the local Dovecot (IMAP)
# and Postfix (SMTP submission) that already serve customer mailboxes. Applies
# Verris branding (product name, colours, logo, login byline) on top of the
# Elastic skin, and publishes it over TLS behind nginx at the webmail host.
#
# Idempotent: re-running upgrades config/branding without dropping the DB.
#
# Env (override inline):
#   WEBMAIL_HOST   FQDN for webmail            (default: webmail.verris.pl)
#   RC_VERSION     Roundcube version           (default: 1.6.9)
#   IMAP_HOST      IMAP backend                (default: localhost / 993 TLS)
#   SMTP_HOST      submission backend          (default: localhost / 587 STARTTLS)
#   RC_DB_PASS     DB password for roundcube   (required on first run)
#   BRAND_NAME     product name in UI          (default: Verris Poczta)
#   BRAND_LOGO_URL optional https logo URL     (default: none -> text logo)
#   ADMIN_EMAIL    support address in footer   (default: pomoc@verris.pl)
#
# Usage: sudo WEBMAIL_HOST=webmail.verris.pl RC_DB_PASS=... ./prod-roundcube-install.sh
set -euo pipefail

WEBMAIL_HOST="${WEBMAIL_HOST:-webmail.verris.pl}"
RC_VERSION="${RC_VERSION:-1.6.9}"
IMAP_HOST="${IMAP_HOST:-localhost}"
SMTP_HOST="${SMTP_HOST:-localhost}"
BRAND_NAME="${BRAND_NAME:-Verris Poczta}"
BRAND_LOGO_URL="${BRAND_LOGO_URL:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-pomoc@verris.pl}"
RC_DIR="/var/www/roundcube"
RC_DB_NAME="roundcube"
RC_DB_USER="roundcube"

log() { echo "[$(date -u +%FT%TZ)] $*"; }
die() { echo "[FAIL] $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "uruchom jako root"

# --- packages ---------------------------------------------------------------
install_packages() {
  log "instaluję zależności (php, nginx, mariadb-client)"
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y nginx php-fpm php-mysqlnd php-mbstring php-xml php-intl \
      php-gd php-zip php-json php-ldap mariadb wget tar >/dev/null
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update >/dev/null
    apt-get install -y nginx php-fpm php-mysql php-mbstring php-xml php-intl \
      php-gd php-zip php-ldap default-mysql-client wget tar >/dev/null
  else
    die "nieobsługiwany menedżer pakietów"
  fi
}

# --- download + DB ----------------------------------------------------------
fetch_roundcube() {
  if [ -f "$RC_DIR/index.php" ] && [ -f "$RC_DIR/.verris-version" ] \
     && [ "$(cat "$RC_DIR/.verris-version")" = "$RC_VERSION" ]; then
    log "Roundcube $RC_VERSION już wgrany — pomijam pobieranie"
    return
  fi
  local tmp; tmp=$(mktemp -d)
  local url="https://github.com/roundcube/roundcubemail/releases/download/${RC_VERSION}/roundcubemail-${RC_VERSION}-complete.tar.gz"
  log "pobieram $url"
  wget -qO "$tmp/rc.tgz" "$url" || die "pobranie Roundcube nie powiodło się"
  mkdir -p "$RC_DIR"
  tar xzf "$tmp/rc.tgz" -C "$tmp"
  cp -a "$tmp/roundcubemail-${RC_VERSION}/." "$RC_DIR/"
  echo "$RC_VERSION" > "$RC_DIR/.verris-version"
  rm -rf "$tmp"
  ( cd "$RC_DIR" && [ -f composer.json ] && command -v composer >/dev/null 2>&1 && composer install --no-dev -q || true )
  chown -R www-data:www-data "$RC_DIR" 2>/dev/null || chown -R nginx:nginx "$RC_DIR" 2>/dev/null || true
}

ensure_db() {
  [ -n "${RC_DB_PASS:-}" ] || die "ustaw RC_DB_PASS (hasło bazy roundcube)"
  log "konfiguruję bazę $RC_DB_NAME"
  mysql --protocol=socket <<SQL
CREATE DATABASE IF NOT EXISTS \`${RC_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER IF NOT EXISTS '${RC_DB_USER}'@'localhost' IDENTIFIED BY '${RC_DB_PASS}';
ALTER USER '${RC_DB_USER}'@'localhost' IDENTIFIED BY '${RC_DB_PASS}';
GRANT ALL PRIVILEGES ON \`${RC_DB_NAME}\`.* TO '${RC_DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
  # Import schema only if the DB has no tables yet.
  local tables; tables=$(mysql --protocol=socket -N -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${RC_DB_NAME}';")
  if [ "${tables:-0}" -eq 0 ] && [ -f "$RC_DIR/SQL/mysql.initial.sql" ]; then
    log "importuję schemat Roundcube"
    mysql --protocol=socket "$RC_DB_NAME" < "$RC_DIR/SQL/mysql.initial.sql"
  fi
}

# --- config -----------------------------------------------------------------
write_config() {
  log "zapisuję config/config.inc.php"
  local des_key; des_key=$(openssl rand -base64 24 | tr -d '\n' | cut -c1-24)
  install -d -m 0750 "$RC_DIR/config"
  cat > "$RC_DIR/config/config.inc.php" <<PHP
<?php
\$config = [];
\$config['db_dsnw'] = 'mysql://${RC_DB_USER}:${RC_DB_PASS}@localhost/${RC_DB_NAME}';

// Local mail backends (Dovecot IMAPS / Postfix submission).
\$config['imap_host'] = 'ssl://${IMAP_HOST}:993';
\$config['smtp_host'] = 'tls://${SMTP_HOST}:587';
\$config['smtp_user'] = '%u';
\$config['smtp_pass'] = '%p';

\$config['support_url'] = 'mailto:${ADMIN_EMAIL}';
\$config['des_key'] = '${des_key}';
\$config['cipher_method'] = 'AES-256-CBC';
\$config['session_lifetime'] = 30;
\$config['skin'] = 'verris';
\$config['product_name'] = '${BRAND_NAME}';
\$config['enable_installer'] = false;
\$config['plugins'] = ['archive', 'zipdownload', 'managesieve', 'newmail_notifier'];
\$config['mime_param_folding'] = 1;
\$config['smtp_conn_options'] = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]];
\$config['imap_conn_options'] = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]];
PHP
  chown -R www-data:www-data "$RC_DIR/config" 2>/dev/null || chown -R nginx:nginx "$RC_DIR/config" 2>/dev/null || true
  chmod 0640 "$RC_DIR/config/config.inc.php"
}

# --- branding (verris skin extends elastic) ---------------------------------
write_skin() {
  log "stosuję branding ($BRAND_NAME)"
  local skin="$RC_DIR/skins/verris"
  rm -rf "$skin"; mkdir -p "$skin"
  cat > "$skin/meta.json" <<JSON
{ "name": "verris", "extends": "elastic", "author": "Verris", "license": "proprietary" }
JSON
  # Brand colours + login header. Elastic reads styles.less / additional CSS.
  cat > "$skin/styles.css" <<CSS
:root{
  --color-main:#10b981;          /* emerald */
  --color-main-dark:#059669;
  --color-link:#10b981;
}
.login-form .logo, #layout-content .formcontent .logo{margin-bottom:1rem}
.brand-name{font-weight:800;font-size:1.4rem;color:#10b981;text-align:center;letter-spacing:.02em}
.brand-byline{color:#6b7280;font-size:.8rem;text-align:center;margin-top:.25rem}
#layout-sidebar .menu a.selected,#taskmenu a.selected{color:#10b981}
.button.btn-primary,button.btn-primary,.btn-primary{background:#10b981;border-color:#10b981}
.btn-primary:hover{background:#059669;border-color:#059669}
CSS
  # Login template override: brand block above the form.
  mkdir -p "$skin/templates"
  if [ -f "$RC_DIR/skins/elastic/templates/login.html" ]; then
    cp "$RC_DIR/skins/elastic/templates/login.html" "$skin/templates/login.html"
    local logo_html
    if [ -n "$BRAND_LOGO_URL" ]; then
      logo_html="<img src=\"${BRAND_LOGO_URL}\" alt=\"${BRAND_NAME}\" style=\"max-height:48px;margin:0 auto;display:block\">"
    else
      logo_html="<div class=\"brand-name\">${BRAND_NAME}</div>"
    fi
    # Inject brand block right after the <form ...> opening tag.
    sed -i "0,/<roundcube:form/s//${logo_html}<div class=\"brand-byline\">Bezpieczna poczta Verris<\/div><roundcube:form/" \
      "$skin/templates/login.html" || true
  fi
  chown -R www-data:www-data "$skin" 2>/dev/null || chown -R nginx:nginx "$skin" 2>/dev/null || true
}

# --- nginx vhost + TLS ------------------------------------------------------
write_vhost() {
  log "konfiguruję nginx vhost dla $WEBMAIL_HOST"
  local sock="/run/php/php-fpm.sock"
  [ -S "$sock" ] || sock=$(find /run /var/run -name 'php*-fpm.sock' 2>/dev/null | head -1 || echo "/run/php-fpm/www.sock")
  cat > "/etc/nginx/conf.d/roundcube.conf" <<NGINX
server {
  listen 80;
  server_name ${WEBMAIL_HOST};
  root ${RC_DIR};
  index index.php;

  # Block access to internal Roundcube dirs.
  location ~ ^/(config|temp|logs|SQL)/ { deny all; }
  location ~ /\.(?!well-known) { deny all; }

  location / { try_files \$uri \$uri/ /index.php?\$query_string; }
  location ~ \.php\$ {
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
    fastcgi_pass unix:${sock};
  }
  client_max_body_size 64M;
}
NGINX
  nginx -t && systemctl reload nginx
  log "TLS: uruchom certbot --nginx -d ${WEBMAIL_HOST} (lub wpnij istniejący wildcard)."
}

main() {
  install_packages
  fetch_roundcube
  ensure_db
  write_config
  write_skin
  write_vhost
  log "Roundcube gotowy na http(s)://${WEBMAIL_HOST} — ustaw WEBMAIL_URL w panelu/ENV API."
}

main "$@"
