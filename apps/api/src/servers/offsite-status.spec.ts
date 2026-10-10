import { statusOffsite } from './offsite-status.js';

describe('statusOffsite — panel nie obiecuje kopii, której nie ma', () => {
  const przebieg = new Date('2026-09-28T16:30:00Z');
  const srv = { lastOffsiteBackupOk: true, lastOffsiteBackupAt: przebieg };

  it('konto sprzed ostatniego przebiegu → chronione, z datą', () => {
    expect(statusOffsite({ createdAt: new Date('2026-09-01T00:00:00Z'), server: srv }))
      .toEqual({ protected: true, pending: false, lastRunAt: przebieg.toISOString(), lastRunOk: true });
  });

  it('konto założone po przebiegu (D3 na t1) → nie „chronione”, tylko pierwsza kopia w nocy, bez daty', () => {
    expect(statusOffsite({ createdAt: new Date('2026-09-28T20:00:00Z'), server: srv }))
      .toMatchObject({ protected: false, pending: true, lastRunAt: null });
  });

  it('nieudany przebieg albo brak serwera → ani chronione, ani „w drodze”', () => {
    expect(statusOffsite({ createdAt: new Date(0), server: { ...srv, lastOffsiteBackupOk: false } }))
      .toMatchObject({ protected: false, pending: false });
    expect(statusOffsite(null)).toEqual({ protected: false, pending: false, lastRunAt: null, lastRunOk: null });
  });

  describe('F3.3 — wynik konta z raportu węzła ma pierwszeństwo przed przebiegiem węzła', () => {
    const konto = new Date('2026-09-01T00:00:00Z');
    const udana = new Date('2026-09-27T03:40:00Z');
    const nieudana = new Date('2026-09-28T03:40:00Z');

    it('przebieg węzła udany, ale kopia TEGO konta się nie udała → poprzednia kopia, z jej datą, i błąd ostatniej', () => {
      expect(statusOffsite({ createdAt: konto, offsiteBackupOkAt: udana, offsiteBackupFailedAt: nieudana, server: srv }))
        .toEqual({ protected: true, pending: false, lastRunAt: udana.toISOString(), lastRunOk: false });
    });

    it('konto bez żadnej udanej kopii → nie chronione, nawet gdy węzeł raportuje sukces', () => {
      expect(statusOffsite({ createdAt: konto, offsiteBackupOkAt: null, offsiteBackupFailedAt: nieudana, server: srv }))
        .toEqual({ protected: false, pending: false, lastRunAt: null, lastRunOk: false });
    });

    it('udana kopia konta po nieudanej → chronione z datą udanej', () => {
      expect(statusOffsite({ createdAt: konto, offsiteBackupOkAt: nieudana, offsiteBackupFailedAt: udana, server: { ...srv, lastOffsiteBackupOk: false } }))
        .toEqual({ protected: true, pending: false, lastRunAt: nieudana.toISOString(), lastRunOk: true });
    });
  });
});
