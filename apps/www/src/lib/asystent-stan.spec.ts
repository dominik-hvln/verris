import {
  KLUCZ_SESJI,
  akapity,
  bezpiecznyUrl,
  odczytajBlad,
  odczytajOdpowiedz,
  reakcjaNaBlad,
  wczytajSesje,
  zapiszSesje,
} from './asystent-stan';

describe('asystent www – logika widgetu', () => {
  it('błąd API: kod i komunikat (także tablica walidacji), nieznany kod pominięty', () => {
    expect(odczytajBlad(400, { kod: 'CAPTCHA_WYMAGANA', message: 'Potwierdź' })).toEqual({
      ok: false,
      status: 400,
      kod: 'CAPTCHA_WYMAGANA',
      komunikat: 'Potwierdź',
    });
    expect(odczytajBlad(400, { message: ['Pytanie może mieć najwyżej 1000 znaków.'] })).toEqual({
      ok: false,
      status: 400,
      komunikat: 'Pytanie może mieć najwyżej 1000 znaków.',
    });
    expect(odczytajBlad(500, { kod: 'COS_INNEGO' })).toEqual({ ok: false, status: 500 });
    expect(odczytajBlad(502, null)).toEqual({ ok: false, status: 502 });
  });

  it('odpowiedź: tylko pola z kontraktu, linki tylko https do verris.pl', () => {
    expect(
      odczytajOdpowiedz({
        rozmowaId: 'r1',
        odpowiedz: 'Tak.',
        nieWiem: false,
        kosztUsd: 1,
        zrodla: [
          { id: 'cennik', tytul: 'Cennik', url: 'https://verris.pl/cennik' },
          { id: 'kb-1', tytul: 'Poczta', url: 'https://pomoc.verris.pl/a/poczta' },
          { id: 'x', tytul: 'Obcy', url: 'https://evil.example/verris.pl' },
          { id: 'y', tytul: 'JS', url: 'javascript:alert(1)' },
          { zly: true },
        ],
      }),
    ).toEqual({
      rozmowaId: 'r1',
      odpowiedz: 'Tak.',
      nieWiem: false,
      zrodla: [
        { id: 'cennik', tytul: 'Cennik', url: 'https://verris.pl/cennik' },
        { id: 'kb-1', tytul: 'Poczta', url: 'https://pomoc.verris.pl/a/poczta' },
        { id: 'x', tytul: 'Obcy', url: null },
        { id: 'y', tytul: 'JS', url: null },
      ],
    });
    expect(odczytajOdpowiedz({ odpowiedz: 'x' })).toBeNull();
    expect(bezpiecznyUrl('http://verris.pl')).toBeNull();
    expect(bezpiecznyUrl('https://verris.pl.evil.com')).toBeNull();
  });

  it.each([
    [{ status: 400, kod: 'CAPTCHA_WYMAGANA' as const }, { captcha: true, przekaz: false }],
    [{ status: 429, kod: 'LIMIT_ROZMOWY' as const }, { przekaz: true, nowaRozmowa: true }],
    [{ status: 429, kod: 'LIMIT_DOBOWY' as const }, { przekaz: true }],
    [{ status: 429 }, { przekaz: true, captcha: false }],
    [{ status: 503, kod: 'NIEDOSTEPNY' as const }, { przekaz: true }],
    [{ status: 503, kod: 'BRAK_KONFIGURACJI' as const }, { przekaz: true }],
    [{ status: 0 }, { przekaz: false, captcha: false }],
  ])('reakcja na błąd %j', (blad, oczek) => {
    expect(reakcjaNaBlad(blad)).toMatchObject(oczek);
  });

  it('niedostępny: komunikat z prośbą o telefon i godzinami', () => {
    expect(reakcjaNaBlad({ status: 503, kod: 'NIEDOSTEPNY' }).tresc).toContain('9–17');
  });

  it('sesja: zapis i odczyt w sessionStorage, błędy pamięci nie psują widgetu', () => {
    const m = new Map<string, string>();
    const magazyn = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    zapiszSesje(magazyn, { rozmowaId: 'r1', wymiany: 2, wiadomosci: [{ rola: 'ja', tresc: 'Hej' }] });
    expect(m.has(KLUCZ_SESJI)).toBe(true);
    expect(wczytajSesje(magazyn)).toEqual({ rozmowaId: 'r1', wymiany: 2, wiadomosci: [{ rola: 'ja', tresc: 'Hej' }] });

    const rzuca = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(wczytajSesje(rzuca)).toEqual({ rozmowaId: null, wiadomosci: [], wymiany: 0 });
    expect(() => zapiszSesje(rzuca, { rozmowaId: null, wiadomosci: [], wymiany: 0 })).not.toThrow();
    expect(wczytajSesje({ getItem: () => '{zepsute' })).toEqual({ rozmowaId: null, wiadomosci: [], wymiany: 0 });
    expect(wczytajSesje(undefined).rozmowaId).toBeNull();
  });

  it('akapity odpowiedzi', () => {
    expect(akapity('Pierwszy.\n\nDrugi.\n \nTrzeci.')).toEqual(['Pierwszy.', 'Drugi.', 'Trzeci.']);
  });
});
