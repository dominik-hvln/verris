import { limitZLogu, statystykiPocztyZLogu } from './poczta-wezla.js';

describe('F3.1 — odczyt wyników poczty węzła', () => {
  it('limit konta: wartość, domyślny, nieczytelny plik; obcy format — null', () => {
    expect(limitZLogu('x\nVERRIS_MQ_LIMIT klient1 250 1000\n')).toEqual({ login: 'klient1', limit: 250, nieczytelny: false, domyslny: 1000 });
    expect(limitZLogu('VERRIS_MQ_LIMIT klient1 domyslny -')).toEqual({ login: 'klient1', limit: null, nieczytelny: false, domyslny: null });
    expect(limitZLogu('VERRIS_MQ_LIMIT klient1 ? 1000')).toMatchObject({ limit: null, nieczytelny: true });
    expect(limitZLogu('VERRIS_MQ_LIMIT ../x 5 1000')).toBeNull();
    expect(limitZLogu(null)).toBeNull();
  });

  it('statystyki: nadawcy, odrzucenia i okno; wiersze z adresem lub znakami spoza wzorca odrzucone', () => {
    const s = statystykiPocztyZLogu(
      [
        'VERRIS_MS klient.pl|klient1|20|3|1',
        'VERRIS_MS (zwrotki)|-|4|4|0',
        'VERRIS_MS ktos@klient.pl|-|1|0|0',
        'VERRIS_MB 550|wp.pl|3',
        'VERRIS_MB -|-|1',
        'VERRIS_MS_OKNO 2026-10-10T00:00:01 2026-10-11T01:00:00 24',
      ].join('\n'),
    );
    expect(s.nadawcy).toEqual([
      { domena: 'klient.pl', uzytkownik: 'klient1', wiadomosci: 20, odrzucone: 3, opoznione: 1 },
      { domena: '(zwrotki)', uzytkownik: null, wiadomosci: 4, odrzucone: 4, opoznione: 0 },
    ]);
    expect(s.odrzucenia).toEqual([{ kod: '550', serwer: 'wp.pl', liczba: 3 }, { kod: null, serwer: null, liczba: 1 }]);
    expect(s.okno).toEqual({ od: '2026-10-10T00:00:01', do: '2026-10-11T01:00:00', wiadomosci: 24 });
  });
});
