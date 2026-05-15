import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailMessage, MailerProvider } from './mailer.interface';
import { LogMailerProvider } from './log-mailer.provider';
import { SmtpMailerProvider } from './smtp-mailer.provider';

export const MAILER_PROVIDER = Symbol('MAILER_PROVIDER');

export interface MailerConfig {
  fromAddress: string;
  fromName: string;
  /** Hard fallback if the active provider throws. We always log to console
   *  on failure even with a real SMTP provider so customers don't get
   *  silently dropped events. */
  swallowErrors: boolean;
}

/**
 * E-3: thin facade that exposes a single `send` method to the rest of the
 * app. Decides the active provider at construction time based on env vars:
 *
 *   SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASS + SMTP_FROM_ADDRESS
 *     → use SMTP (covers Resend, Postmark, SendGrid, Amazon SES SMTP relay)
 *
 *   else
 *     → use the log-only provider (writes to API logs, no actual delivery)
 *
 * The "no SMTP configured" path is intentional — most early-life production
 * deployments don't yet have an MTA and we don't want to crash on startup.
 * Once SMTP is configured, every message goes there.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(
    @Inject(MAILER_PROVIDER) private readonly provider: MailerProvider,
    @Inject('MAILER_CONFIG') private readonly config: MailerConfig,
  ) {
    this.logger.log(`Active provider: ${provider.id}`);
  }

  async send(message: MailMessage): Promise<{ providerId: string; messageId: string | null }> {
    try {
      return await this.provider.send(message);
    } catch (err) {
      this.logger.error(
        `Mailer failed to deliver to ${message.to}: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (this.config.swallowErrors) {
        return { providerId: this.provider.id, messageId: null };
      }
      throw err;
    }
  }
}

export function buildMailerProvider(config: ConfigService): MailerProvider {
  const host = config.get<string>('SMTP_HOST') || process.env.SMTP_HOST || '';
  const port = parseInt(config.get<string>('SMTP_PORT') || process.env.SMTP_PORT || '0', 10);
  const username = config.get<string>('SMTP_USER') || process.env.SMTP_USER || '';
  const password = config.get<string>('SMTP_PASS') || process.env.SMTP_PASS || '';
  const fromAddress =
    config.get<string>('SMTP_FROM_ADDRESS') || process.env.SMTP_FROM_ADDRESS || '';
  const fromName =
    config.get<string>('SMTP_FROM_NAME') || process.env.SMTP_FROM_NAME || 'Verris';
  const secure =
    (config.get<string>('SMTP_SECURE') || process.env.SMTP_SECURE || 'starttls') === 'tls'
      ? 'tls'
      : 'starttls';

  if (host && port > 0 && username && password && fromAddress) {
    return new SmtpMailerProvider({
      host,
      port,
      username,
      password,
      fromAddress,
      fromName,
      secure,
    });
  }
  return new LogMailerProvider();
}
