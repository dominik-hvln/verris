import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { NodeTasksService } from './node-tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';

/**
 * PB-31 — kopie off-site floty skonfigurowane RAZ w panelu (zamiast `rclone config` na każdym
 * węźle). H-16: te same hasła crypt i ten sam remote dla całej floty — inaczej konta z utraconego
 * węzła nie da się odtworzyć na innym. Całość zaszyfrowana (AES-256-GCM, APP_KMS_KEY) jednym wpisem
 * w platform_settings; na węzeł trafia przez kanał agenta (tożsamość węzła), z wpisem w audycie.
 *
 * Backend: Hetzner Storage Box przez SFTP (rclone „sftp”, port 23), na nim rclone „crypt”
 * (password + password2 — dokumentacja rclone crypt: bez tej samej soli danych nie odczytasz).
 */
const KLUCZ = 'backup.offsiteEnc';

export interface KonfiguracjaOffsite {
  host: string;
  port: number;
  user: string;
  pass: string;
  sciezka: string;
  cryptPass: string;
  cryptSalt: string;
  retencjaDni: number;
}

export type PodgladOffsite =
  | { skonfigurowany: false }
  | { skonfigurowany: true; host: string; port: number; user: string; sciezka: string; retencjaDni: number; zmienionoAt: string | null };

@Injectable()
export class BackupOffsiteService {
  private readonly logger = new Logger(BackupOffsiteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    @Optional() private readonly tasks?: NodeTasksService,
  ) {}

  private async wczytaj(): Promise<{ k: KonfiguracjaOffsite; at: Date } | null> {
    const w = await this.prisma.platformSetting.findUnique({ where: { key: KLUCZ } });
    if (!w?.value) return null;
    try {
      return { k: JSON.parse(this.crypto.decrypt(w.value)) as KonfiguracjaOffsite, at: w.updatedAt };
    } catch {
      return null;
    }
  }

  async podglad(): Promise<PodgladOffsite> {
    const w = await this.wczytaj();
    if (!w) return { skonfigurowany: false };
    const { host, port, user, sciezka, retencjaDni } = w.k;
    return { skonfigurowany: true, host, port, user, sciezka, retencjaDni, zmienionoAt: w.at.toISOString() };
  }

  /** Puste hasła = zostaw obecne (formularz nie odsyła sekretów). */
  async zapisz(
    dane: Omit<KonfiguracjaOffsite, 'pass' | 'cryptPass' | 'cryptSalt'> & { pass?: string; cryptPass?: string; cryptSalt?: string },
    actorUserId: string,
  ): Promise<PodgladOffsite> {
    const stare = (await this.wczytaj())?.k;
    const k: KonfiguracjaOffsite = {
      host: dane.host.trim(),
      port: dane.port,
      user: dane.user.trim(),
      sciezka: dane.sciezka.trim().replace(/^\/+|\/+$/g, ''),
      retencjaDni: dane.retencjaDni,
      pass: dane.pass?.trim() || stare?.pass || '',
      cryptPass: dane.cryptPass?.trim() || stare?.cryptPass || '',
      cryptSalt: dane.cryptSalt?.trim() || stare?.cryptSalt || '',
    };
    if (!k.pass || !k.cryptPass || !k.cryptSalt) {
      throw new BadRequestException('Podaj hasło do Storage Boxa oraz hasło i sól szyfrowania (przy pierwszym zapisie wszystkie trzy).');
    }
    if (stare && (stare.cryptPass !== k.cryptPass || stare.cryptSalt !== k.cryptSalt)) {
      // Zmiana haseł crypt odcina dostęp do wcześniejszych kopii — tylko świadomie, z audytem.
      await this.audit.record({ action: 'BACKUP_OFFSITE_CRYPT_CHANGED', actorUserId, details: { host: k.host } });
    }
    const value = this.crypto.encrypt(JSON.stringify(k));
    await this.prisma.platformSetting.upsert({
      where: { key: KLUCZ },
      create: { key: KLUCZ, value, updatedByUserId: actorUserId },
      update: { value, updatedByUserId: actorUserId },
    });
    await this.audit.record({
      action: 'BACKUP_OFFSITE_UPDATED',
      actorUserId,
      details: { host: k.host, port: k.port, user: k.user, sciezka: k.sciezka, retencjaDni: k.retencjaDni },
    });
    // PB-31 — zatwierdzone węzły, które czekały tylko na kopie, od razu dostają Onboard LIVE.
    if (!stare && this.tasks) {
      const czekajace = await this.prisma.server.findMany({
        where: { status: 'ACTIVE', onboardVerifiedAt: null, identityToken: { not: null } },
        select: { id: true },
      });
      for (const s of czekajace) {
        await this.tasks.queueOnboardLive(s.id, actorUserId).catch((e) => this.logger.warn(`Onboard ${s.id}: ${(e as Error).message}`));
      }
    }
    return this.podglad();
  }

  /** Treść dla węzła (env, source-owalna). `null` = nieskonfigurowane. */
  async dlaWezla(serverId: string): Promise<string | null> {
    const w = await this.wczytaj();
    if (!w) return null;
    await this.audit.record({ action: 'BACKUP_OFFSITE_READ_BY_NODE', details: { serverId } });
    const q = (v: string | number) => `'${String(v).replace(/'/g, `'\\''`)}'`;
    const k = w.k;
    return [
      `VB_HOST=${q(k.host)}`,
      `VB_PORT=${q(k.port)}`,
      `VB_USER=${q(k.user)}`,
      `VB_PASS=${q(k.pass)}`,
      `VB_PATH=${q(k.sciezka)}`,
      `VB_CRYPT_PASS=${q(k.cryptPass)}`,
      `VB_CRYPT_SALT=${q(k.cryptSalt)}`,
      `VB_RETENTION_DAYS=${q(k.retencjaDni)}`,
      '',
    ].join('\n');
  }
}
