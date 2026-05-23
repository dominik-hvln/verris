/** Platform settings keys for outbound mail (stored in `platform_settings`). */
export const MAIL_SETTING_KEYS = {
  TRANSPORT: 'mail.transport',
  FROM_ADDRESS: 'mail.fromAddress',
  FROM_NAME: 'mail.fromName',
  SMTP_HOST: 'mail.smtp.host',
  SMTP_PORT: 'mail.smtp.port',
  SMTP_SECURE: 'mail.smtp.secure',
  SMTP_USER: 'mail.smtp.user',
  /** AES-256-GCM ciphertext (APP_KMS_KEY). Empty = no password. */
  SMTP_PASS_ENC: 'mail.smtp.passEnc',
} as const;

export type MailTransportMode = 'local' | 'external';

export type MailSmtpSecure = 'none' | 'starttls' | 'tls';

export const MAIL_SETTING_DEFAULTS: Record<
  (typeof MAIL_SETTING_KEYS)[keyof typeof MAIL_SETTING_KEYS],
  string
> = {
  [MAIL_SETTING_KEYS.TRANSPORT]: 'local',
  [MAIL_SETTING_KEYS.FROM_ADDRESS]: '',
  [MAIL_SETTING_KEYS.FROM_NAME]: 'Verris',
  [MAIL_SETTING_KEYS.SMTP_HOST]: '',
  [MAIL_SETTING_KEYS.SMTP_PORT]: '25',
  [MAIL_SETTING_KEYS.SMTP_SECURE]: 'none',
  [MAIL_SETTING_KEYS.SMTP_USER]: '',
  [MAIL_SETTING_KEYS.SMTP_PASS_ENC]: '',
};
