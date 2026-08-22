import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Strażnik okablowania księgi pojemności węzła (`Server.allocated*`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PODZIAŁ PRACY MIĘDZY TYM PLIKIEM A `ksiega-niezmiennik.spec.ts`
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   ksiega-niezmiennik.spec.ts  →  czy ARYTMETYKA jest poprawna
 *   ten plik                    →  czy wszystkie cztery serwisy jej UŻYWAJĄ
 *
 * Rozdział wziął się z lekcji. Pierwsza wersja tego pliku pilnowała konkretnych
 * linii kodu (`allocatedCpu: { increment: deltaCpu }`) i przy wyniesieniu
 * arytmetyki do wspólnych funkcji zapaliła się na czerwono — słusznie, bo
 * pilnowane linie zniknęły, ale bezużytecznie, bo zniknęły na lepsze.
 *
 * Teraz pilnuje rzeczy, która ma zostać prawdziwa niezależnie od kształtu kodu:
 * NIKT nie liczy księgi po swojemu. Cztery serwisy prowadzą `allocated*`
 * i każde odstępstwo od wspólnych funkcji to piąty rozjazd czekający na
 * odkrycie — czwarty (plan-change po Z-16) kosztował przeczytanie kodu linijka
 * po linijce, bo nie było czego uruchomić.
 *
 * Czego to nadal nie sprawdza: czy serwis woła funkcje w odpowiednim MOMENCIE
 * i z odpowiednimi argumentami. To jest rola testu integracyjnego z bazą (X-04).
 */

const KORZEN = resolve(__dirname, '../../../..');

function zrodlo(rel: string): string {
  return readFileSync(resolve(KORZEN, rel), 'utf-8');
}

/** Cztery serwisy, które prowadzą księgę pojemności węzła. */
const PISARZE_KSIEGI = [
  {
    nazwa: 'provisioning — konto powstaje',
    plik: 'apps/api/src/subscriptions/provisioning.service.ts',
  },
  {
    nazwa: 'autoskalowanie — nadwyżka rośnie i maleje',
    plik: 'apps/api/src/autoscaling/autoscaling-engine.service.ts',
  },
  {
    nazwa: 'zmiana planu — baza się zmienia, nadwyżka znika',
    plik: 'apps/api/src/subscriptions/plan-change.service.ts',
  },
  {
    nazwa: 'usunięcie konta — wszystko wraca',
    plik: 'apps/api/src/compliance/account-deletion.service.ts',
  },
];

const SELEKTOR = 'apps/api/src/subscriptions/node-selector.service.ts';
const MIGRACJA =
  'libs/database/prisma/migrations/20260822150000_uzgodnienie_ksiegi_wezla/migration.sql';

describe('księga pojemności węzła — okablowanie', () => {
  describe('nikt nie liczy księgi po swojemu', () => {
    it.each(PISARZE_KSIEGI)('$nazwa używa wspólnej arytmetyki', ({ plik }) => {
      const s = zrodlo(plik);
      expect(s).toContain('ksiegaUpdateData(');
      expect(s).toContain('deltaKsiegi(');
    });

    it.each(PISARZE_KSIEGI)('$nazwa nie buduje increment/decrement ręcznie', ({ plik }) => {
      const s = zrodlo(plik);
      // Jedyne dozwolone źródło tych kluczy to ksiegaUpdateData w node-capacity.
      expect(s).not.toMatch(/allocatedCpu:\s*\{\s*(increment|decrement)/);
      expect(s).not.toMatch(/allocatedMemory:\s*\{\s*(increment|decrement)/);
      expect(s).not.toMatch(/allocatedDisk:\s*\{\s*(increment|decrement)/);
    });

    it('arytmetyka mieszka wyłącznie w node-capacity.ts', () => {
      const s = zrodlo('apps/api/src/subscriptions/node-capacity.ts');
      expect(s).toContain('export function deltaKsiegi');
      expect(s).toContain('export function ksiegaUpdateData');
      expect(s).toContain('export function limityEfektywne');
      expect(s).toContain('export const KONTO_NIEISTNIEJACE');
    });
  });

  describe('zapis księgi idzie w tej samej transakcji, co zmiana stanu konta', () => {
    // Gdyby jedno przeszło bez drugiego, księga rozjechałaby się dokładnie tak,
    // jak rozjeżdżała się przed Z-16 — tylko szybciej.
    it.each([
      {
        nazwa: 'autoskalowanie',
        plik: 'apps/api/src/autoscaling/autoscaling-engine.service.ts',
      },
      {
        nazwa: 'zmiana planu',
        plik: 'apps/api/src/subscriptions/plan-change.service.ts',
      },
      {
        nazwa: 'usunięcie konta',
        plik: 'apps/api/src/compliance/account-deletion.service.ts',
      },
    ])('$nazwa — server.update i account.update w jednym $transaction', ({ plik }) => {
      const s = zrodlo(plik);
      const tx = s.indexOf('$transaction');
      expect(tx).toBeGreaterThan(-1);
      expect(s.indexOf('ksiegaUpdateData(', tx)).toBeGreaterThan(tx);
      expect(s.indexOf('.account.update', tx)).toBeGreaterThan(tx);
    });
  });

  describe('usunięcie konta zwalnia limity EFEKTYWNE, nie bazowe', () => {
    const s = () => zrodlo('apps/api/src/compliance/account-deletion.service.ts');

    it('pobiera limity konta, a nie limity planu', () => {
      // Account.cpuLimit = baza planu + nadwyżka autoskalowania. Zwolnienie
      // samej bazy zostawiłoby nadwyżkę w księdze na zawsze.
      const t = s();
      expect(t).toContain('cpuLimit: true');
      expect(t).toContain('ramLimitMb: true');
      expect(t).toContain('diskLimitMb: true');
      expect(t).toContain('KONTO_NIEISTNIEJACE');
    });
  });

  describe('zmiana planu zwalnia także nadwyżkę', () => {
    const s = () => zrodlo('apps/api/src/subscriptions/plan-change.service.ts');

    it('stan PRZED to limity efektywne starego planu razem z nadwyżką', () => {
      expect(s()).toContain('limityEfektywne(oldPlan, account)');
    });

    it('stan PO to sama baza nowego planu — nadwyżka jest zerowana', () => {
      const t = s();
      expect(t).toContain('limityEfektywne(target)');
      expect(t).toContain('scaledCpu: 0');
      expect(t).toContain('scaledRamMb: 0');
      expect(t).toContain('scaledDiskMb: 0');
    });

    it('nie została ani jedna delta liczona od baz planów', () => {
      const t = s();
      expect(t).not.toContain('target.cpuLimit - oldPlan.cpuLimit');
      expect(t).not.toContain('target.ramLimitMb - oldPlan.ramLimitMb');
      expect(t).not.toContain('target.diskLimitMb - oldPlan.diskLimitMb');
    });
  });

  describe('maxAccounts nie liczy kont usuniętych', () => {
    it('groupBy filtruje po statusie', () => {
      expect(zrodlo(SELEKTOR)).toContain("status: { not: 'DELETED' }");
    });
  });

  describe('migracja prostuje stan zastany, a nie tylko blokuje przyszłość', () => {
    const sql = () => zrodlo(MIGRACJA);

    it('przelicza allocated* z kont, zamiast dopisywać korektę', () => {
      const s = sql();
      expect(s).toContain('UPDATE "Server"');
      expect(s).toContain('SUM(a."cpuLimit")');
      expect(s).toContain('SUM(a."ramLimitMb")');
      expect(s).toContain('SUM(a."diskLimitMb")');
    });

    it('pomija konta DELETED', () => {
      expect(sql()).toContain(`a."status" <> 'DELETED'`);
    });

    it('obejmuje też węzły bez kont — LEFT JOIN, nie JOIN', () => {
      // Węzeł, z którego usunięto wszystkie konta, ma allocated* > 0 przez
      // przeciek sprzed Z-16. Zwykły JOIN by go pominął i przeciek by został.
      expect(sql()).toContain('LEFT JOIN "Account"');
      expect(sql()).toContain('COALESCE(agg.cpu, 0)');
    });

    it('nie rusza węzłów, które i tak się zgadzają', () => {
      expect(sql()).toContain('IS DISTINCT FROM');
    });
  });
});
