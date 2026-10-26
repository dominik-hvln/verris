import { KROKI_BETA_IDS, LICZBA_KROKOW_BETA, SCENARIUSZE_BETA, SCENARIUSZE_BETA_IDS, policzPostepBeta } from '@verris/contracts';

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

  it('26.10: poczta z migracji, płatności i dostęp współpracownika są obowiązkowe; Git, aplikacje, SSH i cron — opcjonalne', () => {
    const tytul = (id: string) => SCENARIUSZE_BETA.find((s) => s.id === id);
    expect(tytul('s12')?.tytul).toMatch(/poczty/i);
    expect(tytul('s13')?.tytul).toMatch(/faktury/i);
    expect(tytul('s14')?.tytul).toMatch(/współpracownika/i);
    const opcjonalne = SCENARIUSZE_BETA.filter((s) => s.opcjonalny).map((s) => s.id);
    expect(opcjonalne).toEqual(['s15', 's16']);
    expect(SCENARIUSZE_BETA.at(-1)?.id).toBe('s16');
  });

  it('kroki opcjonalnych scenariuszy da się zapisać, ale nie wliczają się do postępu', () => {
    expect(KROKI_BETA_IDS.has('s15.k1')).toBe(true);
    const wymagane = SCENARIUSZE_BETA.filter((s) => !s.opcjonalny).reduce((n, s) => n + s.kroki.length, 0);
    expect(LICZBA_KROKOW_BETA).toBe(wymagane);
    expect(LICZBA_KROKOW_BETA).toBeLessThan(KROKI_BETA_IDS.size);
    expect(policzPostepBeta({ 's15.k1': 'x', 's16.k2': 'x', 's01.k1': 'x' })).toEqual({ zrobione: 1, wszystkie: LICZBA_KROKOW_BETA });
  });
});
