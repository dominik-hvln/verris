import { ConflictException } from '@nestjs/common';
import { UsersAdminService, OPERATOR_ACCOUNT_LINK_TTL_HOURS } from './users.admin.service.js';
import { hashAuthToken } from '../auth/auth-token.util.js';

/** A-24 — operator zakłada konto: bez znanego hasła, bez zgód w imieniu klienta, link 72 h. */
function zbuduj(opts: { istnieje?: boolean; mailPada?: boolean } = {}) {
  const tx = {
    user: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'u1', ...data })) },
    userAuthToken: { create: vi.fn(async (_a: { data: { purpose: string; tokenHash: string; expiresAt: Date } }) => ({})) },
  };
  const prisma = {
    user: { findFirst: vi.fn(async () => (opts.istnieje ? { id: 'x' } : null)) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const config = { get: vi.fn(() => 'https://panel.test') };
  const mailer = {
    send: vi.fn(async (_m: { text: string; to: string }) => {
      if (opts.mailPada) throw new Error('smtp');
    }),
  };
  const svc = new UsersAdminService(
    prisma as never, {} as never, audit as never, config as never, {} as never, {} as never, mailer as never,
  );
  return { svc, prisma, tx, audit, mailer };
}

const dto = { email: '  Jan@Firma.PL ', firstName: ' Jan ', lastName: 'Nowak', reason: 'telefon' };

describe('UsersAdminService.createCustomerByOperator (A-24)', () => {
  it('zakłada klienta z adresem małymi literami i bez zgód', async () => {
    const { svc, tx } = zbuduj();
    const r = await svc.createCustomerByOperator('op1', dto, {});
    expect(r).toEqual({ id: 'u1', email: 'jan@firma.pl', mailSent: true });
    const data = tx.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: 'jan@firma.pl', firstName: 'Jan', role: 'USER' });
    expect(data).not.toHaveProperty('lastConsentVersionTerms');
    expect(data).not.toHaveProperty('emailVerifiedAt');
  });

  it('link w mailu pasuje do zapisanego tokenu, ważność 72 h', async () => {
    const { svc, tx, mailer } = zbuduj();
    const przed = Date.now();
    await svc.createCustomerByOperator('op1', dto, {});
    const tok = tx.userAuthToken.create.mock.calls[0]![0].data;
    expect(tok.purpose).toBe('PASSWORD_RESET');
    const ttl = tok.expiresAt.getTime() - przed;
    expect(ttl).toBeGreaterThan((OPERATOR_ACCOUNT_LINK_TTL_HOURS * 3600 - 60) * 1000);
    const msg = mailer.send.mock.calls[0]![0];
    const raw = decodeURIComponent(/token=([^\s)"&]+)/.exec(msg.text)![1]);
    expect(hashAuthToken(raw)).toBe(tok.tokenHash);
    expect(msg.to).toBe('jan@firma.pl');
  });

  it('audyt z operatorem i powodem', async () => {
    const { svc, audit } = zbuduj();
    await svc.createCustomerByOperator('op1', dto, { ipAddress: '1.2.3.4' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_CUSTOMER_CREATED_BY_OPERATOR', actorUserId: 'op1', userId: 'u1' }),
    );
  });

  it('zajęty adres → 409, nic nie tworzy', async () => {
    const { svc, prisma } = zbuduj({ istnieje: true });
    await expect(svc.createCustomerByOperator('op1', dto, {})).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('awaria maila nie cofa konta — operator widzi mailSent=false', async () => {
    const { svc } = zbuduj({ mailPada: true });
    await expect(svc.createCustomerByOperator('op1', dto, {})).resolves.toMatchObject({ mailSent: false });
  });
});
