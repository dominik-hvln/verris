/**
 * VPS w sprzedaży — ta sama flaga co w panelu klienta (`NEXT_PUBLIC_FEATURE_VPS`),
 * domyślnie wyłączona. Decyzja 2026-09-24: do wejścia VPS do sprzedaży verris.pl go
 * nie reklamuje (strona /vps → 404, znika z menu, stopki, sitemapy i opisów), bo w
 * panelu nie da się go kupić. Literalny odczyt `process.env.NEXT_PUBLIC_…` — tylko
 * taki Next podstawia w buildzie.
 */
const flaga = process.env.NEXT_PUBLIC_FEATURE_VPS;
export const VPS_W_SPRZEDAZY = flaga === 'true' || flaga === '1';

/**
 * E-mail marketing w sprzedaży — ta sama flaga co w panelu (`NEXT_PUBLIC_FEATURE_EMAIL_MARKETING`),
 * domyślnie wyłączona. Decyzja 2026-09-28: do ukończenia usługi (w panelu nie da się jej kupić)
 * verris.pl jej nie reklamuje — /email-marketing → 404, znika z menu, stopki, sitemapy i llms.txt.
 */
const flagaEmm = process.env.NEXT_PUBLIC_FEATURE_EMAIL_MARKETING;
export const EMAIL_MARKETING_W_SPRZEDAZY = flagaEmm === 'true' || flagaEmm === '1';

/**
 * Q-05 — pakiety e-mail marketingu (ceny BRUTTO, zł). Źródło prawdy: apps/api/src/plans/plany-newsletter.ts;
 * zgodność liczb pilnuje test plany-newsletter.spec.ts w API.
 */
export const PAKIETY_NEWSLETTER = [
  { nazwa: 'Newsletter Start', miesiecznie: 19, rocznie: 190, kontakty: 1000, wysylki: 5000 },
  { nazwa: 'Newsletter Plus', miesiecznie: 49, rocznie: 490, kontakty: 5000, wysylki: 25000 },
] as const;

/** „hosting z autoskalowaniem, VPS i domeny” albo bez VPS — jedno miejsce na to wyliczenie. */
export const OFERTA_KROTKO = VPS_W_SPRZEDAZY
  ? 'hosting z autoskalowaniem, VPS i domeny'
  : 'hosting z autoskalowaniem i domeny';

/**
 * PB-07 — publiczna specyfikacja pakietu (/specyfikacja): w menu i sitemapie. Treść zaakceptowana
 * przez właściciela 27.09.2026 (docs/marketing/akceptacja-tresci-2026-09.md).
 */
export const SPECYFIKACJA_OPUBLIKOWANA = true;

/**
 * Funkcje sprawdzane na pierwszym węźle (wezel.csv) — m.in. LiteSpeed, Redis, PostgreSQL, WAF, ImunifyAV,
 * izolacja kont (pole `po` w listach /specyfikacja, strony głównej i /hosting). 07.10 wszystkie sprawdzone na t1
 * (WAF: blokowanie domyślnie od migracji 20261007200000) — włączone. false chowa je wszędzie naraz.
 */
export const SPEC_PO_WERYFIKACJI = true;

/** Zostawia pozycje oznaczone `po: true` (po weryfikacji na węźle) tylko, gdy SPEC_PO_WERYFIKACJI. */
export function zweryfikowane<T extends { po?: boolean }>(lista: T[]): T[] {
  return lista.filter((x) => SPEC_PO_WERYFIKACJI || !x.po);
}
