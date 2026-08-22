import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Asercje po migracji — trzy pliki, trzy różne życia.
 *
 * Do 2026-08-22 wszystkie twierdzenia o bazie po migracji siedziały w jednym
 * pliku, który biegł WYŁĄCZNIE w CI, na świeżej bazie testowej. Produkcja po
 * `prisma migrate deploy` nie była sprawdzana niczym: `migrate deploy` mówi
 * tylko tyle, że pliki SQL się wykonały, nie że baza jest po nich w stanie,
 * w którym kod liczy dobrze.
 *
 * Rozdzielenie było konieczne, bo dopisanie tego jednego pliku do deployu
 * wywalałoby wdrożenia bez powodu — sprawdzał między innymi, czy w bazie są
 * plany prototypowe, które istnieją tylko po seedzie CI.
 *
 *   niezmienniki — CI ORAZ produkcja, BLOKUJĄ (rollback wdrożenia),
 *   katalog      — TYLKO CI: opisuje dzisiejszą decyzję handlową,
 *   historia     — CI i produkcja, wyłącznie RAPORTUJE.
 *
 * Te testy pilnują, żeby ten podział nie rozjechał się po cichu: żeby plik
 * raportujący nie zaczął blokować, żeby blokujący nie wypadł z deployu i żeby
 * katalog nie wjechał na produkcję.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const SQL = join(KORZEN, 'ops', 'sql');

const NIEZMIENNIKI = join(SQL, 'po-migracji-niezmienniki.sql');
const KATALOG = join(SQL, 'po-migracji-katalog.sql');
const HISTORIA = join(SQL, 'po-migracji-historia.sql');
const DEPLOY = join(KORZEN, 'ops', 'scripts', 'prod-deploy-ghcr.sh');
const CI = join(KORZEN, '.github', 'workflows', 'ci.yml');

/**
 * Komentarze precz. Po raz siódmy ta sama lekcja w tym projekcie: strażnik
 * czytający treść pliku trafiał na własne słowa w komentarzu i meldował
 * sukces, choć kod nie robił niczego (X-17, X-21, X-23, Z-05, X-24, H-20).
 */
function kod(sciezka: string, znakKomentarza: '--' | '#'): string {
  const wzor = znakKomentarza === '--' ? /^\s*--/ : /^\s*#/;
  return readFileSync(sciezka, 'utf8')
    .split('\n')
    .filter((l) => !wzor.test(l))
    .join('\n');
}

describe('asercje po migracji — pliki istnieją i mówią, czym są', () => {
  it('są trzy pliki, a stary zbiorczy zniknął', () => {
    expect(existsSync(NIEZMIENNIKI)).toBe(true);
    expect(existsSync(KATALOG)).toBe(true);
    expect(existsSync(HISTORIA)).toBe(true);
    // Zostawienie starego pliku obok nowych to „bliźniacze miejsca": ktoś
    // poprawiłby jedną kopię reguły i nie zauważył drugiej.
    expect(existsSync(join(SQL, 'sprawdz-baze-po-migracji.sql'))).toBe(false);
  });

  it('nic w repozytorium nie woła już starego pliku', () => {
    for (const [plik, znak] of [
      [DEPLOY, '#'],
      [CI, '#'],
    ] as const) {
      expect(kod(plik, znak)).not.toContain('sprawdz-baze-po-migracji.sql');
    }
  });
});

