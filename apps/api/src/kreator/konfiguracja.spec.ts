import { kontoTestowe, miesiacUtc, odczytajKonfiguracjeKreatora } from './konfiguracja.js';

// Składanie podglądu i jego nagłówki: libs/kreator/src/render/podglad-jeden-plik.spec.ts (paczka 123).

describe('konfiguracja kreatora', () => {
  it('domyślnie wyłączony, Sonnet 5.5; tylko modele Anthropic; konta testowe małymi literami bez duplikatów', () => {
    expect(odczytajKonfiguracjeKreatora(null)).toEqual({
      modelGeneracji: 'claude-sonnet-5-5',
      modelZmian: 'claude-sonnet-5-5',
      wlaczony: false,
      kontaTestowe: [],
      bibliotekiZdjec: ['pixabay', 'openverse', 'pexels'],
    });
    const k = odczytajKonfiguracjeKreatora(JSON.stringify({ modelGeneracji: 'gpt-6-luna', modelZmian: 'claude-opus-5-5', wlaczony: 'tak', kontaTestowe: ['A@b.pl', 'a@b.pl ', 7, ''] }));
    expect(k).toEqual({ modelGeneracji: 'claude-sonnet-5-5', modelZmian: 'claude-opus-5-5', wlaczony: false, kontaTestowe: ['a@b.pl'], bibliotekiZdjec: ['pixabay', 'openverse', 'pexels'] });
    // Paczka 122: biblioteki zdjęć – tylko znani dostawcy, bez powtórzeń, kolejność z konfiguracji; pusta lista = wyłączone.
    expect(odczytajKonfiguracjeKreatora(JSON.stringify({ bibliotekiZdjec: ['openverse', 'unsplash', 'openverse', 'pixabay'] })).bibliotekiZdjec).toEqual(['openverse', 'pixabay']);
    expect(odczytajKonfiguracjeKreatora(JSON.stringify({ bibliotekiZdjec: [] })).bibliotekiZdjec).toEqual([]);
    expect(odczytajKonfiguracjeKreatora('[1,2]')).toEqual(odczytajKonfiguracjeKreatora(null));
    expect(odczytajKonfiguracjeKreatora('{zepsute')).toEqual(odczytajKonfiguracjeKreatora(null));
  });

  it('konto testowe po e-mailu albo ID; miesiąc UTC', () => {
    const k = odczytajKonfiguracjeKreatora(JSON.stringify({ kontaTestowe: ['jan@verris.pl', 'abc-123'] }));
    expect(kontoTestowe(k, { id: 'x', email: 'Jan@Verris.pl' })).toBe(true);
    expect(kontoTestowe(k, { id: 'ABC-123' })).toBe(true);
    expect(kontoTestowe(k, { id: 'y', email: 'obcy@verris.pl' })).toBe(false);
    expect(miesiacUtc(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12');
    expect(miesiacUtc(new Date('2027-01-01T00:30:00+02:00'))).toBe('2026-12');
  });
});
