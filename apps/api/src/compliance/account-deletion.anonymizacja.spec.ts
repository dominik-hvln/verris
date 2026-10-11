import { createHash } from 'node:crypto';
import { AccountDeletionService, wzorzecAdresu } from './account-deletion.service.js';
import { JwtStrategy } from '../auth/strategies/jwt.strategy.js';

/**
 * P-02 — anonimizacja konta (art. 17): operacja nieodwracalna. Pilnujemy, co znika, co zostaje
 * (faktury), że subkonta tracą dostęp razem z właścicielem i że w dzienniku nie zostaje jawny e-mail.
 */
function stanowisko(opts: { juzZanonimizowany?: boolean; subkonta?: string[] } = {}) {
  const kolejnosc: string[] = [];
  const magazyn = { removeObject: vi.fn(async (_b: string, k: string) => void kolejnosc.push(`magazyn:${k}`)) };
  const tx = {
    subscription: { update: vi.fn(async () => kolejnosc.push('sub')) },
    subscriptionEvent: { create: vi.fn(async () => ({})) },
    account: { updateMany: vi.fn(async () => kolejnosc.push('accounts-db')), findMany: vi.fn(async () => [{ id: 'a1' }, { id: 'a2' }]) },
    nodeTask: { updateMany: vi.fn(async () => ({ count: 1 })) },
    user: {
      update: vi.fn(async () => ({})),
      findMany: vi.fn(async () => (opts.subkonta ?? []).map((id) => ({ id }))),
    },
    paymentMethod: { deleteMany: vi.fn(async () => ({})) },
    walletAutoTopup: { deleteMany: vi.fn(async () => ({})) },
    clientWebhookEndpoint: { deleteMany: vi.fn(async () => ({})) },
    apiToken: { updateMany: vi.fn(async () => ({})) },
    customerNote: { deleteMany: vi.fn(async () => ({})) },
    migracjaKontakt: { deleteMany: vi.fn(async () => ({})) },
    pocztaPrzychodzaca: {
      findMany: vi.fn(async () => [{ zalaczniki: [{ nazwa: 'zrzut.jpg', klucz: 'poczta/p1/zrzut.jpg' }, { nazwa: 'x.exe', pominiety: 'typ' }] }]),
      deleteMany: vi.fn(async () => ({})),
    },
    migrationRequest: { updateMany: vi.fn(async () => ({ count: 1 })) },
    accountDeletionRequest: { update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 1 })) },
    invoice: { deleteMany: vi.fn() },
    ticketReply: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    ticket: { updateMany: vi.fn(async () => ({ count: 1 })) },
    operatorRequest: {
      findMany: vi.fn(async () => [{ payload: { newEmail: 'Nowy@Firma.pl' }, result: { komunikat: 'Adres e-mail zmieniony na nowy@firma.pl.' } }]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    // Przegląd poprawek — adres sprzed zmiany przez obsługę (CUSTOMER_EMAIL_CHANGED.fromEmail).
    auditLog: { findMany: vi.fn(async () => [{ details: { fromEmail: 'Stary@Firma.pl', toEmail: 'jan@firma.pl', reason: null } }]) },
    $executeRaw: vi.fn(async () => 1),
  };
  const prisma = {
    user: {
      findUnique: vi.fn(async () => ({
        id: 'u1', email: 'Jan@Firma.pl', firstName: 'Jan', anonymizedAt: opts.juzZanonimizowany ? new Date() : null,
      })),
    },
    subscription: { findMany: vi.fn(async () => [{ id: 's1' }]) },
    account: { findMany: vi.fn(async () => [{ id: 'a1', daUsername: 'jan1', serverId: 'n1' }]) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => {
      await fn(tx);
      kolejnosc.push('commit');
    }),
  };
  const suspend = vi.fn(async () => {
    kolejnosc.push('da-suspend');
    return { success: true };
  });
  const da = { getClientForServer: vi.fn(async () => ({ suspendAccount: suspend, suspendUser: suspend })) };
  const audit = { record: vi.fn(async () => undefined) };
  const mailer = { send: vi.fn(async () => undefined) };
  const svc = new AccountDeletionService(prisma as never, audit as never, da as never, mailer as never, { get: () => undefined } as never, magazyn as never);
  return { svc, tx, prisma, audit, kolejnosc, magazyn };
}

