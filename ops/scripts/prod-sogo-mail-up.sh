#!/usr/bin/env bash
# Start SOGo stack (Docker) on control-plane host.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
ENV_FILE=ops/sogo/.env.sogo
RUNTIME_DIR=ops/sogo/runtime
TEMPLATE=ops/sogo/conf.d/database.yaml.template
AUTH_TEMPLATE=ops/sogo/conf.d/auth.yaml.template

if [[ ! -f "${ENV_FILE}" ]]; then
  SOGO_DB_PASSWORD="$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)"
  SOGO_DB_ROOT_PASSWORD="$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)"
  cat >"${ENV_FILE}" <<EOF
SOGO_DB_PASSWORD=${SOGO_DB_PASSWORD}
SOGO_DB_ROOT_PASSWORD=${SOGO_DB_ROOT_PASSWORD}
EOF
  chmod 600 "${ENV_FILE}"
  echo "[sogo-up] Created ${ENV_FILE}"
fi
# shellcheck disable=SC1090
source "${ENV_FILE}"

mkdir -p "${RUNTIME_DIR}"
cp ops/sogo/conf.d/mail.yaml "${RUNTIME_DIR}/mail.yaml"
sed "s/PLACEHOLDER/${SOGO_DB_PASSWORD}/g" "${TEMPLATE}" >"${RUNTIME_DIR}/database.yaml"
sed "s/PLACEHOLDER/${SOGO_DB_PASSWORD}/g" "${AUTH_TEMPLATE}" >"${RUNTIME_DIR}/auth.yaml"
chmod 600 "${RUNTIME_DIR}/database.yaml" "${RUNTIME_DIR}/auth.yaml"
export SOGO_DB_PASSWORD SOGO_DB_ROOT_PASSWORD

docker compose -f ops/docker-compose.sogo-mail.yml --env-file "${ENV_FILE}" up -d
echo "[sogo-up] SOGo container ops-sogo-1 — ensure Caddy CADDY_MAIL_DOMAIN=mail.verris.pl is deployed"
