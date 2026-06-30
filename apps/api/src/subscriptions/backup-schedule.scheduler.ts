import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BackupScheduleService } from './backup-schedule.service';

/**
 * PANEL-11 — co godzinę uruchamia zaplanowane backupy kont, których czas właśnie
 * nadszedł (dopasowanie po godzinie UTC + dniu tygodnia dla harmonogramu WEEKLY).
 * Busy-guard zapobiega nakładaniu się dłuższych przebiegów.
 */
@Injectable()
export class BackupScheduleScheduler {
  private readonly logger = new Logger(BackupScheduleScheduler.name);
  private busy = false;

  constructor(private readonly schedules: BackupScheduleService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'backup-schedule-runner' })
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.schedules.runDue();
    } catch (err) {
      this.logger.error(`backup-schedule tick failed: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}
