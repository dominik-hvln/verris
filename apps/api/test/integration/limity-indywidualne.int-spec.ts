import { SubscriptionStatus } from '@verris/database';
import type { DaUserLimits } from '@verris/directadmin-sdk';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { LimityIndywidualneService } from '../../src/subscriptions/limity-indywidualne.service.js';
import { SshAccessService } from '../../src/subscriptions/ssh-access.service.js';
import { PlanChangeService } from '../../src/subscriptions/plan-change.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { dodajProbke, ksiegaWezla, prawdaOWezle, prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * K3 (PB-53.5) — limity indywidualne usługi na prawdziwej bazie: zapis nadpisań, quota konta (baza + nadwyżka
 * autoskalowania), księga dysku węzła zgodna z kontami, oś „Co się działo” klienta i dziennik zespołu z powodem;
 * przywrócenie limitów planu; błąd węzła = nic nie zmienione; błąd bazy po zmianie na węźle = węzeł przywrócony.
 * Zmiana planu przy limitach indywidualnych zablokowana. Węzeł (DirectAdmin) zastąpiony atrapą.
 */
const POWOD = 'Umowa z klientem z 12.10 — większa poczta';
const wywolania: Array<{ user: string; limity: DaUserLimits }> = [];
const pakiety: Array<{ user: string; pakiet: string }> = [];
let wezelPada: Error | null = null;
let sshNaKoncie = 'OFF';
const da = {
  getClientForServer: async () => ({
    customizeUserLimits: async (user: string, limity: DaUserLimits) => {
      if (wezelPada) throw wezelPada;
      wywolania.push({ user, limity });
    },
    assignUserPackage: async (user: string, pakiet: string) => {
      if (wezelPada) throw wezelPada;
      pakiety.push({ user, pakiet });
    },
    getAccountInfo: async () => ({ ssh: sshNaKoncie, php: 'ON' }),
  }),
};
const svc = (p = prisma() as never) =>
  new LimityIndywidualneService(p, new AuditService(prisma() as never), da as never, new SshAccessService(prisma() as never, new AuditService(prisma() as never)));
const aktywnosc = (userId: string) => new UsersService(prisma() as never, {} as never, {} as never, {} as never, {} as never, {} as never).listMyActivity(userId);

