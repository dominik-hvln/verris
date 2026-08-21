import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DirectAdminService } from '../servers/directadmin.service';

export type BackupFrequency = 'OFF' | 'DAILY' | 'WEEKLY';
export interface BackupScheduleRow {
  id: string;
  subscriptionId: string;
  frequency: BackupFrequency;
  hour: number;
  dayOfWeek: number;
  enabled: boolean;
  retainCount: number;
  lastRunAt: Date | null;
  lastStatus: string | null;
}

/** Minimalny delegate Prisma — client jest regenerowany w buildzie prod (Dockerfile). */
interface ScheduleDelegate {
  findUnique(args: { where: { subscriptionId: string } }): Promise<BackupScheduleRow | null>;
  findMany(args: { where: Record<string, unknown> }): Promise<BackupScheduleRow[]>;
  upsert(args: {
    where: { subscriptionId: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<BackupScheduleRow>;
  update(args: { where: { subscriptionId: string }; data: Record<string, unknown> }): Promise<BackupScheduleRow>;
}

const DEFAULT: Omit<BackupScheduleRow, 'id' | 'subscriptionId'> = {
  frequency: 'OFF',
  hour: 3,
  dayOfWeek: 1,
  enabled: false,
  retainCount: 7,
  lastRunAt: null,
  lastStatus: null,
};

@Injectable()
export class BackupScheduleService {
  private readonly logger = new Logger(BackupScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly da: DirectAdminService,
  ) {}

  private get repo(): ScheduleDelegate {
    return (this.prisma as unknown as { backupSchedule: ScheduleDelegate }).backupSchedule;
  }

  private async assertOwnership(subscriptionId: string, userId: string): Promise<void> {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, select: { id: true } });
    if (!sub) throw new NotFoundException('Service not found');
  }

  async get(subscriptionId: string, userId: string): Promise<BackupScheduleRow> {
    await this.assertOwnership(subscriptionId, userId);
    const row = await this.repo.findUnique({ where: { subscriptionId } });
    return row ?? { id: '', subscriptionId, ...DEFAULT };
  }

  async set(
    subscriptionId: string,
    userId: string,
    input: { frequency: BackupFrequency; hour: number; dayOfWeek: number; enabled: boolean; retainCount?: number },
  ): Promise<BackupScheduleRow> {
    await this.assertOwnership(subscriptionId, userId);
    const frequency: BackupFrequency = ['OFF', 'DAILY', 'WEEKLY'].includes(input.frequency) ? input.frequency : 'OFF';
    const hour = Math.min(23, Math.max(0, Math.trunc(Number(input.hour))));
    const dayOfWeek = Math.min(6, Math.max(0, Math.trunc(Number(input.dayOfWeek))));
    const retainCount = Math.min(60, Math.max(0, Math.trunc(Number(input.retainCount ?? 7))));
    const enabled = Boolean(input.enabled) && frequency !== 'OFF';
    if (Number.isNaN(hour) || Number.isNaN(dayOfWeek) || Number.isNaN(retainCount)) throw new BadRequestException('Nieprawidłowy harmonogram.');
    const data = { frequency, hour, dayOfWeek, enabled, retainCount };
    return this.repo.upsert({ where: { subscriptionId }, create: { subscriptionId, ...data }, update: data });
  }

  /** Wywoływane przez scheduler — wykonuje backupy, których czas właśnie nadszedł. */
  async runDue(now = new Date()): Promise<number> {
    const hour = now.getUTCHours();
    const dow = now.getUTCDay(); // 0=niedziela
    const due = await this.repo.findMany({ where: { enabled: true, frequency: { in: ['DAILY', 'WEEKLY'] }, hour } });
    let ran = 0;
    const minGapMs = 20 * 60 * 60 * 1000; // nie częściej niż raz na ~dobę
    for (const s of due) {
      if (s.frequency === 'WEEKLY' && s.dayOfWeek !== dow) continue;
      if (s.lastRunAt && now.getTime() - new Date(s.lastRunAt).getTime() < minGapMs) continue;
      const sub = await this.prisma.subscription.findUnique({
        where: { id: s.subscriptionId },
        select: { userId: true, status: true },
      });
      if (!sub || sub.status !== 'ACTIVE') continue;
      let status = 'ok';
      try {
        await this.da.createHostingSiteBackupNow(s.subscriptionId, sub.userId);
        ran += 1;
        // Retencja — zostaw N najnowszych archiwów.
        if (s.retainCount && s.retainCount > 0) {
          await this.da.pruneHostingBackups(s.subscriptionId, sub.userId, s.retainCount).catch(() => 0);
        }
      } catch (err) {
        status = `error: ${(err as Error).message}`.slice(0, 200);
        this.logger.warn(`Scheduled backup failed sub=${s.subscriptionId}: ${(err as Error).message}`);
      }
      await this.repo
        .update({ where: { subscriptionId: s.subscriptionId }, data: { lastRunAt: now, lastStatus: status } })
        .catch(() => undefined);
    }
    if (ran > 0) this.logger.log(`Wykonano ${ran} zaplanowanych backupów.`);
    return ran;
  }
}
