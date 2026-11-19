/**
 * @jest-environment jsdom
 */
jest.mock('./akcje', () => ({}));
jest.mock('../kreator/edytor/zdjecia/akcje', () => ({ listaZasobow: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));

import { bezpiecznyOryginal } from './analiza';
import { czystyKontakt, hasloZWyniku, kluczPodgladu } from './materialy';
import { daneWgrania } from './wgraj/wgrywanie-logo';
import { bezpiecznyAdresPlatnosci, opisWynikuZakupu, zawartoscZakupu } from './zakup-marki';
import { trescUsuniecia } from './lista-marek';
import { podsumujPliki, stanStrony } from './eksport';
import { opisDopasowania } from './propozycje';

/** Paczka 131 – czyste funkcje ekranów Kreatora marki (dane z API → to, co trafia do DOM, adresów i formularzy). */

it('oryginał z analizy: tylko obraz data URI base64 (nic innego do <img src>)', () => {
  expect(bezpiecznyOryginal('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
  expect(bezpiecznyOryginal('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull();
  expect(bezpiecznyOryginal('javascript:alert(1)')).toBeNull();
  expect(bezpiecznyOryginal(undefined)).toBeNull();
});

it('adres płatności: https albo ścieżka panelu; inne schematy i //host – odrzucone', () => {
  expect(bezpiecznyAdresPlatnosci('https://pay.example/abc')).toBe('https://pay.example/abc');
  expect(bezpiecznyAdresPlatnosci('/dashboard/kreator-marki?platnosc=karta')).toBe('/dashboard/kreator-marki?platnosc=karta');
  expect(bezpiecznyAdresPlatnosci('//evil.example')).toBeNull();
  expect(bezpiecznyAdresPlatnosci('javascript:alert(1)')).toBeNull();
  expect(bezpiecznyAdresPlatnosci('http://pay.example')).toBeNull();
});

it('wynik zakupu: brak środków z kwotą, opłacony – co dalej', () => {
  expect(opisWynikuZakupu({ status: 'brak-srodkow', brakuje: 27.5 }, 'pakiet')).toEqual({ rodzaj: 'ostrzezenie', tekst: 'W portfelu brakuje 27,50 zł. Doładuj portfel albo zapłać kartą.' });
  expect(opisWynikuZakupu({ status: 'oplacony', stan: {} as never }, 'pakiet')?.tekst).toContain('Pakiet marki jest aktywny');
  expect(opisWynikuZakupu({ status: 'oplacony', stan: {} as never }, 'druga-marka')?.tekst).toContain('kolejną markę');
});

it('wgranie logo: pola multipart wg kontraktu (oświadczenie „tak”, opcjonalne nazwa i branża)', () => {
  const plik = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
  const f = daneWgrania({ plik, zrodlo: 'odswiezenie', oswiadczenie: true, nazwa: ' Hydro-Mix ', branza: '' });
  expect(f.get('zrodlo')).toBe('odswiezenie');
  expect(f.get('oswiadczenie')).toBe('tak');
  expect(f.get('nazwa')).toBe('Hydro-Mix');
  expect(f.has('branza')).toBe(false);
  expect((f.get('plik') as File).name).toBe('logo.svg');
  expect(daneWgrania({ plik, zrodlo: 'wgrane', oswiadczenie: false, nazwa: '', branza: '' }).has('oswiadczenie')).toBe(false);
});

it('materiały: hasło z drobnej zmiany AI, puste pola kontaktu pominięte, klucz podglądu zmienia się z KV', () => {
  expect(hasloZWyniku({ haslo: '  Zapisy na sezon 2027  ' })).toBe('Zapisy na sezon 2027');
  expect(hasloZWyniku({ inne: 'Na wodzie od rana' })).toBe('Na wodzie od rana');
  expect(hasloZWyniku({})).toBeNull();
  expect(czystyKontakt({ imie: ' Anna ', telefon: '', email: undefined })).toEqual({ imie: 'Anna' });
  const m = { kv: { wzor: 'rzadki' as const, tloCiemne: false }, kontakt: {}, projekt: {} as never };
  expect(kluczPodgladu({ wersja: 2 }, m)).not.toBe(kluczPodgladu({ wersja: 2 }, { ...m, kv: { wzor: 'gesty', tloCiemne: false } }));
  expect(kluczPodgladu({ wersja: 2 }, m)).toBe(kluczPodgladu({ wersja: 2 }, m));
});

it('eksport: podsumowanie blokad i stan strony względem wersji marki', () => {
  expect(
    podsumujPliki([
      { plik: 'a.svg', grupa: 'logo', opis: '', dostepny: true },
      { plik: 'w.pdf', grupa: 'druk', opis: '', dostepny: false, blokada: 'TMVIEW_WYMAGANY' },
      { plik: 'p.png', grupa: 'kv', opis: '', dostepny: false, blokada: 'PAKIET_WYMAGANY' },
    ]),
  ).toEqual({ dostepne: 1, pakiet: true, tmview: true, proba: false });
  const w = { wersja: 3, strony: [{ id: 's1', nazwa: 'A', wersjaNaStronie: 3 }, { id: 's2', nazwa: 'B', wersjaNaStronie: 1 }] };
  expect(stanStrony({ id: 's1' }, w)).toBe('aktualna');
  expect(stanStrony({ id: 's2' }, w)).toBe('starsza');
  expect(stanStrony({ id: 's3' }, w)).toBe('brak');
});

it('usunięcie marki: co znika i co zostaje na stronach', () => {
  expect(trescUsuniecia('Pracownia Fal')).toBe(
    'Marka „Pracownia Fal” zniknie z konta razem z propozycjami, wgranymi plikami i materiałami. Strony, które już jej używają, zachowają obecne logo i kolory. Tego nie da się cofnąć.',
  );
});

it('opis dopasowania serii z briefu (cechy i barwy po polsku)', () => {
  expect(
    opisDopasowania({ brief: { nazwa: 'X', branza: 'b', opis: 'o', rodzaj: 'napis', cechy: ['spokojna', 'naturalna'], barwyLubiane: [262, 190], barwyOdrzucone: [350] } }),
  ).toBe('Dobrane do: spokojna, naturalna · lubiane: niebieski, morski · bez: róż');
});

it('zawartość Pakietu: liczby z API (pakiet.zawiera), bez nich – opis ogólny; kolejna marka bez liczb', () => {
  const z = zawartoscZakupu('pakiet', { serie: 10, zmianyAi: 300, aktualizacjeMies: 12 });
  expect(z[0]).toBe('10 serii propozycji i 300 zmian AI');
  expect(z[z.length - 1]).toBe('nowe szablony materiałów przez 12 miesięcy');
  expect(zawartoscZakupu('pakiet', { serie: 2, zmianyAi: 1, aktualizacjeMies: 1 })).toEqual(expect.arrayContaining(['2 serie propozycji i 1 zmiana AI', 'nowe szablony materiałów przez 1 miesiąc']));
  expect(zawartoscZakupu('pakiet')[0]).toBe('więcej serii propozycji i zmian AI');
  expect(zawartoscZakupu('druga-marka', { serie: 10, zmianyAi: 300, aktualizacjeMies: 12 })[0]).toBe('kolejna marka na koncie');
});
