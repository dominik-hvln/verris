import { CENY_ZAPASOWE, type StawkiAutoskalowania } from './ceny';

/**
 * Stawki autoskalowania (brutto, zł) — domyślne wartości kalkulatorów. Źródłem prawdy jest API
 * (GET /autoscaling/pricing przez lib/ceny-api.ts); strony z danymi z API przekazują stawki jawnie.
 */
export const STAWKI: StawkiAutoskalowania = CENY_ZAPASOWE.stawki;

/** Dopłata za pik ponad bazę: 1 vCPU = 100% CPU. */
export function kosztPiku(vcpu: number, ramGb: number, godziny: number, stawki: StawkiAutoskalowania = STAWKI): number {
  return (vcpu * 100 * stawki.cpu + ramGb * stawki.ram) * godziny;
}

/** „3,20” — dwa miejsca po przecinku, przecinek dziesiętny. */
export function formatZl(kwota: number): string {
  return kwota.toFixed(2).replace('.', ',');
}
