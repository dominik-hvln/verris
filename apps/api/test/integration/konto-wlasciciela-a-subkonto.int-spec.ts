import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { CryptoService } from '../../src/common/crypto/crypto.service.js';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy.js';
import { AuthController } from '../../src/auth/auth.controller.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { TwoFactorService } from '../../src/auth/totp/two-factor.service.js';
import { TotpService } from '../../src/auth/totp/totp.service.js';
import { WebAuthnService } from '../../src/auth/webauthn/webauthn.service.js';
import { PasskeyPolicyService } from '../../src/auth/passkey-policy.service.js';
import { CaptchaService } from '../../src/auth/captcha.service.js';
import { MailerService } from '../../src/mail/mailer.service.js';
import { ConsentsController } from '../../src/compliance/consents.controller.js';
import { ConsentsService } from '../../src/compliance/consents.service.js';
import { MarketingPreferencesService } from '../../src/compliance/marketing-preferences.service.js';
import { SearchAdminController } from '../../src/search/search.admin.controller.js';
import { SearchService } from '../../src/search/search.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * Przegląd 28.09 — trasy „osoby zalogowanej” wołane przez subkonto działały na koncie WŁAŚCICIELA
 * (`userId` subkonta = właściciel):
 *  - /auth/2fa/* — subkonto bez uprawnień generowało i włączało TOTP właściciela (sekret zostawał u niego),
 *  - /me/consent/*, /me/marketing-preferences — akceptacja regulaminu/DPA i zgód (w tym alertów logowania)
 *    w imieniu właściciela.
 * Oraz /admin/search — lista klientów bez uprawnienia CUSTOMERS_VIEW.
 */
const SEKRET = 'test-sekret-konto-wlasciciela';
const jwt = new JwtService({ secret: SEKRET });
const totp = new TotpService();

const zgody = { acceptCurrent: vi.fn(async () => undefined), acceptDpa: vi.fn(async () => ({ version: '1' })) };
const marketing = { update: vi.fn(async () => ({})) };

@Module({
  imports: [PassportModule],
  controllers: [AuthController, ConsentsController, SearchAdminController],
  providers: [
    JwtStrategy,
    TwoFactorService,
    TotpService,
    CryptoService,
    SearchService,
    { provide: PrismaService, useFactory: () => prisma() },
    { provide: ConfigService, useValue: { get: (k: string) => (k === 'appKmsKey' ? 'test-kms' : SEKRET) } },
    { provide: AuditService, useValue: { record: async () => undefined } },
    { provide: MailerService, useValue: { send: async () => ({ delivered: true }) } },
    { provide: AuthService, useValue: {} },
    { provide: WebAuthnService, useValue: {} },
    { provide: PasskeyPolicyService, useValue: {} },
    { provide: CaptchaService, useValue: {} },
    { provide: ConsentsService, useValue: zgody },
    { provide: MarketingPreferencesService, useValue: marketing },
  ],
})
class Aplikacja {}

let app: INestApplication;
let url: string;

