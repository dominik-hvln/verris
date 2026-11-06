import { ConflictException, NotFoundException } from '@nestjs/common';
import { CustomerPermission, Role } from '@verris/database';
import { CustomerIamService } from './customer-iam.service.js';

/**
 * P3-01 — „Wyłącz” przy subkoncie było nieodwracalne, a adres współpracownika zostawał zablokowany na zawsze
 * (ponowne zaproszenie: „użyj innego adresu”, własne konto: „Email already exists”). Teraz: wyłączenie da się
 * cofnąć, usunięcie zwalnia adres, a ponowne zaproszenie własnego subkonta mówi, co zrobić.
 * P3-09 — osoba, której odebrano dostęp, dostaje maila.
 */
const WLASCICIEL = { id: 'owner_1', role: Role.USER, customerOwnerId: null, email: 'kasia@firma.pl', firstName: 'Kasia', lastName: 'Pawlak', companyName: null };
const PIOTR = { id: 'sub_1', email: 'piotr@firma.pl', firstName: 'Piotr', lastName: 'Nowak', subaccountDisabledAt: null as Date | null };

function przygotuj(member: typeof PIOTR | null = PIOTR) {
  const prisma = {
    user: {
      findUnique: vi.fn(async (a: { where: { id?: string; email?: string } }) => {
        if (a.where.id === 'owner_1') return WLASCICIEL;
        if (a.where.email === PIOTR.email || a.where.id === PIOTR.id) {
          return member ? { id: PIOTR.id, role: Role.USER, customerOwnerId: 'owner_1', anonymizedAt: null, subaccountDisabledAt: member.subaccountDisabledAt } : null;
        }
        return null;
      }),
      findFirst: vi.fn(async () => member),
      update: vi.fn(async () => ({})),
    },
    webAuthnCredential: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    customerMembership: { findFirst: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    customerSubaccountInvite: { create: vi.fn() },
    subscription: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
  };
  const audit = { record: vi.fn() };
  const mailer = { send: vi.fn(async () => undefined) };
  const config = { get: vi.fn(() => 'https://panel.verris.pl') };
  const consents = { recordRegistrationConsents: vi.fn(async () => ({ termsVersion: '1.1.0', privacyVersion: '1.1.0' })) };
  const svc = new CustomerIamService(prisma as never, audit as never, mailer as never, config as never, consents as never);
  return { prisma, audit, mailer, svc };
}

describe('P3-01 – subkonto: wyłączenie odwracalne, usunięcie zwalnia adres', () => {
  it('włącz ponownie: zdejmuje subaccountDisabledAt i zapisuje w dzienniku, kogo dotyczy', async () => {
    const { prisma, audit, svc } = przygotuj({ ...PIOTR, subaccountDisabledAt: new Date() });
    await svc.enableMember('owner_1', 'owner_1', 'sub_1');
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'sub_1' }, data: { subaccountDisabledAt: null } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'CUSTOMER_IAM_MEMBER_ENABLED', details: expect.objectContaining({ nazwa: 'Piotr Nowak' }) }));
  });

  it('usuń: adres i dane logowania znikają (adres wolny), sesje kończy tokenVersion, passkeye usunięte', async () => {
    const { prisma, audit, svc } = przygotuj();
    await svc.removeMember('owner_1', 'owner_1', 'sub_1');
    const dane = (prisma.user.update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(dane).toMatchObject({
      email: 'deleted-sub_1@verris.local',
      firstName: null,
      lastName: null,
      passwordHash: '',
      customerPermissions: [],
      tokenVersion: { increment: 1 },
    });
    expect(dane.anonymizedAt).toBeInstanceOf(Date);
    expect(dane.subaccountDisabledAt).toBeInstanceOf(Date);
    expect(prisma.webAuthnCredential.deleteMany).toHaveBeenCalledWith({ where: { userId: 'sub_1' } });
    // Dziennik zachowuje, kogo usunięto (adres z chwili usunięcia).
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'CUSTOMER_IAM_MEMBER_REMOVED', details: expect.objectContaining({ email: 'piotr@firma.pl' }) }));
  });

  it('usunięte subkonto nie jest już subkontem do edycji ani włączenia (szukamy tylko anonymizedAt: null)', async () => {
    const { prisma, svc } = przygotuj(null);
    await expect(svc.enableMember('owner_1', 'owner_1', 'sub_1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sub_1', customerOwnerId: 'owner_1', anonymizedAt: null } }));
  });

  it('ponowne zaproszenie WŁASNEGO wyłączonego subkonta: komunikat „włącz albo usuń”, nie „użyj innego adresu”', async () => {
    const { svc } = przygotuj({ ...PIOTR, subaccountDisabledAt: new Date() });
    const zaproszenie = svc.invite('owner_1', 'owner_1', { email: 'Piotr@firma.pl', permissions: [CustomerPermission.TICKETS_READ] });
    await expect(zaproszenie).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.invite('owner_1', 'owner_1', { email: 'piotr@firma.pl', permissions: [CustomerPermission.TICKETS_READ] })).rejects.toThrow(/Włącz je ponownie albo usuń subkonto/);
  });

  it('ponowne zaproszenie aktywnego własnego subkonta: „ma już subkonto”', async () => {
    const { svc } = przygotuj();
    await expect(svc.invite('owner_1', 'owner_1', { email: 'piotr@firma.pl', permissions: [CustomerPermission.TICKETS_READ] })).rejects.toThrow(/ma już subkonto/);
  });
});

