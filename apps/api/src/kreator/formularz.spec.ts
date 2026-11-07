import { describe, expect, it, vi } from 'vitest';
import { PRZYKLAD_SALON } from '@verris/kreator';
import { KreatorFormularzService, LIMIT_STRONY_DOBA, TAG_MAILA } from './formularz.service.js';
import { adresFormularza, sprawdzTokenFormularza, utworzTokenFormularza } from './formularz-token.js';
import { utworzTokenLinku } from './publikacja-token.js';
import { adresPowrotu, mailFormularza, ocenSpam, odczytajFormularz } from './formularz.js';

const ID = '11111111-2222-4333-8444-555555555555';
const KLUCZ = 'k'.repeat(48);
const T0 = Date.UTC(2026, 10, 7, 12, 0, 0);

type Rek = Record<string, unknown>;

function zbuduj(o: { strona?: Rek | null; wyslaneDzis?: number; delivered?: boolean } = {}) {
  const strona: Rek | null =
    o.strona === null
      ? null
      : {
          id: ID, userId: 'u1', status: 'GOTOWA', model: PRZYKLAD_SALON, domena: 'x.pl', adres: 'https://x.pl/', opublikowanaAt: new Date(T0 - 1000),
          ...(o.strona ?? {}),
        };
  const prisma = {
    kreatorStrona: { findUnique: vi.fn(async ({ where }: { where: Rek }) => (strona && strona.id === where.id ? strona : null)) },
    emailLog: { count: vi.fn(async () => o.wyslaneDzis ?? 0) },
    user: { findUnique: vi.fn(async () => ({ email: 'konto@klient.test' })) },
  };
  const mailer = { send: vi.fn(async () => ({ providerId: 'log', messageId: null, emailLogId: 'e1', delivered: o.delivered ?? true })) };
  const config = { get: (k: string) => (k === 'appKmsKey' ? KLUCZ : undefined) };
  const svc = new KreatorFormularzService(prisma as never, config as never, mailer as never);
  return { svc, prisma, mailer, token: utworzTokenFormularza(KLUCZ, ID) };
}

const POPRAWNY = {
  formularz: 'kontakt',
  powrot: 'https://x.pl/o-nas/?stare=1#x',
  czas: '8500',
  strona_www: '',
  zgoda: 'tak',
  imie: 'Anna Testowa',
  email: 'anna@nadawca.test',
  telefon: '600 000 000',
  wiadomosc: 'Dzień dobry,\r\nproszę o termin.',
};
const ZRODLO = { ip: '203.0.113.5', origin: 'https://x.pl', referer: 'https://x.pl/' };

describe('token formularza', () => {
  it('podpisany id strony: poprawny → id, podrobiony podpis / cudzy klucz / token linku podglądu → null', () => {
    const t = utworzTokenFormularza(KLUCZ, ID);
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(sprawdzTokenFormularza(KLUCZ, t)).toBe(ID);
    expect(sprawdzTokenFormularza(KLUCZ, `${t.slice(0, 63)}${t.at(-1) === '0' ? '1' : '0'}`)).toBeNull();
    expect(sprawdzTokenFormularza('inny'.repeat(12), t)).toBeNull();
    expect(sprawdzTokenFormularza(KLUCZ, utworzTokenLinku(KLUCZ, ID, new Date(T0 + 1e9)))).toBeNull();
    expect(sprawdzTokenFormularza(KLUCZ, '../../etc')).toBeNull();
    expect(adresFormularza('https://api.verris.test/', KLUCZ, ID)).toBe(`https://api.verris.test/kreator/formularz/${t}`);
  });
});

