import { KROKI_BETA_IDS, SCENARIUSZE_BETA, SCENARIUSZE_BETA_IDS, policzPostepBeta } from '@verris/contracts';

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
    expect(policzPostepBeta({ 's01.k1': 'x', 's99.k1': 'x' })).toEqual({ zrobione: 1, wszystkie: KROKI_BETA_IDS.size });
    expect(policzPostepBeta(null).zrobione).toBe(0);
  });
});
