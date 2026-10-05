import { MailerProvider } from './mailer.interface.js';
import { LogMailerProvider } from './log-mailer.provider.js';
import { SmtpMailerProvider } from './smtp-mailer.provider.js';
import type { MailSmtpSecure } from './mail-settings.keys.js';

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

/**
 * Q-05 — konfiguracja SMTP z jednego adresu (env `EMM_SMTP_URL`):
 *   smtp://login:hasło@host:587   — STARTTLS (dla localhost bez TLS), domyślny port 587
 *   smtps://login:hasło@host:465  — TLS od połączenia, domyślny port 465
 *   …?from=newsletter@domena.pl   — opcjonalny adres nadawcy (domyślnie ten z `defaults`)
 * Znaki specjalne w loginie i haśle kodowane %XX (zapis URL). Pusty lub zły adres = null.
 */
export function parseSmtpUrl(
  raw: string | undefined,
  defaults: { fromAddress: string; fromName: string },
): ResolvedSmtpConfig | null {
  if (!raw?.trim()) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const tlsOdPolaczenia = u.protocol === 'smtps:';
  if (!tlsOdPolaczenia && u.protocol !== 'smtp:') return null;
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : tlsOdPolaczenia ? 465 : 587,
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    fromAddress: u.searchParams.get('from') || defaults.fromAddress,
    fromName: defaults.fromName,
    secure: tlsOdPolaczenia ? 'tls' : isLocalSmtpHost(u.hostname) ? 'none' : 'starttls',
    ...resolveSmtpIdentity(process.env),
  };
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
