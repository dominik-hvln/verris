import { AuditService } from '../../src/common/audit/audit.service.js';
import { AlarmyService } from '../../src/alarmy/alarmy.service.js';
import { NodeTasksService } from '../../src/servers/node-tasks.service.js';
import { StraznikWezlaService, type ZdarzenieStraznikaDto } from '../../src/servers/straznik-wezla.service.js';
import { prisma, rozlacz, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * 13.10 — strażnik węzła na prawdziwej bazie: raporty z węzła (to samo zdarzenie kilka razy), alarmy dla adminów
 * przy zmianie stanu (panel + e-mail + push ntfy), alarm naprawy, która utknęła, wyłącznik restartu, alarm przy
 * zadaniu węzła, które padło na błędzie systemowym (t1: WP_UPDATE „brak PHP CLI dla konta (CageFS)” o 03:20).
 */
const maile: Array<{ to: string; subject: string }> = [];
const push: Array<Record<string, unknown>> = [];

function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const mailer = { send: async (m: { to: string; subject: string }) => void maile.push(m) };
  const alarmy = new AlarmyService(p, mailer as never, audit, { get: () => undefined } as never);
  return {
    straznik: new StraznikWezlaService(p, alarmy, audit),
    zadania: new NodeTasksService(p, audit, null as never, undefined, undefined, undefined, alarmy),
  };
}

const zdarzenie = (stan: ZdarzenieStraznikaDto['stan'], o: Partial<ZdarzenieStraznikaDto> = {}): ZdarzenieStraznikaDto => ({
  id: '6f1c2b1e-0d3a-4b8e-9b1a-1c2d3e4f5a6b',
  rodzaj: 'lve',
  stan,
  objaw: 'Procesy kont nie wchodzą do LVE: 3 błędów w logu LiteSpeed, 2 w jądrze.',
  kroki: [
    { at: '2026-10-13T04:41:00+02:00', krok: 'diagnoza', wynik: 'zapisana (8000 B)' },
    { at: '2026-10-13T04:41:30+02:00', krok: '1. restart LiteSpeed', wynik: 'wykonany' },
  ],
  diagnoza: '== LiteSpeed stderr\nlscgid (1): enter LVE (1003) : result: -22 !',
  wykrytoAt: '2026-10-13T04:41:00+02:00',
  katalog: '/var/log/verris-straznik/zdarzenia/20261013-044100-lve',
  ...o,
});

