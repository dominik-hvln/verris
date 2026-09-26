import { BadRequestException } from '@nestjs/common';
import { AppSelectorService, aplikacjeZLogu, sprawdzDane, sprawdzKatalog } from './app-selector.service.js';

const dane = { interpreter: 'nodejs' as const, root: 'apps/api', domain: 'a.pl', uri: '/api/', version: '22', startup: 'app.js' };

describe('B-08/B-09 — AppSelectorService', () => {
  it('katalog aplikacji tylko poza public_html/domains i bez wyjścia z konta', () => {
    expect(sprawdzKatalog('/apps/api/')).toBe('apps/api');
    for (const zly of ['public_html/x', 'domains/a.pl/app', '../etc', '.ssh', 'a b', 'mail']) {
      expect(() => sprawdzKatalog(zly)).toThrow(BadRequestException);
    }
  });

  it('dane: normalizuje ścieżkę, odrzuca złą wersję i zmienne', () => {
    expect(sprawdzDane(dane)).toMatchObject({ uri: 'api', entry: '', env: {} });
    expect(() => sprawdzDane({ ...dane, version: '22;id' })).toThrow(BadRequestException);
    expect(() => sprawdzDane({ ...dane, env: { 'A B': 'x' } })).toThrow(BadRequestException);
    expect(() => sprawdzDane({ ...dane, env: { A: 'x\ny' } })).toThrow(BadRequestException);
  });

  it('wynik z węzła: tylko znane pola i poprawne wersje', () => {
    const b64 = Buffer.from(
      JSON.stringify({
        apps: [{ interpreter: 'nodejs', root: 'apps/api', status: 'started', env: { OK: '1', 'z-le': 'x' } }, { interpreter: 'ruby' }],
        versions: { nodejs: ['22', '<script>'], python: ['3.12'] },
      }),
    ).toString('base64');
    const w = aplikacjeZLogu(`[app-selector] ok\nVERRIS_APPS=${b64}\n`);
    expect(w?.apps).toHaveLength(1);
    expect(w?.apps[0].env).toEqual({ OK: '1' });
    expect(w?.versions).toEqual({ nodejs: ['22'], python: ['3.12'] });
  });

  it('zlecenie: domena konta, zmienne w payloadzie, ale nie w dzienniku zdarzeń', async () => {
    const create = vi.fn(async () => ({ id: 't1' }));
    const prisma = {
      subscription: { findFirst: vi.fn(async () => ({ userId: 'u1', account: { id: 'a1', serverId: 's1', status: 'ACTIVE', daUsername: 'klient' } })) },
      nodeTask: { findFirst: vi.fn(async () => null), create, findMany: vi.fn(async () => []) },
    };
    const audit = { record: vi.fn() };
    const da = { assertDomainOwnedBySubscription: vi.fn(async () => 'a.pl') };
    const s = new AppSelectorService(prisma as never, audit as never, da as never);
    await s.utworz('sub', 'u1', { ...dane, env: { DB_PASS: 'tajne' } });
    expect(da.assertDomainOwnedBySubscription).toHaveBeenCalledWith('sub', 'u1', 'a.pl');
    const payload = (create.mock.calls[0] as unknown as [{ data: { payload: Record<string, string> } }])[0].data.payload;
    expect(JSON.parse(Buffer.from(payload.envB64, 'base64').toString())).toEqual({ DB_PASS: 'tajne' });
    expect(payload).toMatchObject({ mode: 'create', daUser: 'klient', root: 'apps/api', uri: 'api' });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('tajne');
  });
});