describe('niezmienniki — plik, który ma prawo zatrzymać wdrożenie', () => {
  const tresc = kod(NIEZMIENNIKI, '--');

  it('strażnik czyta właściwy plik', () => {
    expect(tresc).toContain('DO $$');
    expect(tresc.length).toBeGreaterThan(2000);
  });

  it.each(['Z-13', 'Z-12', 'Z-16', 'Z-05', 'Z-01', 'M-06'])(
    'pozycja %s ma w tym pliku wyjątek, nie samo NOTICE',
    (pozycja) => {
      // Liczenie wystąpień „RAISE EXCEPTION" niczego by nie pilnowało: plik
      // z piętnastoma wyjątkami dla jednej pozycji przeszedłby tak samo jak
      // plik pokrywający wszystkie sześć. Pytanie brzmi, czy KAŻDA pozycja
      // umie zatrzymać wdrożenie.
      const wyjatki = tresc.match(/RAISE EXCEPTION[\s\S]*?;/g) ?? [];
      expect(wyjatki.some((w) => w.includes(`${pozycja}:`))).toBe(true);
    },
  );

  it('NIE zawiera twierdzeń o katalogu — one nie są niezmiennikami', () => {
    // „Dokładnie jeden publiczny pakiet" to dzisiejsza decyzja handlowa.
    // Dodanie drugiego jest legalną zmianą; bramka, która by ją zablokowała,
    // skończyłaby się wyłączeniem całego sprawdzania.
    expect(tresc).not.toContain('isPublic');
    expect(tresc).not.toContain('starter');
  });

  it('NIE pilnuje konkretnej ceny — tę wolno zmienić z panelu', () => {
    // To był realny błąd w pierwszej wersji tego pliku: asercja na 45,00
    // biegnąca na produkcji zamieniłaby pierwszą legalną podwyżkę w rollback
    // każdego kolejnego wdrożenia. Wartości pilnuje katalog, w CI.
    expect(tresc).not.toContain('45.00');
    expect(tresc).not.toContain('399.00');
    expect(tresc).not.toContain('8192');
  });

  it('pilnuje za to reguły cennika, którą wymusza API', () => {
    // plans.service.ts → validatePricingConsistency: ceny dodatnie,
    // rok >= 6x miesiąc. API pilnuje jej przy zapisie, baza nie pilnuje
    // wcale, a migracja danych zapisuje z pominięciem API.
    expect(tresc).toContain('"priceMonthly" * 6');
  });

  it('nie sprawdza sum korekty drugi raz — jedna reguła, jedno miejsce', () => {
    // Korekta jest wierszem w "Invoice", więc obejmuje ją kontrola Z-01.
    // Druga kopia tej samej reguły nigdy by nie wystartowała, a przy zmianie
    // zasad ktoś poprawiłby jedną z dwóch.
    const sumy = (tresc.match(/"netAmount" \+ "vatAmount" <> "amount"/g) ?? []).length;
    expect(sumy).toBe(1);
  });
});

