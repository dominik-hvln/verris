import { NodeTaskStatus } from '@verris/database';
import { BLAD_BEZ_SYGNALU, BLAD_NIE_PODJETO, regulyZTrafien, stanTrafien, trafieniaZLogu } from './trafienia-waf.js';
import { TrafieniaWafKontaService } from '../subscriptions/trafienia-waf-konta.service.js';

/** F3.2 — odczyt trafień WAF z wyniku WAF_HITS i zlecenie odczytu z karty usługi (domeny konta podaje API). */
const LOG = [
  'VERRIS_WAF 2026-10-10T10:10:00Z|klient.pl|2001:db8::7|GET|/xmlrpc.php|930120|OS File Access Attempt|0|200',
  'VERRIS_WAF 2026-10-10T10:00:00Z|klient.pl|198.51.100.23|GET|/|942100|SQL Injection Attack Detected via libinjection|1|403',
  'VERRIS_WAF 2026-10-10T09:00:00Z|sklep.pl|198.51.100.23|POST|/koszyk|942100|SQL Injection Attack Detected via libinjection|1|403',
  'VERRIS_WAF zle|klient.pl|1.2.3.4|GET|/a|abc|x|1|403',
  'VERRIS_WAF_RAZEM 3 3 1024',
].join('\n');

describe('F3.2 — trafienia WAF: odczyt', () => {
  it('wiersze z wyniku węzła (śmieci pominięte) i najczęstsze reguły z liczbą zablokowanych', () => {
    const t = trafieniaZLogu(LOG);
    expect(t).toHaveLength(3);
    expect(t[1]).toEqual({ czas: '2026-10-10T10:00:00Z', domena: 'klient.pl', ip: '198.51.100.23', metoda: 'GET', sciezka: '/', regula: '942100', opis: 'SQL Injection Attack Detected via libinjection', zablokowano: true, status: '403' });
    expect(regulyZTrafien(t)[0]).toEqual({ regula: '942100', opis: 'SQL Injection Attack Detected via libinjection', razy: 2, zablokowano: 2, ostatnio: '2026-10-10T10:00:00Z', domeny: ['klient.pl', 'sklep.pl'] });
  });

  it('stan: ostatni ukończony wynik; błąd ostatniego zadania z komunikatem skryptu (nie „brak trafień”)', () => {
    const t = (status: NodeTaskStatus, outputLog: string) => ({ status, outputLog, errorMessage: null, createdAt: new Date(), completedAt: new Date() });
    const s = stanTrafien([t(NodeTaskStatus.FAILED, '[waf-hits] BŁĄD: nieznany format dziennika WAF'), t(NodeTaskStatus.COMPLETED, LOG)]);
    expect(s).toMatchObject({ wToku: false, razem: 3, blad: 'nieznany format dziennika WAF' });
    expect(s.trafienia).toHaveLength(3);
  });

  it('audyt Fali 3: wynik wyczyszczony retencją (30 dni) to „nie wczytano”, nie „brak trafień”', () => {
    const t = (status: NodeTaskStatus, outputLog: string | null) => ({ status, outputLog, errorMessage: null, createdAt: new Date(), completedAt: new Date() });
    expect(stanTrafien([t(NodeTaskStatus.COMPLETED, null)])).toMatchObject({ wczytano: null, trafienia: [], razem: null });
    expect(stanTrafien([t(NodeTaskStatus.COMPLETED, null), t(NodeTaskStatus.COMPLETED, LOG)]).trafienia).toHaveLength(3);
  });
});

describe('noc 11→12.10 — odczyt WAF wiszący na węźle (d3: „Wczytaj z serwera” 21:47, o 23:0x dalej „stan z 16:58”)', () => {
  const TERAZ = Date.parse('2026-10-11T21:05:00Z');
  const min = (n: number) => new Date(TERAZ - n * 60_000);
  const z = (status: NodeTaskStatus, createdAt: Date, o: { updatedAt?: Date; outputLog?: string | null } = {}) => ({
    status,
    outputLog: o.outputLog ?? null,
    errorMessage: null,
    createdAt,
    updatedAt: o.updatedAt ?? createdAt,
    completedAt: status === NodeTaskStatus.COMPLETED ? createdAt : null,
  });

  it('świeże zlecenie: w toku, z czasem zlecenia i informacją, że serwer go jeszcze nie podjął', () => {
    expect(stanTrafien([z(NodeTaskStatus.QUEUED, min(2)), z(NodeTaskStatus.COMPLETED, min(240), { outputLog: LOG })], TERAZ)).toMatchObject({
      wToku: true,
      zlecono: min(2).toISOString(),
      czekaNaSerwer: true,
      wczytano: min(240).toISOString(),
      blad: null,
    });
    expect(stanTrafien([z(NodeTaskStatus.RUNNING, min(3), { updatedAt: min(1) })], TERAZ)).toMatchObject({ wToku: true, czekaNaSerwer: false });
  });

  it('niepodjęte przez węzeł ponad 15 min: nie „w toku” bez końca, tylko błąd ostatniego odczytu; stary wynik zostaje', () => {
    const s = stanTrafien([z(NodeTaskStatus.QUEUED, min(78)), z(NodeTaskStatus.COMPLETED, min(240), { outputLog: LOG })], TERAZ);
    expect(s).toMatchObject({ wToku: false, zlecono: null, blad: BLAD_NIE_PODJETO, wczytano: min(240).toISOString(), razem: 3 });
  });

  it('podjęte, ale bez sygnału z węzła ponad 15 min: błąd; z heartbeatem (długi odczyt) — dalej w toku', () => {
    expect(stanTrafien([z(NodeTaskStatus.RUNNING, min(40), { updatedAt: min(16) })], TERAZ)).toMatchObject({ wToku: false, blad: BLAD_BEZ_SYGNALU });
    expect(stanTrafien([z(NodeTaskStatus.RUNNING, min(40), { updatedAt: min(1) })], TERAZ)).toMatchObject({ wToku: true, blad: null });
  });
});

