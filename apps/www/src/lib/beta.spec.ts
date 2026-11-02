/**
 * Formularz zgłoszeń do otwartych testów (verris.pl/beta): walidacja, treść żądania do API, UTM, komunikaty
 * i zdarzenie leada wyłącznie po przyjęciu zgłoszenia.
 */
import {
  KREDYT_TESTOW,
  WAZNOSC_KODU_DNI,
  ZGODA_BETA,
  budujZgloszenie,
  komunikatBledu,
  miesiaceZKredytu,
  utmZAdresu,
  walidujZgloszenie,
  wyslijZgloszenie,
  zapamietajUtm,
  type DaneFormularza,
} from './beta';

const DANE: DaneFormularza = {
  imie: ' Anna ',
  email: ' Anna@Example.PL ',
  zakres: ['POCZTA', 'WORDPRESS'],
  strona: 'https://pracownia-anna.pl',
  obecnyHosting: '',
  uwagi: '',
  zgoda: true,
  firma: '',
};

describe('stałe zgodne z API', () => {
  it('kredyt 150 K i kod ważny 14 dni (apps/api/src/beta/beta.service.ts)', () => {
    expect(KREDYT_TESTOW).toBe(150);
    expect(WAZNOSC_KODU_DNI).toBe(14);
  });

  it('„wystarczy na” liczone z ceny miesięcznej z API, z odmianą', () => {
    expect(miesiaceZKredytu(45)).toBe('ok. 3 miesiące hostingu');
    expect(miesiaceZKredytu(30)).toBe('ok. 5 miesięcy hostingu');
    expect(miesiaceZKredytu(100)).toBe('ok. 1 miesiąc hostingu');
    expect(miesiaceZKredytu(200)).toBe('pierwszy miesiąc hostingu');
  });
});

describe('walidujZgloszenie', () => {
  it('poprawne dane — brak błędów', () => {
    expect(walidujZgloszenie(DANE)).toEqual({});
  });

  it('wymaga imienia, poprawnego e-maila, co najmniej jednego zakresu i zgody', () => {
    const b = walidujZgloszenie({ ...DANE, imie: ' ', email: 'anna@', zakres: [], zgoda: false });
    expect(Object.keys(b).sort()).toEqual(['email', 'imie', 'zakres', 'zgoda']);
  });

  it('adres strony tylko http/https z domeną; puste pole jest w porządku', () => {
    expect(walidujZgloszenie({ ...DANE, strona: 'ftp://pracownia.pl' }).strona).toBeDefined();
    expect(walidujZgloszenie({ ...DANE, strona: 'javascript:alert(1)' }).strona).toBeDefined();
    expect(walidujZgloszenie({ ...DANE, strona: 'pracownia.pl' }).strona).toBeDefined();
    expect(walidujZgloszenie({ ...DANE, strona: 'http://pracownia.pl/sklep' }).strona).toBeUndefined();
    expect(walidujZgloszenie({ ...DANE, strona: '' }).strona).toBeUndefined();
  });
});

describe('budujZgloszenie', () => {
  it('treść żądania: zakres w stałej kolejności, e-mail małymi literami, zgoda z treścią klauzuli, utm i honeypot', () => {
    const z = budujZgloszenie({ ...DANE, firma: 'bot' }, { utm: { source: 'facebook', campaign: 'meta-leadgen-hosting-202611' }, page: 'https://verris.pl/beta' });
    expect(z).toEqual({
      imie: 'Anna',
      email: 'anna@example.pl',
      zakres: ['WORDPRESS', 'POCZTA'],
      strona: 'https://pracownia-anna.pl',
      obecnyHosting: undefined,
      uwagi: undefined,
      zgoda: true,
      zgodaTekst: ZGODA_BETA,
      utm: { source: 'facebook', campaign: 'meta-leadgen-hosting-202611' },
      page: 'https://verris.pl/beta',
      firma: 'bot',
      captchaToken: undefined,
    });
  });

  it('klauzula zgody to ten sam tekst, który widzi użytkownik', () => {
    expect(ZGODA_BETA).toContain('Chcę dostać zaproszenie do testów');
    expect(ZGODA_BETA).toContain('HVLN Dominik Kowalski');
  });
});

describe('UTM', () => {
  it('czyta utm_* z adresu, pomija puste, przycina do 100 znaków', () => {
    expect(utmZAdresu('?utm_source=facebook&utm_medium=paid_social&utm_term=&x=1')).toEqual({ source: 'facebook', medium: 'paid_social' });
    expect(utmZAdresu('?utm_content=' + 'a'.repeat(150))?.content).toHaveLength(100);
    expect(utmZAdresu('')).toBeUndefined();
  });

  it('zapamiętuje w sessionStorage i odtwarza po przejściu na stronę bez utm', () => {
    const m = new Map<string, string>();
    const magazyn = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(zapamietajUtm('?utm_source=grupa-wp', magazyn)).toEqual({ source: 'grupa-wp' });
    expect(zapamietajUtm('', magazyn)).toEqual({ source: 'grupa-wp' });
  });

  it('storage, który rzuca (tryb prywatny), nie psuje formularza', () => {
    const rzuca = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(zapamietajUtm('?utm_source=fb', rzuca)).toEqual({ source: 'fb' });
    expect(zapamietajUtm('', rzuca)).toBeUndefined();
  });
});

describe('wyslijZgloszenie', () => {
  it('przyjęte zgłoszenie → stan „wyslane” i zdarzenie leada', async () => {
    const submit = jest.fn(async () => ({ ok: true, status: 202 }));
    const onLead = jest.fn();
    await expect(wyslijZgloszenie(DANE, { page: 'https://verris.pl/beta' }, { submit, onLead })).resolves.toEqual({ stan: 'wyslane' });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(onLead).toHaveBeenCalledTimes(1);
  });

  it('błędy walidacji → bez żądania i bez zdarzenia', async () => {
    const submit = jest.fn(async () => ({ ok: true }));
    const onLead = jest.fn();
    const w = await wyslijZgloszenie({ ...DANE, zakres: [] }, {}, { submit, onLead });
    expect(w.stan).toBe('bledy');
    expect(submit).not.toHaveBeenCalled();
    expect(onLead).not.toHaveBeenCalled();
  });

  it('429 → komunikat o limicie, bez zdarzenia leada', async () => {
    const onLead = jest.fn();
    const w = await wyslijZgloszenie(DANE, {}, { submit: async () => ({ ok: false, status: 429 }), onLead });
    expect(w).toEqual({ stan: 'blad', tekst: 'Za dużo prób z tego adresu, spróbuj za godzinę.', kontakt: false });
    expect(onLead).not.toHaveBeenCalled();
  });

  it('inny błąd → ogólny komunikat z linkiem do kontaktu', async () => {
    expect(komunikatBledu(500)).toEqual({ tekst: expect.stringContaining('Nie udało się'), kontakt: true });
    expect(komunikatBledu(undefined).kontakt).toBe(true);
  });
});
