import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service.js';
import { DomenyOperatoraService, type ZlecenieDomeny } from './domeny-operatora.service.js';

/**
 * F2.7 (D2/D3/D8) — operacje obsługi na domenie klienta: powód, zgłoszenie klienta, domeny zespołu tylko ADMIN,
 * wpis zespołu z wynikiem, wpis klienta z operatorem i numerem zgłoszenia, kod EPP poza dziennikiem.
 */
const KLIENT = 'klient-1';
const OPERATOR = 'op-1';
const ZGLOSZENIE = 'ab12cd34-0000-4000-8000-000000000001';

function uklad(opcje: { rolaKlienta?: string; zgloszenia?: { id: string }[] } = {}) {
  const wpisy: { action: string; userId: string | null; actorUserId: string | null; details: Record<string, unknown> }[] = [];
  const prisma = {
    domain: {
      findUnique: vi.fn(async () => ({ id: 'd1', name: 'klient.pl', userId: KLIENT, user: { role: opcje.rolaKlienta ?? 'USER' } })),
    },
    domainRegistrarOrder: {
      findUnique: vi.fn(async () => ({ domainName: 'klient.pl', domainId: null, userId: KLIENT, user: { role: opcje.rolaKlienta ?? 'USER' } })),
    },
    ticket: { findMany: vi.fn(async () => opcje.zgloszenia ?? [{ id: ZGLOSZENIE }]) },
    auditLog: { create: vi.fn(async ({ data }: { data: (typeof wpisy)[number] }) => void wpisy.push(data)) },
  };
  const audit = new AuditService(prisma as never);
  // Atrapa rejestratora robi to, co prawdziwy: wpis o domenie klienta z operatorem jako autorem.
  const registrar = {
    authCode: vi.fn(async (userId: string, actorUserId: string) => {
      await audit.record({ action: 'DOMAIN_AUTHCODE_REVEALED', userId, actorUserId, details: { domain: 'klient.pl' } });
      return { authCode: 'TAJNY-EPP-123', transferLock: false };
    }),
    setTransferLock: vi.fn(async () => {
      throw new Error('OpenProvider: domain is in transfer');
    }),
    renew: vi.fn(async () => ({ id: 'z1', priceAmount: '59.00', walletTxId: null, status: 'COMPLETED' })),
    ponowZamowienie: vi.fn(async () => ({ id: 'z2', status: 'COMPLETED' })),
  };
  return { svc: new DomenyOperatoraService(prisma as never, registrar as never, audit), registrar, wpisy, prisma };
}

const z = (o: Partial<ZlecenieDomeny> = {}): ZlecenieDomeny => ({
  operatorUserId: OPERATOR,
  operatorRole: 'STAFF',
  powod: 'Klient prosi o kod — przenosi domenę',
  zgloszenie: '#ab12cd34',
  ...o,
});

