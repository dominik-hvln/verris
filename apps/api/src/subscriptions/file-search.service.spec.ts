import { BadRequestException, ConflictException } from '@nestjs/common';
import { FileSearchService, sprawdzZapytanie, wynikZLogu } from './file-search.service.js';

/** C-14 — skrypt węzła sprawdzony lokalnie: szuka klient (runuser), bez dowiązań, limit 500, 90 s. */
function stanowisko(ostatnie: unknown = null, wToku: unknown = null) {
  const account = { id: 'a1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    nodeTask: {
      findFirst: vi.fn().mockResolvedValueOnce(wToku).mockResolvedValue(ostatnie),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  const da = { assertDomainOwnedBySubscription: vi.fn(async (_s: string, _u: string, d: string) => d.toLowerCase()) };
  return { svc: new FileSearchService(prisma as never, da as never), prisma };
}

describe('FileSearchService', () => {
  it('zleca wyszukiwanie w katalogu domeny konta', async () => {
    const s = stanowisko();
    await s.svc.szukaj('s1', 'u1', { domain: 'A.pl', name: ' wp-config ', text: '' });
    const d = (s.prisma.nodeTask.create.mock.calls[0] as unknown as [{ data: { kind: string; payload: unknown } }])[0].data;
    expect(d.kind).toBe('FILE_SEARCH');
    expect(d.payload).toEqual({ daUser: 'klient1', domain: 'a.pl', name: 'wp-config', text: '' });
    await expect(stanowisko(null, { id: 'x' }).svc.szukaj('s1', 'u1', { domain: 'a.pl', name: 'x', text: '' })).rejects.toThrow(ConflictException);
  });

  it.each([['', ''], ['*.php', ''], ['a/b', ''], ['x', 'a\nb'], ['x'.repeat(101), '']])('odrzuca zapytanie %j %j', (n, t) => {
    expect(() => sprawdzZapytanie(n, t)).toThrow(BadRequestException);
  });

  it('wynik z logu; śmieci → null', async () => {
    const b = Buffer.from(JSON.stringify({ pliki: [{ p: 'wp-config.php', s: 3, t: 5 }, { x: 1 }], ucieto: true })).toString('base64');
    const s = stanowisko({ status: 'COMPLETED', payload: { name: 'wp', text: '' }, outputLog: `VERRIS_SZUKAJ=${b}\n` });
    // pierwsze findFirst w stanowisku to „w toku” — status czyta od razu ostatnie zadanie
    s.prisma.nodeTask.findFirst.mockReset().mockResolvedValue({ status: 'COMPLETED', payload: { name: 'wp', text: '' }, outputLog: `VERRIS_SZUKAJ=${b}\n` });
    const r = await s.svc.status('s1', 'u1', 'a.pl');
    expect(r.wynik).toEqual({ pliki: [{ p: 'wp-config.php', s: 3, t: 5 }], ucieto: true });
    expect(r.zapytanie).toEqual({ name: 'wp', text: '' });
    expect(wynikZLogu('VERRIS_SZUKAJ=###')).toBeNull();
  });
});
