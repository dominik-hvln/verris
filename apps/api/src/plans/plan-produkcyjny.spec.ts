import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  BAZA_Z_OFERTY,
  PLAN_PRODUKCYJNY,
  SLUGI_PLANOW_PROTOTYPOWYCH,
  SUFITY_Z_OFERTY,
} from './plan-produkcyjny';

/**
 * Z-13 — uzgodnienie trzech warstw, które do 2026-08-22 mówiły trzy różne rzeczy:
 *
 *   1. treść strony (apps/www/src)          — co obiecujemy klientowi
 *   2. PLAN_PRODUKCYJNY (ten katalog)       — czym to jest w kodzie
 *   3. migracja SQL                          — co naprawdę wyląduje w bazie
 *
 * Warstwa 3 nie istniała w ogóle: strona sprzedawała pakiet, którego nie było
 * gdzie kupić. Warstwa 1 i 2 rozjeżdżały się o wszystko — cenę, RAM, dysk.
 *
 * Test jest statyczny: czyta pliki źródłowe i porównuje liczby. Nie potrzebuje
 * bazy ani działającego API, więc kosztuje milisekundy i biegnie w każdym CI.
 */

const KORZEN = resolve(__dirname, '../../../..');
const MIGRACJA = resolve(
  KORZEN,
  'libs/database/prisma/migrations/20260822120000_plan_produkcyjny/migration.sql',
);
const WWW = resolve(KORZEN, 'apps/www/src');

function sql(): string {
  return readFileSync(MIGRACJA, 'utf-8');
}

/** Wyciąga listę wartości z klauzuli VALUES (...) pierwszego INSERT-a. */
function wartosciInsertu(): string[] {
  const t = sql();
  const start = t.indexOf(') VALUES (');
  expect(start).toBeGreaterThan(-1);
  const koniec = t.indexOf('\n)\nON CONFLICT', start);
  expect(koniec).toBeGreaterThan(start);
  return t
    .slice(start + ') VALUES ('.length, koniec)
    .split(/,\s*\n/)
    .map((s) => s.trim().replace(/,$/, ''));
}

