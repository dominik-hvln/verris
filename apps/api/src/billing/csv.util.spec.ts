import { rowsToCsv } from './csv.util';

/** M-28 — eksport historii transakcji: poprawny CSV bez wstrzykiwania formuł do arkusza. */
describe('rowsToCsv', () => {
  const kol = [{ header: 'opis', value: (r: { o: string }) => r.o }];

  it('BOM, nagłówek, CRLF, cudzysłowy i przecinki', () => {
    expect(rowsToCsv([{ o: 'a,"b"' }], kol)).toBe('﻿opis\r\n"a,""b"""\r\n');
  });

  it.each(['=HYPERLINK("http://zlo.pl","x")', '+1+1', '@SUM(A1)', '-2+3', '\tcmd'])('neutralizuje formułę %j', (o) => {
    const linia = rowsToCsv([{ o }], kol).split('\r\n')[1]!;
    expect(linia.replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('liczby ujemne zostają liczbami', () => {
    expect(rowsToCsv([{ o: '-45.00' }], kol).split('\r\n')[1]).toBe('-45.00');
  });
});
