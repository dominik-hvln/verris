import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AccountDeletionService } from '../compliance/account-deletion.service.js';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { ZakonczIUsunDto } from './dto/subscription.dto.js';
import { RetencjaAkcje, RetencjaKontService } from './retencja-kont.service.js';
import { SubscriptionsAdminController } from './subscriptions.admin.controller.js';

/**
 * Retencja 14 dni (decyzja 29.09.2026): dzień 11 — jedno przypomnienie, dzień 14 — usunięcie konta.
 * Prisma w pamięci ocenia PRAWDZIWE `where` z serwisu (in / not / lte / null / OR / relacja),
 * a usuwanie idzie przez prawdziwe AccountDeletionService.purgeAccountOnDa z atrapą węzła.
 */
const DZIEN = 24 * 60 * 60 * 1000;
const TERAZ = new Date('2026-10-20T03:00:00Z');
const dniTemu = (n: number) => new Date(TERAZ.getTime() - n * DZIEN);

type Wiersz = Record<string, unknown>;

function pasuje(row: Wiersz, where: Wiersz): boolean {
  return Object.entries(where).every(([k, w]) => {
    if (k === 'OR') return (w as Wiersz[]).some((x) => pasuje(row, x));
    const v = row[k];
    if (w === null) return v === null;
    if (w instanceof Date || typeof w !== 'object') return v === w;
    const o = w as Wiersz;
    if ('in' in o) return (o.in as unknown[]).includes(v);
    if ('not' in o) return v !== o.not;
    if ('lte' in o) return v instanceof Date && v <= (o.lte as Date);
    return pasuje(v as Wiersz, o);
  });
}

function konto(id: string, sub: { status: string; canceledAt?: Date | null; trialEndsAt?: Date | null }) {
  return {
    id,
    domain: `${id}.pl`,
    daUsername: `u${id}`,
    serverId: 'n1',
    status: 'SUSPENDED',
    userId: `user-${id}`,
    subscriptionId: `sub-${id}`,
    cpuLimit: 100,
    ramLimitMb: 1024,
    diskLimitMb: 5120,
    createdAt: new Date('2026-01-01'),
    user: { email: `${id}@klient.pl`, firstName: 'Ala', anonymizedAt: null },
    subscription: { status: sub.status, canceledAt: sub.canceledAt ?? null, trialEndsAt: sub.trialEndsAt ?? null },
  };
}

function stanowisko(konta: ReturnType<typeof konto>[], daBlad?: (username: string) => Error | null) {
  const audyt: { action: string; userId?: string | null; actorUserId?: string | null; details?: Wiersz }[] = [];
  const audit = { record: vi.fn(async (p: (typeof audyt)[number]) => void audyt.push(p)) };
  const tx = {
    account: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Wiersz }) =>
        Object.assign(konta.find((k) => k.id === where.id)!, data),
      ),
      // purgeAccountOnDa oznacza DELETED warunkowo (updateMany z status != DELETED)
      updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: Wiersz }) => {
        const k = konta.find((x) => x.id === where.id && x.status !== 'DELETED');
        if (k) Object.assign(k, data);
        return { count: k ? 1 : 0 };
      }),
    },
    server: { update: vi.fn(async () => ({})) },
  };
  const prisma = {
    account: {
      findMany: vi.fn(async ({ where }: { where: Wiersz }) => konta.filter((k) => pasuje(k, where))),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => konta.find((k) => k.id === where.id) ?? null),
    },
    subscription: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const k = konta.find((x) => x.subscriptionId === where.id);
        return k ? { id: k.subscriptionId, serviceTag: k.daUsername, account: { id: k.id, domain: k.domain, status: k.status } } : null;
      }),
    },
    auditLog: {
      findFirst: vi.fn(async ({ where }: { where: { action: string; AND: { details: { path: string[]; equals: string } }[] } }) =>
        audyt.find(
          (a) => a.action === where.action && where.AND.every((c) => a.details?.[c.details.path[0]] === c.details.equals),
        ) ?? null,
      ),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const deleteAccount = vi.fn(async (username: string) => {
    const blad = daBlad?.(username);
    if (blad) throw blad;
    return { success: true };
  });
  const da = {
    getClientForServer: vi.fn(async () => ({ deleteAccount })),
    domenyKontaPrzedUsunieciem: vi.fn(async (a: { domain: string }) => [a.domain]),
    usunDelegacjeUsunietegoKonta: vi.fn(async () => undefined),
  };
  const mailer = { send: vi.fn(async () => ({ delivered: true })) };
  const config = { get: () => undefined };
  const purge = new AccountDeletionService(prisma as never, audit as never, da as never, {} as never, config as never);
  const subs = {
    zakonczPrzezOperatora: vi.fn(async (subId: string) => {
      const k = konta.find((x) => x.subscriptionId === subId)!;
      k.subscription.status = 'CANCELED';
      k.subscription.canceledAt = TERAZ;
    }),
  };
  const svc = new RetencjaKontService(prisma as never, audit as never, mailer as never, config as never, subs as never, purge);
  return { svc, audyt, deleteAccount, mailer, subs };
}

