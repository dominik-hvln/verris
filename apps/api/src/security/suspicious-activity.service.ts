import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';

const FAIL_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const FAIL_THRESHOLD = 10;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // re-alert at most once / 30 min per email

interface RecordFailureInput {
  email: string;
  ip: string | null;
  userAgent: string | null;
  reason:
    | 'unknown_user'
    | 'bad_password'
    | '2fa_failed'
    | 'session_expired'
    | 'too_many_attempts';
}

interface RecordSuccessInput {
  email: string;
  ip: string | null;
  userAgent: string | null;
}

/**
 * E-8: detects suspicious authentication activity (mass-failed logins from
 * a single email or single IP) and emits audit + email alerts. The class is
 * deliberately decoupled from `AuthService` — `AuthService.login()` calls
 * `recordFailure()` / `recordSuccess()` and never has to think about
 * thresholds, alerts, or storage.
 *
 * Detection rule (kept simple to avoid false positives on Day 1):
 *   - For a given email: ≥ 10 failed attempts in the last 15 min triggers
 *     a single audit-log entry with action=`SUSPICIOUS_LOGIN_BURST_BY_EMAIL`
 *     and an alert e-mail to the security inbox (best-effort).
 *   - For a given IP: same threshold, action=`SUSPICIOUS_LOGIN_BURST_BY_IP`.
 *   - Each (email, ip) tuple is alerted at most once per 30 minutes — we
 *     check the last `SUSPICIOUS_*` audit entry to enforce that.
 *
 * Future expansion (out of scope of E-8): geo-IP delta, device fingerprint
 * delta, time-of-day anomalies, password-spraying across distinct emails.
 */
@Injectable()
export class SuspiciousActivityService {
  private readonly logger = new Logger(SuspiciousActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
  ) {}

  async recordSuccess(input: RecordSuccessInput): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        email: input.email.toLowerCase(),
        ip: input.ip,
        userAgent: input.userAgent ?? null,
        succeeded: true,
      },
    });
  }

  async recordFailure(input: RecordFailureInput): Promise<void> {
    const email = input.email.toLowerCase();
    await this.prisma.loginAttempt.create({
      data: {
        email,
        ip: input.ip,
        userAgent: input.userAgent ?? null,
        succeeded: false,
        reason: input.reason,
      },
    });

    // Fire-and-forget detection — don't block the response on it.
    void this.evaluate(email, input.ip).catch((err) => {
      this.logger.warn(
        `Suspicious-activity evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * Returns true if the email is currently rate-limited by recent failures.
   * Auth controllers MAY consult this before checking the password to avoid
   * timing oracles on legitimate users.
   */
  async isEmailLockedOut(email: string): Promise<boolean> {
    const since = new Date(Date.now() - FAIL_WINDOW_MS);
    const failed = await this.prisma.loginAttempt.count({
      where: {
        email: email.toLowerCase(),
        succeeded: false,
        createdAt: { gte: since },
      },
    });
    return failed >= FAIL_THRESHOLD;
  }

  // ---------------------------------------------------------------------

  private async evaluate(email: string, ip: string | null): Promise<void> {
    const since = new Date(Date.now() - FAIL_WINDOW_MS);

    const [byEmail, byIp] = await Promise.all([
      this.prisma.loginAttempt.count({
        where: { email, succeeded: false, createdAt: { gte: since } },
      }),
      ip
        ? this.prisma.loginAttempt.count({
            where: { ip, succeeded: false, createdAt: { gte: since } },
          })
        : Promise.resolve(0),
    ]);

    if (byEmail >= FAIL_THRESHOLD) {
      await this.alert({
        action: 'SUSPICIOUS_LOGIN_BURST_BY_EMAIL',
        cooldownKey: `email:${email}`,
        details: { email, ip, failedCount: byEmail, windowMinutes: 15 },
        body: buildAlertBody({
          kind: 'email',
          subject: email,
          ip,
          failedCount: byEmail,
        }),
      });
    }
    if (ip && byIp >= FAIL_THRESHOLD) {
      await this.alert({
        action: 'SUSPICIOUS_LOGIN_BURST_BY_IP',
        cooldownKey: `ip:${ip}`,
        details: { ip, failedCount: byIp, windowMinutes: 15 },
        body: buildAlertBody({ kind: 'ip', subject: ip, ip, failedCount: byIp }),
      });
    }
  }

  private async alert(input: {
    action: string;
    cooldownKey: string;
    details: Record<string, unknown>;
    body: { subject: string; text: string };
  }): Promise<void> {
    // Check cooldown — last entry for the same `cooldownKey` in audit log.
    const cooldownSince = new Date(Date.now() - ALERT_COOLDOWN_MS);
    const recent = await this.prisma.auditLog.findFirst({
      where: {
        action: input.action,
        createdAt: { gte: cooldownSince },
        details: { path: ['cooldownKey'], equals: input.cooldownKey },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) return;

    await this.audit.record({
      action: input.action,
      details: { ...input.details, cooldownKey: input.cooldownKey },
    });

    const securityInbox = process.env.SECURITY_ALERT_EMAIL;
    if (securityInbox) {
      await this.mailer.send({
        to: securityInbox,
        subject: input.body.subject,
        text: input.body.text,
        tag: 'security.alert',
        category: 'TRANSACTIONAL',
        fromRole: 'SECURITY',
      });
    }
  }
}

function buildAlertBody(input: {
  kind: 'email' | 'ip';
  subject: string;
  ip: string | null;
  failedCount: number;
}): { subject: string; text: string } {
  const headline =
    input.kind === 'email'
      ? `Wykryto ${input.failedCount}× nieudanych logowań dla: ${input.subject}`
      : `Wykryto ${input.failedCount}× nieudanych logowań z IP: ${input.subject}`;
  return {
    subject: `[SECURITY] ${headline}`,
    text: `${headline}

Okno: ostatnie 15 minut.
${input.ip ? `IP: ${input.ip}\n` : ''}
Rekomendowana reakcja:
  1. Sprawdź audit log w panelu admina (filtr action=SUSPICIOUS_LOGIN_*).
  2. Jeśli to atak — zablokuj konto przez admin-panel i włącz wymóg 2FA.
  3. Skontaktuj się z klientem na alternatywnym kanale, żeby potwierdzić.

— Verris Security
`,
  };
}
