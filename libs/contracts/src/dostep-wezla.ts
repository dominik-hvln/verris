/**
 * Weryfikacja 11.10 — działająca droga na węzeł floty. Klucz osobisty operatora (z Maca i z control-plane'u) dostaje
 * na węźle „Permission denied (publickey)”: węzeł przyjmuje tylko klucz deploy control-plane'u
 * (/root/.ssh/verris_node_deploy), którego używa ops/scripts/verris-node.sh. Panel serwera (:2222) przyjmuje tylko
 * połączenia z control-plane'u (zapora w profilu węzła, decyzja 2026-09-29), więc tunel z przeglądarki idzie PRZEZ
 * control-plane, a nie wprost na węzeł. Jedno źródło dla karty węzła (panel operatora) i odpowiedzi SSO w API.
 */
export const SKRYPT_WEZLA_NA_CP = '/opt/verris/ops/scripts/verris-node.sh';

export interface KomendySshWezla {
  /** Powłoka na węźle — uruchamiana NA control-plane (klucz deploy). */
  powloka: string;
  /** Tunel do panelu serwera węzła — z komputera operatora przez control-plane. */
  tunelPanelu: string;
}

export function komendySshWezla(adres: string): KomendySshWezla {
  return {
    powloka: `${SKRYPT_WEZLA_NA_CP} ssh ${adres}`,
    tunelPanelu: `ssh -L 2222:${adres}:2222 root@<control-plane>`,
  };
}
