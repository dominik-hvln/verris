import { Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@verris/database';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PLATFORM_SETTING_KEYS } from '../platform-settings/platform-settings.keys.js';
import type { HetznerClient } from './hetzner.client.js';

/**
 * Q-08 — wspólne dla panelu (VpsService) i odnowień (VpsRenewalScheduler): polityka cenowa snapshotów,
 * opłata za miniony okres i sprzątanie snapshotów przy usunięciu VPS-a.
 */

const OKRES_MS = 30 * 24 * 60 * 60 * 1000;

/** Etykieta, którą każdy nasz snapshot dostaje u dostawcy — po niej listujemy obrazy danego VPS-a. */
export const ETYKIETA_VPS = 'verris-vps';

export interface PolitykaSnapshotow {
  /** K za GB miesięcznie; null = snapshoty wyłączone. */
  cenaZaGb: string | null;
  limit: number;
}

export async function politykaSnapshotow(prisma: PrismaService): Promise<PolitykaSnapshotow> {
  const K = PLATFORM_SETTING_KEYS;
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: [K.VPS_SNAPSHOT_PRICE_PER_GB, K.VPS_SNAPSHOT_LIMIT] } },
  });
  const v = (k: string) => rows.find((r) => r.key === k)?.value.trim() ?? '';
  const cena = Number(v(K.VPS_SNAPSHOT_PRICE_PER_GB).replace(',', '.'));
  const limit = Number.parseInt(v(K.VPS_SNAPSHOT_LIMIT), 10);
  return {
    cenaZaGb: v(K.VPS_SNAPSHOT_PRICE_PER_GB) && Number.isFinite(cena) && cena > 0 ? String(cena) : null,
    limit: Number.isFinite(limit) && limit >= 1 ? Math.min(limit, 20) : 3,
  };
}

/** Odświeża `sizeGb` aktywnych snapshotów z danych dostawcy (`image_size`). */
export async function odswiezRozmiary(prisma: PrismaService, hetzner: HetznerClient, vpsId: string): Promise<Map<string, { status: string; sizeGb: number | null }>> {
  const obrazy = await hetzner.listSnapshots(`${ETYKIETA_VPS}=${vpsId}`);
  const stan = new Map(obrazy.map((o) => [String(o.id), { status: o.status, sizeGb: o.image_size }]));
  const aktywne = await prisma.vpsSnapshot.findMany({ where: { vpsInstanceId: vpsId, deletedAt: null } });
  for (const s of aktywne) {
    const rozmiar = stan.get(s.hetznerImageId)?.sizeGb;
    if (rozmiar != null && (s.sizeGb == null || Number(s.sizeGb) !== rozmiar)) {
      await prisma.vpsSnapshot.update({ where: { id: s.id }, data: { sizeGb: new Prisma.Decimal(rozmiar) } });
    }
  }
  return stan;
}

/**
 * Opłata za snapshoty przechowywane w okresie (koniec − 30 dni, koniec] — z dołu, przy odnowieniu VPS-a.
 * Każdy snapshot, który istniał w tym okresie (także usunięty przed jego końcem), to pełny miesiąc × GB × cena.
 * Rzuca przy błędzie dostawcy — odnowienie ponowi próbę następnego dnia (nie liczymy „na oko”).
 */
export async function oplataZaSnapshoty(
  prisma: PrismaService,
  hetzner: HetznerClient,
  vpsId: string,
  koniecOkresu: Date,
  cenaZaGb: string | null,
): Promise<{ kwota: Prisma.Decimal; gb: Prisma.Decimal }> {
  const zero = { kwota: new Prisma.Decimal(0), gb: new Prisma.Decimal(0) };
  if (!cenaZaGb) return zero;
  const wOkresie = {
    vpsInstanceId: vpsId,
    createdAt: { lt: koniecOkresu },
    OR: [{ deletedAt: null }, { deletedAt: { gt: new Date(koniecOkresu.getTime() - OKRES_MS) } }],
  };
  if ((await prisma.vpsSnapshot.count({ where: wOkresie })) === 0) return zero;
  if ((await prisma.vpsSnapshot.count({ where: { vpsInstanceId: vpsId, deletedAt: null } })) > 0) {
    await odswiezRozmiary(prisma, hetzner, vpsId);
  }
  const wiersze = await prisma.vpsSnapshot.findMany({ where: wOkresie, select: { sizeGb: true } });
  const gb = wiersze.reduce((a, w) => a.add(w.sizeGb ?? 0), new Prisma.Decimal(0));
  return { kwota: gb.mul(cenaZaGb).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP), gb };
}

/**
 * Usunięcie VPS-a: snapshoty u dostawcy przeżywają serwer i dalej kosztują — kasujemy je razem z nim.
 * Błąd jednego obrazu idzie do logu (jak usuwanie serwera w `remove`), wiersz zostaje aktywny do ręcznego sprzątnięcia.
 */
export async function usunSnapshotyVps(prisma: PrismaService, hetzner: HetznerClient, vpsId: string): Promise<void> {
  const logger = new Logger('VpsSnapshoty');
  const aktywne = await prisma.vpsSnapshot.findMany({ where: { vpsInstanceId: vpsId, deletedAt: null } });
  for (const s of aktywne) {
    try {
      await hetzner.deleteImage(s.hetznerImageId);
    } catch (err) {
      // 404 = obrazu już nie ma — cel osiągnięty; każdy inny błąd zostawia wiersz aktywny.
      if (!(err instanceof NotFoundException)) {
        logger.error(`Snapshot ${s.hetznerImageId} (VPS ${vpsId}) nie został usunięty u dostawcy: ${(err as Error).message}`);
        continue;
      }
    }
    await prisma.vpsSnapshot.update({ where: { id: s.id }, data: { deletedAt: new Date() } });
  }
}
