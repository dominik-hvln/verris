/**
 * PB-31 (17.10, TEST-02): po świeżej instalacji DirectAdmin ma `ssl=0` — panel na swoim porcie mówi czystym HTTP
 * (przeglądarka: ERR_SSL_PROTOCOL_ERROR), a API łączy się z węzłem po HTTPS z weryfikacją certyfikatu. Rekord A
 * nazwy węzła powstaje dopiero przy fazie CANARY (control-plane), więc instalator DA nie mógł wydać certyfikatu.
 * Ta funkcja wydaje certyfikat hostname mechanizmem DirectAdmina i dopiero wtedy włącza HTTPS panelu.
 * Ta sama funkcja jest w bootstrapie (faza TLS) i w ops/scripts/node-directadmin-tls-http01.sh (węzły sprzed zmiany);
 * zgodność obu kopii pilnuje test tls-panelu.spec.ts.
 */
// Zwykły literał (nie String.raw): ${…} basha musi być ucieczką \${…}, ukośniki podwojone.
export const TLS_PANELU_SH = `# HTTPS panelu DirectAdmina z ważnym certyfikatem nazwy hosta — wg dokumentacji DirectAdmin:
#  - certyfikat hostname wydaje i odnawia DirectAdmin (ACME), ręcznie: scripts/letsencrypt.sh server_cert; obejmuje też
#    panel, serwer WWW, Exima/Dovecota i FTP; TLS interfejsu DA włącza się osobno
#    (https://docs.directadmin.com/webservices/ssl/service-ssls-and-le.html#using-automatic-certificates-for-server-hostname),
#  - acme_server_cert_enabled=1 — automatyczne wydawanie i odnawianie certyfikatu hostname
#    (https://docs.directadmin.com/directadmin/general-usage/all-directadmin-conf-values.html#acme-server-cert-enabled),
#  - zmiany przez „da config-set”, od 1.710 DA przeładowuje się sam
#    (https://docs.directadmin.com/directadmin/general-usage/configuring-da.html#main-directadmin-configuration-file).
# ssl=1 dopiero po wydaniu certyfikatu: bez niego panel miałby samopodpisany certyfikat instalatora.
# Użycie: wlacz_tls_panelu <hostname> [katalog DA]. Kod: 0 — HTTPS z ważnym certyfikatem; 3 — rekord A nie wskazuje
# węzła; 4 — brak dig (bind-utils); 1 — certyfikat nie wydany albo błąd konfiguracji.
wlacz_tls_panelu() {
  local host="$1" DA=/usr/local/directadmin dabin=da port ip4 strefa ns a proba
  [ "$#" -ge 2 ] && DA="$2"
  [ -n "$host" ] || return 1
  command -v da >/dev/null 2>&1 || dabin="$DA/directadmin"
  port="$("$dabin" config-get port 2>/dev/null)"
  case "$port" in ''|*[!0-9]*) port=2222 ;; esac
  panel_https() { curl -sS -o /dev/null -m 10 --resolve "$host:$port:127.0.0.1" "https://$host:$port/" >/dev/null 2>&1; }
  if [ "$("$dabin" config-get ssl 2>/dev/null)" = 1 ] && panel_https; then return 0; fi
  # Rekord A pytany u serwerów autorytatywnych strefy (bez cache resolvera — rekord powstaje chwilę wcześniej).
  # Nieudane walidacje Let's Encrypt mają limit na godzinę, więc certyfikat dopiero po zgodnym rekordzie;
  # bez dig (bind-utils) nie zgadujemy — kod 4.
  command -v dig >/dev/null 2>&1 || dnf -y -q install bind-utils >/dev/null 2>&1 || true
  command -v dig >/dev/null 2>&1 || return 4
  ip4="$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \\([0-9.]*\\).*/\\1/p' | head -1)"
  a=""
  for proba in $(seq 1 "\${TLS_DNS_PROB:-30}"); do
    # strefa: najbliższa nazwa nadrzędna z rekordami NS (t2.verris.pl → verris.pl, a.b.verris.pl → … → verris.pl)
    strefa="\${host#*.}"; ns=""
    while [ -z "$ns" ] && [ "\${strefa#*.}" != "$strefa" ]; do
      ns="$(dig +short NS "$strefa" 2>/dev/null | head -1)"
      [ -n "$ns" ] || strefa="\${strefa#*.}"
    done
    a="$(dig +short A "$host" \${ns:+"@$ns"} 2>/dev/null)"
    if [ -n "$a" ] && { [ -z "$ip4" ] || printf '%s\\n' "$a" | grep -qxF "$ip4"; }; then break; fi
    a=""
    [ "$proba" -lt "\${TLS_DNS_PROB:-30}" ] && sleep "\${TLS_DNS_ODSTEP:-30}"
  done
  [ -n "$a" ] || return 3
  "$dabin" config-set acme_server_cert_enabled 1 >/dev/null || return 1
  for proba in 1 2 3; do
    "$DA/scripts/letsencrypt.sh" server_cert && break
    [ "$proba" = 3 ] && return 1
    sleep "\${TLS_LE_ODSTEP:-120}"
  done
  "$dabin" config-set ssl 1 >/dev/null || return 1
  for proba in 1 2 3 4 5 6; do
    panel_https && return 0
    sleep "\${TLS_PANEL_ODSTEP:-5}"
  done
  return 1
}
`;
