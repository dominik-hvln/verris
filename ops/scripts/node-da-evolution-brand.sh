#!/bin/bash
# ============================================================================
# node-da-evolution-brand.sh — branding Verris dla panelu DirectAdmin (Evolution)
# ----------------------------------------------------------------------------
# Uruchamiać NA WĘŹLE jako root (konwencja bundla onboard: /root/verris/).
# Kopiuje wyłącznie elementy o UDOKUMENTOWANYCH, przeżywających update ścieżkach:
#   1) data/templates/custom/login.html            — customowa strona logowania
#   2) data/templates/custom/lost_password.html    — (opcjonalnie, --with-lost-password)
#   3) data/templates/custom/static/*              — logo/favicon (serwowane z /static/)
#   4) plugins/verris_links/*                      — pozycje menu Verris (Evolution)
# CSS panelu i menu wkleja się raz w UI (Customize Evolution Skin) — kroki
# wypisuje ten skrypt na końcu; pełny runbook: ops/docs/DA_EVOLUTION_BRANDING.md
#
# Użycie:
#   node-da-evolution-brand.sh [--src DIR] [--with-lost-password] [--dry-run] [--uninstall]
#   --src DIR   źródło artefaktu (domyślnie: /root/verris/verris-evolution,
#               fallback: katalog_skryptu/../skins/verris-evolution)
# Idempotentny: kopiuje tylko przy różnicy; poprzednie pliki backupuje z sufiksem .bak-<ts>.
# ============================================================================
set -euo pipefail

DA_ROOT="/usr/local/directadmin"
CUSTOM_DIR="$DA_ROOT/data/templates/custom"
STATIC_DIR="$CUSTOM_DIR/static"
PLUGIN_DST="$DA_ROOT/plugins/verris_links"
TS="$(date +%Y%m%d-%H%M%S)"

SRC=""
WITH_LOST_PASSWORD=0
DRY_RUN=0
UNINSTALL=0

log_ok()   { echo -e "\e[32m[OK]\e[0m $*"; }
log_info() { echo -e "\e[36m[..]\e[0m $*"; }
log_warn() { echo -e "\e[33m[!!]\e[0m $*"; }
log_err()  { echo -e "\e[31m[EE]\e[0m $*" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --src) SRC="$2"; shift 2 ;;
    --with-lost-password) WITH_LOST_PASSWORD=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) log_err "Nieznana opcja: $1"; exit 2 ;;
  esac
done

if [[ -z "$SRC" ]]; then
  if [[ -d /root/verris/verris-evolution ]]; then
    SRC=/root/verris/verris-evolution
  else
    SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../skins/verris-evolution" 2>/dev/null && pwd || true)"
  fi
fi

[[ -d "$DA_ROOT" ]] || { log_err "Brak $DA_ROOT — to nie jest węzeł DirectAdmin."; exit 1; }

run() { if [[ $DRY_RUN -eq 1 ]]; then echo "DRY-RUN: $*"; else eval "$*"; fi }

# ── Uninstall ───────────────────────────────────────────────────────────────
if [[ $UNINSTALL -eq 1 ]]; then
  log_info "Odinstalowuję branding Verris (backupy .bak-* zostają)"
  for f in "$CUSTOM_DIR/login.html" "$CUSTOM_DIR/lost_password.html"; do
    [[ -f "$f" ]] && run "mv '$f' '$f.removed-$TS'" && log_ok "Wyłączono $f"
  done
  [[ -d "$PLUGIN_DST" ]] && run "rm -rf '$PLUGIN_DST'" && log_ok "Usunięto plugin verris_links"
  log_warn "Assety w $STATIC_DIR zostawiono (współdzielone). CSS/menu wyłącz w UI."
  exit 0
fi

[[ -d "$SRC" ]] || { log_err "Brak źródła artefaktu: $SRC (skopiuj ops/skins/verris-evolution na węzeł)"; exit 1; }
log_info "Źródło artefaktu: $SRC"

