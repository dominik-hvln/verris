import { PassThrough } from 'node:stream';
import { BladImap, PolaczenieImap, cytuj, dataImap, normalizujOdcisk } from './imap.js';
import { atrapaImap } from '../../test/atrapa-imap.js';

/** F3.7 (D6) — minimalny klient IMAP: literały, SEARCH, FETCH BODY.PEEK, STORE słowa kluczowego, błędy serwera. */
describe('klient IMAP', () => {
  const mail = Buffer.from('From: a@b.pl\r\nSubject: Test\r\nMessage-ID: <x@b.pl>\r\n\r\nTreść {5}\r\nlinia\r\n');

  it('loguje, szuka, pobiera nagłówki i całość (literały z CRLF i „{n}” w treści), oznacza słowem kluczowym', async () => {
    const a = await atrapaImap({ wiadomosci: new Map([[7, mail], [9, mail]]), haslo: 'tajne"\\x' });
    const imap = new PolaczenieImap(await a.polacz());
    try {
      await imap.powitanie();
      await imap.zaloguj('zgloszenia@verris.pl', 'tajne"\\x');
      await imap.wybierz();
      expect(await imap.szukajBezSlowa('VerrisZgloszenia', new Date('2026-09-11T10:00:00Z'))).toEqual([7, 9]);
      const n = await imap.naglowki(7);
      expect(n.rozmiar).toBe(mail.length);
      expect(n.naglowki.toString()).toContain('Subject: Test');
      expect(n.naglowki.toString()).not.toContain('Treść');
      expect((await imap.wiadomosc(7)).equals(mail)).toBe(true);
      await imap.oznacz(7, 'VerrisZgloszenia');
      expect([...a.oznaczone]).toEqual([7]);
      expect(await imap.szukajBezSlowa('VerrisZgloszenia', new Date())).toEqual([9]);
      expect(a.komendy).toContain('UID SEARCH UNKEYWORD VerrisZgloszenia SINCE 11-Sep-2026');
      expect(a.komendy).toContain('UID FETCH 7 (UID BODY.PEEK[])');
    } finally {
      await imap.wyloguj();
      await a.zamknij();
    }
  });

  it('odmowa serwera (NO) = wyjątek, bez hasła w komunikacie', async () => {
    const a = await atrapaImap({ wiadomosci: new Map(), haslo: 'dobre' });
    const imap = new PolaczenieImap(await a.polacz());
    try {
      await imap.powitanie();
      const e = await imap.zaloguj('u@verris.pl', 'zle-haslo').catch((x: unknown) => x);
      expect(e).toBeInstanceOf(BladImap);
      expect((e as Error).message).toMatch(/LOGIN/);
      expect((e as Error).message).not.toContain('zle-haslo');
    } finally {
      imap.zamknij();
      await a.zamknij();
    }
  });

  it('STORE odrzucony = wyjątek (nie udajemy, że oznaczono)', async () => {
    const a = await atrapaImap({ wiadomosci: new Map([[1, mail]]), storeNo: true });
    const imap = new PolaczenieImap(await a.polacz());
    try {
      await imap.powitanie();
      await imap.zaloguj('u', 'p');
      await expect(imap.oznacz(1, 'VerrisZgloszenia')).rejects.toBeInstanceOf(BladImap);
    } finally {
      imap.zamknij();
      await a.zamknij();
    }
  });

  it('literał ponad limit i brak odpowiedzi — przerwanie z błędem', async () => {
    const s = new PassThrough();
    const imap = new PolaczenieImap(s, { maxLiteral: 10, timeoutMs: 50 });
    s.write('* 1 FETCH (BODY[] {999}\r\n');
    await expect(imap.czytajLinie()).rejects.toThrow(/większy niż limit/);
    const cisza = new PolaczenieImap(new PassThrough(), { maxLiteral: 10, timeoutMs: 30 });
    await expect(cisza.czytajLinie()).rejects.toThrow(/limit czasu/);
  });

  it('cytowanie i wejście bez wstrzyknięć: CR/LF i znaki spoza ASCII odrzucone, słowo kluczowe i UID walidowane', async () => {
    expect(cytuj('a"b\\c')).toBe('"a\\"b\\\\c"');
    expect(() => cytuj('a\r\nA2 DELETE INBOX')).toThrow(BladImap);
    const imap = new PolaczenieImap(new PassThrough(), { maxLiteral: 10, timeoutMs: 30 });
    await expect(imap.oznacz(1, 'Zle slowo')).rejects.toBeInstanceOf(BladImap);
    await expect(imap.wiadomosc(0)).rejects.toBeInstanceOf(BladImap);
    expect(dataImap(new Date('2026-01-05T23:00:00Z'))).toBe('5-Jan-2026');
    expect(normalizujOdcisk('aa:BB:0c')).toBe('AABB0C');
  });
});
