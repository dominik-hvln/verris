import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CloudLinuxTelemetryDto } from './telemetry.dto.js';
import { TelemetryService } from './telemetry.service.js';
import { noweDoAlarmu, oczyscRaportAktualizacji, trescAlarmuPoprawek } from './aktualizacje-wezla.js';

/**
 * 21.10 — weryfikator aktualizacji bezpieczeństwa: raport agenta (blok `aktualizacje`) czyszczony wpis po wpisie,
 * zapis do Server.aktualizacje i alarm (panel + e-mail + push) tylko o NOWYCH poprawkach Critical/Important.
 */
const poprawka = (advisory: string, waga: string, pakiet = 'alt-php83-cli-8.3.12-1.el10.x86_64', cve: string[] = ['CVE-2026-109618']) => ({ advisory, waga, pakiet, cve });
const raport = (poprawki: unknown[], o: Record<string, unknown> = {}) => ({
  sprawdzono: '2026-10-21T18:00:00Z',
  dnf: { poprawki },
  custombuild: { aktualizacje: [] },
  altPhp: { '8.3': '8.3.11' },
  ...o,
});

describe('raport aktualizacji — czyszczenie wpis po wpisie', () => {
  it('zła poprawka, zły CVE i zła wersja odpadają; reszta raportu zostaje', () => {
    const s = oczyscRaportAktualizacji(
      raport(
        [
          poprawka('ALSA-2026:1001', 'Important', undefined, ['CVE-2026-109618', 'cve-zly', 'CVE-2026-109619', 'CVE-2026-109618']),
          poprawka('ALSA;rm -rf /', 'Critical'),
          { advisory: 'ALSA-2026:9', waga: 'Pilne', pakiet: 'kernel-6.12-1.el10.x86_64', cve: 'nie-lista' },
          'smieci',
        ],
        { custombuild: { aktualizacje: [{ nazwa: 'PHP 8.3', z: '8.3.11', na: '8.3.12' }, { nazwa: 'Exim', z: '4.98', na: '4.98\n1' }] }, altPhp: { '8.3': '8.3.11', x: '1' } },
      ),
    )!;
    expect(s.dnf.poprawki).toEqual([
      { advisory: 'ALSA-2026:1001', waga: 'Important', pakiet: 'alt-php83-cli-8.3.12-1.el10.x86_64', cve: ['CVE-2026-109618', 'CVE-2026-109619'] },
      { advisory: 'ALSA-2026:9', waga: 'Unknown', pakiet: 'kernel-6.12-1.el10.x86_64', cve: [] },
    ]);
    expect(s.custombuild).toEqual({ aktualizacje: [{ nazwa: 'PHP 8.3', z: '8.3.11', na: '8.3.12' }] });
    expect(s.altPhp).toEqual({ '8.3': '8.3.11' });
    expect(oczyscRaportAktualizacji({ altPhp: {} })).toBeNull();
  });

  it('DTO przepuszcza blok `aktualizacje` przy forbidNonWhitelisted (kształt sprawdza oczyscRaportAktualizacji)', () => {
    const dto = plainToInstance(CloudLinuxTelemetryDto, { agentVersion: 'lve-agent/1.4', accounts: [], aktualizacje: raport([poprawka('ALSA-2026:1001', 'Important')]) });
    expect(validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect((dto.aktualizacje as { dnf: { poprawki: unknown[] } }).dnf.poprawki).toHaveLength(1);
    const zla = plainToInstance(CloudLinuxTelemetryDto, { accounts: [], aktualizacje: 'tekst' });
    expect(validateSync(zla, { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property)).toEqual(['aktualizacje']);
  });

  it('nowe do alarmu: tylko Critical/Important, których nie było; po błędzie dnf w poprzednim raporcie — wszystko nowe', () => {
    const stary = oczyscRaportAktualizacji(raport([poprawka('ALSA-1', 'Important')]))!;
    const nowy = oczyscRaportAktualizacji(raport([poprawka('ALSA-1', 'Important'), poprawka('ALSA-2', 'Critical', 'openssl-libs-3.2.2-6.el10.x86_64'), poprawka('ALSA-3', 'Moderate')]))!;
    expect(noweDoAlarmu(stary, nowy).poprawki.map((p) => p.advisory)).toEqual(['ALSA-2']);
    const zBledem = oczyscRaportAktualizacji(raport([], { dnf: { poprawki: [], blad: 'dnf: exit 1' } }))!;
    expect(noweDoAlarmu(zBledem, nowy).poprawki.map((p) => p.advisory)).toEqual(['ALSA-1', 'ALSA-2']);
    const { tytul, tresc } = trescAlarmuPoprawek('t2', nowy.dnf.poprawki.filter((p) => p.waga !== 'Moderate'));
    expect(tytul).toBe('Węzeł t2: 2 nowe poprawki bezpieczeństwa (krytyczne)');
    expect(tresc).toContain('ALSA-2 (Critical): openssl-libs-3.2.2-6.el10.x86_64 — CVE-2026-109618');
  });
});

describe('TelemetryService — zapis raportu i alarmy', () => {
  function stanowisko() {
    let zapisane: unknown = null;
    const prisma = {
      server: {
        findUnique: vi.fn(async () => ({ aktualizacje: zapisane, name: 't2', hostname: 't2.verris.pl' })),
        update: vi.fn(async (a: { data: { aktualizacje?: unknown } }) => {
          if (a.data.aktualizacje !== undefined) zapisane = a.data.aktualizacje;
          return {};
        }),
      },
    };
    const alarmy = { wyslij: vi.fn(async () => true) };
    const svc = new TelemetryService(prisma as never, alarmy as never);
    const wyslij = (r: unknown) => svc.processLveMetrics({ serverId: 's1', accounts: [], agentVersion: 'lve-agent/1.4', aktualizacje: r as Record<string, unknown> });
    return { svc, prisma, alarmy, wyslij, zapisane: () => zapisane };
  }

  it('nowa poprawka Important → zapis i alarm z kluczem węzła i advisory; ten sam raport drugi raz → bez alarmu', async () => {
    const s = stanowisko();
    await s.wyslij(raport([poprawka('ALSA-2026:1001', 'Important')]));
    expect(s.prisma.server.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ aktualizacjeAt: expect.any(Date) }) }));
    expect((s.zapisane() as { dnf: { poprawki: unknown[] } }).dnf.poprawki).toHaveLength(1);
    expect(s.alarmy.wyslij).toHaveBeenCalledTimes(1);
    expect(s.alarmy.wyslij).toHaveBeenCalledWith(
      expect.objectContaining({ klucz: 'aktualizacje:s1:ALSA-2026:1001', waga: 'ostrzezenie', link: '/nodes/aktualizacje', cooldownMin: 7 * 24 * 60 }),
    );
    await s.wyslij(raport([poprawka('ALSA-2026:1001', 'Important')]));
    expect(s.alarmy.wyslij).toHaveBeenCalledTimes(1);
  });

  it('Moderate → zapis bez alarmu; Critical → alarm krytyczny; nowa wersja CustomBuild → alarm informacyjny', async () => {
    const s = stanowisko();
    await s.wyslij(raport([poprawka('ALSA-3', 'Moderate')]));
    expect(s.alarmy.wyslij).not.toHaveBeenCalled();
    await s.wyslij(raport([poprawka('ALSA-3', 'Moderate'), poprawka('ALSA-4', 'Critical')], { custombuild: { aktualizacje: [{ nazwa: 'Exim', z: '4.98', na: '4.98.1' }] } }));
    expect(s.alarmy.wyslij).toHaveBeenNthCalledWith(1, expect.objectContaining({ klucz: 'aktualizacje:s1:ALSA-4', waga: 'krytyczny' }));
    expect(s.alarmy.wyslij).toHaveBeenNthCalledWith(2, expect.objectContaining({ klucz: 'aktualizacje:s1:custombuild:Exim@4.98.1', waga: 'info' }));
  });

  it('błąd dnf zapisany (panel pokaże „nie wiadomo”), bez alarmu; nieczytelny blok — nic nie nadpisuje', async () => {
    const s = stanowisko();
    await s.wyslij(raport([], { dnf: { poprawki: [], blad: 'dnf: exit 1, Error: Failed to download metadata' } }));
    expect((s.zapisane() as { dnf: { blad: string } }).dnf.blad).toContain('Failed to download metadata');
    expect(s.alarmy.wyslij).not.toHaveBeenCalled();
    s.prisma.server.update.mockClear();
    await s.wyslij({ cokolwiek: 1 });
    expect(s.prisma.server.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ aktualizacje: expect.anything() }) }));
  });

  it('awaria kanału alarmu nie psuje zapisu telemetrii', async () => {
    const s = stanowisko();
    s.alarmy.wyslij.mockRejectedValueOnce(new Error('smtp down'));
    await expect(s.wyslij(raport([poprawka('ALSA-9', 'Critical')]))).resolves.toMatchObject({ received: true });
    expect(s.zapisane()).not.toBeNull();
  });
});
