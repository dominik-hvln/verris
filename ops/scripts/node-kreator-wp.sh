#!/usr/bin/env bash
# =============================================================================
# Verris — przejście strony z Verris Kreatora na WordPressa (paczka 124, zadanie KREATOR_WP).
# Uruchamiany przez agenta zadań (verris-task-run.sh) z danymi zadania w zmiennych KWP_*:
#
#   KWP_TRYB       podglad | zamiana | cofnij
#   KWP_DA_USER    login konta,  KWP_DOMAIN  domena strony,  KWP_DIR  katalog strony względem katalogu domowego
#                  (domains/<domena>/public_html[/…] – ten sam, do którego publikuje kreator)
#   KWP_KLUCZ      24 znaki hex – katalog podglądu <katalog strony>/.verris-wp-podglad/<klucz> (hasło w linku)
#   podglad:  KWP_PACZKA (ZIP z API w domains/<domena>/.verris-kreator-wp/), KWP_DB_*, KWP_ADMIN_*, KWP_LOCALE
#   zamiana:  KWP_PLIKI (wpisy strony z kreatora w katalogu strony, po przecinku), KWP_KOPIA (katalog kopii
#             w domains/<domena>/ – tam trafia strona z kreatora, jak kopia przy publikacji)
#   cofnij:   KWP_KOPIA (kopia strony z kreatora do przywrócenia), KWP_KOPIA_WP (katalog, do którego trafia WordPress)
#
# Wszystkie operacje na plikach jako użytkownik konta (runuser / su -l w CageFS) – root niczego nie zapisuje
# w katalogach klienta. Każda ścieżka sprawdzona: bez dowiązań symbolicznych po drodze (jak node-wp-install.sh).
# Zamiana i cofnięcie przy błędzie przywracają stan sprzed zadania.
# =============================================================================
set -Eeuo pipefail

: "${KWP_TRYB:?}"; : "${KWP_DA_USER:?}"; : "${KWP_DOMAIN:?}"; : "${KWP_DIR:?}"; : "${KWP_KLUCZ:?}"

log() { echo "[kreator-wp] $*"; }
die() { log "BŁĄD: $*"; exit 1; }