describe('Z-13 — pakiet ze strony istnieje w bazie i zgadza się z ofertą', () => {
  describe('definicja planu odpowiada temu, co obiecuje strona', () => {
    it('baza CPU w SPEED% odpowiada reklamowanym vCPU', () => {
      expect(PLAN_PRODUKCYJNY.cpuLimit).toBe(BAZA_Z_OFERTY.cpuVCpu * 100);
    });

    it('baza RAM i dysku odpowiada reklamowanym gigabajtom', () => {
      expect(PLAN_PRODUKCYJNY.ramLimitMb).toBe(BAZA_Z_OFERTY.ramGb * 1024);
      expect(PLAN_PRODUKCYJNY.diskLimitMb).toBe(BAZA_Z_OFERTY.diskGb * 1024);
    });

    it('krotności autoskalowania wynikają z sufitów podanych w ofercie', () => {
      expect(PLAN_PRODUKCYJNY.autoscalingMaxOverscaleCpu).toBe(
        SUFITY_Z_OFERTY.cpuVCpu / BAZA_Z_OFERTY.cpuVCpu,
      );
      expect(PLAN_PRODUKCYJNY.autoscalingMaxOverscaleRam).toBe(
        SUFITY_Z_OFERTY.ramGb / BAZA_Z_OFERTY.ramGb,
      );
      expect(PLAN_PRODUKCYJNY.autoscalingMaxOverscaleDisk).toBe(
        SUFITY_Z_OFERTY.diskGb / BAZA_Z_OFERTY.diskGb,
      );
    });

    it('transfer jest bez limitu, bo tak mówi cennik', () => {
      expect(PLAN_PRODUKCYJNY.includedTransferGb).toBeNull();
    });

    it('nie deklaruje czasu odpowiedzi wsparcia, którego nikt nie obiecał', () => {
      // SLA 99,5% na stronie dotyczy dostępności, nie czasu reakcji. Wpisanie
      // tu liczby byłoby wymyśleniem zobowiązania — ustala PB-03.
      expect(PLAN_PRODUKCYJNY.supportSlaHours).toBe(0);
    });
  });

  describe('cena zgadza się z cennikiem i jest w BRUTTO', () => {
    it('45 zł miesięcznie i 399 zł rocznie', () => {
      expect(PLAN_PRODUKCYJNY.priceMonthly).toBe('45.00');
      expect(PLAN_PRODUKCYJNY.priceYearly).toBe('399.00');
    });

    it('cena roczna daje oszczędność reklamowaną na stronie (−141 zł)', () => {
      const roczniePoMiesiecznej = Number(PLAN_PRODUKCYJNY.priceMonthly) * 12;
      const oszczednosc = roczniePoMiesiecznej - Number(PLAN_PRODUKCYJNY.priceYearly);
      expect(oszczednosc).toBe(141);
    });

    it('te same liczby stoją w treści strony', () => {
      const pricing = readFileSync(
        resolve(WWW, 'app/(frontend)/components/Pricing.tsx'),
        'utf-8',
      );
      expect(pricing).toContain("'45 zł'");
      expect(pricing).toContain("'399 zł'");
      expect(pricing).toContain('−141 zł');
    });
  });

  describe('migracja zapisuje dokładnie to, co stoi w definicji', () => {
    it('plik migracji istnieje', () => {
      expect(sql().length).toBeGreaterThan(500);
    });

    it('id, slug i cena w SQL zgadzają się z definicją', () => {
      const w = wartosciInsertu();
      expect(w).toContain(`'${PLAN_PRODUKCYJNY.id}'`);
      expect(w).toContain(`'${PLAN_PRODUKCYJNY.slug}'`);
      expect(w).toContain(PLAN_PRODUKCYJNY.priceMonthly);
      expect(w).toContain(PLAN_PRODUKCYJNY.priceYearly);
    });

    it('limity bazowe w SQL zgadzają się z definicją', () => {
      const w = wartosciInsertu();
      for (const wartosc of [
        PLAN_PRODUKCYJNY.cpuLimit,
        PLAN_PRODUKCYJNY.ramLimitMb,
        PLAN_PRODUKCYJNY.diskLimitMb,
        PLAN_PRODUKCYJNY.ioLimitKbps,
        PLAN_PRODUKCYJNY.iopsLimit,
        PLAN_PRODUKCYJNY.entryProcesses,
        PLAN_PRODUKCYJNY.nprocLimit,
      ]) {
        expect(w).toContain(String(wartosc));
      }
    });

    it('krotności autoskalowania w SQL zgadzają się z definicją', () => {
      const t = sql();
      expect(t).toMatch(
        new RegExp(
          `"autoscalingMaxOverscaleCpu"\\s*=\\s*EXCLUDED\\."autoscalingMaxOverscaleCpu"`,
        ),
      );
      const w = wartosciInsertu();
      // Trzy ostatnie liczby przed NOW(), NOW() to krotności.
      const liczby = w.filter((x) => /^\d+$/.test(x)).map(Number);
      expect(liczby).toEqual(
        expect.arrayContaining([
          PLAN_PRODUKCYJNY.autoscalingMaxOverscaleCpu,
          PLAN_PRODUKCYJNY.autoscalingMaxOverscaleRam,
          PLAN_PRODUKCYJNY.autoscalingMaxOverscaleDisk,
        ]),
      );
    });

    it('transfer bez limitu jest zapisany jako NULL, nie jako zero', () => {
      // 0 znaczyłoby „zero gigabajtów transferu", a nie „bez limitu".
      expect(wartosciInsertu()).toContain('NULL');
    });

    it('migracja jest idempotentna — ON CONFLICT DO UPDATE, nie DO NOTHING', () => {
      // DO NOTHING oznaczałoby, że poprawka ceny wymaga ręcznego UPDATE
      // na produkcji. DO UPDATE sprawia, że migracja jest źródłem prawdy.
      expect(sql()).toContain('ON CONFLICT ("id") DO UPDATE SET');
      expect(sql()).not.toContain('DO NOTHING');
    });

    it('wycofuje plany prototypowe ze sprzedaży', () => {
      const t = sql();
      for (const slug of SLUGI_PLANOW_PROTOTYPOWYCH) {
        expect(t).toContain(`'${slug}'`);
      }
      expect(t).toContain('"isPublic"  = false');
    });

    it('NIE dezaktywuje planów prototypowych — to zabiłoby odnowienia', () => {
      // Subskrypcja na nieaktywnym planie nie odnowi się. isPublic=false
      // wystarcza, żeby plan zniknął z katalogu.
      expect(sql()).not.toMatch(/SET\s+"isActive"\s*=\s*false/);
    });
  });

  describe('Z-16 — sufit oferty NIE JEST dziś osiągalny (rozbieżność pilnowana)', () => {
    /**
     * `autoscaling-engine.service.ts` przycina krotność do 10× niezależnie od
     * tego, co stoi w planie. Oferta obiecuje 12× dla CPU i 20× dla dysku.
     *
     * Ten test nie udaje, że problemu nie ma — utrwala go, żeby zniknął
     * świadomie. Kiedy Z-16 podniesie próg, test zapali się na czerwono
     * i zmusi do przejrzenia oferty razem ze zmianą silnika.
     */
    const PROG_SILNIKA = 10;

    function odczytajProgSilnika(): number {
      const src = readFileSync(
        resolve(KORZEN, 'apps/api/src/autoscaling/autoscaling-engine.service.ts'),
        'utf-8',
      );
      const m = src.match(/return Math\.min\(value,\s*(\d+)\)/);
      expect(m).not.toBeNull();
      return Number(m![1]);
    }

    it('próg w silniku jest nadal tam, gdzie go zastaliśmy', () => {
      expect(odczytajProgSilnika()).toBe(PROG_SILNIKA);
    });

    it('RAM mieści się w progu — sufit 64 GB jest osiągalny', () => {
      expect(PLAN_PRODUKCYJNY.autoscalingMaxOverscaleRam).toBeLessThanOrEqual(PROG_SILNIKA);
    });

    it('CPU i dysk NIE mieszczą się — to jest treść Z-16', () => {
      expect(PLAN_PRODUKCYJNY.autoscalingMaxOverscaleCpu).toBeGreaterThan(PROG_SILNIKA);
      expect(PLAN_PRODUKCYJNY.autoscalingMaxOverscaleDisk).toBeGreaterThan(PROG_SILNIKA);
    });

    it('realnie osiągalny sufit jest niższy od reklamowanego — o ile dokładnie', () => {
      const cpuOsiagalne = BAZA_Z_OFERTY.cpuVCpu * PROG_SILNIKA;
      const dyskOsiagalny = BAZA_Z_OFERTY.diskGb * PROG_SILNIKA;
      expect(cpuOsiagalne).toBe(20); // oferta mówi 24
      expect(dyskOsiagalny).toBe(500); // oferta mówi 1000
      expect(cpuOsiagalne).toBeLessThan(SUFITY_Z_OFERTY.cpuVCpu);
      expect(dyskOsiagalny).toBeLessThan(SUFITY_Z_OFERTY.diskGb);
    });
  });
});
