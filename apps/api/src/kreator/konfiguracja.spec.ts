import { kontoTestowe, miesiacUtc, odczytajKonfiguracjeKreatora, odczytajObrazyAi } from './konfiguracja.js';

// Składanie podglądu i jego nagłówki: libs/kreator/src/render/podglad-jeden-plik.spec.ts (paczka 123).

describe('konfiguracja kreatora', () => {
  it('domyślnie wyłączony, Sonnet 5.5; tylko modele Anthropic; konta testowe małymi literami bez duplikatów', () => {
    expect(odczytajKonfiguracjeKreatora(null)).toEqual({
      modelGeneracji: 'claude-sonnet-5-5',
      modelZmian: 'claude-sonnet-5-5',
      wlaczony: false,
      kontaTestowe: [],
      bibliotekiZdjec: ['pixabay', 'openverse', 'pexels'],
      obrazyAi: { wlaczone: false, dostawca: 'bfl', model: 'flux-pro-1.1', cenaZaObrazUsd: 0.04 },
    });
    const k = odczytajKonfiguracjeKreatora(JSON.stringify({ modelGeneracji: 'gpt-6-luna', modelZmian: 'claude-opus-5-5', wlaczony: 'tak', kontaTestowe: ['A@b.pl', 'a@b.pl ', 7, ''] }));
    expect(k).toMatchObject({ modelGeneracji: 'claude-sonnet-5-5', modelZmian: 'claude-opus-5-5', wlaczony: false, kontaTestowe: ['a@b.pl'], bibliotekiZdjec: ['pixabay', 'openverse', 'pexels'] });
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

  it('zdjęcia AI (paczka 124): domyślnie wyłączone; model musi pasować do dostawcy; cena 0–5 USD, śmieci → domyślne', () => {
    expect(odczytajObrazyAi(undefined)).toEqual({ wlaczone: false, dostawca: 'bfl', model: 'flux-pro-1.1', cenaZaObrazUsd: 0.04 });
    expect(odczytajObrazyAi({ wlaczone: true, dostawca: 'openai', model: 'gpt-image-1.5', cenaZaObrazUsd: 0.12345 })).toEqual({ wlaczone: true, dostawca: 'openai', model: 'gpt-image-1.5', cenaZaObrazUsd: 0.1235 });
    expect(odczytajObrazyAi({ dostawca: 'openai', model: 'flux-pro-1.1' }).model).toBe('gpt-image-1');
    expect(odczytajObrazyAi({ dostawca: 'midjourney', model: 'flux-dev', cenaZaObrazUsd: 7 })).toEqual({ wlaczone: false, dostawca: 'bfl', model: 'flux-dev', cenaZaObrazUsd: 0.04 });
    expect(odczytajObrazyAi({ model: 'flux-pro; rm -rf', cenaZaObrazUsd: -1, wlaczone: 'tak' })).toEqual({ wlaczone: false, dostawca: 'bfl', model: 'flux-pro-1.1', cenaZaObrazUsd: 0.04 });
    expect(odczytajKonfiguracjeKreatora(JSON.stringify({ obrazyAi: { wlaczone: true, cenaZaObrazUsd: 0 } })).obrazyAi).toEqual({ wlaczone: true, dostawca: 'bfl', model: 'flux-pro-1.1', cenaZaObrazUsd: 0 });
  });
});
