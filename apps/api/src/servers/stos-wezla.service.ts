import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { DOZWOLONE, STOS_WEZLA, zgodnoscZManifestem, type ManifestStosu } from './stos-wezla.js';

const KLUCZ = 'stack.manifest';

export interface ZmianaManifestu {
  daKanal: string;
  daCommit: string;
  php1: string;
  mariadb: string;
  litespeedLinia: string;
}

/**
 * PB-33 — manifest stosu floty zmieniany w panelu admina (zamiast w kodzie). Każdy zapis podbija
 * `wersja` (RRRR-MM-DD.N), więc węzły i audyt zgodności widzą, że obowiązuje nowy stan. Nowe węzły
 * instalują go od razu (bootstrap), istniejące dostają plik co minutę, a oprogramowanie zmienia
 * dopiero „Wyrównaj flotę” (fala) — świadomie, bo np. inne domyślne PHP może zatrzymać stronę.
 */
@Injectable()
export class StosWezlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async pobierz(): Promise<ManifestStosu> {
    const w = await this.prisma.platformSetting.findUnique({ where: { key: KLUCZ } });
    if (!w?.value) return STOS_WEZLA;
    try {
      return { ...STOS_WEZLA, ...(JSON.parse(w.value) as Partial<ManifestStosu>) };
    } catch {
      return STOS_WEZLA;
    }
  }

  async zapisz(z: ZmianaManifestu, actorUserId: string): Promise<ManifestStosu> {
    const dozw = <K extends keyof typeof DOZWOLONE>(k: K, v: string) =>
      (DOZWOLONE[k] as readonly { v: string }[]).some((x) => x.v === v);
    if (!dozw('mariadb', z.mariadb)) throw new BadRequestException(`MariaDB ${z.mariadb} nie jest na liście dozwolonych.`);
    if (!dozw('php1', z.php1)) throw new BadRequestException(`PHP ${z.php1} nie jest na liście dozwolonych.`);
    if (!dozw('daKanal', z.daKanal)) throw new BadRequestException(`Kanał DirectAdmin „${z.daKanal}” nie jest dozwolony.`);
    if (!dozw('litespeedLinia', z.litespeedLinia)) throw new BadRequestException(`LiteSpeed ${z.litespeedLinia} nie jest dozwolony.`);
    const commit = (z.daCommit ?? '').trim();
    if (commit && !/^[0-9a-f]{7,40}$/i.test(commit)) {
      throw new BadRequestException('Build DirectAdmina (DA_COMMIT): 7–40 znaków szesnastkowych albo puste.');
    }

    const stary = await this.pobierz();
    const dzis = new Date().toISOString().slice(0, 10);
    const nr = stary.wersja.startsWith(`${dzis}.`) ? Number(stary.wersja.split('.').pop()) + 1 : 1;
    const nowy: ManifestStosu = {
      ...stary,
      wersja: `${dzis}.${nr}`,
      daKanal: z.daKanal,
      daCommit: commit,
      php1: z.php1,
      mariadb: z.mariadb,
      governorMysql: DOZWOLONE.mariadb.find((m) => m.v === z.mariadb)!.governor,
      litespeedLinia: z.litespeedLinia,
    };
    await this.prisma.platformSetting.upsert({
      where: { key: KLUCZ },
      create: { key: KLUCZ, value: JSON.stringify(nowy), updatedByUserId: actorUserId },
      update: { value: JSON.stringify(nowy), updatedByUserId: actorUserId },
    });
    await this.audit.record({
      action: 'STACK_MANIFEST_UPDATED',
      actorUserId,
      details: JSON.parse(JSON.stringify({ z: stary, na: nowy })),
    });
    return nowy;
  }

  /** Manifest + dozwolone wartości + zgodność każdego węzła (strona „Wersje stosu floty”). */
  async widok() {
    const m = await this.pobierz();
    const wezly = await this.prisma.server.findMany({
      where: { status: { in: ['ACTIVE', 'MAINTENANCE', 'PENDING_APPROVAL'] } },
      select: { id: true, name: true, status: true, stackVersion: true, dbVersion: true, lsVersion: true, phpDefaultVersion: true, daVersion: true },
      orderBy: { name: 'asc' },
    });
    return {
      manifest: m,
      dozwolone: DOZWOLONE,
      wezly: wezly.map((w) => ({
        id: w.id,
        nazwa: w.name ?? w.id,
        status: w.status,
        daVersion: w.daVersion,
        zgodnosc: zgodnoscZManifestem(
          { stackVersion: w.stackVersion, dbVersion: w.dbVersion, lsVersion: w.lsVersion, phpVersion: w.phpDefaultVersion },
          m,
        ),
      })),
    };
  }
}
