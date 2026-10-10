import { NodeTaskStatus } from '@verris/database';
import { adresyWTekscie, blokadyZLogu, kanonicznyIp, stanBlokad } from './blokady-ip.js';
import { BlokadyIpWezlaService } from './blokady-ip-wezla.admin.controller.js';

/** F3.2 (D5) — odczyt wyniku node-ip-blocks.sh, stan z zadań IP_BLOCKS i zlecenia NOC na węźle. */
const LOG = [
  'VERRIS_IPB_JAIL sshd',
  'VERRIS_IPB_JAIL exim',
  'VERRIS_IPB 203.0.113.7|sshd|2026-10-10T10:00:00Z|2026-10-10T11:00:00Z|3600',
  'VERRIS_IPB 203.0.113.7|exim|2026-10-10T10:02:00Z|2026-10-10T11:02:00Z|3600',
  'VERRIS_IPB 2001:db8::5|dovecot|2026-10-10T09:00:00Z|-|-1',
  'VERRIS_IPB 1.2.3.4;id|sshd|x|y|1',
  'VERRIS_IPB_RAZEM 3 3',
  'VERRIS_IPB_ALLOW 198.51.100.9',
  'VERRIS_IPB_ODBLOKOWANO 2',
].join('\n');

const zad = (o: Partial<{ id: string; status: NodeTaskStatus; payload: unknown; outputLog: string | null; minut: number }>) => ({
  id: o.id ?? 't',
  status: o.status ?? NodeTaskStatus.COMPLETED,
  payload: o.payload ?? { mode: 'list' },
  outputLog: o.outputLog ?? null,
  errorMessage: null,
  createdAt: new Date(Date.now() - (o.minut ?? 0) * 60_000),
  completedAt: new Date(Date.now() - (o.minut ?? 0) * 60_000),
});

describe('F3.2 — blokady IP: odczyt i adresy', () => {
  it('kanonicznyIp: IPv4/IPv6 w postaci kanonicznej, reszta — null', () => {
    expect(kanonicznyIp(' 203.0.113.7 ')).toBe('203.0.113.7');
    expect(kanonicznyIp('2001:db8::5')).toBe('2001:db8::5');
    for (const zly of ['203.0.113.07', '2001:DB8::5', '2001:db8:0:0:0:0:0:5', '1.2.3.4/24', '1.2.3.4 5.6.7.8', '$(id)', '', 'fe80::1%eth0', '256.1.1.1']) {
      expect({ zly, ip: kanonicznyIp(zly) }).toEqual({ zly, ip: null });
    }
  });

  it('blokadyZLogu: jail → powód, stała blokada, biała lista, liczba odblokowań; śmieci pominięte', () => {
    const w = blokadyZLogu(LOG);
    expect(w.jaile).toEqual(['sshd', 'exim']);
    expect(w.blokady).toEqual([
      { ip: '203.0.113.7', jail: 'sshd', powod: 'nieudane logowania SSH', od: '2026-10-10T10:00:00Z', do: '2026-10-10T11:00:00Z', stala: false },
      { ip: '203.0.113.7', jail: 'exim', powod: 'nieudane logowania SMTP (wysyłka poczty)', od: '2026-10-10T10:02:00Z', do: '2026-10-10T11:02:00Z', stala: false },
      { ip: '2001:db8::5', jail: 'dovecot', powod: 'nieudane logowania IMAP/POP3 (odbiór poczty)', od: '2026-10-10T09:00:00Z', do: null, stala: true },
    ]);
    expect(w).toMatchObject({ razem: 3, pokazano: 3, bialaLista: ['198.51.100.9'], odblokowano: 2 });
  });

  it('adresyWTekscie: IPv4 i IPv6 z treści zgłoszenia, bez wersji, dat i niepoprawnych', () => {
    const t = 'Nie mogę wejść, mój adres 83.12.44.201, a w pracy 2a02:a311:4::1f. Wersja 1.2.3.4.5, 10.10.2026, 999.1.1.1, 1.2.3.04.';
    expect(adresyWTekscie(t)).toEqual(['83.12.44.201', '2a02:a311:4::1f']);
    expect(adresyWTekscie(null)).toEqual([]);
  });

  it('stanBlokad: pełna lista z ostatniej operacji (nie ze „sprawdź IP”), sprawdzenie i operacja osobno, zawężenie do adresu', () => {
    const zadania = [
      zad({ id: 'c', payload: { mode: 'list', ip: '203.0.113.7' }, outputLog: 'VERRIS_IPB 203.0.113.7|sshd|2026-10-10T10:00:00Z|2026-10-10T11:00:00Z|3600\nVERRIS_IPB_RAZEM 1 1' }),
      zad({ id: 'b', payload: { mode: 'unban', ip: '198.51.100.9' }, outputLog: LOG, minut: 1 }),
      zad({ id: 'a', payload: { mode: 'list' }, outputLog: 'VERRIS_IPB_RAZEM 0 0', minut: 5 }),
    ];
    const s = stanBlokad(zadania);
    expect(s.lista?.blokady).toHaveLength(3);
    expect(s.sprawdzenie).toMatchObject({ ip: '203.0.113.7', blokady: [{ jail: 'sshd' }] });
    expect(s.operacja).toMatchObject({ tryb: 'unban', ip: '198.51.100.9', odblokowano: 2, blad: null });
    const tylko = stanBlokad(zadania, '2001:db8::5');
    expect(tylko.lista?.blokady.map((b) => b.ip)).toEqual(['2001:db8::5']);
    expect(tylko.lista?.bialaLista).toEqual([]);
    expect(tylko.lista?.razem).toBeNull();
  });

  it('stanBlokad: błąd węzła = błąd (z komunikatem skryptu), nie pusta lista', () => {
    const s = stanBlokad([{ ...zad({ status: NodeTaskStatus.FAILED, outputLog: '[ip-blocks] BŁĄD: fail2ban-client status: Is fail2ban running?' }) }]);
    expect(s.blad).toBe('fail2ban-client status: Is fail2ban running?');
    expect(s.lista).toBeNull();
  });
});

