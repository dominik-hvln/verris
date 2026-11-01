import { DOMYSLNA_KONFIGURACJA_ASYSTENTA, odczytajKonfiguracjeAsystenta } from './konfiguracja.js';

describe('konfiguracja asystenta www', () => {
  it('brak ustawienia → domyślnie wyłączony, Sonnet 5.5 + Haiku 4.5, limity 10/150 USD', () => {
    expect(odczytajKonfiguracjeAsystenta(null)).toEqual(DOMYSLNA_KONFIGURACJA_ASYSTENTA);
    expect(DOMYSLNA_KONFIGURACJA_ASYSTENTA).toMatchObject({
      wlaczony: false,
      model: 'claude-sonnet-5-5',
      modelStraznika: 'claude-haiku-4-5-20251001',
    });
  });

  it('śmieci wracają do domyślnych, „wlaczony” tylko dla true', () => {
    expect(
      odczytajKonfiguracjeAsystenta(JSON.stringify({ wlaczony: 'true', model: 'x y; drop', limitDziennyUsd: -5, limitMiesiecznyUsd: 1e9 })),
    ).toEqual(DOMYSLNA_KONFIGURACJA_ASYSTENTA);
    expect(odczytajKonfiguracjeAsystenta('{nie json')).toEqual(DOMYSLNA_KONFIGURACJA_ASYSTENTA);
  });

  it('poprawne wartości są przyjmowane', () => {
    expect(
      odczytajKonfiguracjeAsystenta(
        JSON.stringify({ wlaczony: true, model: 'claude-opus-5-5', modelStraznika: 'claude-haiku-4-5', limitDziennyUsd: 3.456, limitMiesiecznyUsd: 0 }),
      ),
    ).toEqual({ wlaczony: true, model: 'claude-opus-5-5', modelStraznika: 'claude-haiku-4-5', limitDziennyUsd: 3.46, limitMiesiecznyUsd: 0 });
  });
});
