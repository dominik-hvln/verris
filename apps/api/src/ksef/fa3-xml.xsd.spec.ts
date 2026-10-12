import { FAKTURY_TESTOWE, walidujXsd, XMLLINT_DOSTEPNY, xmlFaktury } from '../test/faktury-ksef-testowe.js';

/**
 * KSeF 12.10 — XML z buildera przechodzi walidację oficjalnym XSD FA(3) 1-0E
 * (https://github.com/CIRFMF/ksef-docs/tree/main/faktury/schemy/FA, kopia w `schemat-fa3/`).
 * Do 2026-10-12 KAŻDY dokument odpadał (brak obowiązkowych JST/GV w Podmiot2, korekta bez
 * NrKSeF/NrKSeFN) — test lokalnej walidacji przed wysyłką tego nie łapał.
 *
 * Wymaga `xmllint` (libxml2-utils). Bez niego test jest pomijany — i to widać w raporcie.
 */
describe.skipIf(!XMLLINT_DOSTEPNY)('FA(3) — walidacja oficjalnym XSD', () => {
  it.each(FAKTURY_TESTOWE)('%s: dokument zgodny ze schematem', (_nazwa, faktura) => {
    const wynik = walidujXsd(xmlFaktury(faktura()));
    expect(wynik.bledy).not.toMatch(/fails to validate|error/i);
    expect(wynik.ok).toBe(true);
  });

  it('kontrola walidatora: dokument bez JST/GV (stan sprzed 12.10) NIE przechodzi', () => {
    const [, b2b] = FAKTURY_TESTOWE[0];
    const stary = xmlFaktury(b2b()).replace(/\n {4}<JST>2<\/JST>\n {4}<GV>2<\/GV>/, '');
    const wynik = walidujXsd(stary);
    expect(wynik.ok).toBe(false);
    expect(wynik.bledy).toContain('Podmiot2');
  });
});