async function zadanie(metoda: string, sciezka: string, sub: string, body?: unknown, rola = 'USER') {
  const r = await fetch(url + sciezka, {
    method: metoda,
    headers: { Authorization: `Bearer ${jwt.sign({ sub, email: 'x', role: rola, purpose: 'access' }, { expiresIn: 60 })}`, 'Content-Type': 'application/json' },
    body: metoda === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, unknown> | null };
}

async function konta() {
  const t = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const wlasciciel = await prisma().user.create({ data: { email: `wl-${t}@test.verris.pl`, passwordHash: 'x', companyName: 'Firma' } });
  // Subkonto bez żadnego uprawnienia — /auth i /me/consent i tak przechodzą strażnika IAM.
  const sub = await prisma().user.create({
    data: { email: `sub-${t}@test.verris.pl`, passwordHash: 'x', customerOwnerId: wlasciciel.id, customerPermissions: [] } as never,
  });
  return { wlasciciel: wlasciciel.id, sub: sub.id };
}

const dwaFa = (id: string) => prisma().user.findUniqueOrThrow({ where: { id }, select: { isTwoFactorEnabled: true, twoFactorSecret: true } });

describe('Przegląd 28.09 — subkonto nie działa na danych osobistych właściciela', () => {
  beforeAll(async () => {
    app = await NestFactory.create(Aplikacja, { logger: false });
    await app.listen(0);
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await rozlacz();
  });
  beforeEach(async () => {
    await wyczyscBaze();
    zgody.acceptCurrent.mockClear();
    zgody.acceptDpa.mockClear();
    marketing.update.mockClear();
  });

  it('2FA subkonta dotyczy jego własnego loginu, nie właściciela', async () => {
    const k = await konta();
    const start = await zadanie('POST', '/auth/2fa/enroll', k.sub);
    expect(start.status).toBe(200);
    const kod = totp.current(String(start.body?.secret));
    expect((await zadanie('POST', '/auth/2fa/confirm', k.sub, { code: kod })).status).toBe(200);

    expect(await dwaFa(k.wlasciciel)).toEqual({ isTwoFactorEnabled: false, twoFactorSecret: null });
    expect((await dwaFa(k.sub)).isTwoFactorEnabled).toBe(true);
    expect((await zadanie('GET', '/auth/2fa/status', k.sub)).body?.enabled).toBe(true);
    expect((await zadanie('GET', '/auth/2fa/status', k.wlasciciel)).body?.enabled).toBe(false);
  });

  it('operator w impersonacji nie ustawia klientowi 2FA', async () => {
    const k = await konta();
    const token = jwt.sign({ sub: k.wlasciciel, email: 'x', role: 'USER', purpose: 'access', impersonatedBy: k.sub }, { expiresIn: 60 });
    const r = await fetch(url + '/auth/2fa/enroll', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    expect(r.status).toBe(403);
    expect((await dwaFa(k.wlasciciel)).twoFactorSecret).toBeNull();
  });

  it('zgody, DPA i preferencje marketingowe akceptuje tylko właściciel', async () => {
    const k = await konta();
    expect((await zadanie('POST', '/me/consent/accept-current', k.sub)).status).toBe(403);
    expect((await zadanie('POST', '/me/consent/accept-dpa', k.sub)).status).toBe(403);
    expect((await zadanie('PATCH', '/me/marketing-preferences', k.sub, { loginAlertsEmail: false })).status).toBe(403);
    expect(zgody.acceptCurrent).not.toHaveBeenCalled();
    expect(zgody.acceptDpa).not.toHaveBeenCalled();
    expect(marketing.update).not.toHaveBeenCalled();

    expect((await zadanie('POST', '/me/consent/accept-current', k.wlasciciel)).status).toBe(200);
    expect((await zadanie('PATCH', '/me/marketing-preferences', k.wlasciciel, { loginAlertsEmail: false })).status).toBe(200);
  });

  it('wyszukiwarka: klienci tylko z CUSTOMERS_VIEW, węzły z NODES_VIEW, bez żadnego uprawnienia typu — 403', async () => {
    const t = Math.random().toString(36).slice(2, 8);
    const pulpit = await prisma().staffRole.create({ data: { name: `pulpit-${t}`, permissions: ['DASHBOARD_VIEW'] } });
    const flota = await prisma().staffRole.create({ data: { name: `kb-${t}`, permissions: ['NODES_VIEW'] } });
    const z = await prisma().staffRole.create({ data: { name: `bok-${t}`, permissions: ['CUSTOMERS_VIEW'] } });
    const op0 = await prisma().user.create({ data: { email: `op0-${t}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', staffRoleId: pulpit.id } });
    const op1 = await prisma().user.create({ data: { email: `op1-${t}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', staffRoleId: flota.id } });
    const op2 = await prisma().user.create({ data: { email: `op2-${t}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', staffRoleId: z.id } });
    await prisma().user.create({ data: { email: `klient-${t}@test.verris.pl`, passwordHash: 'x', nip: '1234567890' } });
    const wezel = await prisma().server.create({ data: { name: `klient-${t}-wezel`, hostname: `n-${t}.test.verris.net`, ipAddress: `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}` } });

    expect((await zadanie('GET', '/admin/search?q=klient', op0.id, undefined, 'STAFF')).status).toBe(403);

    const kb = await zadanie('GET', `/admin/search?q=klient-${t}`, op1.id, undefined, 'STAFF');
    expect(kb.status).toBe(200);
    expect(kb.body?.results).toEqual([expect.objectContaining({ type: 'node', id: wezel.id, href: `/nodes/${wezel.id}`, status: 'INIT' })]);
    expect(kb.body?.pominiete).toContain('user');
    const poIp = await zadanie('GET', `/admin/search?q=${wezel.ipAddress}`, op1.id, undefined, 'STAFF');
    expect((poIp.body?.results as { id: string }[]).map((r) => r.id)).toEqual([wezel.id]);

    const ok = await zadanie('GET', `/admin/search?q=klient-${t}`, op2.id, undefined, 'STAFF');
    expect(ok.status).toBe(200);
    expect(ok.body?.results).toEqual([expect.objectContaining({ type: 'user' })]);
    expect(ok.body?.pominiete).toContain('node');
  });
});