describe('F3.2 — TrafieniaWafKontaService', () => {
  function zbuduj(o: { zadania?: unknown[]; status?: string; rolaWlasciciela?: string; bladDomen?: string } = {}) {
    const utworzone: Array<Record<string, unknown>> = [];
    const prisma = {
      subscription: { findUnique: vi.fn(async () => ({ userId: 'u1', user: { role: o.rolaWlasciciela ?? 'USER' }, account: { id: 'acc1', serverId: 'w1', domain: 'Klient.pl', status: o.status ?? 'ACTIVE', wafMode: 'ON', wafAppliedAt: null } })) },
      nodeTask: {
        findMany: vi.fn(async () => o.zadania ?? []),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (utworzone.push(data), data)),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const da = {
      listHostingDomainsForSubscription: vi.fn(async () =>
        o.bladDomen ? { domains: [], fetchError: o.bladDomen } : { domains: [{ name: 'klient.pl' }, { name: 'sklep.pl' }] },
      ),
    };
    return { svc: new TrafieniaWafKontaService(prisma as never, da as never), utworzone, da, prisma };
  }

  it('wczytaj: zadanie WAF_HITS konta z domenami konta (od właściciela), zlecający = operator; tryb WAF tylko do odczytu', async () => {
    const { svc, utworzone, da } = zbuduj();
    const r = await svc.wczytaj('s1', 'u1', 'op', 'STAFF');
    expect(da.listHostingDomainsForSubscription).toHaveBeenCalledWith('s1', 'u1');
    expect(utworzone).toEqual([expect.objectContaining({ serverId: 'w1', accountId: 'acc1', kind: 'WAF_HITS', requestedById: 'op', payload: { domains: 'klient.pl,sklep.pl' } })]);
    expect(r).toMatchObject({ tryb: 'ON' });
  });

  it('trwa odczyt → 409; konto usunięte → 400; bez zadania', async () => {
    const trwa = zbuduj({ zadania: [{ status: NodeTaskStatus.RUNNING, outputLog: null, errorMessage: null, createdAt: new Date(), completedAt: null }] });
    await expect(trwa.svc.wczytaj('s1', 'u1', 'op', 'STAFF')).rejects.toMatchObject({ status: 409 });
    const usuniete = zbuduj({ status: 'DELETED' });
    await expect(usuniete.svc.wczytaj('s1', 'u1', 'op', 'STAFF')).rejects.toMatchObject({ status: 400 });
    expect([...trwa.utworzone, ...usuniete.utworzone]).toEqual([]);
  });

  it('noc 11→12.10: wiszące zlecenie nie blokuje nowego (było 409 bez końca) — zamknięte jako błąd tylko, jeśli nadal wisi', async () => {
    const stare = new Date(Date.now() - 80 * 60_000);
    const { svc, utworzone, prisma } = zbuduj({
      zadania: [
        { id: 't-queued', status: NodeTaskStatus.QUEUED, outputLog: null, errorMessage: null, createdAt: stare, updatedAt: stare, completedAt: null },
        { id: 't-running', status: NodeTaskStatus.RUNNING, outputLog: null, errorMessage: null, createdAt: stare, updatedAt: stare, completedAt: null },
      ],
    });
    await svc.wczytaj('s1', 'u1', 'op', 'STAFF');
    expect(prisma.nodeTask.updateMany).toHaveBeenCalledWith({
      where: { id: 't-queued', status: NodeTaskStatus.QUEUED },
      data: expect.objectContaining({ status: NodeTaskStatus.FAILED, errorMessage: BLAD_NIE_PODJETO }),
    });
    expect(prisma.nodeTask.updateMany).toHaveBeenCalledWith({
      where: { id: 't-running', status: NodeTaskStatus.RUNNING, updatedAt: stare },
      data: expect.objectContaining({ status: NodeTaskStatus.FAILED, errorMessage: BLAD_BEZ_SYGNALU }),
    });
    expect(utworzone).toEqual([expect.objectContaining({ kind: 'WAF_HITS', status: NodeTaskStatus.QUEUED })]);
  });

  it('audyt Fali 3: błąd odczytu domen konta z serwera → 503 i bez zadania (nie „brak trafień” dla samej domeny głównej)', async () => {
    const { svc, utworzone } = zbuduj({ bladDomen: 'Serwer hostingowy jest chwilowo niedostępny.' });
    await expect(svc.wczytaj('s1', 'u1', 'op', 'STAFF')).rejects.toMatchObject({ status: 503 });
    expect(utworzone).toEqual([]);
  });

  it('audyt Fali 3 (D3): usługa konta zespołu — STAFF 403 (odczyt i wczytanie, bez zadania); ADMIN może', async () => {
    for (const rola of ['STAFF', 'ADMIN']) {
      const z = zbuduj({ rolaWlasciciela: rola });
      await expect(z.svc.widok('s1', 'STAFF')).rejects.toMatchObject({ status: 403 });
      await expect(z.svc.wczytaj('s1', 'u1', 'op', 'STAFF')).rejects.toMatchObject({ status: 403 });
      expect(z.utworzone).toEqual([]);
      await expect(z.svc.wczytaj('s1', 'u1', 'adm', 'ADMIN')).resolves.toMatchObject({ tryb: 'ON' });
    }
  });
});
