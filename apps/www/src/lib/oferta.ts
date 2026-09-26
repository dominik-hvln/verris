/**
 * VPS w sprzedaży — ta sama flaga co w panelu klienta (`NEXT_PUBLIC_FEATURE_VPS`),
 * domyślnie wyłączona. Decyzja 2026-09-24: do wejścia VPS do sprzedaży verris.pl go
 * nie reklamuje (strona /vps → 404, znika z menu, stopki, sitemapy i opisów), bo w
 * panelu nie da się go kupić. Literalny odczyt `process.env.NEXT_PUBLIC_…` — tylko
 * taki Next podstawia w buildzie.
 */
const flaga = process.env.NEXT_PUBLIC_FEATURE_VPS;
export const VPS_W_SPRZEDAZY = flaga === 'true' || flaga === '1';

/** „hosting z autoskalowaniem, VPS i domeny” albo bez VPS — jedno miejsce na to wyliczenie. */
export const OFERTA_KROTKO = VPS_W_SPRZEDAZY
  ? 'hosting z autoskalowaniem, VPS i domeny'
  : 'hosting z autoskalowaniem i domeny';

/**
 * PB-07 — publiczna specyfikacja pakietu (/specyfikacja): w menu i sitemapie. Treść zaakceptowana
 * przez właściciela 27.09.2026 (docs/marketing/akceptacja-tresci-2026-09.md).
 */
export const SPECYFIKACJA_OPUBLIKOWANA = true;
