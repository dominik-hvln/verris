import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

@Injectable()
export class SogoAuthSyncService {
  private readonly logger = new Logger(SogoAuthSyncService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('SOGO_MYSQL_HOST')?.trim()
      && this.config.get<string>('SOGO_MYSQL_PASSWORD')?.trim());
  }

  async upsert(email: string, plainPassword: string): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn('SOGo auth sync skipped — set SOGO_MYSQL_HOST and SOGO_MYSQL_PASSWORD');
      return;
    }

    const uid = email.trim().toLowerCase();
    const sql = `REPLACE INTO sogo_mail_auth (c_uid, c_name, c_password) VALUES ('${this.escapeSql(
      uid,
    )}', '${this.escapeSql(uid)}', '${this.escapeSql(plainPassword)}');`;
    await this.runMysql(sql);
    this.logger.log(`SOGo auth synced for ${uid}`);
  }

  async remove(email: string): Promise<void> {
    if (!this.isConfigured()) return;

    const uid = email.trim().toLowerCase();
    const sql = `DELETE FROM sogo_mail_auth WHERE c_uid='${this.escapeSql(uid)}';`;
    await this.runMysql(sql);
    this.logger.log(`SOGo auth removed for ${uid}`);
  }

  private escapeSql(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "''");
  }

  private async runMysql(sql: string): Promise<void> {
    const host = this.config.get<string>('SOGO_MYSQL_HOST')!.trim();
    const password = this.config.get<string>('SOGO_MYSQL_PASSWORD')!.trim();
    const user = this.config.get<string>('SOGO_MYSQL_USER')?.trim() || 'sogo';
    const database = this.config.get<string>('SOGO_MYSQL_DATABASE')?.trim() || 'sogo';

    const dir = await mkdtemp(join(tmpdir(), 'verris-sogo-mysql-'));
    const cnfPath = join(dir, 'client.cnf');
    try {
      await writeFile(
        cnfPath,
        `[client]\nhost=${host}\nuser=${user}\npassword=${password}\ndatabase=${database}\n`,
        { mode: 0o600 },
      );
      const execFileAsync = promisify(execFile);
      await execFileAsync(
        'mysql',
        [`--defaults-extra-file=${cnfPath}`, '-e', sql],
        { timeout: 15_000 },
      );
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
