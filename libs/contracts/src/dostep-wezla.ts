/**
 * Weryfikacja 11.10 — działająca droga na węzeł floty. Klucz osobisty operatora (z Maca i z control-plane'u) dostaje
 * na węźle „Permission denied (publickey)”: węzeł przyjmuje tylko klucz deploy control-plane'u
 * (/root/.ssh/verris_node_deploy), którego używa ops/scripts/verris-node.sh. Panel serwera (:2222) przyjmuje tylko
 * połączenia z control-plane'u (zapora w profilu węzła, decyzja 2026-09-29), więc tunel z przeglądarki idzie PRZEZ
 * control-plane, a nie wprost na węzeł. Jedno źródło dla karty węzła (panel operatora) i odpowiedzi SSO w API.
 *
 * Decyzja 17.10 (PB-31): tunel SOCKS (`ssh -D`) zamiast przekierowania portu. Panel ma certyfikat na nazwę hosta
 * (faza TLS bootstrapu), więc link SSO musi zostać z prawdziwą nazwą — przy `-L` i 127.0.0.1 przeglądarka odrzucała
 * certyfikat. Przez SOCKS ze zdalnym DNS przeglądarka łączy się z węzłem z adresu control-plane'u.
 */
export const PORT_SOCKS_PANELU = 1080;
export const SKRYPT_WEZLA_NA_CP = '/opt/verris/ops/scripts/verris-node.sh';

export interface KomendySshWezla {
  /** Powłoka na węźle — uruchamiana NA control-plane (klucz deploy). */
  powloka: string;
  /** Tunel SOCKS do panelu serwera węzła — z komputera operatora przez control-plane. */
  tunelPanelu: string;
  /** Osobny profil Chrome (macOS) z proxy SOCKS — link SSO otwierany w nim bez zmian. */
  przegladarkaPrzezTunel: string;
}

export function komendySshWezla(adres: string): KomendySshWezla {
  return {
    powloka: `${SKRYPT_WEZLA_NA_CP} ssh ${adres}`,
    tunelPanelu: `ssh -N -D ${PORT_SOCKS_PANELU} root@<control-plane>`,
    przegladarkaPrzezTunel: `open -na "Google Chrome" --args --user-data-dir=/tmp/verris-panel-wezla --proxy-server="socks5://127.0.0.1:${PORT_SOCKS_PANELU}"`,
  };
}
