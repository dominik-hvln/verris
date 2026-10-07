import { ProbeScheduler } from '../../src/status/probe.scheduler.js';
import { StatusService } from '../../src/status/status.service.js';
import { dniWstecz, dzienWarszawski } from '../../src/status/status-historia.js';
import { prisma, rozlacz, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Publiczna strona statusu na prawdziwej bazie: SQL zbijający kubełki 1-min do dni (czas polski)
 * i godzin, mapowanie sond na usługi dla klienta oraz brak nazw węzłów i hostów w odpowiedzi.
 */
const DZIEN = 86_400_000;
/**
 * Okolice południa dnia w Warszawie sprzed `n` dni (10:00 UTC = 11:00/12:00 w Warszawie). Liczone od dnia
 * warszawskiego, nie UTC: między 00:00 a 02:00 w Warszawie data UTC to jeszcze poprzedni dzień i test
 * wkładał próbki o dzień za wcześnie (czerwony 08.10 o 00:10).
 */
const poludnie = (n: number) => new Date(`${dniWstecz(dzienWarszawski(new Date()), n + 1)[0]}T10:00:00Z`);

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
      // Dziś w Warszawie: 30 s temu (30 min temu tuż po północy to jeszcze wczoraj).
      data: { probeId: https.id, bucketStart: new Date(Date.now() - 30_000), totalCount: 2, successCount: 2, avgLatencyMs: 120, maxLatencyMs: 120 },
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

  it('sonda platformy bez węzła: własna usługa, dzień prac bez awarii, banner i automat jej nie gubią', async () => {
    const w = await utworzWezel({ name: 'wezel-sekret-02' });
    const p = prisma();
    const panel = await p.serviceProbe.create({
      data: { serverId: null, grupa: 'panel', kind: 'HTTPS', target: 'https://panel-sekret.example.net/', severity: 'MAJOR' },
    });
    const strony = await p.serviceProbe.create({
      data: { serverId: w.id, kind: 'HTTPS', target: 'https://host-sekret.example.net/', severity: 'MAJOR' },
    });
    // Ta sama para (rodzaj, cel) bez węzła drugi raz — indeks częściowy nie pozwala na dubel.
    await expect(
      p.serviceProbe.create({ data: { serverId: null, grupa: 'panel', kind: 'HTTPS', target: 'https://panel-sekret.example.net/' } }),
    ).rejects.toMatchObject({ code: 'P2002' });

    for (const probeId of [panel.id, strony.id]) {
      for (const n of [3, 2]) {
        await p.probeSample.create({
          data: { probeId, bucketStart: poludnie(n), totalCount: 2880, successCount: 2880, avgLatencyMs: 80, maxLatencyMs: 80 },
        });
      }
    }
    // Okno węzła 2 dni temu — dotyczy tylko „Stron klientów”, nie panelu.
    await p.maintenanceWindow.create({
      data: {
        serverId: w.id, title: 'Prace na węźle', status: 'COMPLETED',
        scheduledStart: poludnie(2), scheduledEnd: new Date(poludnie(2).getTime() + 3_600_000),
        startedAt: poludnie(2), completedAt: new Date(poludnie(2).getTime() + 3_600_000),
      },
    });
    // Odwołane okno nie maluje paska.
    await p.maintenanceWindow.create({
      data: { title: 'Odwołane', status: 'CANCELED', scheduledStart: poludnie(3), scheduledEnd: new Date(poludnie(3).getTime() + 3_600_000) },
    });
    await p.probeIncident.create({
      data: { probeId: panel.id, severity: 'MAJOR', status: 'OPEN', title: 'HTTPS probe failing for https://panel-sekret.example.net/', detectionMeta: {} },
    });

    const status = new StatusService(p as never);
    const r = await status.getPublicStatus();

    expect(r.services.map((s) => s.name)).toEqual(['Panel klienta', 'Strony klientów']);
    const [uPanel, uStrony] = r.services;
    expect(uPanel.state).toBe('DOWN');
    expect(uPanel.days[87].state).toBe('OK');
    expect(uPanel.days[86].state).toBe('OK');
    expect(uStrony.days[87].state).toBe('MAINTENANCE');
    expect(uStrony.days[86].state).toBe('OK');
    expect(r.activeIncidents).toEqual([expect.objectContaining({ service: 'Panel klienta' })]);
    expect(JSON.stringify(r)).not.toContain('sekret');

    // Banner klienta i karta klienta w adminie pytają po węzłach — incydent platformy ich nie wywraca.
    expect(await status.findActiveIncidentForServer(w.id)).toBeNull();
    expect(await status.findOpenIncidentsForServers([w.id])).toEqual([]);

    // Automat sond bierze też sondę bez węzła.
    const sprawdzone: string[] = [];
    const scheduler = new ProbeScheduler(
      p as never,
      { run: async () => ({ ok: true, latencyMs: 5 }) } as never,
      { ingestSample: async (id: string) => void sprawdzone.push(id) } as never,
    );
    await scheduler.tick();
    expect(sprawdzone.sort()).toEqual([panel.id, strony.id].sort());
  });

  it('bez sond i bez próbek: pusta lista usług, null zamiast 100%', async () => {
    await utworzWezel();
    const r = await new StatusService(prisma() as never).getPublicStatus();
    expect(r.services).toEqual([]);
    expect(r.overall).toBe('OK');
    expect(r.availability).toEqual({ h24: null, d7: null, d30: null, d90: null });
  });
});