describe('RetencjaKontService — usuwanie po 14 dniach', () => {
  it('13 dni po anulowaniu → nic', async () => {
    const k = konto('a', { status: 'CANCELED', canceledAt: dniTemu(13) });
    const s = stanowisko([k]);
    expect(await s.svc.usunPoRetencji(TERAZ)).toEqual({ usuniete: 0, bledy: 0 });
    expect(s.deleteAccount).not.toHaveBeenCalled();
    expect(k.status).toBe('SUSPENDED');
  });

  it('14 dni po anulowaniu → konto usunięte na węźle, DELETED i wpis w audycie', async () => {
    const k = konto('a', { status: 'CANCELED', canceledAt: dniTemu(14) });
    const s = stanowisko([k]);
    expect(await s.svc.usunPoRetencji(TERAZ)).toEqual({ usuniete: 1, bledy: 0 });
    expect(s.deleteAccount).toHaveBeenCalledWith('ua');
    expect(k.status).toBe('DELETED');
    expect(k.domain).toBe('a.pl~usuniete-a'); // domena wolna dla nowego zamówienia
    expect(s.audyt).toContainEqual(
      expect.objectContaining({ action: RetencjaAkcje.USUNIETE, details: expect.objectContaining({ accountId: 'a', powod: 'RETENCJA_14_DNI' }) }),
    );
  });

  it('wygasły okres próbny (bez canceledAt) liczy się od trialEndsAt', async () => {
    const k = konto('t', { status: 'EXPIRED', trialEndsAt: dniTemu(15) });
    const s = stanowisko([k]);
    await s.svc.usunPoRetencji(TERAZ);
    expect(k.status).toBe('DELETED');
  });

  it('usługa wznowiona (ACTIVE, stare canceledAt) → nic', async () => {
    const k = konto('a', { status: 'ACTIVE', canceledAt: dniTemu(30) });
    const s = stanowisko([k]);
    await s.svc.usunPoRetencji(TERAZ);
    expect(s.deleteAccount).not.toHaveBeenCalled();
    expect(k.status).toBe('SUSPENDED');
  });

  it('usługa wznowiona między zapytaniem a usunięciem → konto zostaje', async () => {
    const k = konto('a', { status: 'CANCELED', canceledAt: dniTemu(20) });
    const s = stanowisko([k]);
    k.subscription.status = 'ACTIVE';
    expect(await s.svc.usunKonto('a', { powod: 'x', actorUserId: null })).toEqual({ ok: false });
    expect(s.deleteAccount).not.toHaveBeenCalled();
  });

  it('błąd węzła → wpis BLAD w audycie, bez DELETED; następnego dnia kolejna próba; reszta kont idzie dalej', async () => {
    const a = konto('a', { status: 'CANCELED', canceledAt: dniTemu(20) });
    const b = konto('b', { status: 'CANCELED', canceledAt: dniTemu(20) });
    let wezelLezy = true;
    const s = stanowisko([a, b], (u) => (u === 'ua' && wezelLezy ? new Error('connect ECONNREFUSED 10.0.0.1:2222') : null));

    expect(await s.svc.usunPoRetencji(TERAZ)).toEqual({ usuniete: 1, bledy: 1 });
    expect(a.status).toBe('SUSPENDED');
    expect(b.status).toBe('DELETED');
    expect(s.audyt).toContainEqual(
      expect.objectContaining({ action: RetencjaAkcje.BLAD, details: expect.objectContaining({ accountId: 'a', error: expect.stringContaining('ECONNREFUSED') }) }),
    );

    wezelLezy = false;
    await s.svc.usunPoRetencji(new Date(TERAZ.getTime() + DZIEN));
    expect(a.status).toBe('DELETED');
  });
});

