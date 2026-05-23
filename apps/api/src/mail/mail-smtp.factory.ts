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
  });
}