describe('AccountDeletionService.executeAnonymization (P-02)', () => {
  it('dane osobowe znikają, usługi anulowane, metody płatności usunięte; faktury zostają', async () => {
    const s = stanowisko();
    await s.svc.executeAnonymization('u1');
    const dane = (s.tx.user.update.mock.calls as unknown as [{ where: { id: string }; data: Record<string, unknown> }][])
      .find(([a]) => a.where.id === 'u1')![0].data;
    expect(dane).toMatchObject({
      email: 'deleted-u1@verris.local', firstName: null, lastName: null, nip: null, address: null,
      passwordHash: '', twoFactorSecret: null, stripeCustomerId: null,
    });
    expect(dane.anonymizedAt).toBeInstanceOf(Date);
    expect(s.tx.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' } }));
    expect(s.tx.paymentMethod.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(s.tx.invoice.deleteMany).not.toHaveBeenCalled();
    expect(s.tx.clientWebhookEndpoint.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(s.tx.apiToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }));
    // F2.4 — notatki obsługi o osobie (lista i stare pole) znikają razem z danymi.
    expect(s.tx.customerNote.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    // F3.7 — wpisy poczty przychodzącej konta (adres nadawcy, temat).
    expect(s.tx.pocztaPrzychodzaca.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(dane.adminInternalNote).toBeNull();
    // Przegląd D11 — log kontaktów i checklista obsługi migracji (notatki o osobie) też znikają.
    expect(s.tx.migracjaKontakt.deleteMany).toHaveBeenCalledWith({ where: { migrationRequest: { userId: 'u1' } } });
    expect(s.tx.migrationRequest.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { checklista: {} } });
    // Audyt Fal 2 — nagłówki kolejki poczty kont klienta (zadania MAIL_QUEUE) znikają razem z danymi.
    expect(s.tx.account.findMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, select: { id: true } });
    // Audyt Fali 3 — także dziennik poczty, blokady IP i trafienia WAF kont klienta; IP i adresy z parametrów.
    expect(s.tx.nodeTask.updateMany).toHaveBeenCalledWith({
      where: { kind: { in: ['MAIL_QUEUE', 'MAIL_LOG', 'IP_BLOCKS', 'WAF_HITS'] }, accountId: { in: ['a1', 'a2'] }, outputLog: { not: null } },
      data: { outputLog: null },
    });
    const sql = (s.tx.$executeRaw.mock.calls as unknown as [TemplateStringsArray, ...unknown[]][]).map(([t, ...v]) => ({ t: t.join('?'), v }));
    expect(sql.find((q) => q.t.includes('UPDATE "NodeTask"'))?.v).toEqual([
      ['ip', 'address', 'szukaj', 'filter'], ['a1', 'a2'], ['MAIL_QUEUE', 'MAIL_LOG', 'IP_BLOCKS', 'WAF_HITS'], ['ip', 'address', 'szukaj', 'filter'],
    ]);
  });

  it('audyt Fali 3 — kopie powodów w dzienniku (akcje konta i domeny, scalenie, kordon, zawieszenie) i zdarzeniach znikają', async () => {
    const s = stanowisko();
    await s.svc.executeAnonymization('u1');
    const sql = (s.tx.$executeRaw.mock.calls as unknown as [TemplateStringsArray, ...unknown[]][]).map(([t, ...v]) => ({ t: t.join('?'), v }));
    const dziennik = sql.filter((q) => q.t.includes('UPDATE "AuditLog" SET "details" = jsonb_set') && q.t.includes('= ANY('));
    expect(dziennik.map((q) => [q.v[0], q.v[3]])).toEqual([
      ['powod', expect.arrayContaining(['OPERATOR_ACCOUNT_CHANGED', 'OPERATOR_DOMAIN_CHANGED', 'SUBSCRIPTION_CANCELED', 'SUBSCRIPTION_CUSTOM_TERMS'])],
      ['reason', expect.arrayContaining(['TICKET_MERGED', 'OUTBOUND_CORDON_APPLIED', 'TICKET_ESCALATED', 'TICKET_ESCALATION_UNDONE', 'CUSTOMER_RISK_FLAG_UPDATED'])],
      ['note', ['SUBSCRIPTION_SUSPENDED', 'SUBSCRIPTION_UNSUSPENDED']],
    ]);
    // Przegląd poprawek Fali 3 — oryginały powodów eskalacji i flagi ryzyka w zgłoszeniach klienta.
    expect(s.tx.ticket.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', escalationReason: { not: null } }, data: { escalationReason: '[zanonimizowano]' } });
    expect(s.tx.ticket.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', riskReason: { not: null } }, data: { riskReason: '[zanonimizowano]' } });
    expect(dziennik.every((q) => q.v[1] === '[zanonimizowano]' && q.v[2] === 'u1')).toBe(true);
    expect(sql.some((q) => q.t.includes('UPDATE "TicketEvent"') && q.v.includes('u1'))).toBe(true);
    expect(sql.some((q) => q.t.includes('UPDATE "SubscriptionEvent"') && q.v.includes('u1'))).toBe(true);
  });

  it('audyt Fali 3 — pliki poczty przychodzącej konta usunięte z magazynu po zapisie (bez sierot)', async () => {
    const s = stanowisko();
    await s.svc.executeAnonymization('u1');
    expect(s.tx.pocztaPrzychodzaca.findMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, select: { zalaczniki: true } });
    expect(s.magazyn.removeObject).toHaveBeenCalledTimes(1);
    expect(s.magazyn.removeObject).toHaveBeenCalledWith('TICKET_ATTACHMENTS', 'poczta/p1/zrzut.jpg');
    expect(s.kolejnosc.indexOf('commit')).toBeLessThan(s.kolejnosc.indexOf('magazyn:poczta/p1/zrzut.jpg'));
  });

  it('audyt Fal 2 — notatki w wątkach, tagi zgłoszeń, powód blokady wysyłki i treści wniosków o operację znikają', async () => {
    const s = stanowisko();
    await s.svc.executeAnonymization('u1');
    expect(s.tx.ticketReply.deleteMany).toHaveBeenCalledWith({ where: { internal: true, ticket: { userId: 'u1' } } });
    expect(s.tx.ticket.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { tags: [] } });
    expect(s.tx.account.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', mailBlockedReason: { not: null } }, data: { mailBlockedReason: null } });
    expect(s.tx.operatorRequest.updateMany).toHaveBeenCalledWith({ where: { customerId: 'u1' }, data: { justification: '[zanonimizowano]' } });
    // Bieżący adres, adres z wniosku o zmianę e-maila i adres sprzed zmiany przez obsługę — w parametrach, wynikach,
    // dzienniku wniosków i dzwonkach zespołu.
    const wzorce = (s.tx.$executeRaw.mock.calls as unknown as unknown[][]).flatMap((c) => c.slice(1)).filter((v) => typeof v === 'string' && v.includes('@'));
    expect(new Set(wzorce)).toEqual(new Set([wzorzecAdresu('jan@firma.pl'), wzorzecAdresu('nowy@firma.pl'), wzorzecAdresu('stary@firma.pl')]));
    expect(s.tx.auditLog.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', action: { in: ['CUSTOMER_EMAIL_CHANGED', 'EMAIL_CHANGE_CONFIRMED'] } },
      select: { details: true },
    });
  });

  it('subkonta: wyłączone, zanonimizowane i wylogowane razem z właścicielem', async () => {
    const s = stanowisko({ subkonta: ['sk1', 'sk2'] });
    await s.svc.executeAnonymization('u1');
    expect(s.tx.user.findMany).toHaveBeenCalledWith({ where: { customerOwnerId: 'u1' }, select: { id: true } });
    for (const id of ['sk1', 'sk2']) {
      const d = (s.tx.user.update.mock.calls as unknown as [{ where: { id: string }; data: Record<string, unknown> }][])
        .find(([a]) => a.where.id === id)![0].data;
      expect(d).toMatchObject({ email: `deleted-${id}@verris.local`, passwordHash: '', tokenVersion: { increment: 1 } });
      expect(d.subaccountDisabledAt).toBeInstanceOf(Date);
    }
  });

  it('dziennik: bez jawnego e-maila, tylko skrót; zawieszenie na serwerze dopiero po zapisie w bazie', async () => {
    const s = stanowisko();
    await s.svc.executeAnonymization('u1');
    const wpis = (s.audit.record.mock.calls as unknown as [{ details: Record<string, unknown> }][])[0][0];
    expect(JSON.stringify(wpis)).not.toMatch(/jan@firma\.pl/i);
    expect(wpis.details.previousEmailSha256).toBe(createHash('sha256').update('jan@firma.pl').digest('hex'));
    expect(s.kolejnosc.indexOf('commit')).toBeLessThan(s.kolejnosc.indexOf('da-suspend'));
  });

  it('drugi raz nic nie robi (idempotencja)', async () => {
    const s = stanowisko({ juzZanonimizowany: true });
    await s.svc.executeAnonymization('u1');
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
    expect(s.audit.record).not.toHaveBeenCalled();
  });
});

describe('JwtStrategy — subkonto zanonimizowanego lub zablokowanego właściciela', () => {
  const strategia = (owner: { anonymizedAt: Date | null; loginBlocked: boolean }) =>
    new JwtStrategy({ get: () => 'sekret-testowy' } as never, {
      user: {
        findUnique: vi.fn(async () => ({
          id: 'sk1', email: 'sk@firma.pl', role: 'USER', loginBlocked: false, anonymizedAt: null, tokenVersion: 0,
          customerOwnerId: 'u1', customerPermissions: [], subaccountDisabledAt: null, customerOwner: owner,
        })),
      },
    } as never);

  it('właściciel aktywny → subkonto działa w jego kontekście', async () => {
    await expect(strategia({ anonymizedAt: null, loginBlocked: false }).validate({ sub: 'sk1', email: '', role: 'USER' })).resolves.toMatchObject({
      userId: 'u1', principalUserId: 'sk1',
    });
  });
  it.each([
    ['zanonimizowany', { anonymizedAt: new Date(), loginBlocked: false }],
    ['zablokowany', { anonymizedAt: null, loginBlocked: true }],
  ])('właściciel %s → 401', async (_n, owner) => {
    await expect(strategia(owner).validate({ sub: 'sk1', email: '', role: 'USER' })).rejects.toThrow('Owner account is not available');
  });
});
