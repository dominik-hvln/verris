import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Z-16 — księga pojemności węzła (`Server.allocated*`) musi się zgadzać
 * z rzeczywistością w OBIE strony.
 *
 * Trzy niezależne przecieki rozjeżdżały ją do 2026-08-22:
 *
 *   1. autoskalowanie DODAWAŁO nadwyżkę w DirectAdminie, nie zapisując jej
 *      w księdze  → węzeł wyglądał luźniej, niż był
 *   2. usunięcie konta NIE ZWALNIAŁO limitów                → węzeł wyglądał
 *      pełniej, niż był, i z czasem przestawał przyjmować konta mając miejsce
 *   3. `maxAccounts` liczył także konta DELETED             → jak wyżej
 *
 * Testy są statyczne — czytają kod i migracje. Prawdziwe sprawdzenie tych
 * ścieżek wymaga testu integracyjnego z bazą, którego projekt nie ma (X-04);
 * do tego czasu strażnik statyczny jest tym, co odróżnia „naprawione"
 * od „naprawione i nikt tego nie cofnie przy następnej refaktoryzacji".
 */

const KORZEN = resolve(__dirname, '../../../..');

function zrodlo(rel: string): string {
  return readFileSync(resolve(KORZEN, rel), 'utf-8');
}

const SILNIK = 'apps/api/src/autoscaling/autoscaling-engine.service.ts';
const USUWANIE = 'apps/api/src/compliance/account-deletion.service.ts';
const SELEKTOR = 'apps/api/src/subscriptions/node-selector.service.ts';
const MIGRACJA =
  'libs/database/prisma/migrations/20260822150000_uzgodnienie_ksiegi_wezla/migration.sql';

describe('Z-16 — księga pojemności węzła nie przecieka', () => {
  describe('przeciek 1: autoskalowanie dopisuje nadwyżkę do księgi', () => {
    const src = () => zrodlo(SILNIK);

    it('zwiększa allocated* o deltę, a nie nadpisuje wartością', () => {
      // increment, nie zapis wartości — inaczej równoległy provisioning
      // gubiłby swoje zmiany.
      expect(src()).toContain('allocatedCpu: { increment: deltaCpu }');
      expect(src()).toContain('allocatedMemory: { increment: deltaRam }');
      expect(src()).toContain('allocatedDisk: { increment: deltaDisk }');
    });

    it('robi to w tej samej transakcji, co zapis stanu konta', () => {
      const s = src();
      const tx = s.indexOf('this.prisma.$transaction');
      const serwer = s.indexOf('tx.server.update', tx);
      const konto = s.indexOf('tx.account.update', tx);
      expect(tx).toBeGreaterThan(-1);
      expect(serwer).toBeGreaterThan(tx);
      expect(konto).toBeGreaterThan(tx);
    });

    it('delta liczy się względem POPRZEDNIEGO stanu konta, nie od zera', () => {
      const s = src();
      expect(s).toContain('opts.nextScaledCpu - sub.account!.scaledCpu');
      expect(s).toContain('opts.nextScaledRamMb - sub.account!.scaledRamMb');
      expect(s).toContain('opts.nextScaledDiskMb - sub.account!.scaledDiskMb');
    });
  });

  describe('przeciek 2: usunięcie konta zwalnia pojemność', () => {
    const src = () => zrodlo(USUWANIE);

    it('zmniejsza allocated* przy oznaczeniu konta jako DELETED', () => {
      const s = src();
      expect(s).toContain('allocatedCpu: { decrement: acc.cpuLimit }');
      expect(s).toContain('allocatedMemory: { decrement: acc.ramLimitMb }');
      expect(s).toContain('allocatedDisk: { decrement: acc.diskLimitMb }');
    });

    it('zwalnia limity EFEKTYWNE, nie bazowe limity planu', () => {
      // Account.cpuLimit = baza planu + nadwyżka autoskalowania. Zwolnienie
      // samej bazy zostawiłoby nadwyżkę w księdze na zawsze.
      const s = src();
      expect(s).toContain('cpuLimit: true');
      expect(s).toContain('ramLimitMb: true');
      expect(s).toContain('diskLimitMb: true');
    });

    it('status i zwolnienie idą w jednej transakcji', () => {
      const s = src();
      const tx = s.indexOf('$transaction');
      expect(tx).toBeGreaterThan(-1);
      const status = s.indexOf('AccountStatus.DELETED', tx);
      const zwolnienie = s.indexOf('decrement: acc.cpuLimit', tx);
      expect(status).toBeGreaterThan(tx);
      expect(zwolnienie).toBeGreaterThan(tx);
    });
  });

  describe('przeciek 4: zmiana planu zwalnia także nadwyżkę', () => {
    // Ten przeciek POWSTAŁBY przez Z-16, gdyby zostawić plan-change bez zmian.
    // Przed Z-16 nadwyżka nie trafiała do allocated*, więc liczenie delty jako
    // różnicy baz planów było poprawne. Po zmianie znaczenia księgi każde
    // miejsce, które ją prowadzi, musiało zostać przejrzane.
    const src = () => zrodlo('apps/api/src/subscriptions/plan-change.service.ts');

    it('delta liczy się od limitów efektywnych, nie od baz planów', () => {
      const s = src();
      expect(s).toContain('target.cpuLimit - (oldPlan.cpuLimit + account.scaledCpu)');
      expect(s).toContain('target.ramLimitMb - (oldPlan.ramLimitMb + account.scaledRamMb)');
      expect(s).toContain('target.diskLimitMb - (oldPlan.diskLimitMb + account.scaledDiskMb)');
    });

    it('nie została ani jedna delta liczona po staremu', () => {
      const s = src();
      expect(s).not.toContain('target.cpuLimit - oldPlan.cpuLimit');
      expect(s).not.toContain('target.ramLimitMb - oldPlan.ramLimitMb');
      expect(s).not.toContain('target.diskLimitMb - oldPlan.diskLimitMb');
    });

    it('zeruje scaled* razem ze zwolnieniem nadwyżki', () => {
      // Gdyby scaled* zostało, konto miałoby limity nowego planu, a księga
      // pamiętałaby nadwyżkę starego.
      const s = src();
      expect(s).toContain('scaledCpu: 0');
      expect(s).toContain('scaledRamMb: 0');
      expect(s).toContain('scaledDiskMb: 0');
    });
  });

  describe('przeciek 3: maxAccounts nie liczy kont usuniętych', () => {
    it('groupBy filtruje po statusie', () => {
      const s = zrodlo(SELEKTOR);
      expect(s).toContain("status: { not: 'DELETED' }");
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
      // przeciek nr 2. Zwykły JOIN by go pominął i przeciek by został.
      expect(sql()).toContain('LEFT JOIN "Account"');
      expect(sql()).toContain('COALESCE(agg.cpu, 0)');
    });

    it('nie rusza węzłów, które i tak się zgadzają', () => {
      expect(sql()).toContain('IS DISTINCT FROM');
    });
  });
});
