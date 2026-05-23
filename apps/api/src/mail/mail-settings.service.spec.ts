import { MailSettingsService } from './mail-settings.service';
import { MAIL_SETTING_KEYS } from './mail-settings.keys';

describe('MailSettingsService', () => {
  const prisma = {
    platformSetting: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };

  const crypto = {
    encrypt: jest.fn((v: string) => `enc:${v}`),
    decrypt: jest.fn((v: string) => v.replace(/^enc:/, '')),
  };

  const config = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        SMTP_HOST: 'localhost',
        SMTP_PORT: '25',
        SMTP_SECURE: 'none',
        SMTP_FROM_ADDRESS: 'panel@verris.pl',
        SMTP_FROM_NAME: 'Verris',
      };
      return map[key];
    }),
  };

  const audit = { record: jest.fn() };

  function svc() {
    return new MailSettingsService(
      prisma as never,
      crypto as never,
      config as never,
      audit as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolveSmtpConfig defaults to local Postfix relay', () => {
    const resolved = svc().resolveSmtpConfig(new Map());
    expect(resolved.host).toBe('localhost');
    expect(resolved.port).toBe(25);
    expect(resolved.secure).toBe('none');
    expect(resolved.fromAddress).toBe('panel@verris.pl');
    expect(resolved.username).toBe('');
  });

  it('resolveSmtpConfig uses external relay from platform settings', () => {
    const map = new Map<string, string>([
      [MAIL_SETTING_KEYS.TRANSPORT, 'external'],
      [MAIL_SETTING_KEYS.SMTP_HOST, 'smtp.example.com'],
      [MAIL_SETTING_KEYS.SMTP_PORT, '587'],
      [MAIL_SETTING_KEYS.SMTP_SECURE, 'starttls'],
      [MAIL_SETTING_KEYS.SMTP_USER, 'user'],
      [MAIL_SETTING_KEYS.SMTP_PASS_ENC, 'enc:secret'],
      [MAIL_SETTING_KEYS.FROM_ADDRESS, 'noreply@verris.pl'],
      [MAIL_SETTING_KEYS.FROM_NAME, 'Verris'],
    ]);
    const resolved = svc().resolveSmtpConfig(map);
    expect(resolved.host).toBe('smtp.example.com');
    expect(resolved.port).toBe(587);
    expect(resolved.username).toBe('user');
    expect(resolved.password).toBe('secret');
  });
});
