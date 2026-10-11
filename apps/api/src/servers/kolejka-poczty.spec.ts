import { NodeTaskStatus } from '@verris/database';
import { ID_WIADOMOSCI_EXIMA, stanKolejki, wiadomosciZLogu } from './kolejka-poczty.js';

/** F3.1 — odczyt wyniku zadania MAIL_QUEUE: tylko nagłówki z wierszy VERRIS_MQ, identyfikatory wg formatu Exima. */
describe('F3.1 — kolejka poczty: wynik zadania węzła', () => {
  it.each([
    ['1tAbCd-000000001bo-D342', true], // Exim ≥ 4.97 (6-11-4)
    ['1aBcDe-0003hL-9u', true], // starszy Exim (6-6-2)
    ['1aBcDe-0003hL-9u ', false],
    ['1aBcDe-0003hL-9', false],
    ['1aBcDe-0003hL-9u;rm', false],
    ['../../etc/passwd', false],
    ['-qff', false],
  ])('identyfikator %j → %s', (id, ok) => expect(ID_WIADOMOSCI_EXIMA.test(id)).toBe(ok));

  it('wiersze VERRIS_MQ → nagłówki; śmieci, treść i wiersze ze złym id pominięte', () => {
    const log = [
      '=== Verris task t1 (kind=MAIL_QUEUE) ===',
      'VERRIS_MQ 1tAbCd-000000001bo-D342|4m|2.9K|0|klient1@t1.verris.test|a@gmail.com,b@wp.pl|Zamówienie nr 123',
      'VERRIS_MQ 1aBcDe-0003hL-9u|2h|12K|1|biuro@klient.pl|ktos@gmail.com,+7|Faktura',
      'VERRIS_MQ zly-id|1m|1K|0|x@y.pl|z@y.pl|temat',
      'Treść: Szanowny Panie, w załączniku…',
      'VERRIS_MQ_RAZEM 3 3 2 2',
    ].join('\n');
    const w = wiadomosciZLogu(log);
    expect(w).toEqual([
      { id: '1tAbCd-000000001bo-D342', wiek: '4m', rozmiar: '2.9K', zamrozona: false, nadawca: 'klient1@t1.verris.test', odbiorcy: 'a@gmail.com,b@wp.pl', temat: 'Zamówienie nr 123' },
      { id: '1aBcDe-0003hL-9u', wiek: '2h', rozmiar: '12K', zamrozona: true, nadawca: 'biuro@klient.pl', odbiorcy: 'ktos@gmail.com,+7', temat: 'Faktura' },
    ]);
    expect(JSON.stringify(w)).not.toContain('Szanowny');
  });

  const zad = (o: Partial<{ status: NodeTaskStatus; payload: unknown; outputLog: string | null; errorMessage: string | null; minuty: number }>) => ({
    id: Math.random().toString(36),
    status: o.status ?? NodeTaskStatus.COMPLETED,
    payload: o.payload ?? { mode: 'list' },
    outputLog: o.outputLog ?? null,
    errorMessage: o.errorMessage ?? null,
    createdAt: new Date(Date.UTC(2026, 9, 10, 12, o.minuty ?? 0)),
    completedAt: o.status === NodeTaskStatus.QUEUED ? null : new Date(Date.UTC(2026, 9, 10, 12, (o.minuty ?? 0) + 1)),
  });

  it('stan: ostatni udany podgląd + trwające odczytanie; wynik usuwania i wypchnięcia; błąd węzła po polsku', () => {
    const s = stanKolejki([
      zad({ status: NodeTaskStatus.QUEUED, minuty: 30 }),
      zad({ payload: { mode: 'remove' }, outputLog: 'VERRIS_MQ_USUNIETO 2\nVERRIS_MQ_POMINIETO 1', minuty: 20 }),
      zad({ payload: { mode: 'list', szukaj: 'gmail' }, outputLog: 'VERRIS_MQ 1aBcDe-0003hL-9u|2h|12K|1|b@k.pl|k@gmail.com|F\nVERRIS_MQ_RAZEM 9 9 1 1', minuty: 10 }),
    ]);
    expect(s).toMatchObject({
      wToku: true,
      wczytano: '2026-10-10T12:11:00.000Z',
      szukaj: 'gmail',
      podsumowanie: { wKolejce: 9, przeczytano: 9, pasuje: 1, pokazano: 1 },
      usuwanie: { wToku: false, usunieto: 2, pominieto: 1, blad: null },
      wypchniecie: null,
      blad: null,
    });
    expect(s.wiadomosci).toHaveLength(1);
    const bl = stanKolejki([zad({ status: NodeTaskStatus.FAILED, outputLog: '[mail-queue] BŁĄD: brak exima na serwerze', minuty: 5 })]);
    expect(bl).toMatchObject({ wToku: false, blad: 'brak exima na serwerze', wiadomosci: [] });
  });

  it('audyt Fal 2: usuwanie przerwane błędem — liczba już usuniętych z logu obok błędu', () => {
    const s = stanKolejki([
      zad({ status: NodeTaskStatus.FAILED, payload: { mode: 'remove' }, outputLog: 'VERRIS_MQ_USUNIETO 50\nVERRIS_MQ_POMINIETO 0\n[mail-queue] BŁĄD: exim -Mrm: nie usunięto 1 — kod 1', minuty: 5 }),
    ]);
    expect(s.usuwanie).toMatchObject({ wToku: false, usunieto: 50, pominieto: 0, blad: 'exim -Mrm: nie usunięto 1 — kod 1' });
  });
});
