import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { StosWezlaService } from './stos-wezla.service.js';
import { zgodnoscZManifestem } from './stos-wezla.js';
import { nazwaWezla, pozaPula, stanWezla, sygnal } from '../admin-dashboard/stan-platformy.js';

/** Nazwy zadań agenta po polsku (lista „Ostatnie zadania” na stronie węzła). */
export const ZADANIA: Record<string, string> = {
  HOSTING_PROFILE: 'Profil hostingu',
  WP_INSTALL: 'Instalacja WordPressa',
  WAF_APPLY: 'WAF (ModSecurity)',
  STAGING_SYNC: 'Kopia testowa strony',
  PHP_APPLY: 'Zmiana PHP',
  APP_INSTALL: 'Instalacja aplikacji',
  DB_UPGRADE: 'Aktualizacja MariaDB',
  FLEET_UPDATE: 'Aktualizacja floty',
  OFFSITE_RESTORE: 'Odtworzenie z kopii poza serwerem',
  DB_TRANSFER: 'Przeniesienie bazy danych',
  FILE_RESTORE: 'Odtworzenie plików',
  SSH_ACCESS: 'Dostęp SSH',
  WP_UPDATE: 'Aktualizacja WordPressa',
  DISK_USAGE: 'Analiza zajętości dysku',
  MALWARE_SCAN: 'Skan złośliwego kodu',
  REDIS_ACCESS: 'Redis',
  MAIL_LOG: 'Dziennik poczty',
  GIT_DEPLOY: 'Wdrożenie z Gita',
  SITE_CLONE: 'Klon strony',
  FILE_SEARCH: 'Wyszukiwanie plików',
  PHP_INFO: 'Informacje o PHP',
  HTACCESS: 'Reguły .htaccess',
  APP_SELECTOR: 'Aplikacja Node/Python',
  SLOW_SQL: 'Wolne zapytania SQL',
  MEMCACHED_ACCESS: 'Memcached',
  SITE_STATS: 'Statystyki strony',
  PGSQL: 'PostgreSQL',
  IMAGE_OPTIMIZE: 'Optymalizacja obrazów',
  ONBOARD_LIVE: 'Onboard LIVE',
};

type Stan = 'ok' | 'warn' | 'crit' | 'brak';
const DZIEN = 86_400_000;

/**
 * PB-34 — strona węzła 1:1 z makiety AdminWezel.dc.html: zasoby (realne z próbek, nie przydział),
 * zgodność z manifestem floty, gotowość, najbardziej obciążone konta i ostatnie zadania.
 */