describe('RetencjaKontService — przypomnienie 3 dni przed usunięciem', () => {
  it('dzień 11 → jeden mail z domeną i datą; kolejne przebiegi nie wysyłają drugiego', async () => {
    const k = konto('a', { status: 'CANCELED', canceledAt: dniTemu(11) });
    const s = stanowisko([k]);
    expect(await s.svc.przypomnij(TERAZ)).toBe(1);
    expect(await s.svc.przypomnij(new Date(TERAZ.getTime() + DZIEN))).toBe(0);
    expect(await s.svc.przypomnij(new Date(TERAZ.getTime() + 2 * DZIEN))).toBe(0);
    expect(s.mailer.send).toHaveBeenCalledTimes(1);
    const mail = (s.mailer.send.mock.calls[0] as unknown as [{ to: string; subject: string; text: string }])[0];
    expect(mail.to).toBe('a@klient.pl');
    expect(mail.subject).toContain('a.pl');
    expect(mail.subject).toContain('23 października 2026');
    expect(mail.text).not.toMatch(/DirectAdmin/);
    expect(s.audyt.filter((x) => x.action === RetencjaAkcje.PRZYPOMNIENIE)).toHaveLength(1);
  });

  it('dzień 10 → jeszcze nic; wznowiona usługa → nic', async () => {
    const s = stanowisko([
      konto('a', { status: 'CANCELED', canceledAt: dniTemu(10) }),
      konto('b', { status: 'ACTIVE', canceledAt: dniTemu(11) }),
    ]);
    expect(await s.svc.przypomnij(TERAZ)).toBe(0);
    expect(s.mailer.send).not.toHaveBeenCalled();
  });

  it('nieudana wysyłka → brak znacznika, ponowienie następnego dnia', async () => {
    const s = stanowisko([konto('a', { status: 'CANCELED', canceledAt: dniTemu(11) })]);
    s.mailer.send.mockRejectedValueOnce(new Error('SMTP 451'));
    expect(await s.svc.przypomnij(TERAZ)).toBe(0);
    expect(await s.svc.przypomnij(new Date(TERAZ.getTime() + DZIEN))).toBe(1);
  });
});

describe('Admin — zakończ usługę i usuń konto od razu', () => {
  it('DTO bez powodu → 400 (ValidationPipe jak w main.ts)', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    await expect(
      pipe.transform({ potwierdzenie: 'a.pl' }, { type: 'body', metatype: ZakonczIUsunDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pusty powód → 400, nic nie jest kończone ani usuwane', async () => {
    const s = stanowisko([konto('a', { status: 'ACTIVE' })]);
    await expect(s.svc.zakonczIUsunTeraz('sub-a', { powod: '  ', potwierdzenie: 'a.pl' }, 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(s.subs.zakonczPrzezOperatora).not.toHaveBeenCalled();
    expect(s.deleteAccount).not.toHaveBeenCalled();
  });

  it('zła domena w potwierdzeniu → 400', async () => {
    const s = stanowisko([konto('a', { status: 'ACTIVE' })]);
    await expect(s.svc.zakonczIUsunTeraz('sub-a', { powod: 'prośba klienta', potwierdzenie: 'b.pl' }, 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(s.subs.zakonczPrzezOperatora).not.toHaveBeenCalled();
  });

  it('kończy usługę, usuwa konto od razu i zapisuje autora oraz powód w audycie', async () => {
    const k = konto('a', { status: 'ACTIVE' });
    const s = stanowisko([k]);
    const wynik = await s.svc.zakonczIUsunTeraz('sub-a', { powod: 'prośba klienta #12', potwierdzenie: 'A.pl' }, 'admin-1');
    expect(wynik).toEqual({ kontoUsuniete: true, blad: null });
    expect(s.subs.zakonczPrzezOperatora).toHaveBeenCalledWith('sub-a', 'admin-1', 'prośba klienta #12');
    expect(k.status).toBe('DELETED');
    expect(s.audyt).toContainEqual(
      expect.objectContaining({
        action: RetencjaAkcje.USUNIETE,
        actorUserId: 'admin-1',
        details: expect.objectContaining({ powod: 'prośba klienta #12', accountId: 'a' }),
      }),
    );
  });

  it('endpoint tylko dla ADMIN (bez nadpisania ról na metodzie)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, SubscriptionsAdminController.prototype.zakonczIUsun)).toBeUndefined();
  });
});
