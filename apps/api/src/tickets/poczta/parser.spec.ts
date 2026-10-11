import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  dataOtrzymania,
  normalizujWzorzec,
  ocenZalacznik,
  odetnijCytat,
  parsujMail,
  parsujNaglowki,
  powodAutomatu,
  powodSpamu,
  tematZgloszenia,
  zablokowany,
} from './parser.js';
import { krotkieIdZTematu, zgloszenieZNaglowkow } from '../../mail/watek-zgloszenia.js';

/** F3.7 (OE-19, OE-20) — rozbiór maili przychodzących do zgłoszeń na plikach .eml z typowych klientów pocztowych. */
const eml = (n: string) => readFileSync(join(import.meta.dirname, '__fixtures__', n));
const ID = '1a2b3c4d-0000-4000-8000-0000000000aa';
const DOMENY = ['verris.pl'];

describe('parser maili przychodzących', () => {
  it('nowe zgłoszenie: nadawca małymi literami, temat i treść z ISO-8859-2 (QP), PDF tak, .exe nie', async () => {
    const m = await parsujMail(eml('nowe-zgloszenie.eml'));
    expect(m.messageId).toBe('<CAF1234nowe@mail.klient.pl>');
    expect(m.nadawca).toBe('jan@klient.pl');
    expect(m.nadawcaNazwa).toBe('Jan Kowalski');
    expect(m.temat).toBe('Błąd 500 na stronie sklepu');
    expect(m.tekst).toContain('strona sklepu zwraca błąd 500');
    expect(m.doAdresy).toEqual(['support@verris.pl']);
    expect(m.zalaczniki.map((z) => [z.nazwa, z.typ])).toEqual([['faktura.pdf', 'application/pdf']]);
    expect(m.pominiete).toEqual([{ nazwa: 'faktura.pdf.exe', powod: 'niedozwolony typ pliku' }]);
    expect(powodAutomatu(m, DOMENY)).toBeNull();
    expect(powodSpamu(m.naglowki)).toBeNull();
  });

  it('odpowiedź z Gmaila: wątek z naszego Message-ID, temat z [#…], treść bez cytatu (nagłówek na dwóch liniach)', async () => {
    const m = await parsujMail(eml('odpowiedz-gmail.eml'));
    expect(zgloszenieZNaglowkow(m.watek, 'verris.pl')).toBe(ID);
    expect(krotkieIdZTematu(m.temat)).toBe('1a2b3c4d');
    expect(m.tekst).toBe('Dziękuję, rekordy już zmieniłem. Czy teraz jest OK?');
    expect(tematZgloszenia(m.temat)).toBe('Odpowiedź opiekuna: DNS');
  });

  it('odpowiedź z Outlooka (PL): bez bloku „Od:/Wysłano:” i kreski; temat „ODP:” rozpoznany', async () => {
    const m = await parsujMail(eml('odpowiedz-outlook.eml'));
    expect(m.tekst).toBe('Nadal nie dziala.');
    expect(krotkieIdZTematu(m.temat)).toBe('1a2b3c4d');
    expect(zgloszenieZNaglowkow(m.watek, 'verris.pl')).toBeNull();
  });

  it('spam (X-Spam: Yes z filtra serwera) — rozpoznany już z samych nagłówków', async () => {
    const naglowki = eml('spam.eml').subarray(0, eml('spam.eml').indexOf('\r\n\r\n'));
    const n = await parsujNaglowki(naglowki);
    expect(n.messageId).toBe('<spam-001@tani-towar.example>');
    expect(powodSpamu(n.naglowki)).toBe('x-spam: Yes');
  });

  it('automaty: autoresponder (Auto-Submitted), zwrotka (pusty Return-Path), lista, nasza domena — bez zgłoszenia', async () => {
    expect(powodAutomatu(await parsujMail(eml('autoresponder.eml')), DOMENY)).toMatch(/Auto-Submitted/);
    expect(powodAutomatu(await parsujMail(eml('zwrotka.eml')), DOMENY)).toMatch(/raport doręczenia|zwrotka/);
    const zwykly = await parsujMail(eml('nowe-zgloszenie.eml'));
    expect(powodAutomatu({ ...zwykly, naglowki: [...zwykly.naglowki, { key: 'list-id', value: '<news.firma.pl>' }] }, DOMENY)).toMatch(/lista/);
    expect(powodAutomatu({ ...zwykly, nadawca: 'support@verris.pl' }, DOMENY)).toMatch(/pętla/);
    expect(powodAutomatu({ ...zwykly, naglowki: [...zwykly.naglowki, { key: 'auto-submitted', value: 'no' }] }, DOMENY)).toBeNull();
  });

  it('obcy nadawca z plikami: JPG tak; ZIP i „PDF” z treścią wykonywalną — nie', async () => {
    const m = await parsujMail(eml('obcy-z-plikami.eml'));
    expect(m.doAdresy).toEqual(['abuse@verris.pl']);
    expect(m.zalaczniki.map((z) => z.nazwa)).toEqual(['zrzut.jpg']);
    expect(m.pominiete).toEqual([
      { nazwa: 'dowody.zip', powod: 'niedozwolony typ pliku' },
      { nazwa: 'raport.pdf', powod: 'treść nie pasuje do rozszerzenia' },
    ]);
  });

  it('bez Message-ID: stały identyfikator z nagłówków (ten sam mail = ten sam id); HTML → tekst', async () => {
    const a = await parsujMail(eml('bez-message-id-html.eml'));
    const b = await parsujMail(eml('bez-message-id-html.eml'));
    expect(a.messageId).toMatch(/^<brak-id\.[0-9a-f]{40}@poczta\.verris>$/);
    expect(a.messageId).toBe(b.messageId);
    expect(a.tekst).toContain('Proszę o fakture za październik.');
  });

  it('cytat: „On … wrote:”, „-----Original Message-----”, blok „>” na końcu; sam cytat — cała treść zostaje', () => {
    expect(odetnijCytat('Nowe.\n\nOn Mon, Oct 12, 2026 at 10:00 AM Verris <support@verris.pl> wrote:\n> stare')).toBe('Nowe.');
    expect(odetnijCytat('Nowe.\n-----Original Message-----\nFrom: x')).toBe('Nowe.');
    expect(odetnijCytat('Nowe.\n\n> stare\n> stare2\n')).toBe('Nowe.');
    expect(odetnijCytat('> tylko cytat')).toBe('> tylko cytat');
    // Zwykłe „napisał:” w środku zdania nie ucina treści.
    expect(odetnijCytat('Kolega napisał: że działa.\nAle nie działa.')).toBe('Kolega napisał: że działa.\nAle nie działa.');
  });

  it('załączniki: typ z rozszerzenia i sygnatury, nie z nagłówka nadawcy; limit 8 MB', () => {
    expect(ocenZalacznik('a.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toEqual({ typ: 'image/png' });
    expect(ocenZalacznik('log.txt', Buffer.from('ok'))).toEqual({ typ: 'text/plain' });
    expect(ocenZalacznik('log.txt', Buffer.from([0x4d, 0x5a, 0]))).toEqual({ powod: 'treść nie pasuje do rozszerzenia' });
    expect(ocenZalacznik('makro.docm', Buffer.from('x'))).toEqual({ powod: 'niedozwolony typ pliku' });
    expect(ocenZalacznik('duzy.pdf', Buffer.alloc(8 * 1024 * 1024 + 1))).toEqual({ powod: 'większy niż 8 MB' });
  });

  it('lista blokad: dokładny adres albo @domena; wzorzec walidowany', () => {
    expect(zablokowany('Jan@Spam.pl', ['@spam.pl'])).toBe('@spam.pl');
    expect(zablokowany('jan@spam.pl', ['jan@spam.pl'])).toBe('jan@spam.pl');
    expect(zablokowany('jan@klient.pl', ['@spam.pl', 'ktos@klient.pl'])).toBeNull();
    expect(normalizujWzorzec(' @Spam.PL ')).toBe('@spam.pl');
    expect(normalizujWzorzec('spam.pl')).toBeNull();
    expect(normalizujWzorzec('*@spam.pl')).toBeNull();
  });

  // Przegląd F3.7 — dane od nadawcy, które wywracały zapis w PostgreSQL albo omijały filtr spamu.
  it('NUL (=00 w QP / encoded-word) usunięty z tematu, nazwy nadawcy, nagłówków i treści', async () => {
    const m = await parsujMail(eml('nul-i-zla-data.eml'));
    expect(m.temat).toBe('Awaria poczty');
    expect(m.nadawcaNazwa).toBe('Jan Kowalski');
    expect(m.tekst).toBe('Poczta nie działa od rana.');
    expect(JSON.stringify(m).includes('\\u0000')).toBe(false);
    const n = await parsujNaglowki(eml('nul-i-zla-data.eml').subarray(0, eml('nul-i-zla-data.eml').indexOf('\r\n\r\n')));
    expect([n.temat, n.nadawcaNazwa, ...n.naglowki.map((h) => h.value)].some((v) => v?.includes('\u0000'))).toBe(false);
  });

  it('data otrzymania: rok -10000 i data z przyszłości → teraz; ostatni rok — z nagłówka', async () => {
    const teraz = new Date('2026-10-11T12:00:00Z');
    const m = await parsujMail(eml('nul-i-zla-data.eml'));
    expect(m.data!.getUTCFullYear()).toBe(-10000);
    expect(dataOtrzymania(m.data, teraz)).toBe(teraz);
    expect(dataOtrzymania(new Date('2099-01-01T00:00:00Z'), teraz)).toBe(teraz);
    expect(dataOtrzymania(null, teraz)).toBe(teraz);
    const wczoraj = new Date('2026-10-10T08:00:00Z');
    expect(dataOtrzymania(wczoraj, teraz)).toBe(wczoraj);
  });

  it('spam: „X-Spam: No” dopisane przez nadawcę nad nagłówkiem filtra nie ukrywa „X-Spam: Yes”', () => {
    expect(powodSpamu([{ key: 'x-spam', value: 'No' }, { key: 'x-spam', value: 'Yes' }])).toBe('x-spam: Yes');
    expect(powodSpamu([{ key: 'x-spam-flag', value: 'NO' }, { key: 'x-spam-flag', value: 'YES' }])).toBe('x-spam-flag: YES');
    expect(powodSpamu([{ key: 'x-spam-status', value: 'No, score=1' }, { key: 'x-spam-status', value: 'Yes, score=9' }])).toBe('x-spam-status: Yes');
    expect(powodSpamu([{ key: 'x-spam', value: 'No' }])).toBeNull();
  });
});
