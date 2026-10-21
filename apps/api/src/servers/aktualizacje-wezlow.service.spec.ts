import { BadRequestException } from '@nestjs/common';
import type { StanAktualizacjiWezla } from '@verris/contracts';
import { AktualizacjeWezlowService } from './aktualizacje-wezlow.service.js';

/**
 * 21.10 — weryfikator aktualizacji: podsumowanie floty z raportów agenta, wyszukiwanie po CVE (uczciwie: brak na liście
 * ≠ „bezpieczne”) i fala samych poprawek bezpieczeństwa.
 */
const TERAZ = new Date('2026-10-21T20:00:00Z');
const raport = (o: Partial<StanAktualizacjiWezla> = {}): StanAktualizacjiWezla => ({
  sprawdzono: '2026-10-21T19:00:00Z',
  dnf: { poprawki: [] },
  custombuild: { aktualizacje: [] },
  altPhp: { '8.3': '8.3.11' },
  ...o,
});
const PHP = { advisory: 'CLSA-2026:1001', waga: 'Important' as const, pakiet: 'alt-php83-cli-8.3.12-1.el10.x86_64', cve: ['CVE-2026-109618', 'CVE-2026-109619'] };
const KERNEL = { advisory: 'ALSA-2026:2002', waga: 'Moderate' as const, pakiet: 'kernel-6.12.0-55.el10.x86_64', cve: ['CVE-2026-2000'] };

function stanowisko(serwery: unknown[]) {
  const prisma = { server: { findMany: vi.fn(async () => serwery) } };
  const nodeTasks = { stanFali: vi.fn(async () => null), queueFleetUpdate: vi.fn(async () => ({ queued: 1, skipped: 0, kanarek: 'a' })) };
  return { svc: new AktualizacjeWezlowService(prisma as never, nodeTasks as never), nodeTasks };
}
const wezel = (id: string, aktualizacje: unknown, godzinTemu: number | null) => ({
  id,
  name: id,
  hostname: null,
  status: 'ACTIVE',
  aktualizacje,
  aktualizacjeAt: godzinTemu === null ? null : new Date(TERAZ.getTime() - godzinTemu * 3600_000),
});

describe('AktualizacjeWezlowService — podsumowanie floty', () => {
  it('poprawki zgrupowane po advisory (ważniejsze pierwsze), węzły bez świeżych danych osobno, nie jako „aktualne”', async () => {
    const s = stanowisko([
      wezel('t1', raport({ dnf: { poprawki: [PHP, KERNEL] } }), 2),
      wezel('t2', raport({ dnf: { poprawki: [PHP, { ...PHP, pakiet: 'alt-php83-fpm-8.3.12-1.el10.x86_64' }] }, custombuild: { aktualizacje: [{ nazwa: 'exim', z: '4.98', na: '4.98.1' }] } }), 3),
      wezel('stary', raport({ dnf: { poprawki: [] } }), 30),
      wezel('nowy', null, null),
    ]);
    const r = await s.svc.podsumowanie(undefined, TERAZ);
    expect(r.poprawki.map((p) => p.advisory)).toEqual(['CLSA-2026:1001', 'ALSA-2026:2002']);
    expect(r.poprawki[0].wezly.map((w) => w.id)).toEqual(['t1', 't2']);
    expect(r.poprawki[0].pakiety).toHaveLength(2);
    expect(r.kafelki).toEqual({ wezlowZWaznymi: 2, poprawek: 2, wezlowBezDanych: 2 });
    expect(r.wezly.find((w) => w.id === 'stary')?.dane).toBe('stare');
    expect(r.wezly.find((w) => w.id === 'nowy')?.dane).toBe('brak');
    expect(r.wezly.find((w) => w.id === 't2')).toMatchObject({ poprawek: 1, waznych: 1, custombuild: [{ nazwa: 'exim' }] });
  });

  it('CVE: kto ma poprawkę do zainstalowania, kto nie ma jej na liście, kto bez danych; brak wszędzie → uczciwy komunikat', async () => {
    const s = stanowisko([wezel('t1', raport({ dnf: { poprawki: [PHP] } }), 1), wezel('t2', raport(), 1), wezel('stary', raport(), 48)]);
    const r = await s.svc.podsumowanie(' cve-2026-109618 ', TERAZ);
    expect(r.cve).toMatchObject({
      cve: 'CVE-2026-109618',
      doZalatania: [{ id: 't1', advisory: ['CLSA-2026:1001'] }],
      bezPoprawkiNaLiscie: [{ id: 't2' }],
      bezDanych: [{ id: 'stary' }],
    });
    const brak = await s.svc.podsumowanie('CVE-2026-0001', TERAZ);
    expect(brak.cve?.doZalatania).toEqual([]);
    expect(brak.cve?.komunikat).toMatch(/już zainstalowana albo dystrybucja jeszcze jej nie wydała/);
    await expect(s.svc.podsumowanie('nie-cve', TERAZ)).rejects.toThrow(BadRequestException);
  });

  it('raport o nieznanym kształcie nie udaje „brak poprawek” — liczy się jak brak danych', async () => {
    const s = stanowisko([wezel('dziwny', { cos: 1 }, 1)]);
    const r = await s.svc.podsumowanie(undefined, TERAZ);
    expect(r.wezly[0].dane).toBe('brak');
  });
});

describe('AktualizacjeWezlowService — instalacja', () => {
  it('fala w trybie bezpieczeństwa z CVE (bez duplikatów), CustomBuild i wybranymi węzłami; zły CVE → 400', async () => {
    const s = stanowisko([]);
    await s.svc.zainstaluj('admin', { cve: ['CVE-2026-109618', 'cve-2026-109618'], custombuild: true, serwery: ['a', 'a'] });
    expect(s.nodeTasks.queueFleetUpdate).toHaveBeenCalledWith('admin', { tryb: 'bezpieczenstwo', cve: ['CVE-2026-109618'], custombuild: true, serwery: ['a'] });
    await s.svc.zainstaluj('admin', {});
    expect(s.nodeTasks.queueFleetUpdate).toHaveBeenLastCalledWith('admin', { tryb: 'bezpieczenstwo' });
    await expect(s.svc.zainstaluj('admin', { cve: ['CVE-1'] })).rejects.toThrow(BadRequestException);
  });
});