install_file() { # install_file <src> <dst> [mode]
  local src="$1" dst="$2" mode="${3:-644}"
  if [[ -f "$dst" ]] && cmp -s "$src" "$dst"; then
    log_ok "Bez zmian: $dst"
    return 0
  fi
  if [[ -f "$dst" ]]; then
    run "cp -a '$dst' '$dst.bak-$TS'"
    log_info "Backup: $dst.bak-$TS"
  fi
  run "install -D -m '$mode' '$src' '$dst'"
  log_ok "Zainstalowano: $dst"
}

# ── 1) Strona logowania ─────────────────────────────────────────────────────
install_file "$SRC/templates/custom/login.html" "$CUSTOM_DIR/login.html"

# ── 2) Lost password (opcjonalnie — flow wymaga testu na węźle) ─────────────
if [[ $WITH_LOST_PASSWORD -eq 1 ]]; then
  install_file "$SRC/templates/custom/lost_password.html" "$CUSTOM_DIR/lost_password.html"
  if ! grep -q '^lost_password=1' "$DA_ROOT/conf/directadmin.conf" 2>/dev/null; then
    log_warn "directadmin.conf nie ma lost_password=1 — reset hasła nieaktywny (ustaw ręcznie po testach)."
  fi
else
  log_info "Pomijam lost_password.html (uruchom z --with-lost-password po przetestowaniu flow)."
fi

# ── 3) Assety statyczne (/static/) ──────────────────────────────────────────
for f in "$SRC"/templates/custom/static/*; do
  install_file "$f" "$STATIC_DIR/$(basename "$f")"
done

# ── 4) Plugin verris_links (pozycje menu Evolution) ─────────────────────────
if [[ $DRY_RUN -eq 1 ]]; then
  echo "DRY-RUN: rsync plugin → $PLUGIN_DST"
else
  mkdir -p "$PLUGIN_DST"
  cp -a "$SRC/plugin/verris_links/." "$PLUGIN_DST/"
  chmod 755 "$PLUGIN_DST/user/index.html"
  chown -R diradmin:diradmin "$PLUGIN_DST"
  log_ok "Plugin verris_links → $PLUGIN_DST"
fi

# ── Weryfikacja ──────────────────────────────────────────────────────────────
if [[ $DRY_RUN -eq 0 ]]; then
  log_info "Weryfikacja..."
  PORT="$(grep -oP '^port=\K[0-9]+' "$DA_ROOT/conf/directadmin.conf" 2>/dev/null || echo 2222)"
  if curl -skm 10 "https://localhost:$PORT/" | grep -q "Verris"; then
    log_ok "Strona logowania serwuje branding Verris (port $PORT)"
  else
    log_warn "Nie potwierdzono brandingu na https://localhost:$PORT/ — sprawdź ręcznie."
  fi
  if curl -skm 10 "https://localhost:$PORT/static/verris-logo-light.svg" | grep -q "<svg"; then
    log_ok "Assety /static/ dostępne"
  else
    log_warn "/static/verris-logo-light.svg niedostępny — sprawdź $STATIC_DIR"
  fi
fi

# ── Kroki ręczne (raz, w UI — zapisują się po stronie DA i przeżywają update) ─
cat <<'EOT'

────────────────────────────────────────────────────────────────────────
POZOSTAŁE KROKI (raz, w UI admina; szczegóły: ops/docs/DA_EVOLUTION_BRANDING.md):
 1. Admin Tools → Customize Evolution Skin → CSS Customizations:
    wklej zawartość ops/skins/verris-evolution/evolution/custom.css
 2. → Theme Colors / Main Colors: wartości z tabeli w runbooku (Pine+Mint)
 3. → Logos: verris-logo-light/dark.svg + favicon.svg (assets/)
 4. → Help Links: zamień evo.site-helper.com na https://verris.pl/pomoc
 5. → Menu Customizations (poziom User): uproszczenie wg runbooka
       (ukryj/przenieś zaawansowane, kolejność: WWW → Poczta → Dane)
 6. Po zapisie: znajdź pliki, w których DA utrwalił ustawienia
    (diff w /usr/local/directadmin/data/) i dopisz je do dystrybucji —
    wtedy kroki 1–5 też zautomatyzujemy.
────────────────────────────────────────────────────────────────────────
EOT
log_ok "Gotowe."
