#!/usr/bin/env bash
# =============================================================================
# DEPLOY-1 — interaktywne ustawienie sekretów GitHub Actions dla auto-deployu.
# Uruchom U SIEBIE (nie na serwerze): bash ops/scripts/setup-github-secrets.sh
#
# Wymaga GitHub CLI: https://cli.github.com  → `gh auth login`
# Skrypt NIE zapisuje żadnych wartości do plików — czyta je z klawiatury i od razu
# przekazuje do `gh secret set`. Sekrety wrażliwe wczytywane są bez echa (-s).
# =============================================================================
set -Eeuo pipefail

command -v gh >/dev/null || { echo "Brak GitHub CLI (gh). Zainstaluj i wykonaj: gh auth login"; exit 1; }

# Repo docelowe (np. hvln/verris). Domyślnie bieżące repo z gh.
read -rp "Repozytorium (owner/repo) [enter = bieżące]: " REPO
REPO_ARG=()
[ -n "${REPO:-}" ] && REPO_ARG=(--repo "$REPO")

set_plain() { # nazwa; wartość widoczna (host/user/port/path)
  local name="$1" val
  read -rp "  $name = " val
  if [ -n "$val" ]; then printf '%s' "$val" | gh secret set "$name" "${REPO_ARG[@]}"; echo "  ✓ $name ustawione"; fi
}
set_secret() { # nazwa; wartość ukryta (token)
  local name="$1" val
  read -rsp "  $name (ukryte) = " val; echo
  if [ -n "$val" ]; then printf '%s' "$val" | gh secret set "$name" "${REPO_ARG[@]}"; echo "  ✓ $name ustawione"; fi
}
set_file() { # nazwa; ścieżka do pliku (klucz prywatny)
  local name="$1" path
  read -rp "  $name — ścieżka do pliku klucza [np. ~/.ssh/verris_deploy] = " path
  path="${path/#\~/$HOME}"
  if [ -n "$path" ] && [ -f "$path" ]; then gh secret set "$name" "${REPO_ARG[@]}" < "$path"; echo "  ✓ $name ustawione z $path"; else echo "  ! pominięto (brak pliku)"; fi
}

echo "== Ustawianie sekretów deployu =="
set_plain  DEPLOY_SSH_HOST
set_plain  DEPLOY_SSH_USER
set_plain  DEPLOY_SSH_PORT
set_plain  DEPLOY_PATH
set_file   DEPLOY_SSH_KEY
set_secret GHCR_PULL_TOKEN

echo
echo "Gotowe. Sprawdź: gh secret list ${REPO:+--repo $REPO}"
echo "Pamiętaj o .env.prod na serwerze: REGISTRY_PREFIX=ghcr.io/<owner-małymi-literami>"