describe('katalog — blokuje, ale tylko w CI', () => {
  const tresc = kod(KATALOG, '--');

  it('rzuca wyjątkami (w CI ma zatrzymać build)', () => {
    expect((tresc.match(/RAISE EXCEPTION/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('mówi o rzeczach, które istnieją dopiero po seedzie', () => {
    expect(tresc).toContain('starter');
    expect(tresc).toContain('isPublic');
  });

  it('to tutaj mieszkają konkretne wartości z oferty', () => {
    // Cennik zmienia się w CI razem z PLAN_PRODUKCYJNY i treścią strony,
    // w jednym commicie — i właśnie o zgodę tych trzech miejsc chodzi.
    expect(tresc).toContain('45.00');
    expect(tresc).toContain('399.00');
    expect(tresc).toContain('8192');
  });
});

describe('historia — raport, nigdy bramka', () => {
  const tresc = kod(HISTORIA, '--');

  it('strażnik czyta właściwy plik', () => {
    expect(tresc).toContain('DO $$');
    expect(tresc).toContain('RAISE NOTICE');
  });

  it('NIE ZAWIERA ani jednego RAISE EXCEPTION w kodzie', () => {
    // Ten plik biegnie na produkcji po migracji. Jeden `RAISE EXCEPTION` tutaj
    // znaczy wycofanie wdrożenia z powodu danych sprzed migracji, których
    // migracja nie naprawia i nie miała naprawiać — kara za przeszłość, nie
    // ochrona przed błędem.
    expect(tresc).not.toContain('RAISE EXCEPTION');
  });
});

describe('deploy produkcyjny uruchamia niezmienniki i wycofuje się przy naruszeniu', () => {
  const tresc = kod(DEPLOY, '#');

  it('strażnik czyta właściwy plik', () => {
    expect(tresc).toContain('prisma migrate deploy');
    expect(tresc).toContain('IMAGE_TAG');
  });

  it('woła plik niezmienników', () => {
    expect(tresc).toContain('ops/sql/po-migracji-niezmienniki.sql');
  });

  it('robi to PO migracji, nie przed', () => {
    // Przed migracją asercja opisywałaby stan, którego wdrożenie dopiero ma
    // dotyczyć — przechodziłaby zawsze i nie znaczyłaby nic.
    const migracja = tresc.indexOf('prod-migrate-deploy.sh');
    const asercja = tresc.indexOf('ops/sql/po-migracji-niezmienniki.sql');
    expect(migracja).toBeGreaterThan(-1);
    expect(asercja).toBeGreaterThan(migracja);
  });

  it('naruszenie kończy deploy i cofa obraz — nie tylko wypisuje ostrzeżenie', () => {
    // Czwarte wystąpienie rodziny „bramka, która raportuje zamiast bramkować"
    // (X-14, X-23, H-19, H-20). Tu ma być rollback i exit 1.
    const blok = tresc.slice(tresc.indexOf('po-migracji-niezmienniki.sql'));
    const koniec = blok.indexOf('po-migracji-historia.sql');
    const gate = blok.slice(0, koniec > -1 ? koniec : blok.length);
    expect(gate).toContain('ROLLBACK');
    expect(gate).toMatch(/exit 1/);
    expect(gate).not.toMatch(/po-migracji-niezmienniki\.sql[^\n]*\|\|\s*true/);
  });

  it('historia leci na produkcję, ale niczego nie zatrzymuje', () => {
    expect(tresc).toContain('ops/sql/po-migracji-historia.sql');
    const linia = tresc
      .split('\n')
      .find((l) => l.includes('po-migracji-historia.sql') && !l.includes('asercja()'));
    expect(linia).toBeDefined();
    // Wołanie musi być rozbrojone: `|| echo …`, nigdy gołe.
    expect(linia).toMatch(/\|\|/);
  });

  it('NIE uruchamia katalogu na produkcji', () => {
    expect(tresc).not.toContain('po-migracji-katalog.sql');
  });
});

describe('CI uruchamia wszystkie trzy pliki i sprawdza, że asercje się czerwienią', () => {
  const tresc = kod(CI, '#');

  it('strażnik czyta właściwy plik', () => {
    expect(tresc).toContain('prisma migrate deploy');
    expect(tresc).toContain('jobs:');
  });

  it.each([
    ['niezmienniki', 'ops/sql/po-migracji-niezmienniki.sql'],
    ['katalog', 'ops/sql/po-migracji-katalog.sql'],
    ['historia', 'ops/sql/po-migracji-historia.sql'],
  ])('uruchamia plik %s', (_nazwa, sciezka) => {
    expect(tresc).toContain(sciezka);
  });

  it('uruchamia je PO seedzie — katalog inaczej przechodziłby pusto', () => {
    const seed = tresc.indexOf('db:seed');
    const katalog = tresc.indexOf('ops/sql/po-migracji-katalog.sql');
    expect(seed).toBeGreaterThan(-1);
    expect(katalog).toBeGreaterThan(seed);
  });

  it('sprawdza, że niezmienniki czerwienią się na złych danych', () => {
    // Asercja przechodząca na każdej bazie nie jest bramką. Odkąd potrafi
    // wycofać produkcyjne wdrożenie, to pytanie przestało być teoretyczne.
    expect(tresc).toContain('ops/scripts/asercje-czerwienia-sie.sh');
  });

  it('żaden z tych kroków nie jest rozbrojony przez continue-on-error', () => {
    // X-23: job bezpieczeństwa miał `continue-on-error: true` i przez to
    // meldował znaleziska, niczego nie zatrzymując.
    const od = tresc.indexOf('ops/sql/po-migracji-niezmienniki.sql');
    const fragment = tresc.slice(od, tresc.indexOf('asercje-czerwienia-sie.sh') + 200);
    expect(fragment).not.toContain('continue-on-error');
  });
});

describe('skrypt sprawdzający czerwienienie', () => {
  const SKRYPT = join(KORZEN, 'ops', 'scripts', 'asercje-czerwienia-sie.sh');
  const tresc = kod(SKRYPT, '#');

  it('strażnik czyta właściwy plik', () => {
    expect(tresc).toContain('po-migracji-niezmienniki.sql');
    expect(tresc.length).toBeGreaterThan(800);
  });

  it('wymaga WŁAŚCIWEGO powodu czerwieni, nie samego kodu wyjścia', () => {
    // Bez tego skrypt meldowałby sukces także wtedy, gdyby żadna asercja nie
    // zadziałała, a wszystko zatrzymał CHECK w bazie.
    expect(tresc).toContain('ZŁY POWÓD');
    expect(tresc).toContain('oczekiwane');
  });

  it('ma kontrolę na czystej bazie — inaczej „czerwone" nic nie znaczy', () => {
    expect(tresc).toContain('CZERWONE NA CZYSTEJ BAZIE');
  });

  it('nie zostawia śladu w bazie', () => {
    expect(tresc).toContain('BEGIN;');
    expect(tresc).toContain('ROLLBACK;');
  });

  it('psuje każdy niezmiennik z osobna', () => {
    for (const pozycja of ['Z-13', 'Z-12', 'Z-16', 'Z-05', 'Z-01', 'M-06']) {
      expect(tresc).toContain(pozycja);
    }
  });
});