describe('POST /kreator/formularz/:token', () => {
  it('poprawna wysyłka → mail tekstowy do firma.email z Reply-To nadawcy, 303 na podstronę z ?formularz=wyslano#sekcja', async () => {
    const t = zbuduj();
    const r = await t.svc.wyslij(t.token, POPRAWNY, ZRODLO, T0);
    expect(r).toEqual({ status: 303, adres: 'https://x.pl/o-nas/?formularz=wyslano#kontakt' });
    expect(t.mailer.send).toHaveBeenCalledTimes(1);
    const mail = (t.mailer.send.mock.calls[0] as unknown as [Rek])[0];
    expect(mail).toMatchObject({
      to: 'kontakt@przyklad.pl', subject: 'Wiadomość ze strony x.pl', replyTo: 'anna@nadawca.test', fromRole: 'NOREPLY', category: 'TRANSACTIONAL', tag: TAG_MAILA, userId: 'u1',
    });
    expect(mail.html).toBeUndefined();
    expect(mail.text).toContain('Imię: Anna Testowa');
    expect(mail.text).toContain('Wiadomość:\nDzień dobry,\nproszę o termin.');
    expect(mail.text).not.toContain('\r');
    expect(mail.text).not.toContain('strona_www');
  });

  it('brak firma.email w modelu → mail na e-mail konta', async () => {
    const model = { ...structuredClone(PRZYKLAD_SALON), firma: { ...structuredClone(PRZYKLAD_SALON.firma), email: undefined } };
    const t = zbuduj({ strona: { model } });
    await t.svc.wyslij(t.token, POPRAWNY, ZRODLO, T0);
    expect((t.mailer.send.mock.calls[0] as unknown as [Rek])[0].to).toBe('konto@klient.test');
  });

  it('podrobiony token → 404 bez zapytań do bazy; wycofana albo usunięta strona → 404 bez maila', async () => {
    const t = zbuduj();
    const zly = await t.svc.wyslij(`${'0'.repeat(32)}${'f'.repeat(32)}`, POPRAWNY, ZRODLO, T0);
    expect(zly.status).toBe(404);
    expect(t.prisma.kreatorStrona.findUnique).not.toHaveBeenCalled();

    const wycofana = zbuduj({ strona: { opublikowanaAt: null, domena: null, adres: null } });
    const w = await wycofana.svc.wyslij(wycofana.token, POPRAWNY, ZRODLO, T0);
    expect(w.status).toBe(404);
    if (w.status === 404) {
      expect(w.html).toContain('Formularz nie działa');
      expect(w.naglowki['Content-Security-Policy']).toContain("default-src 'none'");
    }
    const usunieta = zbuduj({ strona: null });
    expect((await usunieta.svc.wyslij(usunieta.token, POPRAWNY, ZRODLO, T0)).status).toBe(404);
    expect(wycofana.mailer.send).not.toHaveBeenCalled();
    expect(usunieta.mailer.send).not.toHaveBeenCalled();
  });

  it('honeypot i wysyłka szybsza niż 3 s → ciche odrzucenie (303 „wyslano”, bez maila)', async () => {
    const t = zbuduj();
    const hp = await t.svc.wyslij(t.token, { ...POPRAWNY, strona_www: 'http://spam.test' }, ZRODLO, T0);
    expect(hp).toEqual({ status: 303, adres: 'https://x.pl/o-nas/?formularz=wyslano#kontakt' });
    const szybko = await t.svc.wyslij(t.token, { ...POPRAWNY, czas: '1200' }, { ...ZRODLO, ip: '203.0.113.6' }, T0);
    expect(szybko.status).toBe(303);
    expect(t.mailer.send).not.toHaveBeenCalled();
  });

  it('bez pomiaru czasu (bez JS): samo w sobie przechodzi; razem z obcym źródłem albo linkami → błąd', async () => {
    const t = zbuduj();
    const bezJs = { ...POPRAWNY, czas: '' };
    expect(await t.svc.wyslij(t.token, bezJs, { ...ZRODLO, ip: '198.51.100.1' }, T0)).toMatchObject({ adres: expect.stringContaining('formularz=wyslano') });
    expect(await t.svc.wyslij(t.token, bezJs, { ip: '198.51.100.2', origin: 'https://spam.test' }, T0)).toMatchObject({ adres: expect.stringContaining('formularz=blad') });
    expect(await t.svc.wyslij(t.token, { ...bezJs, wiadomosc: 'Tanio: https://spam.test' }, { ...ZRODLO, ip: '198.51.100.3' }, T0)).toMatchObject({
      adres: expect.stringContaining('formularz=blad'),
    });
    expect(t.mailer.send).toHaveBeenCalledTimes(1);
  });

  it('limit per IP: 5 wysyłek w 10 min, szósta → ?formularz=blad; po 10 min znowu można', async () => {
    const t = zbuduj();
    for (let i = 0; i < 5; i++) expect((await t.svc.wyslij(t.token, POPRAWNY, ZRODLO, T0 + i)) as Rek).toMatchObject({ adres: expect.stringContaining('wyslano') });
    expect(await t.svc.wyslij(t.token, POPRAWNY, ZRODLO, T0 + 10)).toMatchObject({ status: 303, adres: 'https://x.pl/o-nas/?formularz=blad#kontakt' });
    expect(await t.svc.wyslij(t.token, POPRAWNY, { ...ZRODLO, ip: '203.0.113.99' }, T0 + 11)).toMatchObject({ adres: expect.stringContaining('wyslano') });
    expect(await t.svc.wyslij(t.token, POPRAWNY, ZRODLO, T0 + 10 * 60 * 1000 + 5)).toMatchObject({ adres: expect.stringContaining('wyslano') });
    expect(t.mailer.send).toHaveBeenCalledTimes(7);
  });

  it('limit per strona: 50 maili na dobę (z EmailLog: tag, właściciel, temat z domeną) → błąd bez maila', async () => {
    const t = zbuduj({ wyslaneDzis: LIMIT_STRONY_DOBA });
    expect(await t.svc.wyslij(t.token, POPRAWNY, ZRODLO, T0)).toMatchObject({ adres: expect.stringContaining('formularz=blad') });
    expect(t.mailer.send).not.toHaveBeenCalled();
    expect(t.prisma.emailLog.count).toHaveBeenCalledWith({
      where: { tag: TAG_MAILA, userId: 'u1', subject: 'Wiadomość ze strony x.pl', createdAt: { gte: new Date(T0 - 24 * 60 * 60 * 1000) } },
    });
  });

  it('obcy adres powrotu → strona główna domeny publikacji; brak zgody / za długie pole / tablica → błąd', async () => {
    const t = zbuduj();
    expect(await t.svc.wyslij(t.token, { ...POPRAWNY, powrot: 'https://zlo.test/x.pl/' }, ZRODLO, T0)).toEqual({ status: 303, adres: 'https://x.pl/?formularz=wyslano#kontakt' });
    const ip = (n: number) => ({ ...ZRODLO, ip: `192.0.2.${n}` });
    expect(await t.svc.wyslij(t.token, { ...POPRAWNY, zgoda: undefined }, ip(1), T0)).toEqual({ status: 303, adres: 'https://x.pl/o-nas/?formularz=blad#kontakt' });
    expect(await t.svc.wyslij(t.token, { ...POPRAWNY, wiadomosc: 'a'.repeat(5001) }, ip(2), T0)).toMatchObject({ adres: expect.stringContaining('blad') });
    expect(await t.svc.wyslij(t.token, { ...POPRAWNY, imie: ['a', 'b'] }, ip(3), T0)).toMatchObject({ adres: expect.stringContaining('blad') });
    expect(await t.svc.wyslij(t.token, { ...POPRAWNY, powrot: 'https://zlo.test/', zgoda: 'nie' }, ip(4), T0)).toEqual({ status: 303, adres: 'https://x.pl/?formularz=blad#kontakt' });
    expect(t.mailer.send).toHaveBeenCalledTimes(1);
  });

  it('mail niedostarczony (błąd wysyłki / odbiorca wyłączony) → ?formularz=blad', async () => {
    const t = zbuduj({ delivered: false });
    expect(await t.svc.wyslij(t.token, POPRAWNY, ZRODLO, T0)).toMatchObject({ adres: expect.stringContaining('formularz=blad') });
  });
});

