import { MailSettingsService } from './mail-settings.service.js';
import { MAIL_SETTING_KEYS } from './mail-settings.keys.js';

describe('MailSettingsService', () => {
  const prisma = {
    platformSetting: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };

  const crypto = {
    encrypt: vi.fn((v: string) => `enc:${v}`),
    decrypt: vi.fn((v: string) => v.replace(/^enc:/, '')),
  };

  const config = {
    get: vi.fn((key: string) => {
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

  const audit = { record: vi.fn() };

  function svc() {
    return new MailSettingsService(
      prisma as never,
      crypto as never,
      config as never,
      audit as never,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolveSmtpConfig defaults to local Postfix relay', () => {
    const resolved = svc().resolveSmtpConfig(new Map());
    expect(resolved.host).toBe('localhost');
    expect(resolved.port).toBe(25);
    expect(resolved.secure).toBe('none');
    expect(resolved.fromAddress).toBe('panel@verris.pl');
    expect(resolved.username).toBe('');
    expect(resolved.heloName).toBeTruthy();
    expect(resolved.messageIdDomain).toBeTruthy();
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

  it('X-48: relay zewnętrzny bez portu nie zapisuje portu „undefined”', async () => {
    await expect(
      svc().updateAdminSettings(
        { transport: 'external', smtpHost: 'smtp.example.com', smtpUser: 'u', smtpPassword: 'p', fromAddress: 'noreply@verris.pl', fromName: 'Verris' } as never,
        'admin-1',
      ),
    ).rejects.toThrow('Podaj port i szyfrowanie SMTP');
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });
});
