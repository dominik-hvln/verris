import { MailerProvider } from './mailer.interface';
import { LogMailerProvider } from './log-mailer.provider';
import { SmtpMailerProvider } from './smtp-mailer.provider';
import type { MailSmtpSecure } from './mail-settings.keys';

export interface ResolvedSmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  secure: MailSmtpSecure;
  /** EHLO/HELO name — must match PTR / mail.verris.pl (not host.docker.internal). */
  heloName: string;
  /** Domain suffix for Message-ID header (e.g. verris.pl). */
  messageIdDomain: string;
}

/** Public HELO + Message-ID domain for outbound SMTP (deliverability). */
export function resolveSmtpIdentity(env: NodeJS.ProcessEnv = process.env): {
  heloName: string;
  messageIdDomain: string;
} {
  const heloName =
    env.SMTP_HELO_NAME?.trim() ||
    env.CADDY_MAIL_DOMAIN?.trim() ||
    'mail.verris.pl';
  const messageIdDomain =
    env.SMTP_MESSAGE_ID_DOMAIN?.trim() ||
    env.CONTROL_PLANE_MAIL_DOMAIN?.trim() ||
    'verris.pl';
  return { heloName, messageIdDomain };
}

export function isLocalSmtpHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === 'host.docker.internal' ||
    /^localhost\.localdomain$/i.test(host)
  );
}

export function buildSmtpMailerProvider(config: ResolvedSmtpConfig): MailerProvider {
  if (!config.host || config.port <= 0 || !config.fromAddress) {
    return new LogMailerProvider();
  }

  const local = isLocalSmtpHost(config.host);
  if (!local && (!config.username || !config.password)) {
    return new LogMailerProvider();
  }

  return new SmtpMailerProvider({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    fromAddress: config.fromAddress,
    fromName: config.fromName,
    secure: config.secure,
    heloName: config.heloName,
    messageIdDomain: config.messageIdDomain,
  });
}
