import {
  DOMYSLNA_KONFIGURACJA_MARKI,
  bruttoNetto,
  cenyMarki,
  dostepDoMarki,
  markaPublicznie,
  odczytajKonfiguracjeMarki,
  ofertaMarki,
  scalKonfiguracjeMarki,
  uzycieMarkiBezDanych,
} from './konfiguracja-marki.js';

/**
 * Paczka 130 – konfiguracja Kreatora marki w ustawieniach platformy (jak `kreator.konfiguracja`). Na starym kodzie
 * czerwony: modułu nie było.
 */
describe('konfiguracja Kreatora marki', () => {
  it('domyślnie wyłączony, tylko lista kont; limity i Pakiet z założeń 19.11; Sonnet 5.5; 10 MB', () => {
    expect(odczytajKonfiguracjeMarki(null)).toEqual({
      wlaczony: false,
      dostepnosc: 'lista',
      kontaTestowe: [],
      wCenieHostingu: { marek: 1, seriiMies: 3, zmianAiMies: 50 },
      pakiet: { cenaBrutto: 149, serie: 10, zmianyAi: 300, aktualizacjeSzablonowMies: 12 },
      drugaMarka: { cenaBrutto: 49 },
      pakietWKreatorzeProRocznym: false,
      symboleAi: true,
      modelGeneracji: 'claude-sonnet-5-5',
      modelZmian: 'claude-sonnet-5-5',
      maksRozmiarWgraniaMb: 10,
    });
    expect(odczytajKonfiguracjeMarki('{zepsute')).toEqual(DOMYSLNA_KONFIGURACJA_MARKI);
    expect(odczytajKonfiguracjeMarki('[1,2]')).toEqual(DOMYSLNA_KONFIGURACJA_MARKI);
  });

  it('śmieci w bazie wracają do wartości domyślnych pole po polu; konta testowe małymi literami bez duplikatów', () => {
    const k = odczytajKonfiguracjeMarki(
      JSON.stringify({
        wlaczony: 'tak',
        dostepnosc: 'vip',
        kontaTestowe: ['A@b.pl', 'a@b.pl ', 7, ''],
        wCenieHostingu: { marek: 2, seriiMies: -1, zmianAiMies: 1.5 },
        pakiet: { cenaBrutto: 199.999, serie: 9999, zmianyAi: '300' },
        drugaMarka: { cenaBrutto: 10_001 },
        symboleAi: 'nie',
        modelGeneracji: 'gpt-6',
        modelZmian: 'claude-haiku-4-5-20251001',
        maksRozmiarWgraniaMb: 100,
      }),
    );
    expect(k).toEqual({
      ...DOMYSLNA_KONFIGURACJA_MARKI,
      kontaTestowe: ['a@b.pl'],
      wCenieHostingu: { marek: 2, seriiMies: 3, zmianAiMies: 50 },
      pakiet: { cenaBrutto: 200, serie: 10, zmianyAi: 300, aktualizacjeSzablonowMies: 12 },
      modelZmian: 'claude-haiku-4-5-20251001',
    });
  });

  it('scalanie zmian admina: pola zagnieżdżone osobno – sama cena Pakietu nie zeruje limitów', () => {
    const obecna = { ...DOMYSLNA_KONFIGURACJA_MARKI, pakiet: { ...DOMYSLNA_KONFIGURACJA_MARKI.pakiet, serie: 20 } };
    const k = scalKonfiguracjeMarki(obecna, { pakiet: { cenaBrutto: 199 }, wlaczony: true, symboleAi: undefined });
    expect(k.pakiet).toEqual({ cenaBrutto: 199, serie: 20, zmianyAi: 300, aktualizacjeSzablonowMies: 12 });
    expect(k.wlaczony).toBe(true);
    expect(k.symboleAi).toBe(true);
    expect(scalKonfiguracjeMarki(obecna, { wCenieHostingu: { zmianAiMies: 80 } }).wCenieHostingu).toEqual({ marek: 1, seriiMies: 3, zmianAiMies: 80 });
  });

  it('netto liczone z brutto (÷ 1,23, do grosza – jak na fakturze): 149 → 121,14; 49 → 39,84; 99 → 80,49', () => {
    expect(bruttoNetto(149)).toEqual({ brutto: 149, netto: 121.14 });
    expect(bruttoNetto(49)).toEqual({ brutto: 49, netto: 39.84 });
    expect(bruttoNetto(99)).toEqual({ brutto: 99, netto: 80.49 });
    expect(bruttoNetto(0)).toEqual({ brutto: 0, netto: 0 });
    expect(cenyMarki(DOMYSLNA_KONFIGURACJA_MARKI)).toEqual({ pakiet: { brutto: 149, netto: 121.14 }, drugaMarka: { brutto: 49, netto: 39.84 } });
  });

  it('dostęp: lista kont zawsze; wyłączony – nikt inny; beta – testerzy; wszyscy – każdy', () => {
    const lista = { ...DOMYSLNA_KONFIGURACJA_MARKI, kontaTestowe: ['jan@verris.pl', 'abc-1'] };
    expect(dostepDoMarki(lista, { id: 'x', email: 'Jan@Verris.pl' })).toBe(true);
    expect(dostepDoMarki(lista, { id: 'ABC-1' })).toBe(true);
    expect(dostepDoMarki(lista, { id: 'y', email: 'obcy@verris.pl', tester: true })).toBe(false);
    expect(dostepDoMarki({ ...lista, wlaczony: true }, { id: 'y', tester: true })).toBe(false);
    const beta = { ...lista, wlaczony: true, dostepnosc: 'beta' as const };
    expect(dostepDoMarki(beta, { id: 'y', tester: true })).toBe(true);
    expect(dostepDoMarki(beta, { id: 'y', tester: false })).toBe(false);
    expect(dostepDoMarki({ ...beta, wlaczony: false }, { id: 'y', tester: true })).toBe(false);
    expect(dostepDoMarki({ ...lista, wlaczony: true, dostepnosc: 'wszyscy' }, { id: 'y' })).toBe(true);
    expect(dostepDoMarki({ ...lista, wlaczony: false, dostepnosc: 'wszyscy' }, { id: 'y' })).toBe(false);
  });

  it('oferta publiczna: bez cen i limitów, dopóki moduł nie jest włączony dla wszystkich', () => {
    expect(markaPublicznie(DOMYSLNA_KONFIGURACJA_MARKI)).toBe(false);
    expect(ofertaMarki(DOMYSLNA_KONFIGURACJA_MARKI)).toEqual({ dostepny: false });
    expect(ofertaMarki({ ...DOMYSLNA_KONFIGURACJA_MARKI, wlaczony: true, dostepnosc: 'beta' })).toEqual({ dostepny: false });
    expect(ofertaMarki({ ...DOMYSLNA_KONFIGURACJA_MARKI, wlaczony: false, dostepnosc: 'wszyscy' })).toEqual({ dostepny: false });
    expect(ofertaMarki({ ...DOMYSLNA_KONFIGURACJA_MARKI, wlaczony: true, dostepnosc: 'wszyscy', kontaTestowe: ['tajne@verris.pl'] })).toEqual({
      dostepny: true,
      wCenieHostingu: { marek: 1, seriiMies: 3, zmianAiMies: 50 },
      pakiet: { brutto: 149, netto: 121.14, serie: 10, zmianyAi: 300, aktualizacjeSzablonowMies: 12 },
      drugaMarka: { brutto: 49, netto: 39.84 },
      pakietWKreatorzeProRocznym: false,
      symboleAi: true,
      maksRozmiarWgraniaMb: 10,
    });
  });

  it('użycie w fazie 1: zera z oznaczeniem „brak danych”', () => {
    expect(uzycieMarkiBezDanych('2026-11')).toEqual({
      miesiac: '2026-11',
      zrodlo: 'brak-danych',
      marki: 0,
      kontaZMarka: 0,
      serie: 0,
      zmianyAi: 0,
      kosztUsd: 0,
      pakiety: 0,
      drugieMarki: 0,
    });
  });
});