describe('P3-09 – mail po odebraniu dostępu', () => {
  it('wyłączenie aktywnego subkonta wysyła mail do współpracownika z nazwą właściciela', async () => {
    const { mailer, svc } = przygotuj();
    await svc.disableMember('owner_1', 'owner_1', 'sub_1');
    expect(mailer.send).toHaveBeenCalledTimes(1);
    const mail = (mailer.send.mock.calls[0] as unknown as [{ to: string; subject: string; text: string }])[0];
    expect(mail.to).toBe('piotr@firma.pl');
    expect(mail.subject).toBe('Dostęp do konta Verris odebrany');
    expect(mail.text).toContain('Kasia Pawlak');
  });

  it('błąd wysyłki maila nie cofa wyłączenia', async () => {
    const { mailer, prisma, svc } = przygotuj();
    mailer.send.mockRejectedValueOnce(new Error('smtp'));
    await expect(svc.disableMember('owner_1', 'owner_1', 'sub_1')).resolves.toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('usunięcie już wyłączonego subkonta nie wysyła drugiego maila', async () => {
    const { mailer, svc } = przygotuj({ ...PIOTR, subaccountDisabledAt: new Date() });
    await svc.removeMember('owner_1', 'owner_1', 'sub_1');
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

describe('P3-10 – mail z zaproszeniem współpracownika', () => {
  it('kto zaprasza (nazwa + adres), lista uprawnień prostym językiem, jeden termin ważności', async () => {
    const { iamSubaccountInviteTemplate } = await import('../mail/templates/iam-invite-notification.js');
    const m = iamSubaccountInviteTemplate({
      to: 'piotr@firma.pl', ownerEmail: 'kasia@firma.pl', ownerName: 'Kasia Pawlak', inviteUrl: 'https://panel.verris.pl/accept-invite?token=x',
      expiresDays: 7, label: null, panelUrl: 'https://panel.verris.pl', permissions: ['SERVICES_MANAGE', 'DNS_MANAGE', 'NIEZNANE'],
    });
    expect(m.text).toContain('Kasia Pawlak');
    expect(m.text).toContain('kasia@firma.pl');
    expect(m.text).toContain('rekordy DNS');
    expect(m.text).toContain('zarządzanie usługami (bez rezygnacji z usługi)');
    expect(m.text).not.toContain('NIEZNANE');
    expect(m.html).not.toMatch(/kilka dni/);
    expect(m.text).toMatch(/7 dni/);
  });
});