function wezel(o: { status?: string; zadania?: unknown[] } = {}) {
  const utworzone: Array<{ data: Record<string, unknown> }> = [];
  const prisma = {
    server: { findUnique: vi.fn(async () => ({ id: 'w1', status: o.status ?? 'ACTIVE' })) },
    nodeTask: {
      findMany: vi.fn(async () => o.zadania ?? []),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => (utworzone.push(a), { id: 't1', ...a.data })),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { svc: new BlokadyIpWezlaService(prisma as never, audit as never), utworzone, audit };
}

describe('F3.2 — blokady IP węzła (NOC)', () => {
  const POWOD = 'Klient z biura, blokada po zmianie hasła';

  it('odczyt: zadanie IP_BLOCKS list bez konta i adresu; wpis w dzienniku', async () => {
    const { svc, utworzone, audit } = wezel();
    await svc.wczytaj('w1', 'noc1');
    expect(utworzone[0]!.data).toMatchObject({ serverId: 'w1', accountId: null, kind: 'IP_BLOCKS', requestedById: 'noc1', payload: { mode: 'list' } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'NODE_IP_BLOCKS_VIEWED', actorUserId: 'noc1' }));
  });

  it('odblokowanie i biała lista: adres kanoniczny i powód obowiązkowe; tryby unban / allow / disallow; dziennik z powodem', async () => {
    const ok = wezel();
    await ok.svc.odblokuj('w1', 'noc1', '203.0.113.7', POWOD);
    await ok.svc.bialaLista('w1', 'noc1', '198.51.100.9', POWOD, 'dodaj');
    await ok.svc.bialaLista('w1', 'noc1', '198.51.100.9', POWOD, 'usun');
    expect(ok.utworzone.map((u) => u.data.payload)).toEqual([
      { mode: 'unban', ip: '203.0.113.7' },
      { mode: 'allow', ip: '198.51.100.9' },
      { mode: 'disallow', ip: '198.51.100.9' },
    ]);
    expect(ok.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'NODE_IP_UNBLOCK_QUEUED', details: expect.objectContaining({ ip: '203.0.113.7', powod: POWOD }) }));
    expect(ok.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'NODE_IP_ALLOWLIST_CHANGED', details: expect.objectContaining({ akcja: 'dodaj' }) }));
    const zle = wezel();
    await expect(zle.svc.odblokuj('w1', 'noc1', '203.0.113.7', 'krótki')).rejects.toMatchObject({ status: 400 });
    await expect(zle.svc.odblokuj('w1', 'noc1', '203.0.113.7;reboot', POWOD)).rejects.toMatchObject({ status: 400 });
    await expect(zle.svc.bialaLista('w1', 'noc1', '10.0.0.0/8', POWOD, 'dodaj')).rejects.toMatchObject({ status: 400 });
    expect(zle.utworzone).toEqual([]);
  });

  it('węzeł nieaktywny → 400; trwająca operacja → 409, bez nowego zadania', async () => {
    await expect(wezel({ status: 'OFFLINE' }).svc.wczytaj('w1', 'noc1')).rejects.toMatchObject({ status: 400 });
    const trwa = wezel({ zadania: [zad({ status: NodeTaskStatus.RUNNING })] });
    await expect(trwa.svc.odblokuj('w1', 'noc1', '203.0.113.7', POWOD)).rejects.toMatchObject({ status: 409 });
    expect(trwa.utworzone).toEqual([]);
  });
});
