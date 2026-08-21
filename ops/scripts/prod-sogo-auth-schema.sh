#!/usr/bin/env bash
# Apply SOGo web-auth table on existing MariaDB (initdb only runs on fresh volume).
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
ENV_FILE=ops/sogo/.env.sogo
[[ -f "${ENV_FILE}" ]] || { echo "Missing ${ENV_FILE} — run prod-sogo-mail-up.sh first"; exit 1; }
# shellcheck disable=SC1090
source "${ENV_FILE}"
export SOGO_DB_PASSWORD SOGO_DB_ROOT_PASSWORD

docker compose -f ops/docker-compose.sogo-mail.yml --env-file "${ENV_FILE}" exec -T sogo-db \
  mariadb -u sogo -p"${SOGO_DB_PASSWORD}" sogo <ops/sogo/init/01-sogo-mail-auth.sql
echo "[sogo-auth-schema] sogo_mail_auth + sogo_auth_view ready"
