import 'reflect-metadata';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { getMetadataStorage } from 'class-validator';

/**
 * Każde ciało żądania (i obiekt query) przechodzi przez klasę DTO z regułami class-validator.
 *
 * Globalny ValidationPipe sprawdza tylko klasy. Przy `@Body() body: { … }`, `Partial<…>`, interfejsie
 * albo `@Body('pole')` typ w czasie działania to `Object`/`String` i pipe przepuszcza wszystko —
 * tak do 2026-09-24 żyło ponad 60 endpointów (m.in. zapis .htaccess i baner KB z linkiem `javascript:`).
 * Strażnik czyta metadane Nesta, więc łapie też interfejsy, których nie widać w źródle.
 */
const WYJATKI: Record<string, string> = {
  // Publiczny beacon analityki: zawsze 204, pola przycinane w kontrolerze; błąd walidacji tylko gubiłby odsłony.
  'AnalyticsPublicController.collect': 'beacon',
  // Proxy fontów przekazuje querystring Google Fonts 1:1 (powtarzalne `family`), serwis sam go buduje.
  'FontsProxyController.css2': 'proxy',
};

const BODY = '3';
const QUERY = '4';
const PROSTE: unknown[] = [Object, String, Number, Boolean, Array];

function kontrolery(katalog: string, wynik: string[] = []): string[] {
  for (const nazwa of readdirSync(katalog)) {
    const sciezka = join(katalog, nazwa);
    if (statSync(sciezka).isDirectory()) kontrolery(sciezka, wynik);
    else if (nazwa.endsWith('.controller.ts')) wynik.push(sciezka);
  }
  return wynik;
}

function maReguly(typ: unknown): boolean {
  return (
    typeof typ === 'function' &&
    !PROSTE.includes(typ) &&
    getMetadataStorage().getTargetValidationMetadatas(typ, '', true, false).length > 0
  );
}

it('ciała żądań i obiekty query mają DTO z regułami walidacji', async () => {
  const zrodla = join(import.meta.dirname, '..');
  const naruszenia: string[] = [];
  let sprawdzone = 0;

  for (const plik of kontrolery(zrodla)) {
    const modul = (await import(plik)) as Record<string, unknown>;
    for (const eksport of Object.values(modul)) {
      if (typeof eksport !== 'function') continue;
      const klasa = eksport as { name: string; prototype: object };
      for (const metoda of Object.getOwnPropertyNames(klasa.prototype)) {
        const argumenty = Reflect.getMetadata(ROUTE_ARGS_METADATA, klasa, metoda) as
          | Record<string, { index: number; data?: unknown }>
          | undefined;
        if (!argumenty) continue;
        const typy = (Reflect.getMetadata('design:paramtypes', klasa.prototype, metoda) ?? []) as unknown[];
        for (const [klucz, arg] of Object.entries(argumenty)) {
          const rodzaj = klucz.split(':')[0];
          const calyObiekt = arg.data === undefined;
          if (rodzaj !== BODY && !(rodzaj === QUERY && calyObiekt)) continue;
          sprawdzone++;
          const nazwa = `${klasa.name}.${metoda}`;
          if (WYJATKI[nazwa]) continue;
          if (!calyObiekt) naruszenia.push(`${relative(zrodla, plik)} ${nazwa}: @Body('${String(arg.data)}') — użyj DTO`);
          else if (!maReguly(typy[arg.index])) naruszenia.push(`${relative(zrodla, plik)} ${nazwa}: typ bez reguł walidacji`);
        }
      }
    }
  }

  expect(sprawdzone).toBeGreaterThan(100);
  expect(naruszenia).toEqual([]);
}, 120_000); // importuje wszystkie kontrolery — pod obciążeniem całego pakietu trwa dłużej
