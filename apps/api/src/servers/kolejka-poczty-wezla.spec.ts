import { NodeTaskStatus } from '@verris/database';
import { KolejkaPocztyWezlaService } from './kolejka-poczty-wezla.admin.controller.js';
import { PocztaKontaOperatoraService } from '../subscriptions/poczta-konta-operatora.service.js';

/** F3.1 — zlecenia zadania MAIL_QUEUE: kolejka węzła (NOC) i usuwanie wiadomości konta tylko z świeżego podglądu. */
function wezel(o: { status?: string; zadania?: unknown[] } = {}) {
  const utworzone: Array<{ data: Record<string, unknown> }> = [];
  const prisma = {
    server: { findUnique: vi.fn(async () => ({ id: 'w1', status: o.status ?? 'ACTIVE' })) },
    nodeTask: {
      findMany: vi.fn(async () => o.zadania ?? []),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => (utworzone.push(a), a.data)),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { svc: new KolejkaPocztyWezlaService(prisma as never, audit as never), utworzone, audit };
}

describe('F3.1 — kolejka poczty węzła', () => {
  it('odczyt: zadanie MAIL_QUEUE bez konta, tryb list z frazą; wpis w dzienniku', async () => {
    const { svc, utworzone, audit } = wezel();
    await svc.wczytaj('w1', 'noc1', 'gmail.com');
    expect(utworzone[0]!.data).toMatchObject({ serverId: 'w1', kind: 'MAIL_QUEUE', requestedById: 'noc1', payload: { mode: 'list', szukaj: 'gmail.com' } });
    expect(utworzone[0]!.data.accountId).toBeUndefined();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'NODE_MAIL_QUEUE_VIEWED', actorUserId: 'noc1' }));
  });

  it('wypchnięcie: exim -qff przez zadanie flush, tylko z powodem; węzeł nieaktywny i trwająca operacja → odmowa', async () => {
    const ok = wezel();
    await expect(ok.svc.wypchnij('w1', 'noc1', 'krótki')).rejects.toMatchObject({ status: 400 });
    await ok.svc.wypchnij('w1', 'noc1', 'Po zdjęciu z RBL — wysyłamy zaległe');
    expect(ok.utworzone[0]!.data.payload).toEqual({ mode: 'flush' });
    expect(ok.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'NODE_MAIL_QUEUE_FLUSHED' }));
    await expect(wezel({ status: 'OFFLINE' }).svc.wczytaj('w1', 'noc1')).rejects.toMatchObject({ status: 400 });
    const trwa = wezel({ zadania: [{ id: 't', status: NodeTaskStatus.RUNNING, payload: { mode: 'list' }, outputLog: null, errorMessage: null, createdAt: new Date(), completedAt: null }] });
    await expect(trwa.svc.wypchnij('w1', 'noc1', 'Po zdjęciu z RBL — wysyłamy zaległe')).rejects.toMatchObject({ status: 409 });
    expect(trwa.utworzone).toEqual([]);
  });

  it('fraza ze znakami sterującymi → 400 bez zadania', async () => {
    const { svc, utworzone } = wezel();
    await expect(svc.wczytaj('w1', 'noc1', 'a\nMQ_MODE=flush')).rejects.toMatchObject({ status: 400 });
    expect(utworzone).toEqual([]);
  });
});

describe('F3.1 — usunięcie wiadomości konta: tylko z podglądu sprzed najwyżej godziny', () => {
  const ID = '1tAbCd-000000001bo-D342';
  const z = { subscriptionId: 's1', operatorUserId: 'op', operatorRole: 'STAFF', powod: 'Spam z formularza kontaktowego' };
  function konto(minutTemu: number) {
    const podglad = {
      id: 'p', status: NodeTaskStatus.COMPLETED, payload: { mode: 'list', domains: 'klient.pl' }, errorMessage: null,
      outputLog: `VERRIS_MQ ${ID}|3m|1K|0|a@klient.pl|b@gmail.com|Spam`,
      createdAt: new Date(Date.now() - minutTemu * 60_000), completedAt: new Date(Date.now() - minutTemu * 60_000),
    };
    const create = vi.fn(async (a: { data: unknown }) => ({ id: 't2', ...(a.data as object) }));
    const prisma = { nodeTask: { findMany: vi.fn(async () => [podglad]), create } };
    const akcje = { wykonaj: vi.fn(async (_z: unknown, _a: unknown, _c: unknown, op: (w: unknown) => Promise<unknown>) => op({ konto: { id: 'acc1', serverId: 'w1', daUsername: 'klient1' } })) };
    return { svc: new PocztaKontaOperatoraService(prisma as never, {} as never, akcje as never, {} as never, {} as never), create, akcje };
  }

  it('świeży podgląd → zadanie remove z identyfikatorami i domenami z podglądu', async () => {
    const { svc, create } = konto(5);
    expect(await svc.usunZKolejki(z, [ID, ID])).toMatchObject({ zlecono: 1 });
    expect(create.mock.calls[0]![0].data).toMatchObject({ kind: 'MAIL_QUEUE', accountId: 'acc1', payload: { mode: 'remove', daUser: 'klient1', domains: 'klient.pl', ids: ID } });
  });

  it('podgląd starszy niż godzina albo id spoza podglądu → 400 bez zadania; zły format id → 400 przed dziennikiem', async () => {
    const stary = konto(61);
    await expect(stary.svc.usunZKolejki(z, [ID])).rejects.toMatchObject({ status: 400 });
    expect(stary.create).not.toHaveBeenCalled();
    const obcy = konto(5);
    await expect(obcy.svc.usunZKolejki(z, ['1aBcDe-0003hL-9u'])).rejects.toMatchObject({ status: 400 });
    expect(obcy.create).not.toHaveBeenCalled();
    const zly = konto(5);
    await expect(zly.svc.usunZKolejki(z, [`${ID};rm`])).rejects.toMatchObject({ status: 400 });
    await expect(zly.svc.usunZKolejki(z, [])).rejects.toMatchObject({ status: 400 });
    expect(zly.akcje.wykonaj).not.toHaveBeenCalled();
  });
});