describe('F2.7 — operacje obsługi na domenie klienta', () => {
  it('kod EPP: wraca do operatora, a w dzienniku jest tylko fakt pokazania (z powodem i zgłoszeniem)', async () => {
    const { svc, wpisy } = uklad();
    const r = await svc.kodEpp('d1', z());
    expect(r.authCode).toBe('TAJNY-EPP-123');
    expect(JSON.stringify(wpisy)).not.toContain('TAJNY-EPP-123');
    const zespol = wpisy.find((w) => w.action === 'OPERATOR_DOMAIN_CHANGED')!;
    expect(zespol).toMatchObject({ userId: KLIENT, actorUserId: OPERATOR });
    expect(zespol.details).toMatchObject({ akcja: 'kod-epp', domain: 'klient.pl', powod: 'Klient prosi o kod — przenosi domenę', zgloszenieId: ZGLOSZENIE, wynik: 'ok' });
    // D3 — wpis klienta: autor = operator (klient widzi „obsługa Verris”), numer zgłoszenia dopisany z kontekstu.
    const klienta = wpisy.find((w) => w.action === 'DOMAIN_AUTHCODE_REVEALED')!;
    expect(klienta).toMatchObject({ userId: KLIENT, actorUserId: OPERATOR });
    expect(klienta.details).toMatchObject({ zgloszenieId: ZGLOSZENIE });
    expect(klienta.details).not.toHaveProperty('powod');
  });

  it('bez powodu (min. 10 znaków) — odmowa bez wywołania rejestratora i bez wpisu', async () => {
    const { svc, registrar, wpisy } = uklad();
    await expect(svc.kodEpp('d1', z({ powod: 'bo tak' }))).rejects.toBeInstanceOf(BadRequestException);
    expect(registrar.authCode).not.toHaveBeenCalled();
    expect(wpisy).toEqual([]);
  });

  it('zgłoszenie spoza konta klienta — odmowa', async () => {
    const { svc, registrar } = uklad({ zgloszenia: [] });
    await expect(svc.kodEpp('d1', z())).rejects.toThrow('Nie ma takiego zgłoszenia u tego klienta.');
    expect(registrar.authCode).not.toHaveBeenCalled();
  });

  it('domena konta zespołu: STAFF — 403, ADMIN — wolno', async () => {
    const { svc, registrar } = uklad({ rolaKlienta: 'ADMIN' });
    await expect(svc.kodEpp('d1', z())).rejects.toBeInstanceOf(ForbiddenException);
    expect(registrar.authCode).not.toHaveBeenCalled();
    await expect(svc.kodEpp('d1', z({ operatorRole: 'ADMIN' }))).resolves.toMatchObject({ authCode: 'TAJNY-EPP-123' });
  });

  it('błąd rejestratora = błąd dla operatora i wpis „blad” z treścią w dzienniku zespołu', async () => {
    const { svc, wpisy } = uklad();
    await expect(svc.blokada('d1', z(), true)).rejects.toThrow('domain is in transfer');
    const zespol = wpisy.find((w) => w.action === 'OPERATOR_DOMAIN_CHANGED')!;
    expect(zespol.details).toMatchObject({ akcja: 'blokada', wynik: 'blad', blad: 'OpenProvider: domain is in transfer' });
  });

  it('D8 — odnowienie: płatnik idzie do rejestratora (portfel / koszt Verris) i do dziennika zespołu', async () => {
    const { svc, registrar, wpisy } = uklad();
    await svc.odnow('d1', z({ powod: 'Auto-odnowienie padło, domena wygasa jutro' }), 2, true);
    expect(registrar.renew).toHaveBeenCalledWith(KLIENT, OPERATOR, 'd1', 2, { naKosztVerris: true });
    expect(wpisy.find((w) => w.action === 'OPERATOR_DOMAIN_CHANGED')!.details).toMatchObject({
      akcja: 'odnowienie-koszt-verris',
      platnik: 'verris',
      lata: 2,
      zamowienieId: 'z1',
      kwota: '59.00',
    });
    await svc.odnow('d1', z(), 1, false);
    expect(registrar.renew).toHaveBeenLastCalledWith(KLIENT, OPERATOR, 'd1', 1, { naKosztVerris: false });
  });

  it('ponowienie zamówienia: klient = właściciel zamówienia, nowy kod EPP nie trafia do dziennika', async () => {
    const { svc, registrar, wpisy } = uklad();
    await svc.ponow('o1', z(), 'NOWY-KOD-EPP');
    expect(registrar.ponowZamowienie).toHaveBeenCalledWith('o1', OPERATOR, { authCode: 'NOWY-KOD-EPP' });
    expect(JSON.stringify(wpisy)).not.toContain('NOWY-KOD-EPP');
    expect(wpisy.find((w) => w.action === 'OPERATOR_DOMAIN_CHANGED')!.details).toMatchObject({
      akcja: 'ponowienie',
      zamowienieId: 'o1',
      nowyKodEpp: true,
      noweZamowienieId: 'z2',
    });
  });
});
