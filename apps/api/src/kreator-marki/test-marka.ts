import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Marka, ProjektLogo, koloryMarki } from '@verris/kreator';
import { NapisMarkiService } from './napis-marki.js';

/**
 * Fikstury testów Kreatora marki (paczka 131): marka „Łódka i Wiosło” na kroju Hanken Grotesk (OFL) i źródło krojów
 * z plików w test/fixtures/fonty (bez sieci – w testach proxy fontów nie łączy się z Google).
 */
const KATALOG_FIXTUR = join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'fonty');

export const PLIK_LATIN = readFileSync(join(KATALOG_FIXTUR, 'hanken-grotesk-latin.woff2'));
export const PLIK_LATIN_EXT = readFileSync(join(KATALOG_FIXTUR, 'hanken-grotesk-latin-ext.woff2'));

/** Źródło krojów: każda rodzina/waga dostaje plik Hanken Grotesk z właściwego podzbioru. */
export const zrodloKrojowTestowe = () => {
  const wolania: string[] = [];
  return {
    wolania,
    plikKreatora: async (nazwa: string) => {
      wolania.push(nazwa);
      return { buf: nazwa.endsWith('-latin-ext.woff2') ? PLIK_LATIN_EXT : PLIK_LATIN, type: 'font/woff2' };
    },
  };
};

export const napisTestowy = () => NapisMarkiService.zeZrodlem(zrodloKrojowTestowe());

export const projektTestowy = (zm: Partial<ProjektLogo> = {}): ProjektLogo =>
  ProjektLogo.parse({
    sygnet: { typ: 'biblioteka', rodzina: 'kolumna-litera', parametry: { zlobki: 3 }, litery: 'Ł' },
    napis: { font: 'Hanken Grotesk', waga: 700 },
    kolory: koloryMarki(250, 'jasna', { akcentBarwa: 40 }),
    fonty: { naglowki: 'Hanken Grotesk', tekst: 'Hanken Grotesk' },
    ...zm,
  });

export const markaTestowa = (zm: Partial<Marka> = {}): Marka =>
  Marka.parse({
    wersjaModelu: 1,
    zrodlo: 'nowa',
    brief: { nazwa: 'Łódka i Wiosło', podpis: 'Wypożyczalnia kajaków', branza: 'turystyka wodna', opis: 'Spływy kajakowe po Wielkopolsce dla rodzin.' },
    projekt: projektTestowy(),
    kv: { wzor: 'rzadki', haslo: 'Spływy, które pamięta się latami', tloCiemne: false },
    kontakt: { imie: 'Anna Przykładowa', stanowisko: 'Właścicielka', telefon: '600 000 000', email: 'anna@przyklad.pl', www: 'przyklad.pl' },
    ...zm,
  });
