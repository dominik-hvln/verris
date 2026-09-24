import { BadRequestException, ConflictException } from '@nestjs/common';
import { HtaccessService, sprawdzSciezke, ustawieniaZLogu } from './htaccess.service';

/**
 * B-17/B-18/G-07 — skrypt węzła sprawdzony lokalnie: blok Verris na początku pliku, reszta bez zmian,
 * odczyt i zapis jako klient (dowiązanie do /etc/shadow → odmowa), 5xx po zapisie → poprzedni plik.
 */
function stanowisko(zadania: unknown[] = [], wToku: unknown = null) {
  const account = { id: 'a1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: jest.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    nodeTask: {
      findFirst: jest.fn(async () => wToku),
      findMany: jest.fn(async () => zadania),
      create: jest.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  const da = { assertDomainOwnedBySubscription: jest.fn(async (_s: string, _u: string, d: string) => d.toLowerCase()) };
  const audit = { record: jest.fn(async () => undefined) };
  return { svc: new HtaccessService(prisma as never, audit as never, da as never), prisma, audit };
}
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
const zapis = { domain: 'A.pl', indexes: 'off' as const, hsts: true, e403: '', e404: ' /404.html ', e500: '' };

describe('HtaccessService', () => {
  it('zapis: payload dla skryptu (napisy), domena z konta, wpis w dzienniku', async () => {
    const s = stanowisko();
    await s.svc.zapisz('s1', 'u1', zapis);
    const d = (s.prisma.nodeTask.create.mock.calls[0] as unknown as [{ data: { kind: string; payload: Record<string, string> } }])[0].data;
    expect(d.kind).toBe('HTACCESS');
    expect(d.payload).toEqual({ mode: 'write', indexes: 'off', hsts: '1', e403: '', e404: '/404.html', e500: '', daUser: 'klient1', domain: 'a.pl' });
    expect(s.audit.record).toHaveBeenCalled();
  });

  it('odczyt bez wpisu w dzienniku; drugie zadanie w toku → 409', async () => {
    const s = stanowisko();
    await s.svc.odczytaj('s1', 'u1', 'a.pl');
    expect(s.audit.record).not.toHaveBeenCalled();
    await expect(stanowisko([], { id: 'x' }).svc.zapisz('s1', 'u1', zapis)).rejects.toThrow(ConflictException);
  });

  it.each(['404.html', '/../etc/passwd', '/a b', '/a//b', '/', '/x\nHeader set X 1', '/a"b'])('odrzuca ścieżkę %j', (p) => {
    expect(() => sprawdzSciezke(p)).toThrow(BadRequestException);
  });

  it('stan z ostatniego udanego zadania; błąd ostatniego widoczny', async () => {
    const log = `VERRIS_HTACCESS=${b64({ indexes: 'off', hsts: true, e403: '', e404: '/404.html', e500: '/../x' })}\n`;
    const s = stanowisko([
      { status: 'FAILED', outputLog: '[htaccess] BŁĄD: serwer odrzucił nowe ustawienia (HTTP 500)', createdAt: new Date() },
      { status: 'COMPLETED', outputLog: log, createdAt: new Date(), completedAt: new Date() },
    ]);
    const r = await s.svc.status('s1', 'u1', 'a.pl');
    expect(r.ustawienia).toEqual({ indexes: 'off', hsts: true, e403: '', e404: '/404.html', e500: '' });
    expect(r.blad).toContain('HTTP 500');
    expect(ustawieniaZLogu('VERRIS_HTACCESS=!!')).toBeNull();
  });
});
