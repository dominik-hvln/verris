#!/usr/bin/env bash
# =============================================================================
# Miejsce na dysku control-plane — JEDNO miejsce dla:
#   · retencji kopii lokalnych w /var/lib/verris/backups (przytnij_kopie_lokalne),
#   · decyzji „czy robić kopię Grafany" (kopia_grafany_potrzebna + odcisk),
#   · strażnika wolnego miejsca przed pobieraniem obrazów (zapewnij_miejsce_przed_pobraniem),
#   · plików hosta: limit journald + systemd-tmpfiles dla /tmp/verris-*-staging
#     (zainstaluj_pliki_hosta_dysku).
#
# Incydent 10.11.2026: dysk panelu (75 GB) zapełniony w 99%. Główne przyczyny:
#   1. prod-deploy-ghcr.sh robił przy KAŻDYM deployu kopię danych Grafany
#      (~180 MB) i nigdy jej nie usuwał — 217 kopii = 34 GB;
#   2. dziennik systemd 3,7 GB (limit był tylko ręcznie na serwerze);
#   3. ~3 GB nieużywanych obrazów.
# Kopia Grafany ma sens tylko przy zmianie wersji obrazu albo konfiguracji (cofnięcie
# aktualizacji Grafany 13, PB-38), więc teraz powstaje wyłącznie wtedy, a stare kopie
# są przycinane na końcu każdego skryptu, który je tworzy.
#
# Użycie jako biblioteka (skrypty prod-*):
#   . ops/scripts/lib/miejsce-na-dysku.sh
# albo wprost na serwerze:
#   sudo bash ops/scripts/lib/miejsce-na-dysku.sh zainstaluj   # journald + tmpfiles (idempotentnie)
#   sudo bash ops/scripts/lib/miejsce-na-dysku.sh przytnij     # retencja kopii lokalnych
#   sudo bash ops/scripts/lib/miejsce-na-dysku.sh stan         # co zajmuje miejsce
#
# Funkcje są „best effort" tam, gdzie chodzi o sprzątanie (nigdy nie przerywają deployu);
# jedyna, która może zwrócić błąd z intencją zatrzymania, to strażnik wolnego miejsca.
# Test: apps/api/src/test/miejsce-na-dysku.spec.ts (uruchamia te funkcje w bashu).
# =============================================================================

_md_log() { printf '[dysk] %s\n' "$*"; }

# -----------------------------------------------------------------------------
# Retencja kopii lokalnych.
#   grafana-RRRRMMDD-GGMMSS.tgz — zostają KOPIE_GRAFANA_ZOSTAW (3) najnowsze;
#   infra-RRRRMMDD-GGMMSS/      — usuwane WYŁĄCZNIE, gdy są poza KOPIE_INFRA_ZOSTAW (2)
#                                 najnowszymi I starsze niż KOPIE_INFRA_MIN_DNI (30) dni.
# „Najnowsze" i „wiek" liczone z NAZWY (znacznik czasu nadany przy tworzeniu), nie z mtime —
# shred w środku katalogu albo kopiowanie zmieniają mtime, nazwa się nie zmienia.
# Nazwy spoza wzorca nie są ruszane nigdy (cudze pliki, ręczne kopie).
# Zrzuty baz w infra-* (dane osobowe) są niszczone shred przed usunięciem katalogu.
# -----------------------------------------------------------------------------
przytnij_kopie_lokalne() {
  local kat="${1:-${VERRIS_LOCAL_BACKUP_DIR:-/var/lib/verris/backups}}"
  local zostaw_g="${KOPIE_GRAFANA_ZOSTAW:-3}"
  local zostaw_i="${KOPIE_INFRA_ZOSTAW:-2}"
  local min_dni="${KOPIE_INFRA_MIN_DNI:-30}"
  local teraz="${PRZYTNIJ_TERAZ:-$(date +%s)}"
  local granica nazwa sciezka n

  case "$kat" in
    /?*) ;;
    *) _md_log "przycinanie pominięte: '$kat' to nie ścieżka absolutna"; return 0 ;;
  esac
  if [ ! -d "$kat" ] || [ -L "$kat" ]; then return 0; fi

  n=0
  while IFS= read -r nazwa; do
    [ -n "$nazwa" ] || continue
    n=$((n + 1))
    [ "$n" -le "$zostaw_g" ] && continue
    sciezka="$kat/$nazwa"
    if [ -f "$sciezka" ] && [ ! -L "$sciezka" ]; then
      rm -f -- "$sciezka" && _md_log "usunięto starą kopię Grafany: $nazwa"
    fi
  done < <(_md_nazwy "$kat" '^grafana-[0-9]{8}-[0-9]{6}\.tgz$')

  # Niedokończone kopie Grafany (przerwany deploy) — starsze niż godzina.
  find "$kat" -maxdepth 1 -type f -name 'grafana-*.tgz.partial' -mmin +60 -delete 2>/dev/null || true

  granica="$(date -d "@$((teraz - min_dni * 86400))" +%Y%m%d-%H%M%S)"
  n=0
  while IFS= read -r nazwa; do
    [ -n "$nazwa" ] || continue
    n=$((n + 1))
    [ "$n" -le "$zostaw_i" ] && continue
    [[ "${nazwa#infra-}" < "$granica" ]] || continue
    sciezka="$kat/$nazwa"
    if [ -d "$sciezka" ] && [ ! -L "$sciezka" ]; then
      find "$sciezka" -type f \( -name '*.dump' -o -name 'role.sql' \) -exec shred -u {} + 2>/dev/null || true
      rm -rf -- "$sciezka" && _md_log "usunięto stary katalog zrzutów: $nazwa"
    fi
  done < <(_md_nazwy "$kat" '^infra-[0-9]{8}-[0-9]{6}$')
  return 0
}

