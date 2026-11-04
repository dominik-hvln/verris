/**
 * Podgląd stawek w adminie — te same wzory co API (`apps/api/src/eco/drzewa-model.ts`): część = 1/10 000 drzewa,
 * wkład = ⌊netto[gr] × stawka / 10 000⌋, netto = brutto / 1,23 (połowa w górę).
 */
export const CZESCI_DRZEWA = 10_000;

/** Decyzja 16 (4.11.2026): domyślnie 300 pkt = 1 drzewo (jak `DOMYSLNE_PUNKTY_NA_DRZEWO` w API). */
export const DOMYSLNE_PUNKTY_NA_DRZEWO = 300;

/** Decyzja 17 (4.11.2026): certyfikat zawsze na Verris (jak `CERTYFIKAT_VERRIS` w API). */
export const CERTYFIKAT_VERRIS = {
  customerName: 'Verris',
  certificateText: 'Drzewo posadzone dzięki klientom Verris',
} as const;

/** Koszt w punktach procentu drzewa: ⌈procent × punktyNaDrzewo / 100⌉ (jak API). */
export function punktyZaProcent(procent: number, punktyNaDrzewo: number): number {
  return Math.ceil((procent * punktyNaDrzewo) / 100);
}

export function nettoZBruttoGrosze(bruttoGrosze: number): number {
  return bruttoGrosze <= 0 ? 0 : Math.floor((2 * bruttoGrosze * 100 + 123) / 246);
}

export function wkladCzesci(bruttoGrosze: number, stawka: number): number {
  return Math.floor((nettoZBruttoGrosze(bruttoGrosze) * stawka) / 10_000);
}

export const procent = (czesci: number) => `${Math.floor(czesci / 100)},${String(czesci % 100).padStart(2, '0')}%`;
export const zl = (grosze: number) => `${Math.floor(grosze / 100)},${String(grosze % 100).padStart(2, '0')} zł`;

/** Roczny koszt drzew dla `klienci` klientów: rocznych (1 płatność) albo miesięcznych (12 płatności). */
export function kosztRocznyGrosze(opts: {
  bruttoGrosze: number;
  platnosciWRoku: number;
  klienci: number;
  stawka: number;
  kosztDrzewaGrosze: number;
}): { czesci: number; grosze: number } {
  const czesci = wkladCzesci(opts.bruttoGrosze, opts.stawka) * opts.platnosciWRoku * opts.klienci;
  return { czesci, grosze: Math.ceil((czesci * opts.kosztDrzewaGrosze) / CZESCI_DRZEWA) };
}