async function usluga(scaledDiskMb = 1024) {
  const wezel = await utworzWezel();
  const plan = await utworzPlan(); // 50 GB, slug spoza polityki → pakiet domyślny (25 skrzynek, 5 baz, 1 domena)
  const k = await utworzKonto({ serverId: wezel.id, planId: plan.id, scaledDiskMb });
  await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: SubscriptionStatus.ACTIVE } });
  const admin = await prisma().user.create({ data: { email: `admin-k3-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
  return { wezel, plan, admin, ...k };
}
const zlecenie = (u: Awaited<ReturnType<typeof usluga>>, limity: unknown, role = 'ADMIN') => ({
  subscriptionId: u.subscription.id,
  operator: { userId: u.admin.id, role },
  powod: POWOD,
  limity,
});

describe('K3 — limity indywidualne usługi', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    wywolania.length = 0;
    pakiety.length = 0;
    wezelPada = null;
    sshNaKoncie = 'OFF';
  });
  afterAll(rozlacz);

  it('zapis: węzeł dostaje pełny zestaw limitów, baza — nadpisania, quota konta, księga dysku, zdarzenie i dziennik', async () => {
    const u = await usluga();
    const r = await svc().ustaw(zlecenie(u, { diskLimitMb: 102400, emailAccounts: 100, databases: '' }));
    expect(r.bezZmian).toBe(false);

    expect(wywolania).toEqual([
      {
        user: u.account.daUsername,
        limity: expect.objectContaining({ diskQuotaMb: 102400 + 1024, emailAccounts: 100, databases: 5, domains: 1 }),
      },
    ]);
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: u.subscription.id }, include: { account: true, events: true } });
    expect(s.limitOverrides).toEqual({ diskLimitMb: 102400, emailAccounts: 100 });
    expect(s.account?.diskLimitMb).toBe(102400 + 1024);
    expect(await ksiegaWezla(u.wezel.id)).toEqual(await prawdaOWezle(u.wezel.id));
    expect(s.events.map((e) => [e.type, e.details])).toEqual([['LIMITS_CUSTOMIZED', { source: 'OPERATOR', limity: { diskLimitMb: 102400, emailAccounts: 100 } }]]);

    // Klient: „obsługa Verris”, bez powodu; zespół: powód i kto.
    const klient = (await aktywnosc(u.user.id)).events.find((e) => e.action === 'SUBSCRIPTION_LIMITS_CUSTOMIZED');
    expect(klient).toMatchObject({ actor: 'obsługa Verris' });
    expect(JSON.stringify(klient)).not.toContain(POWOD);
    const zespol = await prisma().auditLog.findFirstOrThrow({ where: { action: 'OPERATOR_ACCOUNT_CHANGED', userId: u.user.id } });
    expect(zespol.actorUserId).toBe(u.admin.id);
    expect(zespol.details).toMatchObject({ akcja: 'limity-indywidualne', powod: POWOD, wynik: 'ok', po: { diskLimitMb: 102400, emailAccounts: 100 } });

    // Drugi raz to samo — bez wywołania węzła i bez wpisów.
    expect(await svc().ustaw(zlecenie(u, { diskLimitMb: 102400, emailAccounts: 100 }))).toMatchObject({ bezZmian: true });
    expect(wywolania).toHaveLength(1);
  });

  it('przywrócenie limitów planu: węzeł dostaje plan, nadpisania NULL, quota i księga wracają', async () => {
    const u = await usluga();
    const ksiegaPrzed = await ksiegaWezla(u.wezel.id);
    await svc().ustaw(zlecenie(u, { diskLimitMb: 102400, domains: 3 }));
    const r = await svc().ustaw(zlecenie(u, {}));
    expect(r).toMatchObject({ bezZmian: false, komunikat: 'Przywrócono limity planu.' });

    expect(wywolania[1]).toEqual({ user: u.account.daUsername, limity: expect.objectContaining({ diskQuotaMb: 51200 + 1024, domains: 1 }) });
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: u.subscription.id }, include: { account: true, events: { orderBy: { createdAt: 'asc' } } } });
    expect(s.limitOverrides).toBeNull();
    expect(s.account?.diskLimitMb).toBe(51200 + 1024);
    expect(await ksiegaWezla(u.wezel.id)).toEqual(ksiegaPrzed);
    expect(s.events.map((e) => e.type)).toEqual(['LIMITS_CUSTOMIZED', 'LIMITS_RESET']);
    expect((await aktywnosc(u.user.id)).events.some((e) => e.action === 'SUBSCRIPTION_LIMITS_RESET')).toBe(true);
  });

  // t1 12.10: przywrócenie przez „customize” wartościami planu zostawiało w DA package=custom (original_package=…),
  // więc konto nie dostawało już zmian pakietu planu. Bez nadwyżki autoskalowania wraca pakiet planu.
  it('przywrócenie bez nadwyżki autoskalowania: węzeł dostaje z powrotem pakiet planu (nie „customize”)', async () => {
    const u = await usluga(0);
    await svc().ustaw(zlecenie(u, { emailAccounts: 25 + 1 }));
    expect(wywolania).toHaveLength(1);
    await svc().ustaw(zlecenie(u, {}));
    expect(wywolania).toHaveLength(1);
    expect(pakiety).toEqual([{ user: u.account.daUsername, pakiet: u.plan.slug }]);
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: u.subscription.id } });
    expect(s.limitOverrides).toBeNull();
  });

  // t1 12.10: action=package zmienił ssh=ON (włączony przez klienta) na ssh=OFF z pakietu planu.
  it('przywrócenie pakietu przy włączonym SSH: zlecone ponowne włączenie SSH (zadanie węzła), przy wyłączonym — nic', async () => {
    const u = await usluga(0);
    sshNaKoncie = 'ON';
    await svc().ustaw(zlecenie(u, { emailAccounts: 26 }));
    await svc().ustaw(zlecenie(u, {}));
    const zadania = await prisma().nodeTask.findMany({ where: { accountId: u.account.id, kind: 'SSH_ACCESS' } });
    expect(zadania).toHaveLength(1);
    expect(zadania[0]!.payload).toMatchObject({ mode: 'enable', daUser: u.account.daUsername });

    const v = await usluga(0);
    sshNaKoncie = 'OFF';
    await svc().ustaw(zlecenie(v, { emailAccounts: 26 }));
    await svc().ustaw(zlecenie(v, {}));
    expect(await prisma().nodeTask.count({ where: { accountId: v.account.id, kind: 'SSH_ACCESS' } })).toBe(0);
  });

  it('błąd węzła = błąd operacji: w bazie nic się nie zmienia (nadpisania, quota, księga, zdarzenia, dziennik)', async () => {
    const u = await usluga();
    const ksiegaPrzed = await ksiegaWezla(u.wezel.id);
    wezelPada = new Error('DirectAdmin API Error: Cannot modify user');
    await expect(svc().ustaw(zlecenie(u, { diskLimitMb: 102400 }))).rejects.toThrow('Serwer nie przyjął zmiany limitów — nic nie zmieniono');
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: u.subscription.id }, include: { account: true, events: true } });
    expect(s.limitOverrides).toBeNull();
    expect(s.account?.diskLimitMb).toBe(51200 + 1024);
    expect(s.events).toEqual([]);
    expect(await ksiegaWezla(u.wezel.id)).toEqual(ksiegaPrzed);
    expect(await prisma().auditLog.count({ where: { userId: u.user.id } })).toBe(0);
  });

  it('błąd zapisu w bazie po zmianie na węźle: węzeł dostaje z powrotem poprzednie limity, wpis w dzienniku', async () => {
    const u = await usluga();
    // Własny Proxy (nie Object.create): klient Prismy sam jest Proxy i przypisanie przez prototyp zepsułoby go innym testom.
    // Zapis na węźle idzie w tej samej transakcji (blokada usługi) — pada pierwszy zapis w bazie PO węźle.
    const padaZapis = <T extends object>(tx: T) =>
      new Proxy(tx, {
        get: (t, k) =>
          k === 'subscription'
            ? new Proxy(Reflect.get(t, k) as object, {
                get: (d, m) =>
                  m === 'update'
                    ? async () => {
                        throw new Error('deadlock detected');
                      }
                    : Reflect.get(d, m),
              })
            : Reflect.get(t, k),
      });
    const p = new Proxy(prisma(), {
      get: (cel, klucz) =>
        klucz === '$transaction'
          ? (fn: (tx: unknown) => Promise<unknown>, o: never) => cel.$transaction((tx) => fn(padaZapis(tx)), o)
          : Reflect.get(cel, klucz),
    });
    await expect(svc(p as never).ustaw(zlecenie(u, { diskLimitMb: 102400 }))).rejects.toThrow('limity na serwerze przywrócone');
    expect(wywolania.map((w) => w.limity.diskQuotaMb)).toEqual([102400 + 1024, 51200 + 1024]);
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: u.subscription.id } })).limitOverrides).toBeNull();
    const zespol = await prisma().auditLog.findFirstOrThrow({ where: { action: 'OPERATOR_ACCOUNT_CHANGED', userId: u.user.id } });
    expect(zespol.details).toMatchObject({ wynik: 'baza-blad-wezel-przywrocony', blad: 'deadlock detected', powod: POWOD });
  });

  it('reguły: tylko ADMIN, powód obowiązkowy, walidacja, dysk nie poniżej zajętego miejsca — bez wywołania węzła', async () => {
    const u = await usluga();
    await expect(svc().ustaw(zlecenie(u, { diskLimitMb: 102400 }, 'STAFF'))).rejects.toThrow('administrator');
    await expect(svc().ustaw({ ...zlecenie(u, { diskLimitMb: 102400 }), powod: 'krótki' })).rejects.toThrow('Podaj powód');
    await expect(svc().ustaw(zlecenie(u, { inodes: 100 }))).rejects.toThrow('Nieznany limit');
    await dodajProbke({ serverId: u.wezel.id, subscriptionId: u.subscription.id, accountId: u.account.id, diskMb: 30_000 });
    await expect(svc().ustaw(zlecenie(u, { diskLimitMb: 20480 }))).rejects.toThrow('Zajęte miejsce na koncie (30000 MB');
    expect(wywolania).toEqual([]);
  });

  it('zmiana planu przy limitach indywidualnych zablokowana (klient i admin), po przywróceniu — dostępna', async () => {
    const u = await usluga();
    const duzy = await utworzPlan({ priceMonthly: 90, cpuLimit: 400 });
    await prisma().subscription.update({
      where: { id: u.subscription.id },
      data: { paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 86_400_000), currentPeriodEnd: new Date(Date.now() + 29 * 86_400_000) },
    });
    const p = prisma() as never;
    const zmiana = new PlanChangeService(p, new AuditService(p), new WalletLedgerService(p), null as never, {} as never, { send: async () => ({}) } as never, { get: () => undefined } as never);
    await svc().ustaw(zlecenie(u, { emailAccounts: 100 }));
    await expect(zmiana.previewForUser(u.user.id, u.subscription.id, duzy.id)).rejects.toThrow('limity ustalone indywidualnie — zmianę planu ustalisz z obsługą');
    await expect(zmiana.previewForAdmin(u.subscription.id, duzy.id)).rejects.toThrow('najpierw „Przywróć limity planu”');
    await svc().ustaw(zlecenie(u, {}));
    await expect(zmiana.previewForAdmin(u.subscription.id, duzy.id)).resolves.toMatchObject({ direction: 'upgrade' });
  });
});
