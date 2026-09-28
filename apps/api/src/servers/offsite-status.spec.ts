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
});