describe('formularz – funkcje pomocnicze', () => {
  it('adresPowrotu: tylko host domeny (lub www.), bez danych logowania, portów i obcych schematów', () => {
    expect(adresPowrotu('https://www.x.pl/a/?q=1#h', 'x.pl', 'kontakt', 'wyslano')).toBe('https://www.x.pl/a/?formularz=wyslano#kontakt');
    expect(adresPowrotu('https://x.pl.zlo.test/', 'x.pl', 'kontakt', 'blad')).toBe('https://x.pl/?formularz=blad#kontakt');
    expect(adresPowrotu('https://user:pass@x.pl/', 'x.pl', null, 'blad')).toBe('https://x.pl/?formularz=blad');
    expect(adresPowrotu('https://x.pl:8443/', 'x.pl', null, 'blad')).toBe('https://x.pl/?formularz=blad');
    expect(adresPowrotu('javascript:alert(1)//x.pl', 'x.pl', null, 'blad')).toBe('https://x.pl/?formularz=blad');
    expect(adresPowrotu('//zlo.test', 'x.pl', 'zly"id', 'blad')).toBe('https://x.pl/?formularz=blad');
  });

  it('mail: czysty tekst – znaczniki HTML zostają tekstem, znaki sterujące i nowe linie w polach jednowierszowych usunięte', () => {
    const o = odczytajFormularz({ ...POPRAWNY, imie: 'Ania\r\nBcc: zlo@test\u0007', email: '', wiadomosc: '<b>pogrubione</b>‮odwrócone' });
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    const m = mailFormularza(o.dane, { domena: 'x.pl', adresStrony: 'https://x.pl/' });
    expect(m.text).toContain('Imię: Ania Bcc: zlo@test\n');
    expect(m.text).toContain('<b>pogrubione</b>odwrócone');
    expect(m.text).not.toMatch(/[\u0000-\u0008‮]/);
    expect(m.replyTo).toBeUndefined();
    expect(m.text).toContain('odpowiedz telefonicznie');
    expect(m).not.toHaveProperty('html');
  });

  it('odczyt: wymagane imię i e-mail albo telefon, poprawny e-mail; ocena spamu', () => {
    expect(odczytajFormularz({ ...POPRAWNY, imie: '  ' })).toEqual({ ok: false, powod: 'imie' });
    expect(odczytajFormularz({ ...POPRAWNY, email: '', telefon: '' })).toEqual({ ok: false, powod: 'kontakt' });
    expect(odczytajFormularz({ ...POPRAWNY, email: 'nie-mail' })).toEqual({ ok: false, powod: 'email' });
    expect(odczytajFormularz('tekst')).toEqual({ ok: false, powod: 'brak-tresci' });
    const d = (x: Rek) => {
      const o = odczytajFormularz({ ...POPRAWNY, ...x });
      if (!o.ok) throw new Error(o.powod);
      return o.dane;
    };
    expect(ocenSpam(d({}), { domena: 'x.pl' })).toBe('ok');
    expect(ocenSpam(d({ czas: '2999' }), { domena: 'x.pl' })).toBe('za-szybko');
    expect(ocenSpam(d({ strona_www: 'x' }), { domena: 'x.pl' })).toBe('pulapka');
    expect(ocenSpam(d({ czas: '' }), { domena: 'x.pl', referer: 'https://www.x.pl/' })).toBe('ok');
    expect(ocenSpam(d({ czas: '' }), { domena: 'x.pl' })).toBe('podejrzane');
  });
});
