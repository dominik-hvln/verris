import {
  KROKI_BETA_IDS,
  KROKI_BETA_WYMAGANE,
  LICZBA_KROKOW_BETA,
  SCENARIUSZE_BETA,
  SCENARIUSZE_BETA_IDS,
  SCENARIUSZE_BETA_POCZTA,
  policzPostepBeta,
} from '@verris/contracts';

/**
 * PB-26 — scenariusze testów są zapisywane w bazie po identyfikatorach (BetaPostep.kroki / .uwagi), a ta sama lista
 * zasila stronę „Testy (beta)”, widok admina i przewodnik PDF. Identyfikatory muszą być unikalne i stabilne.
 */
describe('Scenariusze testów (beta)', () => {
  it('identyfikatory scenariuszy i kroków są unikalne, a krok należy do swojego scenariusza (sNN.kM)', () => {
    const kroki = SCENARIUSZE_BETA.flatMap((s) => s.kroki.map((k) => k.id));
    expect(SCENARIUSZE_BETA_IDS.size).toBe(SCENARIUSZE_BETA.length);
    expect(KROKI_BETA_IDS.size).toBe(kroki.length);
    for (const s of SCENARIUSZE_BETA) {
      expect(s.id).toMatch(/^s\d{2}$/);
      for (const k of s.kroki) expect(k.id).toMatch(new RegExp(`^${s.id}\\.k\\d+$`));
      expect(s.kroki.length).toBeGreaterThan(0);
      expect(s.weryfikacja.length).toBeGreaterThan(0);
    }
  });

  it('scenariusze obejmują asystenta AI, prognozy i kopie (o to prosił właściciel przy przewodniku)', () => {
    const tytuly = SCENARIUSZE_BETA.map((s) => s.tytul.toLowerCase()).join(' | ');
    expect(tytuly).toMatch(/asystent ai/);
    expect(tytuly).toMatch(/prognoz/);
    expect(tytuly).toMatch(/kopie/);
  });

  it('postęp liczy tylko znane kroki (usunięty krok z bazy nie zawyża wyniku)', () => {
    expect(policzPostepBeta({ 's01.k1': 'x', 's99.k1': 'x' })).toEqual({ zrobione: 1, wszystkie: LICZBA_KROKOW_BETA });
    expect(policzPostepBeta(null).zrobione).toBe(0);
  });

  it('26.10: poczta z migracji, płatności i dostęp współpracownika są obowiązkowe; Git, aplikacje, SSH i cron – opcjonalne', () => {
    const tytul = (id: string) => SCENARIUSZE_BETA.find((s) => s.id === id);
    expect(tytul('s12')?.tytul).toMatch(/poczty/i);
    expect(tytul('s13')?.tytul).toMatch(/faktury/i);
    expect(tytul('s14')?.tytul).toMatch(/współpracownika/i);
    const opcjonalne = SCENARIUSZE_BETA.filter((s) => s.opcjonalny).map((s) => s.id);
    expect(opcjonalne).toEqual(['s15', 's16']);
    expect(SCENARIUSZE_BETA.at(-1)?.id).toBe('s16');
  });

  it('paczka 123: obowiązkowy scenariusz „Kreator stron” po domenie – tworzenie, tekst, zdjęcie, publikacja i wycofanie', () => {
    const ids = SCENARIUSZE_BETA.map((s) => s.id);
    const s17 = SCENARIUSZE_BETA.find((s) => s.id === 's17')!;
    expect(s17.tytul).toBe('Kreator stron');
    expect(s17.opcjonalny).toBeFalsy();
    expect(s17.poczta).toBeFalsy();
    expect(ids.indexOf('s17')).toBe(ids.indexOf('s04') + 1);
    const kroki = s17.kroki.map((k) => k.tekst).join(' ');
    for (const r of [/Nowa strona/, /Edycję na stronie/, /zdjęcie/, /Publikuj/, /Wycofaj publikację/]) expect(kroki).toMatch(r);
    expect(KROKI_BETA_WYMAGANE.has('s17.k5')).toBe(true);
    expect(SCENARIUSZE_BETA_POCZTA.map((s) => s.id)).not.toContain('s17');
    // Nie obiecujemy tego, czego publikacja jeszcze nie ma.
    expect(JSON.stringify(s17)).not.toMatch(/WordPress|językow/);
  });

  it('kroki opcjonalnych scenariuszy da się zapisać, ale nie wliczają się do postępu', () => {
    expect(KROKI_BETA_IDS.has('s15.k1')).toBe(true);
    const wymagane = SCENARIUSZE_BETA.filter((s) => !s.opcjonalny).reduce((n, s) => n + s.kroki.length, 0);
    expect(LICZBA_KROKOW_BETA).toBe(wymagane);
    expect(LICZBA_KROKOW_BETA).toBeLessThan(KROKI_BETA_IDS.size);
    expect(policzPostepBeta({ 's15.k1': 'x', 's16.k2': 'x', 's01.k1': 'x' })).toEqual({ zrobione: 1, wszystkie: LICZBA_KROKOW_BETA });
  });

  it('decyzja 4: scenariusz 02 nie każe szukać faktury za zakup z kredytów z kodu – mówi, że jej nie ma', () => {
    const s02 = SCENARIUSZE_BETA.find((s) => s.id === 's02')!;
    const tekst = [...s02.weryfikacja, ...s02.kroki.map((k) => k.tekst)].join(' ');
    expect(tekst).not.toMatch(/faktur\p{L}* za zakup/iu);
    expect(tekst).not.toMatch(/Znajdź fakturę/);
    expect(tekst).toMatch(/kredyty z kodu testera to nie zakup, więc nie ma za nie faktury/);
  });

  it('P4-12: ścieżka „tylko poczta” – zamówienie samej poczty w 02 i oznaczone scenariusze bez strony i WordPressa', () => {
    expect(SCENARIUSZE_BETA.find((s) => s.id === 's02')!.kroki.map((k) => k.tekst).join(' ')).toMatch(/Poczta e-mail/);
    const ids = SCENARIUSZE_BETA_POCZTA.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['s01', 's02', 's05', 's12', 's13']));
    for (const nie of ['s03', 's06', 's07', 's09', 's15', 's16']) expect(ids).not.toContain(nie);
    expect(SCENARIUSZE_BETA_POCZTA.every((s) => !s.opcjonalny)).toBe(true);
  });
});