# Nazwy wpisów katalogu pasujące do wzorca (ERE), od najnowszej (znacznik czasu w nazwie).
_md_nazwy() {
  local kat="$1" wzorzec="$2" p n
  for p in "$kat"/* ; do
    [ -e "$p" ] || continue
    n="${p##*/}"
    [[ "$n" =~ $wzorzec ]] && printf '%s\n' "$n"
  done | sort -r
}

# Ustawia pułapkę EXIT: przycięcie kopii na końcu skryptu, także po błędzie.
# Kod wyjścia skryptu zostaje zachowany; przycinanie nigdy go nie zmienia.
przytnij_kopie_przy_wyjsciu() {
  _MD_KAT_KOPII="${1:-${VERRIS_LOCAL_BACKUP_DIR:-/var/lib/verris/backups}}"
  trap _md_przy_wyjsciu EXIT
}
_md_przy_wyjsciu() {
  local rc=$?
  przytnij_kopie_lokalne "$_MD_KAT_KOPII" || true
  exit "$rc"
}

# -----------------------------------------------------------------------------
# Kopia Grafany tylko przy zmianie obrazu albo konfiguracji.
# -----------------------------------------------------------------------------

# Obraz usługi wprost z pliku compose (bez dockera — da się to sprawdzić testem).
# Pusty wynik = nie wiadomo → kopia_grafany_potrzebna odpowie „tak".
obraz_uslugi_z_compose() {
  local plik="$1" usluga="$2"
  [ -r "$plik" ] || return 0
  awk -v naglowek="  ${usluga}:" '
    $0 == naglowek { w = 1; next }
    w && /^  [^ #]/ { exit }
    w && /^    image:/ { sub(/^    image:[ \t]*/, ""); gsub(/["\047]/, ""); sub(/[ \t]+#.*$/, ""); print; exit }
  ' "$plik"
}

# Odcisk = obraz (tag) + skrót plików konfiguracji. Pusty obraz → pusty odcisk.
odcisk_grafany() {
  local obraz="$1" skrot
  shift
  [ -n "$obraz" ] || return 0
  skrot="$(cat -- "$@" 2>/dev/null | sha256sum | awk '{print substr($1, 1, 16)}')" || true
  printf 'obraz=%s konfiguracja=%s\n' "$obraz" "$skrot"
}

# 0 = zrób kopię, 1 = pomiń. Kopia jest potrzebna, gdy: odcisk nieznany, brak
# jakiejkolwiek kopii w katalogu, albo odcisk różni się od zapisanego przy ostatniej kopii.
kopia_grafany_potrzebna() {
  local kat="$1" odcisk="$2" plik
  [ -n "$odcisk" ] || return 0
  local jest=0
  for plik in "$kat"/grafana-*.tgz; do
    [ -f "$plik" ] && { jest=1; break; }
  done
  [ "$jest" = "1" ] || return 0
  [ "$(cat "$kat/.grafana-odcisk" 2>/dev/null)" = "$odcisk" ] && return 1
  return 0
}

zapisz_odcisk_grafany() {
  local kat="$1" odcisk="$2"
  [ -n "$odcisk" ] || return 0
  printf '%s\n' "$odcisk" > "$kat/.grafana-odcisk.tmp" && mv -f "$kat/.grafana-odcisk.tmp" "$kat/.grafana-odcisk"
}

# -----------------------------------------------------------------------------
# Strażnik wolnego miejsca przed pobieraniem/budowaniem obrazów.
#   wolne ≥ DEPLOY_WOLNE_MIN_GB (5)  → nic;
#   mniej                              → prune obrazów i cache budowania, przycięcie kopii,
#                                        odchudzenie dziennika systemd;
#   dalej < DEPLOY_WOLNE_STOP_GB (3)  → zwraca 1 z czytelnym komunikatem (deploy przerywa,
#                                        zanim `pull` zapełni dysk w połowie).
# Nieczytelny wynik `df` nie blokuje deployu (ostrzeżenie) — strażnik nie może sam
# stać się przyczyną awarii.
# -----------------------------------------------------------------------------
wolne_mb() {
  # Tylko liczba: awk zamieniłby nieczytelne pole na 0, a „0 MB wolnego" zatrzymałoby deploy.
  df -Pk -- "${1:-/}" 2>/dev/null | awk 'NR == 2 && $4 ~ /^[0-9]+$/ { print int($4 / 1024) }'
}

_md_gb() { awk -v m="$1" 'BEGIN { printf "%.1f", m / 1024 }'; }

zapewnij_miejsce_przed_pobraniem() {
  local kat_kopii="${1:-${VERRIS_LOCAL_BACKUP_DIR:-/var/lib/verris/backups}}"
  local sciezka="${DEPLOY_DYSK_SCIEZKA:-/}"
  local min_gb="${DEPLOY_WOLNE_MIN_GB:-5}" stop_gb="${DEPLOY_WOLNE_STOP_GB:-3}"
  local wolne

  wolne="$(wolne_mb "$sciezka")" || true
  if ! [[ "$wolne" =~ ^[0-9]+$ ]]; then
    _md_log "UWAGA: nie umiem odczytać wolnego miejsca na $sciezka — strażnik pominięty."
    return 0
  fi
  _md_log "wolne na $sciezka: $(_md_gb "$wolne") GB (próg sprzątania ${min_gb} GB, próg zatrzymania ${stop_gb} GB)"
  [ "$wolne" -ge $((min_gb * 1024)) ] && return 0

  _md_log "mniej niż ${min_gb} GB — sprzątam przed pobraniem obrazów…"
  docker image prune -af >/dev/null 2>&1 || true
  docker builder prune -af >/dev/null 2>&1 || true
  przytnij_kopie_lokalne "$kat_kopii" || true
  if command -v journalctl >/dev/null 2>&1; then
    journalctl --vacuum-size="${DYSK_DZIENNIK_LIMIT:-500M}" >/dev/null 2>&1 || true
  fi

  wolne="$(wolne_mb "$sciezka")" || true
  if ! [[ "$wolne" =~ ^[0-9]+$ ]]; then
    _md_log "UWAGA: nie umiem odczytać wolnego miejsca po sprzątaniu — strażnik pominięty."
    return 0
  fi
  _md_log "po sprzątaniu wolne: $(_md_gb "$wolne") GB"
  if [ "$wolne" -lt $((stop_gb * 1024)) ]; then
    {
      echo "[dysk] STOP: na $sciezka zostało $(_md_gb "$wolne") GB (< ${stop_gb} GB) mimo sprzątania."
      echo "[dysk]       Przerywam PRZED pobieraniem obrazów — pull zapełniłby dysk w połowie,"
      echo "[dysk]       a działająca wersja zostaje nietknięta."
      echo "[dysk]       Diagnoza:  sudo bash ops/scripts/lib/miejsce-na-dysku.sh stan"
      echo "[dysk]       (df -h /; du -xsh /var/lib/verris/backups /var/lib/containerd /var/lib/docker /var/log/journal /tmp;"
      echo "[dysk]        docker system df -v). Po zwolnieniu miejsca ponów deploy. Opis: DEPLOY.md, sekcja Miejsce na dysku."
    } >&2
    return 1
  fi
  return 0
}

# -----------------------------------------------------------------------------
# Pliki hosta (wersjonowane w repo, instalowane idempotentnie):
#   ops/systemd/journald-verris-limit.conf → /etc/systemd/journald.conf.d/verris-limit.conf
#   ops/systemd/tmpfiles-verris.conf       → /etc/tmpfiles.d/verris.conf
# Ta sama nazwa pliku journald co ręcznie założona 10.11 — instalacja ją zastępuje, nie dubluje.
# Restart journald i vacuum tylko wtedy, gdy plik się zmienił (czyli raz).
# Bez roota: tylko podpowiedź (deploy idzie dalej).
# VERRIS_ETC_ROOT — katalog zamiast /etc (testy).
# -----------------------------------------------------------------------------
_md_zainstaluj_plik() { # źródło cel → 0 = zainstalowano (zmiana), 1 = bez zmian albo błąd
  local zrodlo="$1" cel="$2"
  [ -r "$zrodlo" ] || { _md_log "UWAGA: brak $zrodlo"; return 1; }
  cmp -s -- "$zrodlo" "$cel" && return 1
  if install -D -m 0644 -- "$zrodlo" "$cel"; then
    _md_log "zainstalowano $cel"
    return 0
  fi
  _md_log "UWAGA: nie udało się zainstalować $cel"
  return 1
}

zainstaluj_pliki_hosta_dysku() {
  local repo="${1:?katalog repozytorium wymagany}"
  local etc="${VERRIS_ETC_ROOT:-/etc}"
  local journald_cel="$etc/systemd/journald.conf.d/verris-limit.conf"
  local tmpfiles_cel="$etc/tmpfiles.d/verris.conf"
  local limit

  if [ -z "${VERRIS_ETC_ROOT:-}" ] && [ "$(id -u)" != "0" ]; then
    _md_log "pliki hosta (journald, tmpfiles) pominięte — brak roota. Raz: sudo bash ops/scripts/lib/miejsce-na-dysku.sh zainstaluj"
    return 0
  fi

  if _md_zainstaluj_plik "$repo/ops/systemd/journald-verris-limit.conf" "$journald_cel"; then
    # journald czyta konfigurację przy starcie (man journald.conf) — restart, potem
    # natychmiastowe odchudzenie do limitu (bez czekania na rotację).
    systemctl restart systemd-journald >/dev/null 2>&1 || _md_log "UWAGA: restart systemd-journald nie powiódł się"
    limit="$(awk -F= '/^SystemMaxUse=/ { print $2 }' "$journald_cel")"
    journalctl --vacuum-size="${limit:-500M}" >/dev/null 2>&1 || true
  fi

  if _md_zainstaluj_plik "$repo/ops/systemd/tmpfiles-verris.conf" "$tmpfiles_cel"; then
    # Tworzy katalogi z właściwymi prawami; sprzątanie wg wieku robi systemd-tmpfiles-clean.timer.
    systemd-tmpfiles --create "$tmpfiles_cel" >/dev/null 2>&1 || _md_log "UWAGA: systemd-tmpfiles --create nie powiódł się"
  fi
  return 0
}

# -----------------------------------------------------------------------------
# Diagnoza: co zajmuje miejsce (polecenia z incydentu 10.11.2026).
# -----------------------------------------------------------------------------
stan_dysku() {
  echo "== df -h /"
  df -h / 2>/dev/null || true
  echo "== największe katalogi"
  du -xsh /var/lib/verris/backups /var/lib/containerd /var/lib/docker /var/log/journal \
    /tmp/verris-backup-staging /tmp/verris-restore-staging 2>/dev/null || true
  echo "== kopie lokalne (najnowsze)"
  find /var/lib/verris/backups -maxdepth 1 -mindepth 1 -printf '%TY-%Tm-%Td %TH:%TM  %10s  %f\n' 2>/dev/null \
    | sort -r | head -10 || true
  echo "== dziennik systemd"
  journalctl --disk-usage 2>/dev/null || true
  echo "== docker system df"
  docker system df 2>/dev/null || true
  echo "== wolumeny (rozmiar)"
  docker system df -v 2>/dev/null | awk '/^Local Volumes space usage/,/^Build cache usage/' || true
}

# --- wywołanie wprost (nie przez `.`) -------------------------------------------
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -Eeuo pipefail
  _md_repo="$(cd "$(dirname "$0")/../../.." && pwd)"
  case "${1:-}" in
    zainstaluj) zainstaluj_pliki_hosta_dysku "$_md_repo" ;;
    przytnij) przytnij_kopie_lokalne "${2:-}" ;;
    stan) stan_dysku ;;
    *)
      echo "Użycie: $0 zainstaluj | przytnij [katalog] | stan" >&2
      exit 2
      ;;
  esac
fi