describe('Strażnik węzła — raporty i alarmy', () => {
  const fetchMock = vi.fn();
  beforeEach(async () => {
    await wyczyscBaze();
    maile.length = 0;
    push.length = 0;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      push.push(JSON.parse(init.body));
      return { ok: true, status: 200 };
    });
    vi.stubGlobal('fetch', fetchMock);
    process.env.ALERT_PUSH_URL = 'https://ntfy.sh/verris-alarmy-test';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ALERT_PUSH_URL;
  });
  afterAll(rozlacz);

  const admin = () => prisma().user.create({ data: { email: `admin-${Date.now()}-${Math.random()}@verris.pl`, passwordHash: 'x', role: 'ADMIN', firstName: 'Dominik' } });

  it('naprawa → naprawiono: jedno zdarzenie, alarm tylko przy wyniku (panel, e-mail, push); powtórka raportu nic nie wysyła', async () => {
    const a = await admin();
    const w = await utworzWezel({ name: 't1' });
    const { straznik } = uslugi();
    await straznik.przyjmij(w.id, zdarzenie('naprawa'));
    expect(await prisma().notification.count()).toBe(0);
    await straznik.przyjmij(w.id, zdarzenie('naprawiono', { kroki: [...zdarzenie('naprawa').kroki, { at: 'x', krok: 'sprawdzenie d3.hvln.pl', wynik: 'HTTP 200 — OK' }] }));
    await straznik.przyjmij(w.id, zdarzenie('naprawiono'));
    const z = await prisma().zdarzenieStraznika.findMany();
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ stan: 'naprawiono', rodzaj: 'lve' });
    expect(z[0].zakonczonoAt).not.toBeNull();
    const n = await prisma().notification.findMany({ where: { userId: a.id } });
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ title: 'Węzeł t1: awaria naprawiona automatycznie (izolacja kont (LVE) — strony PHP nie działają)', severity: 'info', link: `/nodes/${w.id}?sekcja=uslugi#straznik` });
    expect(n[0].body).toContain('1. restart LiteSpeed: wykonany');
    expect(maile.map((m) => m.subject)).toEqual([`[Verris] ✅ ${n[0].title}`]);
    expect(push).toEqual([expect.objectContaining({ topic: 'verris-alarmy-test', priority: 3, click: expect.stringContaining(`/nodes/${w.id}?sekcja=uslugi#straznik`) })]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://ntfy.sh/');
  });

  it('nie_naprawiono i restart węzła: alarm krytyczny (push priorytet 5); bez ALERT_PUSH_URL — bez pusha', async () => {
    await admin();
    const w = await utworzWezel({ name: 't1' });
    const { straznik } = uslugi();
    await straznik.przyjmij(w.id, zdarzenie('restart'));
    expect(push.pop()).toMatchObject({ priority: 5, title: 'Węzeł t1: strażnik restartuje węzeł (izolacja kont (LVE) — strony PHP nie działają)' });
    delete process.env.ALERT_PUSH_URL;
    await straznik.przyjmij(w.id, zdarzenie('nie_naprawiono', { id: '7f1c2b1e-0d3a-4b8e-9b1a-1c2d3e4f5a6b', rodzaj: 'usluga:exim', objaw: 'Usługa exim włączona, a w stanie: failed.' }));
    expect(push).toEqual([]);
    expect(await prisma().notification.findFirst({ where: { title: { contains: 'usługa exim nie działa' } } })).toMatchObject({ severity: 'critical' });
  });

  it('naprawa bez wyniku > 15 min albo węzeł milczy po restarcie: alarm „utknęło”, raz', async () => {
    await admin();
    const w = await utworzWezel({ name: 't1' });
    const { straznik } = uslugi();
    await straznik.przyjmij(w.id, zdarzenie('naprawa'));
    expect(await straznik.utkniete(new Date(Date.now() + 5 * 60_000))).toBe(0);
    expect(await straznik.utkniete(new Date(Date.now() + 20 * 60_000))).toBe(1);
    expect(await straznik.utkniete(new Date(Date.now() + 30 * 60_000))).toBe(0);
    expect(await prisma().notification.count({ where: { title: { contains: 'naprawa strażnika nie zakończyła się' } } })).toBe(1);
  });

  it('wyłącznik restartu węzła: domyślnie włączony, admin wyłącza (dziennik); lista zdarzeń bez pełnej diagnozy, diagnoza osobno', async () => {
    const a = await admin();
    const w = await utworzWezel({ name: 't1' });
    const { straznik } = uslugi();
    expect(await straznik.restartDozwolony()).toBe(true);
    await straznik.ustawRestart(false, a.id);
    expect(await straznik.restartDozwolony()).toBe(false);
    expect(await prisma().auditLog.count({ where: { action: 'STRAZNIK_RESTART_WEZLA_USTAWIONY' } })).toBe(1);
    await straznik.przyjmij(w.id, zdarzenie('naprawiono'));
    const l = await straznik.lista(w.id);
    expect(l.restartWezla).toBe(false);
    expect(l.zdarzenia[0]).toMatchObject({ nazwa: 'izolacja kont (LVE) — strony PHP nie działają', stan: 'naprawiono' });
    expect(l.zdarzenia[0]).not.toHaveProperty('diagnoza');
    expect((await straznik.diagnoza(w.id, l.zdarzenia[0].id)).diagnoza).toContain('enter LVE (1003)');
  });

  it('zadanie węzła pada na błędzie systemowym (CageFS / LVE): alarm raz na godzinę; zwykły błąd zadania — bez alarmu', async () => {
    await admin();
    const w = await utworzWezel({ name: 't1' });
    const { zadania } = uslugi();
    const zadanie = (kind: string) =>
      prisma().nodeTask.create({ data: { serverId: w.id, kind: kind as never, status: 'RUNNING', startedAt: new Date() } });
    const t1 = await zadanie('WP_UPDATE');
    await zadania.failTaskFromNode({ serverId: w.id, taskId: t1.id, error: '[wp-update] BŁĄD: brak PHP CLI dla konta (CageFS / alt-php)' });
    const t2 = await zadanie('WP_UPDATE');
    await zadania.failTaskFromNode({ serverId: w.id, taskId: t2.id, error: '[wp-update] BŁĄD: brak PHP CLI dla konta (CageFS / alt-php)' });
    const t3 = await zadanie('WP_INSTALL');
    await zadania.failTaskFromNode({ serverId: w.id, taskId: t3.id, error: 'Database connection refused for wp_abc' });
    const n = await prisma().notification.findMany({ where: { title: { contains: 'błędzie systemowym' } } });
    expect(n).toHaveLength(1);
    expect(n[0].title).toBe('Węzeł t1: zadanie WP_UPDATE padło na błędzie systemowym');
    expect(n[0].body).toContain('Rozpoznane po: „brak PHP CLI”');
  });
});
