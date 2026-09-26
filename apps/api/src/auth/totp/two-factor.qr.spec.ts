import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { TwoFactorService } from './two-factor.service.js';
import { TotpService } from './totp.service.js';

/**
 * Kod QR do 2FA rysuje API. Do 2026-09-24 trzy panele wstawiały otpauthUri — w nim
 * SEKRET TOTP — w adres api.qrserver.com, więc drugi składnik logowania każdego
 * klienta i pracownika trafiał do obcego serwisu i jego logów.
 */
describe('2FA — QR bez obcych serwisów', () => {
  it('startEnrollment zwraca QR jako SVG data URL z tym samym sekretem', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 'jan@example.pl', isTwoFactorEnabled: false }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const crypto = { encrypt: (v: string) => `enc:${v}` };
    const svc = new TwoFactorService(prisma as never, crypto as never, {} as never, new TotpService(), {} as never, {} as never);

    const res = await svc.startEnrollment('u1');

    expect(res.qrDataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const svg = Buffer.from(res.qrDataUrl.split(',')[1]!, 'base64').toString('utf8');
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>$/);
    expect(res.otpauthUri).toContain(`secret=${res.secret}`);
  });

  it('żaden panel nie woła zewnętrznego generatora QR', () => {
    const KORZEN = resolve(import.meta.dirname, '..', '..', '..', '..', '..', 'apps');
    const zakazane = /qrserver\.com|chart\.googleapis\.com|quickchart\.io|goqr\.me/;
    const trafienia: string[] = [];
    const przejdz = (dir: string) => {
      for (const n of readdirSync(dir)) {
        if (n === 'node_modules' || n === '.next' || n === 'dist') continue;
        const p = join(dir, n);
        if (statSync(p).isDirectory()) przejdz(p);
        else if (/\.(tsx?|jsx?)$/.test(n) && zakazane.test(readFileSync(p, 'utf8'))) trafienia.push(p);
      }
    };
    for (const app of ['client-panel', 'staff-panel', 'admin-panel', 'www']) przejdz(join(KORZEN, app, 'src'));
    expect(trafienia).toEqual([]);
  });
});