@Injectable()
export class PrzegladWezlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stos: StosWezlaService,
  ) {}

  async przeglad(id: string) {
    const teraz = Date.now();
    const s = await this.prisma.server.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Server not found');

    const [manifest, konta, probki, zadania] = await Promise.all([
      this.stos.pobierz(),
      this.prisma.account.findMany({
        where: { serverId: id },
        select: {
          id: true,
          domain: true,
          cpuLimit: true,
          scaledCpu: true,
          scaledRamMb: true,
          scaledDiskMb: true,
          subscriptionId: true,
          subscription: { select: { plan: { select: { name: true } } } },
          user: { select: { id: true, email: true, firstName: true, lastName: true, companyName: true } },
        },
      }),
      // Ostatnia próbka każdego konta z 10 min (bez starszych — konto bez próbek nie „zawyża” zużycia).
      this.prisma.$queryRaw<{ accountId: string; cpu: number; ram: number; dysk: number }[]>`
        SELECT DISTINCT ON ("accountId") "accountId", "cpuUsageAvg"::float8 AS cpu, "memUsageAvgMb"::float8 AS ram, "diskUsageMb"::float8 AS dysk
        FROM "UsageMetric"
        WHERE "serverId" = ${id} AND "accountId" IS NOT NULL AND "bucketDurationS" <= 300 AND "bucketStart" >= ${new Date(teraz - 10 * 60_000)}
        ORDER BY "accountId", "bucketStart" DESC`,
      this.prisma.nodeTask.findMany({
        where: { serverId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, kind: true, status: true, errorMessage: true, createdAt: true, payload: true, accountId: true },
      }),
    ]);

    const probkaWg = new Map(probki.map((p) => [p.accountId, p]));
    const sumaCpu = probki.reduce((a, p) => a + p.cpu, 0);
    const rdzenie = s.totalCpuCores ?? 0;
    const cpuProc = probki.length && rdzenie > 0 ? Math.min(100, Math.round(sumaCpu / rdzenie)) : null;
    const ramMb = probki.length ? Math.round(probki.reduce((a, p) => a + p.ram, 0)) : null;
    const dyskMb = probki.length ? Math.round(probki.reduce((a, p) => a + p.dysk, 0)) : null;

    const domenaWg = new Map(konta.map((k) => [k.id, k.domain]));
    const obciazone = konta
      .map((k) => {
        const p = probkaWg.get(k.id);
        const limit = k.cpuLimit + k.scaledCpu;
        return {
          id: k.id,
          domena: k.domain,
          plan: k.subscription?.plan?.name ?? null,
          klient: k.user.companyName?.trim() || [k.user.firstName, k.user.lastName].filter(Boolean).join(' ') || k.user.email,
          klientId: k.user.id,
          autoskalowanieCpu: k.scaledCpu > 0 && k.cpuLimit > 0 ? Math.round((k.scaledCpu / k.cpuLimit) * 100) : 0,
          proc: p && limit > 0 ? Math.min(100, Math.round((p.cpu / limit) * 100)) : null,
        };
      })
      .filter((k) => k.proc != null)
      .sort((a, b) => b.proc! - a.proc!)
      .slice(0, 5);

    // --- Zgodność z manifestem floty
    const pozycje = [
      { co: 'DirectAdmin', oczekiwane: manifest.daKanal, faktyczne: s.daVersion, zgodne: null as boolean | null },
      ...zgodnoscZManifestem(
        { stackVersion: s.stackVersion, dbVersion: s.dbVersion, lsVersion: s.lsVersion, phpVersion: s.phpDefaultVersion },
        manifest,
      ),
      { co: 'CloudLinux (LVE)', oczekiwane: '—', faktyczne: s.clVersion, zgodne: null },
    ];
    const rozjazdy = pozycje.filter((p) => p.zgodne === false).length;

    // --- Gotowość (te same warunki co selektor węzłów i audyt)
    const raport = (s.onboardReport ?? null) as { fail?: number; warn?: number; at?: string } | null;
    const data = (d: Date | string) =>
      new Date(d).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' }).replace(',', '');
    const gotowosc: { co: string; stan: Stan; opis: string; naprawa: string | null }[] = [
      s.onboardVerifiedAt
        ? { co: 'Weryfikacja onboardu', stan: 'ok', opis: `zielona ${data(s.onboardVerifiedAt)} · ${raport?.fail ?? 0} × FAIL, ${raport?.warn ?? 0} × WARN`, naprawa: null }
        : raport
          ? { co: 'Weryfikacja onboardu', stan: 'crit', opis: `${raport.fail ?? 0} × FAIL, ${raport.warn ?? 0} × WARN · węzeł nie dostaje nowych kont`, naprawa: 'audyt' }
          : { co: 'Weryfikacja onboardu', stan: 'brak', opis: 'brak raportu — uruchom Onboard LIVE', naprawa: 'audyt' },
      s.hardenedEnabled
        ? { co: 'Utwardzenie i blokada ruchu wychodzącego', stan: 'ok', opis: s.hardenedCheckedAt ? `znacznik z ${data(s.hardenedCheckedAt)}` : 'znacznik obecny', naprawa: null }
        : { co: 'Utwardzenie i blokada ruchu wychodzącego', stan: s.hardenedEnabled === false ? 'crit' : 'brak', opis: s.hardenedEnabled === false ? 'brak znacznika utwardzenia' : 'węzeł jeszcze nie raportował', naprawa: 'audyt' },
      s.lastOffsiteBackupAt
        ? {
            co: 'Kopie poza serwerem',
            stan: !s.lastOffsiteBackupOk ? 'crit' : teraz - s.lastOffsiteBackupAt.getTime() > 1.5 * DZIEN ? 'warn' : 'ok',
            opis: `${s.lastOffsiteBackupOk ? 'ostatnia' : 'ostatnia NIEUDANA'} ${data(s.lastOffsiteBackupAt)}${s.lastOffsiteBackupInfo ? ` · ${s.lastOffsiteBackupInfo.slice(0, 120)}` : ''}`,
            naprawa: s.lastOffsiteBackupOk ? null : 'audyt',
          }
        : { co: 'Kopie poza serwerem', stan: 'brak', opis: 'jeszcze żadnej kopii', naprawa: 'audyt' },
      s.cagefsEnabled
        ? { co: 'CageFS (izolacja kont)', stan: 'ok', opis: `włączone${s.cagefsEnabledCount != null ? ` · ${s.cagefsEnabledCount} kont` : ''}`, naprawa: null }
        : { co: 'CageFS (izolacja kont)', stan: s.cagefsEnabled === false ? 'crit' : 'brak', opis: s.cagefsEnabled === false ? 'wyłączone' : 'węzeł jeszcze nie raportował', naprawa: 'audyt' },
    ];
    if (s.lastSecurityAlertAt && teraz - s.lastSecurityAlertAt.getTime() < DZIEN) {
      gotowosc.push({
        co: 'Alert bezpieczeństwa',
        stan: 'warn',
        opis: `${data(s.lastSecurityAlertAt)} · ${s.lastSecurityAlertKind ?? ''} ${s.lastSecurityAlertInfo?.slice(0, 120) ?? ''}`.trim(),
        naprawa: 'audyt',
      });
    }

    return {
      id: s.id,
      nazwa: nazwaWezla(s),
      region: s.region,
      ip: s.ipAddress,
      status: s.status,
      stan: stanWezla(s, cpuProc, teraz),
      poza: pozaPula(s),
      przyjmujeKonta: s.acceptsNewAccounts,
      sygnal: sygnal(s.lastHeartbeatAt, teraz),
      naZywo: s.lastHeartbeatAt != null && teraz - s.lastHeartbeatAt.getTime() < 2 * 60_000,
      wersje: { cloudlinux: s.clVersion, directadmin: s.daVersion, manifest: s.stackVersion, agent: s.agentVersion },
      manifestFloty: manifest.wersja,
      zasoby: {
        cpu: { proc: cpuProc, rdzenie: rdzenie || null, sprzedane: rdzenie > 0 ? Math.round((s.allocatedCpu / (rdzenie * 100)) * 10) / 10 : null, limit: s.overcommitCpu },
        ram: { uzyteMb: ramMb, razemMb: s.totalMemoryMb, rezerwaProc: s.reservedHeadroomPercent },
        dysk: { uzyteMb: dyskMb, razemMb: s.totalDiskMb, przydzieloneMb: s.allocatedDisk },
        konta: { razem: konta.length, limit: s.maxAccounts, autoskalowane: konta.filter((k) => k.scaledCpu > 0 || k.scaledRamMb > 0 || k.scaledDiskMb > 0).length },
      },
      zgodnosc: { pozycje, rozjazdy, bezRaportu: pozycje.every((p) => p.zgodne === null || p.faktyczne == null) },
      gotowosc,
      doNaprawy: rozjazdy + gotowosc.filter((g) => g.stan !== 'ok').length,
      obciazone,
      zadania: zadania.map((z) => {
        const fala = (z.payload as { fala?: { nr?: number; razem?: number } } | null)?.fala;
        return {
          id: z.id,
          status: z.status,
          tekst: [ZADANIA[z.kind] ?? z.kind, fala?.nr ? `fala ${fala.nr}/${fala.razem}` : null, z.accountId ? domenaWg.get(z.accountId) ?? null : null]
            .filter(Boolean)
            .join(' · '),
          blad: z.errorMessage?.slice(0, 200) ?? null,
          at: z.createdAt.toISOString(),
        };
      }),
    };
  }
}
