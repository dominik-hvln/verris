import { StatusService } from '../../src/status/status.service.js';
import { dniWstecz, dzienWarszawski } from '../../src/status/status-historia.js';
import { prisma, rozlacz, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Publiczna strona statusu na prawdziwej bazie: SQL zbijający kubełki 1-min do dni (czas polski)
 * i godzin, mapowanie sond na usługi dla klienta oraz brak nazw węzłów i hostów w odpowiedzi.
 */
const DZIEN = 86_400_000;
/** Południe UTC danego dnia kalendarzowego sprzed `n` dni — daleko od granic doby w Warszawie. */
const poludnie = (n: number) => {
  const d = new Date(Date.now() - n * DZIEN);
  d.setUTCHours(12, 0, 0, 0);
  return d;
};

describe('GET /status — agregacja historii z próbek sond', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('paski dni z próbek, brak danych bez zmyślania, bez nazw węzłów i hostów', async () => {
    const w = await utworzWezel({ name: 'wezel-sekret-01' });
    const p = prisma();
    const dane = { serverId: w.id, severity: 'MAJOR' as const };
    const https = await p.serviceProbe.create({ data: { ...dane, kind: 'HTTPS', target: 'https://host-sekret.example.net/' } });
    const imap = await p.serviceProbe.create({ data: { ...dane, kind: 'IMAP', target: 'mail-sekret.example.net:993', severity: 'MINOR' } });
    await p.serviceProbe.create({ data: { ...dane, kind: 'SSH', target: 'host-sekret.example.net:22' } });
    await p.serviceProbe.create({ data: { ...dane, kind: 'DA_API', target: 'https://da-sekret.example.net:2222/' } });

    const probka = (probeId: string, dni: number, total: number, success: number, ms: number) =>
      p.probeSample.create({
        data: { probeId, bucketStart: poludnie(dni), totalCount: total, successCount: success, avgLatencyMs: ms, maxLatencyMs: ms },
      });
    await probka(https.id, 3, 2880, 2880, 100); // dzień bez błędów
    await probka(https.id, 2, 1000, 970, 300); // 97% → awaria
    // dzień -1 — celowo bez próbek
    await probka(imap.id, 3, 2880, 2870, 50); // 99,65% → spowolnienie
    await p.probeSample.create({
      data: { probeId: https.id, bucketStart: new Date(Date.now() - 30 * 60_000), totalCount: 2, successCount: 2, avgLatencyMs: 120, maxLatencyMs: 120 },
    });

    await p.probeIncident.create({
      data: {
        probeId: https.id,
        severity: 'MAJOR',
        status: 'RESOLVED',
        title: 'HTTPS probe failing for https://host-sekret.example.net/',
        startedAt: poludnie(2),
        resolvedAt: new Date(poludnie(2).getTime() + 17 * 60_000),
        detectionMeta: { consecutiveFailures: 2 },
      },
    });
    await p.maintenanceWindow.create({
      data: {
        serverId: w.id,
        title: 'Aktualizacje bezpieczeństwa',
        status: 'SCHEDULED',
        scheduledStart: new Date(Date.now() + DZIEN),
        scheduledEnd: new Date(Date.now() + DZIEN + 20 * 60_000),
      },
    });

    const r = await new StatusService(p as never).getPublicStatus();

    expect(r.services.map((s) => s.name)).toEqual(['Strony klientów', 'Poczta']);
    const strony = r.services[0];
    const dni = dniWstecz(dzienWarszawski(new Date()), 90);
    expect(strony.days.map((d) => d.date)).toEqual(dni);
    const dzien = (n: number) => strony.days[89 - n];
    expect(dzien(3)).toMatchObject({ state: 'OK', uptimePct: 100, avgLatencyMs: 100 });
    expect(dzien(2)).toMatchObject({ state: 'DOWN', uptimePct: 97, avgLatencyMs: 300 });
    expect(dzien(1)).toMatchObject({ state: 'NO_DATA', uptimePct: null });
    expect(dzien(60)).toMatchObject({ state: 'NO_DATA' });
    expect(strony.uptime90Pct).toBe(Math.floor(((2880 + 970 + 2) / (2880 + 1000 + 2)) * 10000) / 100);
    expect(strony.latency24h).toHaveLength(24);
    expect(strony.latency24h.filter((g) => g.avgLatencyMs !== null)).toHaveLength(1);
    expect(r.services[1].days[86]).toMatchObject({ state: 'DEGRADED' });
    expect(r.availability.d90).not.toBeNull();

    expect(r.recentIncidents).toHaveLength(1);
    expect(r.recentIncidents[0]).toMatchObject({ service: 'Strony klientów', title: 'Usługa jest niedostępna lub działa z przerwami — pracujemy nad tym.', durationMinutes: 17 });
    expect(r.maintenance).toHaveLength(1);

    const json = JSON.stringify(r);
    for (const tajne of ['sekret', 'probe failing', 'SSH', 'DA_API', '2222', w.id]) expect(json).not.toContain(tajne);
  });

  it('bez sond i bez próbek: pusta lista usług, null zamiast 100%', async () => {
    await utworzWezel();
    const r = await new StatusService(prisma() as never).getPublicStatus();
    expect(r.services).toEqual([]);
    expect(r.overall).toBe('OK');
    expect(r.availability).toEqual({ h24: null, d7: null, d30: null, d90: null });
  });
});
