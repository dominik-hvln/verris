/**
 * Stawki autoskalowania (brutto, zł) — te same co w /specyfikacja: 1% CPU/h, 1 GB RAM/h, 1 GB dysku/h.
 * Jedno źródło dla kalkulatora piku (/hosting) i kalkulatora na /przenies-strone.
 */
export const STAWKI = { cpu: 0.001323, ram: 0.0882, dysk: 0.0008 } as const;

/** Dopłata za pik ponad bazę: 1 vCPU = 100% CPU. */
export function kosztPiku(vcpu: number, ramGb: number, godziny: number): number {
  return (vcpu * 100 * STAWKI.cpu + ramGb * STAWKI.ram) * godziny;
}

/** „3,20” — dwa miejsca po przecinku, przecinek dziesiętny. */
export function formatZl(kwota: number): string {
  return kwota.toFixed(2).replace('.', ',');
}
