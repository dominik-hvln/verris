import { Injectable, Optional } from '@nestjs/common';
import { ServerStatus } from '@verris/database';
import { KOPIA_KONTA_ALERT_DNI } from '@verris/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';
import { BackupOffsiteService } from './backup-offsite.service.js';
import { HARMONOGRAM_OFFSITE, PRZEBIEG_WEZLA_NIEAKTUALNY_MS, STATUSY_Z_KOPIA, przebiegZInfo, stanKopiiKonta, type StanKopiiKonta } from './kopie-kont.js';

const MAX_WIERSZY = 300;

/**
 * F3.3 — „Kopie floty” (admin + NOC, NODES_VIEW): kopia bazy panelu (ten sam obiekt co metryki verris_backup_*),
 * ostatni przebieg kopii poza serwerem każdego węzła, konta bez świeżej albo z nieudaną kopią (też nieudane kopie
 * zaplanowane przez klienta na serwerze), harmonogram i retencja (odczyt; retencję floty zmienia tylko ADMIN
 * w „Kopie offsite”) oraz ostatnie próby odtworzenia. Bez haseł i adresu magazynu kopii.
 */
@Injectable()
export class KopieFlotyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offsite: BackupOffsiteService,
    @Optional() private readonly storage?: ObjectStorageService,
  ) {}

  async stan(serverId: string | undefined, teraz = Date.now()) {
    const [konfiguracja, baza, wezly, konta, proby] = await Promise.all([
      this.offsite.podglad(),
      this.storage ? this.storage.getPostgresBackupLatestStat().catch(() => null) : Promise.resolve(null),
      this.prisma.server.findMany({
        where: { status: { in: [ServerStatus.ACTIVE, ServerStatus.MAINTENANCE] }, ...(serverId ? { id: serverId } : {}) },
        select: { id: true, name: true, hostname: true, status: true, lastOffsiteBackupAt: true, lastOffsiteBackupOk: true, lastOffsiteBackupInfo: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.account.findMany({
        where: { status: { in: STATUSY_Z_KOPIA }, ...(serverId ? { serverId } : {}) },
        select: {
          id: true,
          subscriptionId: true,
          domain: true,
          daUsername: true,
          serverId: true,
          createdAt: true,
          offsiteBackupOkAt: true,
          offsiteBackupBytes: true,
          offsiteBackupFailedAt: true,
          subscription: { select: { backupSchedule: { select: { enabled: true, lastRunAt: true, lastStatus: true, offsiteRetentionDays: true } } } },
        },
      }),
      this.prisma.restoreDrill.findMany({
        orderBy: { finishedAt: 'desc' },
        take: 50,
        select: { id: true, finishedAt: true, durationSec: true, result: true, objectName: true, source: true, owner: true },
      }),
    ]);

    const retencjaFloty = konfiguracja.skonfigurowany ? konfiguracja.retencjaDni : null;
    const nazwaWezla = new Map(wezly.map((w) => [w.id, w.name ?? w.hostname ?? w.id]));
    const naWezel = new Map<string, { kont: number; ok: number; nowe: number; nieudane: number; bezSwiezej: number; wlasnaRetencja: number }>();
    const wiersze: Array<{
      accountId: string;
      subscriptionId: string;
      domena: string;
      login: string;
      wezel: { id: string; nazwa: string };
      stan: StanKopiiKonta;
      ostatniaUdana: string | null;
      rozmiar: number | null;
      ostatniaNieudana: string | null;
      lokalnaNieudana: { kiedy: string | null; blad: string } | null;
    }> = [];
    const podsumowanie = { kont: 0, ok: 0, nowe: 0, nieudane: 0, przeterminowane: 0, bezKopii: 0, lokalneNieudane: 0 };

    for (const k of konta) {
      const stan = stanKopiiKonta(k, teraz);
      podsumowanie.kont++;
      if (stan === 'ok') podsumowanie.ok++;
      else if (stan === 'nowe') podsumowanie.nowe++;
      else if (stan === 'nieudana') podsumowanie.nieudane++;
      else if (stan === 'przeterminowana') podsumowanie.przeterminowane++;
      else podsumowanie.bezKopii++;
      const w = naWezel.get(k.serverId) ?? { kont: 0, ok: 0, nowe: 0, nieudane: 0, bezSwiezej: 0, wlasnaRetencja: 0 };
      w.kont++;
      if (stan === 'ok') w.ok++;
      else if (stan === 'nowe') w.nowe++;
      else if (stan === 'nieudana') w.nieudane++;
      else w.bezSwiezej++;
      const harm = k.subscription.backupSchedule;
      if (harm && retencjaFloty !== null && harm.offsiteRetentionDays !== retencjaFloty) w.wlasnaRetencja++;
      naWezel.set(k.serverId, w);

      // Kopia zaplanowana przez klienta na serwerze (backup-schedule.service.ts) zapisuje „error: …” w lastStatus.
      const lokalna = harm?.enabled && harm.lastStatus?.startsWith('error')
        ? { kiedy: harm.lastRunAt?.toISOString() ?? null, blad: harm.lastStatus.replace(/^error:\s*/, '').slice(0, 200) }
        : null;
      if (lokalna) podsumowanie.lokalneNieudane++;
      if ((stan === 'ok' || stan === 'nowe') && !lokalna) continue;
      wiersze.push({
        accountId: k.id,
        subscriptionId: k.subscriptionId,
        domena: k.domain,
        login: k.daUsername,
        wezel: { id: k.serverId, nazwa: nazwaWezla.get(k.serverId) ?? k.serverId },
        stan,
        ostatniaUdana: k.offsiteBackupOkAt?.toISOString() ?? null,
        rozmiar: k.offsiteBackupBytes === null ? null : Number(k.offsiteBackupBytes),
        ostatniaNieudana: k.offsiteBackupFailedAt?.toISOString() ?? null,
        lokalnaNieudana: lokalna,
      });
    }
    const waga: Record<StanKopiiKonta, number> = { nieudana: 0, brak: 1, przeterminowana: 2, nowe: 3, ok: 4 };
    wiersze.sort((a, b) => waga[a.stan] - waga[b.stan] || (a.ostatniaUdana ?? '').localeCompare(b.ostatniaUdana ?? '') || a.domena.localeCompare(b.domena));

    const ostatniePerZrodlo = new Map<string, (typeof proby)[number]>();
    for (const p of proby) if (!ostatniePerZrodlo.has(p.source)) ostatniePerZrodlo.set(p.source, p);

    return {
      progDni: KOPIA_KONTA_ALERT_DNI,
      harmonogram: HARMONOGRAM_OFFSITE,
      offsite: konfiguracja.skonfigurowany
        ? { skonfigurowany: true as const, retencjaDni: konfiguracja.retencjaDni, zmienionoAt: konfiguracja.zmienionoAt }
        : { skonfigurowany: false as const },
      bazaPanelu: baza
        ? { obecna: true, kiedy: new Date(baza.lastModifiedUnix * 1000).toISOString(), wiekS: baza.ageSeconds, rozmiar: baza.sizeBytes }
        : { obecna: false },
      wezly: wezly.map((w) => {
        const p = przebiegZInfo(w.lastOffsiteBackupInfo);
        const at = w.lastOffsiteBackupAt?.getTime() ?? null;
        return {
          id: w.id,
          nazwa: w.name ?? w.hostname ?? w.id,
          status: w.status,
          przebieg: at === null ? null : { kiedy: new Date(at).toISOString(), ok: Boolean(w.lastOffsiteBackupOk), ...p },
          nieaktualny: at === null || teraz - at > PRZEBIEG_WEZLA_NIEAKTUALNY_MS,
          konta: naWezel.get(w.id) ?? { kont: 0, ok: 0, nowe: 0, nieudane: 0, bezSwiezej: 0, wlasnaRetencja: 0 },
        };
      }),
      podsumowanie,
      konta: wiersze.slice(0, MAX_WIERSZY),
      kontUcietych: Math.max(0, wiersze.length - MAX_WIERSZY),
      proby: [...ostatniePerZrodlo.values()].map((p) => ({ ...p, finishedAt: p.finishedAt.toISOString() })),
    };
  }
}
