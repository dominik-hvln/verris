import { ForbiddenException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis, { type Redis } from 'ioredis';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';

/**
 * CYBER-3 — ochrona przed nadużyciem wysyłki (outbound spam).
 *
 * Twarde limity wysyłki per konto (minuta / godzina / doba), wykrywanie skoków
 * i AUTO-CORDON konta (zatrzymanie dalszej wysyłki + alert do security), zanim
 * przejęte/nadużywające konto wpakuje IP floty na RBL.
 *
 * Backend liczników: Redis (współdzielony między replikami; INCR+EXPIRE = okno
 * stałe kroczące). Gdy `REDIS_URL` nie ustawione — fallback in-memory (single
 * replica, jak RateLimitGuard). Cordon trzymany w Redis (TTL) + audyt + alert,
 * więc jest widoczny i trwały (AOF), a każde wykrycie skoku i tak go odnawia.
 */
interface MemBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class OutboundAbuseGuard implements OnModuleDestroy {
  private readonly logger = new Logger(OutboundAbuseGuard.name);
  private redis: Redis | null = null;
  private readonly mem = new Map<string, MemBucket>();
  private readonly memCordon = new Map<string, { reason: string; at: number }>();

  private readonly perMinute: number;
  private readonly perHour: number;
  private readonly perDay: number;
  private readonly cordonTtlSec: number;

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
  ) {
    this.perMinute = this.readInt('OUTBOUND_MAX_PER_MINUTE', 200);
    this.perHour = this.readInt('OUTBOUND_MAX_PER_HOUR', 1000);
    this.perDay = this.readInt('OUTBOUND_MAX_PER_DAY', 5000);
    this.cordonTtlSec = this.readInt('OUTBOUND_CORDON_TTL_SEC', 30 * 24 * 3600);

    const url = process.env.REDIS_URL?.trim();
    if (url) {
      try {
        this.redis = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: false });
        this.redis.on('error', (e) =>
          this.logger.warn(`Redis (outbound-abuse) error: ${e.message}`),
        );
      } catch (e) {
        this.logger.warn(`Redis init failed, fallback in-memory: ${(e as Error).message}`);
        this.redis = null;
      }
    } else {
      this.logger.log('REDIS_URL brak — liczniki outbound działają in-memory (single replica).');
    }
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
  }

  private readInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private cordonKey(userId: string): string {
    return `outbound:cordon:${userId}`;
  }

  /** True gdy konto jest w cordonie (wysyłka wstrzymana). */
  async isCordoned(userId: string): Promise<boolean> {
    if (this.redis) {
      try {
        return (await this.redis.exists(this.cordonKey(userId))) === 1;
      } catch {
        /* fallthrough to memory */
      }
    }
    return this.memCordon.has(userId);
  }

  /** Rzuca 403, gdy konto jest cordonowane. Wołane przed startem wysyłki. */
  async assertNotCordoned(userId: string): Promise<void> {
    if (await this.isCordoned(userId)) {
      throw new ForbiddenException(
        'Wysyłka z tego konta została tymczasowo wstrzymana z powodu nietypowej aktywności. ' +
          'Skontaktuj się z pomocą techniczną.',
      );
    }
  }

  /**
   * Rejestruje `n` wysłanych wiadomości dla konta i sprawdza limity. Gdy
   * którykolwiek limit (minuta/godzina/doba) zostanie przekroczony — nakłada
   * cordon i rzuca `ForbiddenException`. Zwraca aktualne liczniki.
   */
  async recordSends(
    userId: string,
    n: number,
    ctx?: { subscriptionId?: string; source?: string },
  ): Promise<{ minute: number; hour: number; day: number }> {
    if (n <= 0) return { minute: 0, hour: 0, day: 0 };

    const minute = await this.incr(`outbound:m:${userId}`, n, 60);
    const hour = await this.incr(`outbound:h:${userId}`, n, 3600);
    const day = await this.incr(`outbound:d:${userId}`, n, 86400);

    let breach: string | null = null;
    if (minute > this.perMinute) breach = `skok wysyłki: ${minute}/min > ${this.perMinute}`;
    else if (hour > this.perHour) breach = `limit godzinowy: ${hour}/h > ${this.perHour}`;
    else if (day > this.perDay) breach = `limit dobowy: ${day}/24h > ${this.perDay}`;

    if (breach) {
      await this.cordon(userId, breach, ctx);
      throw new ForbiddenException(
        'Przekroczono limit wysyłki — konto zostało tymczasowo wstrzymane (ochrona antyspamowa).',
      );
    }
    return { minute, hour, day };
  }

  /** Nakłada cordon: blokuje wysyłkę, zapisuje audyt i wysyła alert do security. */
  async cordon(
    userId: string,
    reason: string,
    ctx?: { subscriptionId?: string; source?: string },
  ): Promise<void> {
    const alreadyCordoned = await this.isCordoned(userId);
    if (this.redis) {
      try {
        await this.redis.set(
          this.cordonKey(userId),
          JSON.stringify({ reason, at: new Date().toISOString(), ...ctx }),
          'EX',
          this.cordonTtlSec,
        );
      } catch (e) {
        this.logger.warn(`Redis cordon set failed: ${(e as Error).message}`);
        this.memCordon.set(userId, { reason, at: Date.now() });
      }
    } else {
      this.memCordon.set(userId, { reason, at: Date.now() });
    }

    if (alreadyCordoned) return; // audyt/alert tylko przy pierwszym nałożeniu

    this.logger.warn(`OUTBOUND CORDON userId=${userId} reason="${reason}"`);
    await this.audit
      .record({
        action: 'OUTBOUND_CORDON_APPLIED',
        userId,
        details: { reason, ...ctx },
      })
      .catch(() => undefined);

    const inbox = process.env.SECURITY_ALERT_EMAIL;
    if (inbox) {
      await this.mailer
        .send({
          to: inbox,
          subject: `[Verris][SECURITY] Auto-cordon wysyłki — konto ${userId}`,
          text:
            `Nałożono automatyczny cordon na wysyłkę konta.\n\n` +
            `Konto (userId): ${userId}\n` +
            `Powód: ${reason}\n` +
            `Subskrypcja: ${ctx?.subscriptionId ?? '-'}\n` +
            `Źródło: ${ctx?.source ?? 'outbound-guard'}\n` +
            `Czas: ${new Date().toISOString()}\n\n` +
            `Wysyłka z tego konta jest wstrzymana. Zwolnij cordon w panelu admina ` +
            `(Deliverability → Cordony) po weryfikacji.`,
          category: 'TRANSACTIONAL',
          tag: 'security.outbound-cordon',
        })
        .catch((e) => this.logger.warn(`Alert cordon email failed: ${(e as Error).message}`));
    }
  }

  /** Zwalnia cordon (akcja admina). Zeruje też liczniki, by konto ruszyło od zera. */
  async release(userId: string, actorUserId?: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(
          this.cordonKey(userId),
          `outbound:m:${userId}`,
          `outbound:h:${userId}`,
          `outbound:d:${userId}`,
        );
      } catch (e) {
        this.logger.warn(`Redis cordon release failed: ${(e as Error).message}`);
      }
    }
    this.memCordon.delete(userId);
    this.mem.delete(`outbound:m:${userId}`);
    this.mem.delete(`outbound:h:${userId}`);
    this.mem.delete(`outbound:d:${userId}`);

    await this.audit
      .record({
        action: 'OUTBOUND_CORDON_RELEASED',
        userId: actorUserId ?? userId,
        details: { targetUserId: userId },
      })
      .catch(() => undefined);
  }

  /** Lista aktywnych cordonów (dla panelu admina). */
  async listCordoned(): Promise<Array<{ userId: string; reason: string; at: string }>> {
    if (this.redis) {
      try {
        const keys = await this.scan('outbound:cordon:*');
        const out: Array<{ userId: string; reason: string; at: string }> = [];
        for (const key of keys) {
          const raw = await this.redis.get(key);
          const userId = key.replace('outbound:cordon:', '');
          let reason = 'nieznany';
          let at = '';
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as { reason?: string; at?: string };
              reason = parsed.reason ?? reason;
              at = parsed.at ?? '';
            } catch {
              /* zły JSON — zostaw domyślne */
            }
          }
          out.push({ userId, reason, at });
        }
        return out;
      } catch (e) {
        this.logger.warn(`Redis listCordoned failed: ${(e as Error).message}`);
      }
    }
    return [...this.memCordon.entries()].map(([userId, v]) => ({
      userId,
      reason: v.reason,
      at: new Date(v.at).toISOString(),
    }));
  }

  // --- backend liczników -----------------------------------------------------

  private async incr(key: string, by: number, ttlSec: number): Promise<number> {
    if (this.redis) {
      try {
        const val = await this.redis.incrby(key, by);
        if (val === by) await this.redis.expire(key, ttlSec); // ustaw TTL przy pierwszym trafieniu okna
        return val;
      } catch {
        /* fallthrough to memory */
      }
    }
    const now = Date.now();
    const b = this.mem.get(key);
    if (!b || b.resetAt <= now) {
      this.mem.set(key, { count: by, resetAt: now + ttlSec * 1000 });
      return by;
    }
    b.count += by;
    return b.count;
  }

  private async scan(match: string): Promise<string[]> {
    if (!this.redis) return [];
    const found: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', match, 'COUNT', 200);
      cursor = next;
      found.push(...batch);
    } while (cursor !== '0');
    return found;
  }
}