[[ "$KWP_TRYB" =~ ^(podglad|zamiana|cofnij)$ ]] || die "nieznany tryb"
[[ "$KWP_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || die "nieprawidłowy login konta"
[[ "$KWP_DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || die "nieprawidłowa domena"
[[ "$KWP_KLUCZ" =~ ^[0-9a-f]{24}$ ]] || die "nieprawidłowy klucz podglądu"
DOMENA_WZGL="domains/${KWP_DOMAIN}"
[[ "$KWP_DIR" == "${DOMENA_WZGL}/public_html" || "$KWP_DIR" =~ ^domains/[a-z0-9.-]+/public_html(/[A-Za-z0-9._-]{1,64}){0,3}$ ]] || die "nieprawidłowy katalog strony"
[[ "$KWP_DIR" == "${DOMENA_WZGL}/public_html"* ]] || die "katalog strony spoza domeny"
[[ "$KWP_DIR" != *"/.."* && "$KWP_DIR" != *"/./"* ]] || die "nieprawidłowy katalog strony"

U="$KWP_DA_USER"
H="/home/${U}"
DOCROOT="${H}/${KWP_DIR}"
KATALOG_PODGLADU_WZGL="${KWP_DIR}/.verris-wp-podglad"
PODGLAD_WZGL="${KATALOG_PODGLADU_WZGL}/${KWP_KLUCZ}"
PODGLAD="${H}/${PODGLAD_WZGL}"
ADRES="https://${KWP_DOMAIN}"
# Katalog strony to korzeń adresu domeny (także przy własnym katalogu głównym public_html/<katalog>).
ADRES_PODGLADU="${ADRES}/.verris-wp-podglad/${KWP_KLUCZ}"
WP_DIR="${H}/.verris"
WP_PHAR="${WP_DIR}/wp-cli.phar"
WP_PHP_ARGS="-d memory_limit=512M -d max_execution_time=900"
NAZWA_RE='^[A-Za-z0-9._-]{1,128}$'

# Root pracuje w katalogach klienta — żadna część ścieżki nie może być dowiązaniem (np. public_html → /etc).
bez_dowiazan() { # <ścieżka względem katalogu domowego>
  [ "$(realpath -e -- "${H}/$1" 2>/dev/null)" = "$(realpath -e -- "$H")/$1" ]
}
jako() { runuser -u "$U" -- "$@"; }

[ -d "$DOCROOT" ] || die "Brak katalogu strony — sprawdź, czy domena jest dodana do usługi."
bez_dowiazan "$KWP_DIR" || die "Katalog strony prowadzi przez dowiązanie — przerwano."
bez_dowiazan "$DOMENA_WZGL" || die "Katalog domeny prowadzi przez dowiązanie — przerwano."

# --- wp-cli i PHP konta (jak node-wp-install.sh) --------------------------------------------------------------------
ensure_wp_cli() {
  runuser -u "$U" -- test -s "$WP_PHAR" && return 0
  log "Pobieram wp-cli…"
  local tmp; tmp="$(mktemp)"
  if ! curl -fsSL --retry 3 --retry-delay 2 https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o "$tmp"; then
    rm -f "$tmp"; die "nie udało się pobrać wp-cli"
  fi
  runuser -u "$U" -- sh -c 'umask 022; mkdir -p "$1" && cat > "$2.tmp" && mv -f "$2.tmp" "$2"' verris "$WP_DIR" "$WP_PHAR" < "$tmp" || { rm -f "$tmp"; die "nie udało się zapisać wp-cli"; }
  rm -f "$tmp"
}

resolve_user_php() {
  local p candidate
  p=$(su -s /bin/bash -l "$U" -c 'command -v php 2>/dev/null | head -1' || true)
  if [ -n "$p" ] && su -s /bin/bash -l "$U" -c "test -x '$p'" 2>/dev/null; then echo "$p"; return 0; fi
  for candidate in /usr/local/bin/php /usr/bin/php /opt/alt/php*/usr/bin/php; do
    if [ -x "$candidate" ] && su -s /bin/bash -l "$U" -c "test -x '$candidate'" 2>/dev/null; then echo "$candidate"; return 0; fi
  done
  die "Brak PHP CLI dla konta (CageFS / alt-php)."
}

# wp <katalog WordPressa> <argumenty…> — każdy argument przez printf %q (dane klienta: tytuł, hasła).
wp_w() {
  local dir="$1"; shift
  local cmd a
  cmd="cd $(printf %q "$dir") && $(printf %q "$WP_PHP") $WP_PHP_ARGS $(printf %q "$WP_PHAR")"
  for a in "$@"; do cmd+=" $(printf %q "$a")"; done
  su -s /bin/bash -l "$U" -c "$cmd"
}

blok_htaccess() { # <RewriteBase>
  local baza="$1"
  printf '%s\n' "# BEGIN WordPress" "<IfModule mod_rewrite.c>" "RewriteEngine On" \
    "RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]" "RewriteBase ${baza}" "RewriteRule ^index\\.php$ - [L]" \
    "RewriteCond %{REQUEST_FILENAME} !-f" "RewriteCond %{REQUEST_FILENAME} !-d" "RewriteRule . ${baza}index.php [L]" \
    "</IfModule>" "# END WordPress"
}

# Zapis pliku jako klient (treść ze stdin), bez podążania za dowiązaniem w miejscu docelowym.
zapisz_jako() { # <ścieżka bezwzględna>
  runuser -u "$U" -- sh -c '[ -L "$1" ] && exit 1; umask 022; cat > "$1.verris-tmp" && mv -f -- "$1.verris-tmp" "$1"' verris "$1"
}

# =============================================================================
# podglad — WordPress w katalogu podglądu + import paczki
# =============================================================================
tryb_podglad() {
  : "${KWP_PACZKA:?}"; : "${KWP_DB_NAME:?}"; : "${KWP_DB_USER:?}"; : "${KWP_DB_PASS:?}"
  : "${KWP_ADMIN_USER:?}"; : "${KWP_ADMIN_PASS:?}"; : "${KWP_ADMIN_EMAIL:?}"
  local locale="${KWP_LOCALE:-pl_PL}"
  [[ "$locale" =~ ^[a-z]{2,3}(_[A-Z]{2})?$ ]] || die "nieprawidłowy język"
  [[ "$KWP_PACZKA" =~ ^domains/[a-z0-9.-]+/\.verris-kreator-wp/[0-9a-f]{24}\.zip$ && "$KWP_PACZKA" == "${DOMENA_WZGL}/"* ]] || die "nieprawidłowa ścieżka paczki"
  [[ "$KWP_ADMIN_USER" =~ ^[a-zA-Z0-9_.@-]{3,60}$ ]] || die "nieprawidłowy login administratora"
  [ -f "${H}/${KWP_PACZKA}" ] && bez_dowiazan "$KWP_PACZKA" || die "Brak paczki strony na koncie."

  sprzatnij_podglad() {
    local rc=$?
    if [ "$rc" -ne 0 ]; then
      log "Instalacja przerwana — usuwam katalog podglądu."
      bez_dowiazan "$PODGLAD_WZGL" 2>/dev/null && jako rm -rf -- "$PODGLAD" || true
    fi
    jako rm -f -- "${H}/${KWP_PACZKA}" 2>/dev/null || true
    jako rmdir -- "${H}/${DOMENA_WZGL}/.verris-kreator-wp" 2>/dev/null || true
  }
  trap sprzatnij_podglad EXIT

  # Katalog podglądu: bez listowania, bez indeksowania (nagłówek X-Robots-Tag), nazwa z kluczem = hasło w linku.
  if [ ! -d "${H}/${KATALOG_PODGLADU_WZGL}" ]; then jako mkdir -m 755 -- "${H}/${KATALOG_PODGLADU_WZGL}"; fi
  bez_dowiazan "$KATALOG_PODGLADU_WZGL" || die "Katalog podglądu prowadzi przez dowiązanie — przerwano."
  printf '%s\n' "Options -Indexes" "<IfModule mod_headers.c>" "Header set X-Robots-Tag \"noindex, nofollow\"" "</IfModule>" | zapisz_jako "${H}/${KATALOG_PODGLADU_WZGL}/.htaccess"
  : | zapisz_jako "${H}/${KATALOG_PODGLADU_WZGL}/index.html"
  [ -e "$PODGLAD" ] && die "Katalog podglądu już istnieje."
  jako mkdir -m 755 -- "$PODGLAD"
  bez_dowiazan "$PODGLAD_WZGL" || die "Katalog podglądu prowadzi przez dowiązanie — przerwano."

  ensure_wp_cli
  WP_PHP="$(resolve_user_php)"
  log "PHP CLI: $WP_PHP"
  wp_w "$PODGLAD" --version >/dev/null 2>&1 || die "wp-cli nie uruchamia się (php / phar / CageFS)."

  log "Pobieram WordPressa ($locale)…"
  local lang="${locale%%_*}" tar="${WP_DIR}/wp-core-${KWP_KLUCZ}.tar.gz" glowny zapasowy="https://wordpress.org/latest.tar.gz"
  glowny="https://${lang}.wordpress.org/latest-${locale}.tar.gz"
  [ "$locale" = "en_US" ] && glowny="$zapasowy"
  su -s /bin/bash -l "$U" -c "set -e; curl -fsSL --retry 3 --retry-delay 2 $(printf %q "$glowny") -o $(printf %q "$tar") || curl -fsSL --retry 3 --retry-delay 2 $(printf %q "$zapasowy") -o $(printf %q "$tar"); tar -xzf $(printf %q "$tar") -C $(printf %q "$PODGLAD") --strip-components=1; rm -f $(printf %q "$tar")" \
    || die "Nie udało się pobrać lub rozpakować WordPressa."

  log "Konfiguracja i instalacja…"
  wp_w "$PODGLAD" config create --dbname="$KWP_DB_NAME" --dbuser="$KWP_DB_USER" --dbpass="$KWP_DB_PASS" --dbhost=localhost --locale="$locale" --force
  wp_w "$PODGLAD" core install --url="$ADRES_PODGLADU" --title="$KWP_DOMAIN" --admin_user="$KWP_ADMIN_USER" --admin_password="$KWP_ADMIN_PASS" --admin_email="$KWP_ADMIN_EMAIL" --skip-email
  wp_w "$PODGLAD" config set DISALLOW_FILE_EDIT true --raw --type=constant || log "WARN: nie udało się wyłączyć edytora plików"
  wp_w "$PODGLAD" language core install "$locale" --activate >/dev/null 2>&1 || log "WARN: pakiet językowy $locale — pominięto (rdzeń już jest w tym języku)"

  # Reguły ładnych adresów w katalogu podglądu (wp-cli nie zapisuje ich bez mod_rewrite w CLI).
  { blok_htaccess "/${ADRES_PODGLADU#"${ADRES}"/}/"; printf '%s\n' "<IfModule mod_headers.c>" "Header set X-Robots-Tag \"noindex, nofollow\"" "</IfModule>"; } | zapisz_jako "${PODGLAD}/.htaccess"

  log "Porządki po instalacji (przykładowe treści i wtyczki, komentarze)…"
  wp_w "$PODGLAD" post delete 1 2 3 --force >/dev/null 2>&1 || true
  wp_w "$PODGLAD" plugin delete hello akismet >/dev/null 2>&1 || true
  wp_w "$PODGLAD" option update blog_public 0
  wp_w "$PODGLAD" option update default_comment_status closed
  wp_w "$PODGLAD" option update default_ping_status closed
  wp_w "$PODGLAD" option update default_pingback_flag 0
  wp_w "$PODGLAD" option update timezone_string Europe/Warsaw || true
  wp_w "$PODGLAD" rewrite structure '/%postname%/'

  log "Import strony z kreatora…"
  local importer="${WP_DIR}/kreator-wp-import.php"
  printf '%s' "__VERRIS_KWP_IMPORTER_B64__" | base64 -d | zapisz_jako "$importer"
  wp_w "$PODGLAD" eval-file "$importer" "${H}/${KWP_PACZKA}" --user="$KWP_ADMIN_USER"
  jako rm -f -- "$importer" || true
  wp_w "$PODGLAD" rewrite flush || true

  echo "[VERRIS_KWP] status=podglad url=${ADRES_PODGLADU}/ admin_user=${KWP_ADMIN_USER}"
  log "Gotowe: ${ADRES_PODGLADU}/"
}

# =============================================================================
# zamiana — strona z kreatora do kopii, WordPress z podglądu do katalogu strony, adres domeny
# =============================================================================
tryb_zamiana() {
  : "${KWP_KOPIA:?}"
  [[ "$KWP_KOPIA" =~ ^\.verris-kopia-[0-9]{8}-[0-9]{4,6}(-[0-9]{1,3})?$ ]] || die "nieprawidłowa nazwa kopii"
  [ -f "${PODGLAD}/wp-config.php" ] && bez_dowiazan "$PODGLAD_WZGL" || die "Brak WordPressa w katalogu podglądu — zainstaluj podgląd ponownie."
  # Zmienne dla pułapki wycofania – globalne (pułapka EXIT działa już poza zakresem funkcji).
  kopia_wzgl="${DOMENA_WZGL}/${KWP_KOPIA}"
  [ -e "${H}/${kopia_wzgl}" ] && die "Katalog kopii już istnieje."

  local -a pliki=() wp=()
  local n
  IFS=',' read -r -a pliki <<< "${KWP_PLIKI:-}"
  for n in "${pliki[@]}"; do
    [[ "$n" =~ $NAZWA_RE && "$n" != "." && "$n" != ".." && "$n" != ".verris-wp-podglad" ]] || die "nieprawidłowa nazwa pliku strony: $n"
  done
  while IFS= read -r -d '' n; do
    n="${n##*/}"
    [ "$n" = ".htaccess" ] && continue
    [[ "$n" =~ $NAZWA_RE ]] || die "nieprawidłowa nazwa pliku WordPressa: $n"
    wp+=("$n")
  done < <(runuser -u "$U" -- find "$PODGLAD" -mindepth 1 -maxdepth 1 -print0)
  # Konflikt nazw przed jakąkolwiek zmianą: wpis WordPressa, który już jest w katalogu strony i nie idzie do kopii.
  for n in "${wp[@]}"; do
    if [ -e "${DOCROOT}/${n}" ] || [ -L "${DOCROOT}/${n}" ]; then
      local w=0 p
      for p in "${pliki[@]}"; do [ "$p" = "$n" ] && w=1; done
      [ "$w" = 1 ] || die "W katalogu strony jest już „${n}” (nie należy do strony z kreatora) — usuń go albo przenieś i spróbuj ponownie."
    fi
  done

  ensure_wp_cli
  WP_PHP="$(resolve_user_php)"

  htaccess_kopia="${WP_DIR}/kreator-wp-${KWP_KLUCZ}.htaccess"
  etap=0
  przeniesione_kreator=()
  przeniesione_wp=()
  wycofaj_zamiane() {
    local rc=$?
    trap - EXIT
    [ "$rc" -eq 0 ] && return 0
    log "Zamiana przerwana (etap $etap) — przywracam stan sprzed zadania."
    if [ "$etap" -ge 4 ]; then
      wp_w "$DOCROOT" search-replace "$ADRES" "$ADRES_PODGLADU" --skip-columns=guid --precise >/dev/null 2>&1 || true
      wp_w "$DOCROOT" option update blog_public 0 >/dev/null 2>&1 || true
    fi
    for n in "${przeniesione_wp[@]}"; do jako mv -n -- "${DOCROOT}/${n}" "${PODGLAD}/${n}" || true; done
    if [ -f "$htaccess_kopia" ]; then jako cp -f -- "$htaccess_kopia" "${DOCROOT}/.htaccess" || true; elif [ "$etap" -ge 3 ]; then jako rm -f -- "${DOCROOT}/.htaccess" || true; fi
    for n in "${przeniesione_kreator[@]}"; do jako mv -n -- "${H}/${kopia_wzgl}/${n}" "${DOCROOT}/${n}" || true; done
    jako rmdir -- "${H}/${kopia_wzgl}" 2>/dev/null || true
    jako rm -f -- "$htaccess_kopia" || true
    exit "$rc"
  }
  trap wycofaj_zamiane EXIT

  # 1. Kopia strony z kreatora (poza katalogiem WWW, jak przy publikacji).
  etap=1
  jako mkdir -m 755 -- "${H}/${kopia_wzgl}"
  bez_dowiazan "$kopia_wzgl" || die "Katalog kopii prowadzi przez dowiązanie — przerwano."
  for n in "${pliki[@]}"; do
    [ -e "${DOCROOT}/${n}" ] || [ -L "${DOCROOT}/${n}" ] || continue
    jako mv -n -- "${DOCROOT}/${n}" "${H}/${kopia_wzgl}/${n}"
    przeniesione_kreator+=("$n")
  done
  log "Strona z kreatora w kopii: ${kopia_wzgl} (${#przeniesione_kreator[@]} wpisów)."

  # 2. WordPress do katalogu strony.
  etap=2
  for n in "${wp[@]}"; do
    jako mv -n -- "${PODGLAD}/${n}" "${DOCROOT}/${n}"
    przeniesione_wp+=("$n")
  done

  # 3. .htaccess strony: reguły WordPressa dopisane do istniejących (ustawienia Verris i klienta zostają).
  etap=3
  if [ -f "${DOCROOT}/.htaccess" ]; then jako cp -f -- "${DOCROOT}/.htaccess" "$htaccess_kopia"; fi
  if ! grep -qs "^# BEGIN WordPress" "${DOCROOT}/.htaccess"; then
    { [ -s "${DOCROOT}/.htaccess" ] && cat "${DOCROOT}/.htaccess" && echo; blok_htaccess "/"; } | zapisz_jako "${DOCROOT}/.htaccess"
  fi

  # 4. Adres domeny zamiast adresu podglądu (search-replace zna dane serializowane; guid zostaje).
  etap=4
  wp_w "$DOCROOT" option update home "$ADRES"
  wp_w "$DOCROOT" option update siteurl "$ADRES"
  wp_w "$DOCROOT" search-replace "$ADRES_PODGLADU" "$ADRES" --skip-columns=guid --precise
  wp_w "$DOCROOT" option update blog_public 1
  wp_w "$DOCROOT" rewrite flush || true

  etap=5
  trap - EXIT
  jako rm -f -- "$htaccess_kopia" "${PODGLAD}/.htaccess" || true
  jako rmdir -- "$PODGLAD" 2>/dev/null || log "WARN: katalog podglądu nie jest pusty — zostaje"
  if [ -z "$(runuser -u "$U" -- find "${H}/${KATALOG_PODGLADU_WZGL}" -mindepth 1 -maxdepth 1 ! -name .htaccess ! -name index.html -print -quit)" ]; then
    jako rm -f -- "${H}/${KATALOG_PODGLADU_WZGL}/.htaccess" "${H}/${KATALOG_PODGLADU_WZGL}/index.html" || true
    jako rmdir -- "${H}/${KATALOG_PODGLADU_WZGL}" 2>/dev/null || true
  fi
  echo "[VERRIS_KWP] status=zamiana url=${ADRES}/ kopia=${kopia_wzgl}"
  log "Gotowe: ${ADRES}/"
}

# =============================================================================
# cofnij — WordPress do kopii, strona z kreatora z kopii z powrotem
# =============================================================================
tryb_cofnij() {
  : "${KWP_KOPIA:?}"; : "${KWP_KOPIA_WP:?}"
  [[ "$KWP_KOPIA" =~ ^\.verris-kopia-[0-9]{8}-[0-9]{4,6}(-[0-9]{1,3})?$ ]] || die "nieprawidłowa nazwa kopii"
  [[ "$KWP_KOPIA_WP" =~ ^\.verris-wordpress-[0-9]{8}-[0-9]{4,6}$ ]] || die "nieprawidłowa nazwa kopii WordPressa"
  kopia_wzgl="${DOMENA_WZGL}/${KWP_KOPIA}"
  kopia_wp_wzgl="${DOMENA_WZGL}/${KWP_KOPIA_WP}"
  [ -d "${H}/${kopia_wzgl}" ] && bez_dowiazan "$kopia_wzgl" || die "Nie ma już kopii strony z kreatora — cofnięcie niemożliwe."
  [ -e "${H}/${kopia_wp_wzgl}" ] && die "Katalog kopii WordPressa już istnieje."
  [ -f "${DOCROOT}/wp-config.php" ] || die "W katalogu strony nie ma WordPressa."

  local -a wp=() kreator=()
  przeniesione_wp=()
  przywrocone=()
  local n
  while IFS= read -r -d '' n; do
    n="${n##*/}"
    case "$n" in
      index.php|wp-admin|wp-content|wp-includes|xmlrpc.php|license.txt|licencja.txt|readme.html|wp-*.php) wp+=("$n") ;;
    esac
  done < <(runuser -u "$U" -- find "$DOCROOT" -mindepth 1 -maxdepth 1 -print0)
  while IFS= read -r -d '' n; do
    n="${n##*/}"
    [[ "$n" =~ $NAZWA_RE ]] || die "nieprawidłowa nazwa w kopii: $n"
    if [ -e "${DOCROOT}/${n}" ] && [[ ! " ${wp[*]} " == *" ${n} "* ]]; then
      die "W katalogu strony jest „${n}”, a kopia też go ma — przenieś go i spróbuj ponownie."
    fi
    kreator+=("$n")
  done < <(runuser -u "$U" -- find "${H}/${kopia_wzgl}" -mindepth 1 -maxdepth 1 -print0)

  htaccess_kopia="${WP_DIR}/kreator-wp-${KWP_KLUCZ}-cofnij.htaccess"
  wycofaj_cofniecie() {
    local rc=$?
    trap - EXIT
    [ "$rc" -eq 0 ] && return 0
    log "Cofnięcie przerwane — przywracam WordPressa."
    for n in "${przywrocone[@]}"; do jako mv -n -- "${DOCROOT}/${n}" "${H}/${kopia_wzgl}/${n}" || true; done
    for n in "${przeniesione_wp[@]}"; do jako mv -n -- "${H}/${kopia_wp_wzgl}/${n}" "${DOCROOT}/${n}" || true; done
    [ -f "$htaccess_kopia" ] && jako cp -f -- "$htaccess_kopia" "${DOCROOT}/.htaccess" || true
    jako rmdir -- "${H}/${kopia_wp_wzgl}" 2>/dev/null || true
    exit "$rc"
  }
  trap wycofaj_cofniecie EXIT

  jako mkdir -m 755 -- "${H}/${kopia_wp_wzgl}"
  bez_dowiazan "$kopia_wp_wzgl" || die "Katalog kopii WordPressa prowadzi przez dowiązanie — przerwano."
  for n in "${wp[@]}"; do
    jako mv -n -- "${DOCROOT}/${n}" "${H}/${kopia_wp_wzgl}/${n}"
    przeniesione_wp+=("$n")
  done
  # Reguły WordPressa z .htaccess strony (reszta zostaje); kopia całego pliku obok WordPressa.
  if [ -f "${DOCROOT}/.htaccess" ] && [ ! -L "${DOCROOT}/.htaccess" ]; then
    jako cp -f -- "${DOCROOT}/.htaccess" "$htaccess_kopia"
    jako cp -f -- "${DOCROOT}/.htaccess" "${H}/${kopia_wp_wzgl}/.htaccess"
    sed '/^# BEGIN WordPress$/,/^# END WordPress$/d' "$htaccess_kopia" | zapisz_jako "${DOCROOT}/.htaccess"
    if ! grep -q '[^[:space:]]' "${DOCROOT}/.htaccess"; then jako rm -f -- "${DOCROOT}/.htaccess"; fi
  fi
  for n in "${kreator[@]}"; do
    jako mv -n -- "${H}/${kopia_wzgl}/${n}" "${DOCROOT}/${n}"
    przywrocone+=("$n")
  done
  trap - EXIT
  jako rmdir -- "${H}/${kopia_wzgl}" 2>/dev/null || true
  jako rm -f -- "$htaccess_kopia" || true
  echo "[VERRIS_KWP] status=cofnieto kopia_wp=${kopia_wp_wzgl}"
  log "Strona z kreatora przywrócona; WordPress w ${kopia_wp_wzgl}."
}

case "$KWP_TRYB" in
  podglad) tryb_podglad ;;
  zamiana) tryb_zamiana ;;
  cofnij) tryb_cofnij ;;
esac
